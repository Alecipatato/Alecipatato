"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateStore, type GenerationResult, AI_MODEL, StoreGenerationError, type StoreBrief } from "@/lib/ai/store-generator";
import { requireUser } from "@/lib/auth";
import { isCjConfigured } from "@/lib/cj/client";
import { startSourcingJob } from "@/lib/products/sourcing";
import { PALETTES } from "@/lib/palettes";
import { getPlatformSettings } from "@/lib/settings";
import { parseStoreConfig, THEME_IDS } from "@/lib/store-config";
import { allocateSubdomain } from "@/lib/subdomains";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedProduct } from "@/lib/ai/store-generator";
import { fmt, isLocale, plural } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { describeViolation, moderate } from "@/lib/moderation/rules";
import type { ThemeId } from "@/lib/types";

export type ActionState = { error?: string; message?: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

async function readBrief(formData: FormData): Promise<StoreBrief | string> {
  const t = (await getMessages()).dashboard.actions;
  const niche = String(formData.get("niche") ?? "").trim();
  const productTypes = String(formData.get("product_types") ?? "").trim();
  const themeRaw = String(formData.get("theme") ?? "auto");
  const palette = String(formData.get("palette") ?? "auto");
  const primaryColor = String(formData.get("primary_color") ?? "");
  const storeName = String(formData.get("store_name") ?? "").trim();
  const languageRaw = formData.get("language");

  if (niche.length < 10) return t.nicheTooShort;
  if (niche.length > 1000 || productTypes.length > 500 || storeName.length > 60) return t.fieldTooLong;
  const violation = await moderate([niche, productTypes, storeName]);
  if (violation) return fmt(t.nicheBlocked, { term: describeViolation(violation, await getMessages()) });
  const theme = themeRaw === "auto" || THEME_IDS.includes(themeRaw as ThemeId) ? (themeRaw as StoreBrief["theme"]) : "auto";
  const validPalette = palette === "auto" || palette === "custom" || palette in PALETTES ? palette : "auto";

  return {
    niche,
    productTypes,
    theme,
    palette: validPalette,
    primaryColor: validPalette === "custom" && HEX.test(primaryColor) ? primaryColor : undefined,
    storeName: storeName || undefined,
    language: isLocale(languageRaw) ? languageRaw : await getLocale(),
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
  const m = await getMessages();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("kind", ["create_store", "regenerate_store"]) // la recherche de produits ne compte pas dans la limite
    .gte("created_at", since);
  if ((count ?? 0) >= settings.aiRateLimit.maxRequestsPerHour) {
    return m.dashboard.actions.rateLimited;
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
    // Les textes générés passent aussi par la modération (nom de marque inventé par l'IA, etc.).
    const c = result.store.config.content;
    const violation = await moderate([result.store.name, c.tagline, c.hero.title, c.hero.subtitle, c.about.title, c.about.body, c.footerText]);
    if (violation) return fmt(m.moderation.textBlocked, { reason: describeViolation(violation, m) });
    return { ...result, logId: log.id };
  } catch (error) {
    const message =
      error instanceof StoreGenerationError
        ? fmt(m.errors.generation[error.code], { reason: error.reason ?? "" })
        : m.dashboard.actions.generationFailed;
    if (!(error instanceof StoreGenerationError)) console.error("Génération IA :", error);
    await admin
      .from("ai_generations")
      .update({ status: "failed", error: String(error instanceof Error ? error.message : error).slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", log.id);
    return message;
  }
}

async function productRows(storeId: string, products: GeneratedProduct[]) {
  // Produits d'exemple (sans fournisseur configuré) ; ceux qui enfreignent la modération sont écartés.
  const allowed = [];
  for (const p of products) if (!(await moderate([p.title, p.description, ...p.highlights], [p.category]))) allowed.push(p);
  return allowed.map((p, i) => ({
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
  const t = (await getMessages()).dashboard.actions;
  const brief = await readBrief(formData);
  if (typeof brief === "string") return { error: brief };

  const admin = createAdminClient();
  const settings = await getPlatformSettings();
  const { count } = await admin.from("stores").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  const max = settings.freePlan.maxStores;
  if ((count ?? 0) >= max) return { error: fmt(plural(max, t.storeLimitOne, t.storeLimitOther), { max }) };

  const result = await runGeneration(user.id, "create_store", null, brief);
  if (typeof result === "string") return { error: result };
  const generated = result.store;

  const subdomain = await allocateSubdomain(generated.subdomainSuggestion, generated.name);
  const withSupplier = isCjConfigured();
  const { data: store, error } = await admin
    .from("stores")
    .insert({
      owner_id: user.id,
      subdomain,
      name: generated.name,
      niche_description: brief.niche,
      theme: generated.theme,
      config: generated.config,
      // Avec le fournisseur CJ : hors ligne le temps de choisir les produits.
      status: withSupplier ? "draft" : "active",
      contact_email: user.email,
      language: brief.language,
      generation_brief: brief,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Création de boutique :", error);
    return { error: t.saveFailed };
  }

  await admin.from("ai_generations").update({ store_id: store.id }).eq("id", result.logId);

  if (withSupplier) {
    // Vrais produits : la recherche chez CJ se fait ensuite, étape par étape, sur l'écran « Produits ».
    const keywords = generated.searchKeywords.length ? generated.searchKeywords : [brief.productTypes || brief.niche].map((k) => k.slice(0, 40));
    await startSourcingJob(store.id, keywords);
    redirect(`/tableau-de-bord/boutiques/${store.id}/produits?nouvelle=1`);
  }

  // Sans fournisseur configuré : produits d'exemple générés par l'IA.
  const { error: productsError } = await admin.from("products").insert(await productRows(store.id, generated.products));
  if (productsError) console.error("Insertion des produits :", productsError);
  redirect(`/tableau-de-bord/boutiques/${store.id}?nouvelle=1`);
}

export async function regenerateStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const t = (await getMessages()).dashboard.actions;
  const storeId = String(formData.get("store_id") ?? "");
  const store = await getOwnedStore(storeId, user.id);
  if (!store) return { error: t.notFound };
  if (store.status === "suspended") return { error: t.suspended };

  const settings = await getPlatformSettings();
  if (store.regeneration_count >= settings.freePlan.maxRegenerationsPerStore) {
    return { error: fmt(t.regenerationsUsed, { max: settings.freePlan.maxRegenerationsPerStore }) };
  }

  const brief = await readBrief(formData);
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
      language: brief.language,
      generation_brief: brief,
      regeneration_count: store.regeneration_count + 1,
    })
    .eq("id", store.id);
  if (error) return { error: t.updateFailed };

  // Les produits du fournisseur sont conservés ; seuls les produits d'exemple sont regénérés.
  await admin.from("products").delete().eq("store_id", store.id).eq("supplier", "sample");
  if (!isCjConfigured()) await admin.from("products").insert(await productRows(store.id, generated.products));

  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
  return { message: t.regenerated };
}

export async function updateStoreDesign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const t = (await getMessages()).dashboard.actions;
  const store = await getOwnedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store) return { error: t.notFound };
  if (store.status === "suspended") return { error: t.suspended };

  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const name = get("name").slice(0, 60);
  if (!name) return { error: t.nameRequired };
  const contactEmail = get("contact_email");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: t.invalidContact };
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

  const c = config.content;
  const violation = await moderate([name, c.tagline, c.hero.title, c.hero.subtitle, c.hero.ctaLabel, c.about.title, c.about.body, c.footerText]);
  if (violation) {
    const m = await getMessages();
    return { error: fmt(m.moderation.textBlocked, { reason: describeViolation(violation, m) }) };
  }

  const { error } = await createAdminClient()
    .from("stores")
    .update({
      name,
      theme: THEME_IDS.includes(theme as ThemeId) ? theme : store.theme,
      config,
      contact_email: contactEmail || null,
    })
    .eq("id", store.id);
  if (error) return { error: t.changesFailed };

  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
  return { message: t.changesSaved };
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

/** Informations légales de la boutique (pages légales générées automatiquement). */
export async function updateStoreLegal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const m = await getMessages();
  const store = await getOwnedStore(String(formData.get("store_id") ?? ""), user.id);
  if (!store) return { error: m.dashboard.actions.notFound };
  if (store.status === "suspended") return { error: m.dashboard.actions.suspended };

  const get = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);
  const returnDays = Number(get("return_days", 3));
  if (!Number.isInteger(returnDays) || returnDays < 14 || returnDays > 90) return { error: m.legal.form.invalid };
  const legalInfo = {
    legal_name: get("legal_name", 120),
    address: get("address", 300),
    privacy_officer: get("privacy_officer", 120),
    return_days: returnDays,
  };
  const { error } = await createAdminClient().from("stores").update({ legal_info: legalInfo }).eq("id", store.id);
  if (error) return { error: m.dashboard.actions.changesFailed };
  revalidatePath(`/tableau-de-bord/boutiques/${store.id}`);
  return { message: m.legal.form.saved };
}
