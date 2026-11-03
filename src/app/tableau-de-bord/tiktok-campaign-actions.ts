"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDailyBudget } from "@/lib/ads/budget";
import { getAdConnection } from "@/lib/ads/connections";
import {
  createDisabledTiktokCampaign,
  listTiktokAdvertisers,
  listTiktokIdentities,
  setTiktokCampaignStatus,
  TiktokError,
  tiktokTime,
} from "@/lib/ads/tiktok";
import { runMarketingGeneration } from "@/lib/ai/marketing-run";
import { requireUser } from "@/lib/auth";
import { fmt, isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { parsePixels } from "@/lib/marketing/settings";
import { describeViolation, moderate } from "@/lib/moderation/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicStoreUrl } from "@/lib/tenant";

export type TiktokCampaignState = { error?: string };

const page = (storeId: string) => `/tableau-de-bord/boutiques/${storeId}/publicite/tiktok`;
/** Texte d'une annonce TikTok : 100 caractères au plus. */
const AD_TEXT_MAX = 100;

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

/** Compte annonceur et compte TikTok (qui publie les vidéos) choisis par le vendeur, vérifiés auprès de TikTok. */
export async function chooseTiktokAccount(storeId: string, _prev: TiktokCampaignState, formData: FormData): Promise<TiktokCampaignState> {
  const m = await getMessages();
  const t = m.ads.tiktok;
  if (!(await ownedStore(storeId))) return { error: m.dashboard.actions.notFound };
  const connection = await getAdConnection(storeId, "tiktok");
  if (!connection) return { error: t.reconnect };
  const advertiserId = String(formData.get("advertiser_id") ?? "");
  const identityId = String(formData.get("identity_id") ?? "");
  try {
    const advertiser = (await listTiktokAdvertisers(connection.accessToken)).find((a) => a.id === advertiserId);
    const identity = advertiser ? (await listTiktokIdentities(connection.accessToken, advertiser.id)).find((i) => i.id === identityId) : null;
    if (!advertiser || !identity) return { error: t.choose.required };
    await createAdminClient()
      .from("ad_connections")
      .update({ ad_account_id: advertiser.id, ad_account_name: advertiser.name, ad_account_currency: advertiser.currency, page_id: identity.id, page_name: identity.name })
      .eq("store_id", storeId)
      .eq("platform", "tiktok");
  } catch {
    return { error: t.reconnect };
  }
  revalidatePath(page(storeId));
  return {};
}

/** Brouillon : vidéo choisie parmi celles du compte TikTok, texte rédigé par l'IA. */
export async function draftTiktokCampaign(storeId: string, _prev: TiktokCampaignState, formData: FormData): Promise<TiktokCampaignState> {
  const m = await getMessages();
  const t = m.ads.tiktok;
  const ctx = await ownedStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  const budget = parseDailyBudget(formData.get("daily_budget"));
  if (!budget) return { error: m.ads.campaigns.errors.budget };
  const itemId = String(formData.get("tiktok_item_id") ?? "");
  if (!/^\d{6,30}$/.test(itemId)) return { error: t.errors.video };
  const admin = createAdminClient();
  const { data: product } = await admin.from("products").select("id, title").eq("store_id", storeId).eq("status", "active").eq("id", String(formData.get("product_id") ?? "")).maybeSingle();
  if (!product) return { error: m.ads.campaigns.errors.product };

  const result = await runMarketingGeneration(ctx.user.id, ctx.store, product.id, m);
  if ("error" in result) return { error: result.error };
  const copy = result.content.adCopies.find((a) => a.platform === "tiktok") ?? result.content.adCopies[0];
  if (!copy) return { error: m.dashboard.actions.generationFailed };

  const storeUrl = publicStoreUrl({ subdomain: ctx.store.subdomain, customDomain: ctx.store.domain_status === "active" ? ctx.store.custom_domain : null });
  const { data: draft, error } = await admin
    .from("ad_campaigns")
    .insert({
      store_id: storeId,
      platform: "tiktok",
      product_id: product.id,
      name: `${product.title} — ${ctx.store.name}`.slice(0, 200),
      daily_budget_cents: budget,
      primary_text: copy.primaryText.slice(0, AD_TEXT_MAX),
      headline: copy.headline,
      description: "",
      link_url: `${storeUrl}/produit/${product.id}`,
      image_url: "",
      tiktok_item_id: itemId,
    })
    .select("id")
    .single();
  if (error || !draft) return { error: m.dashboard.actions.changesFailed };
  redirect(`${page(storeId)}?brouillon=${draft.id}#brouillon`);
}

/** Crée la campagne chez TikTok, DÉSACTIVÉE, après relecture du texte par le vendeur. */
export async function createTiktokCampaign(storeId: string, _prev: TiktokCampaignState, formData: FormData): Promise<TiktokCampaignState> {
  const m = await getMessages();
  const t = m.ads.tiktok;
  const ctx = await ownedStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  const connection = await getAdConnection(storeId, "tiktok");
  if (!connection?.adAccountId || !connection.pageId) return { error: t.reconnect };
  if (connection.adAccountCurrency && connection.adAccountCurrency !== "CAD") return { error: m.ads.campaigns.errors.currency };
  const pixelId = parsePixels(ctx.store.pixels).tiktok;
  if (!pixelId) return { error: t.pixelMissing };

  const admin = createAdminClient();
  const { data: draft } = await admin.from("ad_campaigns").select("*").eq("id", String(formData.get("campaign_id") ?? "")).eq("store_id", storeId).eq("platform", "tiktok").eq("status", "draft").maybeSingle();
  if (!draft?.tiktok_item_id) return { error: m.dashboard.actions.notFound };
  const adText = String(formData.get("ad_text") ?? "").trim();
  const budget = parseDailyBudget(formData.get("daily_budget"));
  if (!adText || adText.length > AD_TEXT_MAX) return { error: t.errors.text };
  if (!budget) return { error: m.ads.campaigns.errors.budget };
  const violation = await moderate([adText]);
  if (violation) return { error: fmt(m.moderation.textBlocked, { reason: describeViolation(violation, m) }) };
  await admin.from("ad_campaigns").update({ primary_text: adText, daily_budget_cents: budget }).eq("id", draft.id);

  const { ids, error } = await createDisabledTiktokCampaign(
    connection.accessToken,
    {
      advertiserId: connection.adAccountId,
      identityId: connection.pageId,
      pixelId,
      name: draft.name,
      dailyBudgetCents: budget,
      adText,
      linkUrl: draft.link_url,
      tiktokItemId: draft.tiktok_item_id,
      // Identifiant numérique unique par brouillon : une nouvelle tentative ne crée pas de doublon.
      requestId: String(BigInt(`0x${draft.id.replace(/-/g, "").slice(0, 15)}`)),
      startTime: tiktokTime(new Date()),
    },
    isLocale(ctx.store.language) ? ctx.store.language : "en",
  );
  await admin
    .from("ad_campaigns")
    .update({
      status: error ? "failed" : "paused",
      error: error ? error.message.slice(0, 500) : null,
      external_campaign_id: ids.campaignId ?? null,
      external_adset_id: ids.adgroupId ?? null,
      external_creative_id: ids.ctaPortfolioId ?? null,
      external_ad_id: ids.adId ?? null,
    })
    .eq("id", draft.id);
  if (error) return { error: fmt(t.errors.tiktok, { reason: error.message }) };
  redirect(`${page(storeId)}?creee=1`);
}

/** Lance ou met en pause une campagne TikTok créée. */
export async function setTiktokCampaignActive(storeId: string, campaignId: string, active: boolean): Promise<TiktokCampaignState> {
  const m = await getMessages();
  if (!(await ownedStore(storeId))) return { error: m.dashboard.actions.notFound };
  const connection = await getAdConnection(storeId, "tiktok");
  if (!connection?.adAccountId) return { error: m.ads.tiktok.reconnect };
  const admin = createAdminClient();
  const { data: c } = await admin.from("ad_campaigns").select("*").eq("id", campaignId).eq("store_id", storeId).eq("platform", "tiktok").in("status", ["paused", "active"]).maybeSingle();
  if (!c?.external_campaign_id) return { error: m.dashboard.actions.notFound };
  try {
    await setTiktokCampaignStatus(connection.accessToken, connection.adAccountId, { campaignId: c.external_campaign_id, adgroupId: c.external_adset_id ?? undefined, adId: c.external_ad_id ?? undefined }, active ? "ENABLE" : "DISABLE");
  } catch (err) {
    return { error: fmt(m.ads.tiktok.errors.tiktok, { reason: err instanceof TiktokError ? err.message : String(err) }) };
  }
  await admin.from("ad_campaigns").update({ status: active ? "active" : "paused", ...(active && !c.launched_at && { launched_at: new Date().toISOString() }) }).eq("id", c.id);
  revalidatePath(page(storeId));
  return {};
}

/** Supprime un brouillon (rien n'a été créé chez TikTok). */
export async function deleteTiktokDraft(storeId: string, campaignId: string): Promise<void> {
  if (!(await ownedStore(storeId))) return;
  await createAdminClient().from("ad_campaigns").delete().eq("id", campaignId).eq("store_id", storeId).eq("platform", "tiktok").eq("status", "draft");
  revalidatePath(page(storeId));
}

/** Déconnecte le compte TikTok (les campagnes restent dans TikTok Ads Manager). */
export async function disconnectTiktok(storeId: string): Promise<void> {
  if (!(await ownedStore(storeId))) return;
  await createAdminClient().from("ad_connections").delete().eq("store_id", storeId).eq("platform", "tiktok");
  redirect(`${page(storeId)}?tiktok=deconnecte`);
}
