"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDailyBudget } from "@/lib/ads/budget";
import { getAdConnection } from "@/lib/ads/connections";
import { createPausedMetaCampaign, listMetaAdAccounts, listMetaPages, MetaError, setMetaCampaignStatus } from "@/lib/ads/meta";
import { runMarketingGeneration } from "@/lib/ai/marketing-run";
import { requireUser } from "@/lib/auth";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { parsePixels } from "@/lib/marketing/settings";
import { describeViolation, moderate } from "@/lib/moderation/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicStoreUrl, platformUrl } from "@/lib/tenant";

export type CampaignState = { error?: string };

const page = (storeId: string) => `/tableau-de-bord/boutiques/${storeId}/publicite/campagne`;

async function ownedStore(storeId: string) {
  const user = await requireUser();
  const { data } = await createAdminClient()
    .from("stores")
    .select("id, name, status, config, niche_description, language, currency, pixels, subdomain, custom_domain, domain_status")
    .eq("id", storeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  return data && data.status !== "suspended" ? { user, store: data } : null;
}

/** Compte publicitaire et page Facebook choisis par le vendeur (vérifiés auprès de Meta). */
export async function chooseMetaAccount(storeId: string, _prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const m = await getMessages();
  const ctx = await ownedStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  const connection = await getAdConnection(storeId, "meta");
  if (!connection) return { error: m.ads.campaigns.reconnect };
  const [accounts, pages] = await Promise.all([listMetaAdAccounts(connection.accessToken), listMetaPages(connection.accessToken)]).catch(() => [[], []] as const);
  const account = accounts.find((a) => a.id === formData.get("ad_account_id"));
  const fbPage = pages.find((p) => p.id === formData.get("page_id"));
  if (!account || !fbPage) return { error: m.ads.campaigns.choose.required };
  await createAdminClient()
    .from("ad_connections")
    .update({ ad_account_id: account.id, ad_account_name: account.name, ad_account_currency: account.currency, page_id: fbPage.id, page_name: fbPage.name })
    .eq("store_id", storeId)
    .eq("platform", "meta");
  revalidatePath(page(storeId));
  return {};
}

/** Brouillon : l'IA rédige les textes de la publicité pour le produit choisi. */
export async function draftMetaCampaign(storeId: string, _prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const m = await getMessages();
  const t = m.ads.campaigns;
  const ctx = await ownedStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  const budget = parseDailyBudget(formData.get("daily_budget"));
  if (!budget) return { error: t.errors.budget };
  const admin = createAdminClient();
  const { data: product } = await admin.from("products").select("id, title, images").eq("store_id", storeId).eq("status", "active").eq("id", String(formData.get("product_id") ?? "")).maybeSingle();
  if (!product) return { error: t.errors.product };

  const result = await runMarketingGeneration(ctx.user.id, ctx.store, product.id, m);
  if ("error" in result) return { error: result.error };
  const copy = result.content.adCopies.find((a) => a.platform === "meta") ?? result.content.adCopies[0];
  if (!copy) return { error: m.dashboard.actions.generationFailed };

  const storeUrl = publicStoreUrl({ subdomain: ctx.store.subdomain, customDomain: ctx.store.domain_status === "active" ? ctx.store.custom_domain : null });
  const image = Array.isArray(product.images) ? String(product.images[0] ?? "") : "";
  const { data: draft, error } = await admin
    .from("ad_campaigns")
    .insert({
      store_id: storeId,
      platform: "meta",
      product_id: product.id,
      name: `${product.title} — ${ctx.store.name}`.slice(0, 200),
      daily_budget_cents: budget,
      primary_text: copy.primaryText,
      headline: copy.headline,
      description: copy.description,
      link_url: `${storeUrl}/produit/${product.id}`,
      // Images d'exemple (adresse relative) : rendues absolues ; les vraies sont celles du fournisseur.
      image_url: image.startsWith("/") ? `${platformUrl()}${image}` : image,
    })
    .select("id")
    .single();
  if (error || !draft) return { error: m.dashboard.actions.changesFailed };
  redirect(`${page(storeId)}?brouillon=${draft.id}#brouillon`);
}

/** Crée la campagne chez Meta, EN PAUSE, après relecture des textes par le vendeur. */
export async function createMetaCampaign(storeId: string, _prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const m = await getMessages();
  const t = m.ads.campaigns;
  const ctx = await ownedStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  const connection = await getAdConnection(storeId, "meta");
  if (!connection?.adAccountId || !connection.pageId) return { error: t.reconnect };
  if (connection.adAccountCurrency && connection.adAccountCurrency !== "CAD") return { error: t.errors.currency };
  const pixelId = parsePixels(ctx.store.pixels).meta;
  if (!pixelId) return { error: t.pixelMissing };

  const admin = createAdminClient();
  const campaignId = String(formData.get("campaign_id") ?? "");
  const { data: draft } = await admin.from("ad_campaigns").select("*").eq("id", campaignId).eq("store_id", storeId).eq("status", "draft").maybeSingle();
  if (!draft) return { error: m.dashboard.actions.notFound };
  const texts = {
    primary_text: String(formData.get("primary_text") ?? "").trim().slice(0, 2000),
    headline: String(formData.get("headline") ?? "").trim().slice(0, 255),
    description: String(formData.get("description") ?? "").trim().slice(0, 255),
  };
  const budget = parseDailyBudget(formData.get("daily_budget"));
  if (!texts.primary_text || !texts.headline) return { error: t.errors.texts };
  if (!budget) return { error: t.errors.budget };
  const violation = await moderate([texts.primary_text, texts.headline, texts.description]);
  if (violation) return { error: fmt(m.moderation.textBlocked, { reason: describeViolation(violation, m) }) };
  await admin.from("ad_campaigns").update({ ...texts, daily_budget_cents: budget }).eq("id", draft.id);

  const { ids, error } = await createPausedMetaCampaign(connection.accessToken, {
    adAccountId: connection.adAccountId,
    pageId: connection.pageId,
    pixelId,
    name: draft.name,
    dailyBudgetCents: budget,
    primaryText: texts.primary_text,
    headline: texts.headline,
    description: texts.description,
    linkUrl: draft.link_url,
    imageUrl: draft.image_url,
  });
  await admin
    .from("ad_campaigns")
    .update({
      status: error ? "failed" : "paused",
      error: error ? error.message.slice(0, 500) : null,
      external_campaign_id: ids.campaignId ?? null,
      external_adset_id: ids.adsetId ?? null,
      external_creative_id: ids.creativeId ?? null,
      external_ad_id: ids.adId ?? null,
    })
    .eq("id", draft.id);
  if (error) return { error: fmt(t.errors.meta, { reason: error.message }) };
  redirect(`${page(storeId)}?creee=1`);
}

/** Lance ou met en pause une campagne créée. */
export async function setMetaCampaignActive(storeId: string, campaignId: string, active: boolean): Promise<CampaignState> {
  const m = await getMessages();
  const ctx = await ownedStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  const connection = await getAdConnection(storeId, "meta");
  if (!connection) return { error: m.ads.campaigns.reconnect };
  const admin = createAdminClient();
  const { data: c } = await admin.from("ad_campaigns").select("*").eq("id", campaignId).eq("store_id", storeId).in("status", ["paused", "active"]).maybeSingle();
  if (!c?.external_campaign_id) return { error: m.dashboard.actions.notFound };
  try {
    await setMetaCampaignStatus(connection.accessToken, { campaignId: c.external_campaign_id, adsetId: c.external_adset_id ?? undefined, adId: c.external_ad_id ?? undefined }, active ? "ACTIVE" : "PAUSED");
  } catch (err) {
    return { error: fmt(m.ads.campaigns.errors.meta, { reason: err instanceof MetaError ? err.message : String(err) }) };
  }
  await admin.from("ad_campaigns").update({ status: active ? "active" : "paused", ...(active && !c.launched_at && { launched_at: new Date().toISOString() }) }).eq("id", c.id);
  revalidatePath(page(storeId));
  return {};
}

/** Supprime un brouillon (rien n'a été créé chez Meta). */
export async function deleteCampaignDraft(storeId: string, campaignId: string): Promise<void> {
  if (!(await ownedStore(storeId))) return;
  await createAdminClient().from("ad_campaigns").delete().eq("id", campaignId).eq("store_id", storeId).eq("status", "draft");
  revalidatePath(page(storeId));
}

/** Déconnecte le compte Meta (les campagnes restent chez Meta, gérables dans le Gestionnaire de publicités). */
export async function disconnectMeta(storeId: string): Promise<void> {
  if (!(await ownedStore(storeId))) return;
  await createAdminClient().from("ad_connections").delete().eq("store_id", storeId).eq("platform", "meta");
  redirect(`${page(storeId)}?meta=deconnecte`);
}
