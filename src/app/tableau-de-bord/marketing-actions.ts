"use server";

import { revalidatePath } from "next/cache";
import { AI_MODEL, StoreGenerationError } from "@/lib/ai/store-generator";
import { generateMarketing, marketingTexts } from "@/lib/ai/marketing";
import { requireUser } from "@/lib/auth";
import { fmt, isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { META_PIXEL_PATTERN, parseStoreSeoInput, TIKTOK_PIXEL_PATTERN } from "@/lib/marketing/settings";
import { describeViolation, moderate } from "@/lib/moderation/rules";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice, parseStoreConfig } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";

export type MarketingState = { error?: string; message?: string };

const pagePath = (storeId: string) => `/tableau-de-bord/boutiques/${storeId}/marketing`;

async function ownedStore(storeId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("stores")
    .select("id, name, status, config, niche_description, language, currency, seo")
    .eq("id", storeId)
    .eq("owner_id", userId)
    .maybeSingle();
  return data && data.status !== "suspended" ? data : null;
}

/** Titre et méta-description de la page d'accueil. */
export async function updateStoreSeo(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const user = await requireUser();
  const m = await getMessages();
  const store = await ownedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store) return { error: m.dashboard.actions.notFound };
  const seo = parseStoreSeoInput(String(formData.get("seo_title") ?? ""), String(formData.get("seo_description") ?? ""));
  const violation = await moderate([seo.title, seo.description]);
  if (violation) return { error: fmt(m.moderation.textBlocked, { reason: describeViolation(violation, m) }) };
  const { error } = await createAdminClient().from("stores").update({ seo }).eq("id", store.id);
  if (error) return { error: m.dashboard.actions.changesFailed };
  revalidatePath(pagePath(store.id));
  return { message: m.marketingTools.seo.saved };
}

/** Identifiants des pixels Meta et TikTok (vides = désactivés). */
export async function updateStorePixels(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const user = await requireUser();
  const m = await getMessages();
  const store = await ownedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store) return { error: m.dashboard.actions.notFound };
  const meta = String(formData.get("meta_pixel") ?? "").replace(/\s/g, "");
  const tiktok = String(formData.get("tiktok_pixel") ?? "").replace(/\s/g, "").toUpperCase();
  if ((meta && !META_PIXEL_PATTERN.test(meta)) || (tiktok && !TIKTOK_PIXEL_PATTERN.test(tiktok))) return { error: m.marketingTools.pixels.invalid };
  const { error } = await createAdminClient().from("stores").update({ pixels: { meta: meta || null, tiktok: tiktok || null } }).eq("id", store.id);
  if (error) return { error: m.dashboard.actions.changesFailed };
  revalidatePath(pagePath(store.id));
  return { message: m.marketingTools.pixels.saved };
}

/** Génère des scripts TikTok, des textes publicitaires et une suggestion SEO avec l'IA. */
export async function generateMarketingContent(_prev: MarketingState, formData: FormData): Promise<MarketingState> {
  const user = await requireUser();
  const m = await getMessages();
  const store = await ownedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store) return { error: m.dashboard.actions.notFound };
  const admin = createAdminClient();
  const settings = await getPlatformSettings();

  // Même limite horaire que la génération de boutiques, comptée séparément.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "marketing").gte("created_at", since);
  if ((count ?? 0) >= settings.aiRateLimit.maxRequestsPerHour) return { error: m.marketingTools.ai.rateLimited };

  const { data: products } = await admin.from("products").select("id, title, description, highlights, price_cents").eq("store_id", store.id).eq("status", "active").order("position").limit(30);
  const productId = String(formData.get("product_id") ?? "");
  const focus = (products ?? []).find((p) => p.id === productId) ?? null;
  const language = isLocale(store.language) ? store.language : "en";
  const config = parseStoreConfig(store.config);

  const { data: log } = await admin.from("ai_generations").insert({ user_id: user.id, store_id: store.id, kind: "marketing", model: AI_MODEL }).select("id").single();
  try {
    const { content, usage } = await generateMarketing({
      language,
      store: { name: store.name, tagline: config.content.tagline, niche: store.niche_description ?? "" },
      product: focus
        ? {
            title: focus.title,
            description: focus.description,
            highlights: Array.isArray(focus.highlights) ? focus.highlights.filter((h): h is string => typeof h === "string") : [],
            price: formatPrice(Number(focus.price_cents), store.currency, language),
          }
        : null,
      otherProducts: (products ?? []).filter((p) => p.id !== focus?.id).slice(0, 10).map((p) => p.title),
    });
    if (log) await admin.from("ai_generations").update({ status: "succeeded", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, finished_at: new Date().toISOString() }).eq("id", log.id);
    const violation = await moderate(marketingTexts(content));
    if (violation) return { error: fmt(m.moderation.textBlocked, { reason: describeViolation(violation, m) }) };
    await admin.from("marketing_assets").insert({ store_id: store.id, product_id: focus?.id ?? null, content });
  } catch (error) {
    if (log) {
      await admin
        .from("ai_generations")
        .update({ status: "failed", error: String(error instanceof Error ? error.message : error).slice(0, 500), finished_at: new Date().toISOString() })
        .eq("id", log.id);
    }
    if (error instanceof StoreGenerationError) return { error: fmt(m.errors.generation[error.code], { reason: error.reason ?? "" }) };
    console.error("Contenus marketing :", error);
    return { error: m.dashboard.actions.generationFailed };
  }
  revalidatePath(pagePath(store.id));
  return { message: m.marketingTools.ai.generated };
}
