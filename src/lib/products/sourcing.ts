import { type AiUsage, rewriteProducts, selectProducts } from "../ai/product-curator";
import { AI_MODEL, StoreGenerationError } from "../ai/store-generator";
import { isLocale } from "../i18n/config";
import { getProductDetail, getShippingOptions, searchProducts } from "../cj/catalog";
import { bestShippingOption, type CjProductDetail, type CjProductSummary, type CjShippingOption, type CjVariant } from "../cj/normalize";
import { getUsdCadRate } from "../fx";
import { suggestRetailPriceCents, usdToCadCents } from "../money";
import { getPlatformSettings } from "../settings";
import { createAdminClient } from "../supabase/admin";

/**
 * Recherche de produits pour une boutique, en petites étapes (chaque appel de
 * advanceSourcing dure quelques secondes) :
 *   1. searching  : recherche dans le catalogue CJ avec les mots-clés de la boutique
 *   2. selecting  : l'IA choisit et classe les meilleurs candidats
 *   3. processing : par lots — fiche CJ, livraison Canada ≤ 15 jours, rédaction, prix ≥ 40 % de marge
 *   4. done       : produits « proposés », à valider par le client ; les choix restants servent de remplaçants
 */

export const MAX_DELIVERY_DAYS = 15;
const BATCH_SIZE = 4;
const MAX_CANDIDATES = 90;
const EXTRA_PICKS = 12; // remplaçants

export interface SourcingState {
  id: string;
  status: "searching" | "selecting" | "processing" | "done" | "failed";
  proposed: number;
  target: number;
  error: string | null;
}

type JobRow = {
  id: string;
  store_id: string;
  status: SourcingState["status"];
  keywords: string[];
  candidates: CjProductSummary[];
  picks: string[];
  cursor: number;
  target: number;
  error: string | null;
};

async function logAi(storeId: string, kind: "select_products" | "rewrite_products", usage: AiUsage) {
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("owner_id").eq("id", storeId).single();
  if (!store) return;
  await admin.from("ai_generations").insert({
    user_id: store.owner_id,
    store_id: storeId,
    kind,
    status: "succeeded",
    model: AI_MODEL,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    finished_at: new Date().toISOString(),
  });
}

async function countSupplierProducts(storeId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("supplier", "cj")
    .in("status", ["proposed", "active"]);
  return count ?? 0;
}

export async function startSourcingJob(storeId: string, keywords: string[], target = 18): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("sourcing_jobs")
    .insert({ store_id: storeId, keywords: keywords.slice(0, 6), target })
    .select("id")
    .single();
  if (error) throw new Error(`Création de la recherche impossible : ${error.message}`);
  return data.id;
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const { data } = await createAdminClient()
    .from("sourcing_jobs")
    .select("id, store_id, status, keywords, candidates, picks, cursor, target, error")
    .eq("id", jobId)
    .maybeSingle<JobRow>();
  return data;
}

async function toState(job: JobRow): Promise<SourcingState> {
  return { id: job.id, status: job.status, proposed: await countSupplierProducts(job.store_id), target: job.target, error: job.error };
}

async function updateJob(jobId: string, patch: Partial<JobRow>) {
  await createAdminClient().from("sourcing_jobs").update(patch).eq("id", jobId);
}

/** Fait avancer la recherche d'une étape. Sans danger si appelée plusieurs fois. */
export async function advanceSourcing(jobId: string): Promise<SourcingState> {
  const job = await loadJob(jobId);
  if (!job) throw new Error("Recherche introuvable.");
  if (job.status === "done" || job.status === "failed") return toState(job);

  try {
    if (job.status === "searching") {
      const found = new Map<string, CjProductSummary>();
      for (const keyword of job.keywords) {
        try {
          for (const p of await searchProducts(keyword, 20)) {
            // Écarte les produits sans image ou hors des prix raisonnables (1 $ à 80 $ US).
            if (p.image && p.priceUsdCents >= 100 && p.priceUsdCents <= 8000) found.set(p.pid, p);
          }
        } catch (err) {
          console.warn(`Recherche CJ « ${keyword} » :`, err);
        }
      }
      const candidates = [...found.values()].slice(0, MAX_CANDIDATES);
      if (candidates.length === 0) {
        await updateJob(job.id, { status: "failed", error: "no_products_found" });
      } else {
        await updateJob(job.id, { status: "selecting", candidates });
      }
    } else if (job.status === "selecting") {
      const { data: store } = await createAdminClient().from("stores").select("niche_description, name").eq("id", job.store_id).single();
      const { pids, usage } = await selectProducts(store?.niche_description || store?.name || "", job.candidates, job.target + EXTRA_PICKS);
      await logAi(job.store_id, "select_products", usage);
      if (pids.length === 0) {
        await updateJob(job.id, { status: "failed", error: "no_products_suitable" });
      } else {
        await updateJob(job.id, { status: "processing", picks: pids, cursor: 0 });
      }
    } else if (job.status === "processing") {
      const already = await countSupplierProducts(job.store_id);
      const batch = job.picks.slice(job.cursor, job.cursor + Math.min(BATCH_SIZE, Math.max(job.target - already, 0)));
      if (batch.length > 0) await processPicks(job.store_id, batch);
      const cursor = job.cursor + batch.length;
      const done = cursor >= job.picks.length || (await countSupplierProducts(job.store_id)) >= job.target;
      await updateJob(job.id, { cursor, ...(done && { status: "done" }) });
    }
  } catch (err) {
    // Code d'erreur (traduit à l'affichage) ou détail technique.
    const message = err instanceof StoreGenerationError ? err.code : err instanceof Error ? err.message : "unknown";
    console.error("Recherche de produits :", err);
    await updateJob(job.id, { status: "failed", error: message.slice(0, 300) });
  }

  return toState((await loadJob(jobId)) ?? job);
}

interface Prepared {
  detail: CjProductDetail;
  variant: CjVariant;
  shipping: CjShippingOption;
}

/** Fiche CJ + livraison Canada ≤ 15 jours. null si le produit ne convient pas. */
async function prepare(pid: string): Promise<Prepared | null> {
  const detail = await getProductDetail(pid);
  if (!detail || detail.variants.length === 0 || detail.images.length === 0) return null;
  const variant = [...detail.variants].sort((a, b) => a.priceUsdCents - b.priceUsdCents)[0];
  const shipping = bestShippingOption(await getShippingOptions(variant.vid, "CA"), MAX_DELIVERY_DAYS);
  return shipping ? { detail, variant, shipping } : null;
}

/**
 * Traite des choix de l'IA : vérifie chaque produit chez CJ, fait rédiger les
 * fiches dans la langue de la boutique et enregistre les produits « proposés ». Retourne le nombre ajouté.
 */
export async function processPicks(storeId: string, pids: string[]): Promise<number> {
  const prepared: Prepared[] = [];
  for (const pid of pids) {
    try {
      const p = await prepare(pid);
      if (p) prepared.push(p);
    } catch (err) {
      console.warn(`Produit CJ ${pid} ignoré :`, err);
    }
  }
  if (prepared.length === 0) return 0;

  const admin = createAdminClient();
  const [{ data: store }, { data: existing }, settings] = await Promise.all([
    admin.from("stores").select("niche_description, name, language").eq("id", storeId).single(),
    admin.from("products").select("category, position").eq("store_id", storeId),
    getPlatformSettings(),
  ]);
  const categories = [...new Set((existing ?? []).map((p) => p.category).filter((c): c is string => Boolean(c)))];
  const language = isLocale(store?.language) ? store.language : "en";
  let position = Math.max(-1, ...(existing ?? []).map((p) => p.position ?? 0)) + 1;

  const { copies, usage } = await rewriteProducts(
    { niche: store?.niche_description || store?.name || "", categories, language },
    prepared.map((p) => ({ pid: p.detail.pid, name: p.detail.name, description: p.detail.description, variantName: p.variant.name })),
  );
  await logAi(storeId, "rewrite_products", usage);
  const copyByPid = new Map(copies.map((c) => [c.pid, c]));
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);

  const rows = prepared.map((p) => {
    const copy = copyByPid.get(p.detail.pid);
    const costCadCents = usdToCadCents(p.variant.priceUsdCents + p.shipping.priceUsdCents, fx.rate);
    const price = suggestRetailPriceCents(costCadCents, settings.minMarginRate);
    const images = [...new Set([...(p.variant.image ? [p.variant.image] : []), ...p.detail.images])].slice(0, 8);
    return {
      store_id: storeId,
      supplier: "cj",
      supplier_product_id: p.detail.pid,
      supplier_variant_id: p.variant.vid,
      title: copy?.title || p.detail.name.slice(0, 120),
      description: copy?.description || null,
      highlights: copy?.highlights ?? [],
      category: copy?.category || p.detail.category || (language === "fr" ? "Divers" : "Miscellaneous"),
      images,
      price_cents: price,
      suggested_price_cents: price,
      supplier_cost_usd_cents: p.variant.priceUsdCents,
      shipping_cost_usd_cents: p.shipping.priceUsdCents,
      delivery_days_min: p.shipping.daysMin,
      delivery_days_max: p.shipping.daysMax,
      shipping_method: p.shipping.name,
      status: "proposed",
      position: position++,
      last_synced_at: new Date().toISOString(),
    };
  });

  const { data: inserted, error } = await admin
    .from("products")
    .upsert(rows, { onConflict: "store_id,supplier,supplier_product_id,supplier_variant_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`Enregistrement des produits impossible : ${error.message}`);
  return inserted?.length ?? 0;
}

/**
 * Remplace un produit refusé par le prochain choix de l'IA encore non traité.
 * Retourne true si un remplaçant a été ajouté.
 */
export async function addReplacement(storeId: string): Promise<boolean> {
  const { data: job } = await createAdminClient()
    .from("sourcing_jobs")
    .select("id, picks, cursor")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; picks: string[]; cursor: number }>();
  if (!job) return false;

  let cursor = job.cursor;
  let added = 0;
  // Jusqu'à 3 essais : certains produits sont écartés (livraison trop lente, plus disponible…).
  for (let tries = 0; tries < 3 && added === 0 && cursor < job.picks.length; tries++) {
    added = await processPicks(storeId, [job.picks[cursor]]);
    cursor++;
  }
  await updateJob(job.id, { cursor });
  return added > 0;
}
