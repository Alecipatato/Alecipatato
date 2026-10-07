"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateStore, type GenerationResult, AI_MODEL, StoreGenerationError, type StoreBrief } from "@/lib/ai/store-generator";
import { requireUser } from "@/lib/auth";
import { PALETTES } from "@/lib/palettes";
import { getPlatformSettings } from "@/lib/settings";
import { parseStoreConfig, THEME_IDS } from "@/lib/store-config";
import { allocateSubdomain } from "@/lib/subdomains";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedProduct } from "@/lib/ai/store-generator";
import type { ThemeId } from "@/lib/types";

export type ActionState = { error?: string; message?: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

function readBrief(formData: FormData): StoreBrief | string {
  const niche = String(formData.get("niche") ?? "").trim();
  const productTypes = String(formData.get("product_types") ?? "").trim();
  const themeRaw = String(formData.get("theme") ?? "auto");
  const palette = String(formData.get("palette") ?? "auto");
  const primaryColor = String(formData.get("primary_color") ?? "");
  const storeName = String(formData.get("store_name") ?? "").trim();

  if (niche.length < 10) return "Décrivez votre niche en au moins une phrase (10 caractères minimum).";
  if (niche.length > 1000 || productTypes.length > 500 || storeName.length > 60) return "Un des champs est trop long.";
  const theme = themeRaw === "auto" || THEME_IDS.includes(themeRaw as ThemeId) ? (themeRaw as StoreBrief["theme"]) : "auto";
  const validPalette = palette === "auto" || palette === "custom" || palette in PALETTES ? palette : "auto";

  return {
    niche,
    productTypes,
    theme,
    palette: validPalette,
    primaryColor: validPalette === "custom" && HEX.test(primaryColor) ? primaryColor : undefined,
    storeName: storeName || undefined,
  };
}

/** Appelle l'IA en appliquant le rate limiting et en journalisant l'appel (coûts). */
async function runGeneration(
  userId: string,
  kind: "create_store" | "regenerate_store",
  storeId: string | null,
  brief: StoreBrief,
): Promise<(GenerationResult & { logId: string }) | string> {
  const admin = createAdminClient();
  const settings = await getPlatformSettings();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= settings.aiRateLimit.maxRequestsPerHour) {
    return "Vous avez atteint la limite de générations pour cette heure. Réessayez un peu plus tard.";
  }

  const { data: log, error: logError } = await admin
    .from("ai_generations")
    .insert({ user_id: userId, store_id: storeId, kind, model: AI_MODEL })
    .select("id")
    .single();
  if (logError) throw new Error(`Journalisation impossible : ${logError.message}`);

  try {
    const result = await generateStore(brief);
    await admin
      .from("ai_generations")
      .update({
        status: "succeeded",
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        finished_at: new Date().toISOString(),
      })
      .eq("id", log.id);
    return { ...result, logId: log.id };
  } catch (error) {
    const message = error instanceof StoreGenerationError ? error.message : "La génération a échoué. Réessayez dans un instant.";
    if (!(error instanceof StoreGenerationError)) console.error("Génération IA :", error);
    await admin
      .from("ai_generations")
      .update({ status: "failed", error: String(error instanceof Error ? error.message : error).slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", log.id);
    return message;
  }
}

function productRows(storeId: string, products: GeneratedProduct[]) {
  // Produits d'exemple : remplacés par de vrais produits CJ en phase 3.
  return products.map((p, i) => ({
    store_id: storeId,
    supplier: "sample",
    supplier_product_id: `sample-${i + 1}`,
    title: p.title,
    category: p.category,
    description: p.description,
    highlights: p.highlights,
    price_cents: p.priceCents,
    status: "active",
    position: i,
  }));
}

async function getOwnedStore(storeId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("stores")
    .select("id, owner_id, subdomain, status, config, theme, regeneration_count, generation_brief")
    .eq("id", storeId)
    .eq("owner_id", userId)
    .maybeSingle();
  return data;
}

export async function createStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const brief = readBrief(formData);
  if (typeof brief === "string") return { error: brief };

  const admin = createAdminClient();
  const settings = await getPlatformSettings();
  const { count } = await admin.from("stores").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if ((count ?? 0) >= settings.freePlan.maxStores) {
    return { error: `Le compte gratuit est limité à ${settings.freePlan.maxStores} boutique${settings.freePlan.maxStores > 1 ? "s" : ""}.` };
  }

  const result = await runGeneration(user.id, "create_store", null, brief);
  if (typeof result === "string") return { error: result };
  const generated = result.store;

  const subdomain = await allocateSubdomain(generated.subdomainSuggestion, generated.name);
  const { data: store, error } = await admin
    .from("stores")
    .insert({
      owner_id: user.id,
      subdomain,
      name: generated.name,
      niche_description: brief.niche,
      theme: generated.theme,
      config: generated.config,
      status: "active",
      contact_email: user.email,
      generation_brief: brief,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Création de boutique :", error);
    return { error: "La boutique n'a pas pu être enregistrée. Réessayez." };
  }

  const { error: productsError } = await admin.from("products").insert(productRows(store.id, generated.products));
  if (productsError) console.error("Insertion des produits :", productsError);
  await admin.from("ai_generations").update({ store_id: store.id }).eq("id", result.logId);

  redirect(`/tableau-de-bord/boutiques/${store.id}?nouvelle=1`);
}

export async function regenerateStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const storeId = String(formData.get("store_id") ?? "");
  const store = await getOwnedStore(storeId, user.id);
  if (!store) return { error: "Boutique introuvable." };
  if (store.status === "suspended") return { error: "Cette boutique est suspendue : elle ne peut pas être modifiée." };

  const settings = await getPlatformSettings();
  if (store.regeneration_count >= settings.freePlan.maxRegenerationsPerStore) {
    return { error: `Vous avez utilisé vos ${settings.freePlan.maxRegenerationsPerStore} régénérations pour cette boutique.` };
  }

  const brief = readBrief(formData);
  if (typeof brief === "string") return { error: brief };

  const result = await runGeneration(user.id, "regenerate_store", store.id, brief);
  if (typeof result === "string") return { error: result };
  const generated = result.store;

  const admin = createAdminClient();
  const { error } = await admin
    .from("stores")
    .update({
      name: generated.name,
      niche_description: brief.niche,
      theme: generated.theme,
      config: generated.config,
      generation_brief: brief,
      regeneration_count: store.regeneration_count + 1,
    })
    .eq("id", store.id);
  if (error) return { error: "La boutique n'a pas pu être mise à jour. Réessayez." };

  await admin.from("products").delete().eq("store_id", store.id).eq("supplier", "sample");
  await admin.from("products").insert(productRows(store.id, generated.products));

  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
  return { message: "Votre boutique a été régénérée." };
}

export async function updateStoreDesign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const store = await getOwnedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store) return { error: "Boutique introuvable." };
  if (store.status === "suspended") return { error: "Cette boutique est suspendue : elle ne peut pas être modifiée." };

  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const name = get("name").slice(0, 60);
  if (!name) return { error: "Le nom de la boutique est obligatoire." };
  const contactEmail = get("contact_email");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "Adresse de contact invalide." };
  const theme = get("theme");

  const current = parseStoreConfig(store.config);
  const config = parseStoreConfig({
    colors: {
      primary: get("color_primary"),
      accent: get("color_accent"),
      background: get("color_background"),
      text: get("color_text"),
    },
    fonts: { heading: get("font_heading"), body: get("font_body") },
    content: {
      ...current.content,
      tagline: get("tagline"),
      hero: { title: get("hero_title"), subtitle: get("hero_subtitle"), ctaLabel: get("hero_cta") || current.content.hero.ctaLabel },
      about: { title: get("about_title"), body: get("about_body") },
      footerText: get("footer_text"),
    },
  });

  const { error } = await createAdminClient()
    .from("stores")
    .update({
      name,
      theme: THEME_IDS.includes(theme as ThemeId) ? theme : store.theme,
      config,
      contact_email: contactEmail || null,
    })
    .eq("id", store.id);
  if (error) return { error: "Les modifications n'ont pas pu être enregistrées." };

  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
  return { message: "Modifications enregistrées. Elles sont déjà visibles sur votre boutique." };
}

export async function setProductVisibility(formData: FormData) {
  const user = await requireUser();
  const store = await getOwnedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store || store.status === "suspended") return;
  const visible = formData.get("visible") === "1";
  await createAdminClient()
    .from("products")
    .update({ status: visible ? "active" : "rejected" })
    .eq("id", String(formData.get("product_id") ?? ""))
    .eq("store_id", store.id);
  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
}

export async function setStoreOnline(formData: FormData) {
  const user = await requireUser();
  const store = await getOwnedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store || store.status === "suspended") return;
  await createAdminClient()
    .from("stores")
    .update({ status: formData.get("online") === "1" ? "active" : "draft" })
    .eq("id", store.id);
  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
  revalidatePath("/tableau-de-bord");
}
