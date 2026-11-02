"use server";

import { revalidatePath } from "next/cache";
import { runMarketingGeneration } from "@/lib/ai/marketing-run";
import { requireUser } from "@/lib/auth";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { META_PIXEL_PATTERN, parseStoreSeoInput, TIKTOK_PIXEL_PATTERN } from "@/lib/marketing/settings";
import { describeViolation, moderate } from "@/lib/moderation/rules";
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
  const result = await runMarketingGeneration(user.id, store, String(formData.get("product_id") ?? "") || null, m);
  if ("error" in result) return { error: result.error };
  revalidatePath(pagePath(store.id));
  return { message: m.marketingTools.ai.generated };
}
