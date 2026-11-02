import { fmt, isLocale } from "../i18n/config";
import type { Messages } from "../i18n/messages";
import { describeViolation, moderate } from "../moderation/rules";
import { getPlatformSettings } from "../settings";
import { formatPrice, parseStoreConfig } from "../store-config";
import { createAdminClient } from "../supabase/admin";
import { generateMarketing, type MarketingContent, marketingTexts } from "./marketing";
import { AI_MODEL, StoreGenerationError } from "./store-generator";

export interface MarketingStore {
  id: string;
  name: string;
  config: unknown;
  niche_description: string | null;
  language: string | null;
  currency: string;
}

/**
 * Génère et enregistre des contenus marketing (scripts TikTok, textes publicitaires, SEO) pour une boutique,
 * éventuellement centrés sur un produit : limite horaire, journal des coûts et modération compris.
 * Utilisé par l'écran Marketing et par le brouillon de campagne publicitaire.
 */
export async function runMarketingGeneration(
  userId: string,
  store: MarketingStore,
  productId: string | null,
  m: Messages,
): Promise<{ content: MarketingContent; productId: string | null } | { error: string }> {
  const admin = createAdminClient();
  const settings = await getPlatformSettings();

  // Même limite horaire que la génération de boutiques, comptée séparément.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "marketing").gte("created_at", since);
  if ((count ?? 0) >= settings.aiRateLimit.maxRequestsPerHour) return { error: m.marketingTools.ai.rateLimited };

  const { data: products } = await admin.from("products").select("id, title, description, highlights, price_cents").eq("store_id", store.id).eq("status", "active").order("position").limit(30);
  const focus = (products ?? []).find((p) => p.id === productId) ?? null;
  const language = isLocale(store.language) ? store.language : "en";
  const config = parseStoreConfig(store.config);

  const { data: log } = await admin.from("ai_generations").insert({ user_id: userId, store_id: store.id, kind: "marketing", model: AI_MODEL }).select("id").single();
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
    return { content, productId: focus?.id ?? null };
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
}
