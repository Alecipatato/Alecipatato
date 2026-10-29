import { classifyTrends } from "../ai/product-curator";
import { AI_MODEL } from "../ai/store-generator";
import { getProductDetail, getShippingOptions, searchProducts } from "../cj/catalog";
import { bestShippingOption, type CjProductSummary } from "../cj/normalize";
import { findViolation, type ModerationRule } from "../moderation/match";
import { getModerationRules } from "../moderation/rules";
import { MAX_DELIVERY_DAYS } from "../products/sourcing";
import { createAdminClient } from "../supabase/admin";
import { demandScore, demandSignal } from "./score";
import { TREND_THEMES, type TrendThemeId } from "./themes";

/**
 * Rafraîchissement des produits tendance depuis CJ (tâche planifiée /api/cron/trends, toutes les heures).
 * Chaque passage reste court (environ 1 appel CJ par seconde) :
 *   1. découverte d'UNE source, la plus ancienne (chaque source revient environ une fois par jour) :
 *      - un thème : produits les plus importés pour ses mots-clés, dans la zone TikTok de CJ,
 *        parmi les produits « tendance » de CJ, puis dans tout le catalogue ;
 *      - « tiktok » : les produits tendance de la zone TikTok de CJ, tous thèmes ;
 *   2. tri par l'IA des nouveaux produits : thème (ou refus : santé, cosmétiques, marques…) et nom court FR/EN ;
 *   3. vérification par lots : fiche, variante la moins chère, livraison Canada ≤ 15 jours ;
 *   4. score de demande : boutiques CJ + ventes réelles sur la plateforme (30 jours).
 * Aucune popularité n'est inventée : « TikTok » et « tendance » sont les indicateurs donnés par CJ.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Produits gardés par thème à chaque découverte. */
export const PER_THEME = 40;
/** Zone TikTok : pages de 100 produits « tendance ». */
const TIKTOK_PAGES = 3;
const SEARCH_SIZE = 50;
const CLASSIFY_BATCH = 40;
const CLASSIFY_PER_PASS = 80;
const CHECK_BATCH = 25;
/** Un produit absent des découvertes depuis ce délai n'est plus « tendance ». */
const STALE_DAYS = 3;
/** Un produit affiché est revérifié (prix, livraison, disponibilité) au moins à ce rythme. */
const RECHECK_MS = DAY_MS;
const MIN_PRICE_USD_CENTS = 100;
const MAX_PRICE_USD_CENTS = 8000;

const TIKTOK_SOURCE = "tiktok";
type SourceId = TrendThemeId | typeof TIKTOK_SOURCE;
const SOURCES: SourceId[] = [TIKTOK_SOURCE, ...TREND_THEMES.map((t) => t.id)];

export interface TrendsReport {
  source: SourceId | null;
  discovered: number;
  classified: number;
  checked: number;
  ready: number;
  rejected: number;
}

type Found = { product: CjProductSummary; tiktok: boolean; trending: boolean };

function acceptable(rules: ModerationRule[], p: CjProductSummary) {
  return Boolean(p.image) && p.priceUsdCents >= MIN_PRICE_USD_CENTS && p.priceUsdCents <= MAX_PRICE_USD_CENTS && !findViolation(rules, [p.name], [p.category]);
}

/** Une recherche CJ ; une erreur passagère n'arrête pas la découverte (null = échec). */
async function search(label: string, ...args: Parameters<typeof searchProducts>): Promise<CjProductSummary[] | null> {
  try {
    return await searchProducts(...args);
  } catch (err) {
    console.warn(`Tendances CJ « ${label} » :`, err);
    return null;
  }
}

async function collect(source: SourceId, rules: ModerationRule[]): Promise<{ found: Found[]; ok: boolean }> {
  const map = new Map<string, Found>();
  let ok = false;
  const add = (list: CjProductSummary[] | null, flags: { tiktok?: boolean; trending?: boolean }) => {
    if (!list) return;
    ok = true;
    for (const p of list) {
      if (!acceptable(rules, p)) continue;
      const prev = map.get(p.pid);
      map.set(p.pid, { product: p, tiktok: Boolean(prev?.tiktok || flags.tiktok), trending: Boolean(prev?.trending || flags.trending) });
    }
  };

  if (source === TIKTOK_SOURCE) {
    for (let page = 1; page <= TIKTOK_PAGES; page++) {
      const list = await search(`tiktok p${page}`, "", 100, { byPopularity: true, tiktok: true, trending: true, page });
      add(list, { tiktok: true, trending: true });
      if (!list || list.length < 100) break;
    }
    add(await search("tiktok", "", 100, { byPopularity: true, tiktok: true }), { tiktok: true });
    return { found: [...map.values()], ok };
  }

  const theme = TREND_THEMES.find((t) => t.id === source)!;
  for (const keyword of theme.keywords) {
    add(await search(`${keyword} tiktok`, keyword, SEARCH_SIZE, { byPopularity: true, tiktok: true }), { tiktok: true });
    add(await search(`${keyword} tendance`, keyword, SEARCH_SIZE, { byPopularity: true, trending: true }), { trending: true });
    add(await search(keyword, keyword, SEARCH_SIZE, { byPopularity: true }), {});
  }
  // Priorité aux produits populaires sur TikTok ou marqués « tendance », puis aux plus importés.
  const rank = (f: Found) => (f.tiktok ? 2 : 0) + (f.trending ? 1 : 0);
  const top = [...map.values()].sort((a, b) => rank(b) - rank(a) || b.product.listedCount - a.product.listedCount).slice(0, PER_THEME);
  return { found: top, ok };
}

async function discover(source: SourceId): Promise<number> {
  const admin = createAdminClient();
  const { found, ok } = await collect(source, await getModerationRules());
  if (!ok) return 0; // CJ injoignable : la source sera reprise au prochain passage
  const now = new Date().toISOString();

  if (found.length) {
    const pids = found.map((f) => f.product.pid);
    const { data: existing } = await admin.from("trending_products").select("supplier_product_id, tiktok, trending, theme").in("supplier_product_id", pids);
    const known = new Map((existing ?? []).map((e) => [e.supplier_product_id, e]));
    const common = (f: Found) => {
      const prev = known.get(f.product.pid);
      return {
        supplier_product_id: f.product.pid,
        name: f.product.name,
        category: f.product.category,
        supplier_cost_usd_cents: f.product.priceUsdCents,
        listed_count: f.product.listedCount,
        tiktok: f.tiktok || Boolean(prev?.tiktok),
        trending: f.trending || Boolean(prev?.trending),
        discovered_at: now,
      };
    };
    const fresh = found.filter((f) => !known.has(f.product.pid));
    const seen = found.filter((f) => known.has(f.product.pid));
    if (fresh.length) {
      // Thème du mot-clé = simple indice, confirmé (ou corrigé) par l'IA.
      const { error } = await admin
        .from("trending_products")
        .insert(fresh.map((f) => ({ ...common(f), theme: source === TIKTOK_SOURCE ? null : source, images: [f.product.image] })));
      if (error) throw new Error(`Enregistrement des tendances impossible : ${error.message}`);
    }
    if (seen.length) {
      // Déjà connus : on rafraîchit la popularité sans toucher au thème ni aux vérifications.
      const { error } = await admin.from("trending_products").upsert(seen.map(common), { onConflict: "supplier_product_id" });
      if (error) throw new Error(`Mise à jour des tendances impossible : ${error.message}`);
      // De nouveau parmi les meilleurs : remis en vérification.
      await admin
        .from("trending_products")
        .update({ status: "pending", reject_reason: null })
        .eq("reject_reason", "not_trending")
        .in("supplier_product_id", seen.map((f) => f.product.pid));
      // Trouvés d'abord dans la zone TikTok (sans thème), puis par un mot-clé : le thème du mot-clé sert d'indice
      // et le produit refusé faute de thème (« unclassified ») est trié à nouveau.
      const untyped = seen.filter((f) => !known.get(f.product.pid)?.theme).map((f) => f.product.pid);
      if (source !== TIKTOK_SOURCE && untyped.length) {
        await admin
          .from("trending_products")
          .update({ theme: source, status: "pending", reject_reason: null, classified_at: null })
          .is("theme", null)
          .or("reject_reason.is.null,reject_reason.eq.unclassified")
          .in("supplier_product_id", untyped);
      }
    }
  }

  await admin.from("trend_sources").upsert({ id: source, discovered_at: now, found: found.length });
  // Produits qui ne sont plus dans les meilleurs depuis quelques jours : retirés de la galerie.
  await admin
    .from("trending_products")
    .update({ status: "rejected", reject_reason: "not_trending" })
    .lt("discovered_at", new Date(Date.now() - STALE_DAYS * DAY_MS).toISOString())
    .neq("status", "rejected");
  return found.length;
}

/** Source à découvrir maintenant : jamais découverte, ou la plus ancienne si elle date de plus d'un jour. */
async function nextSource(): Promise<SourceId | null> {
  const { data } = await createAdminClient().from("trend_sources").select("id, discovered_at");
  const last = new Map((data ?? []).map((s) => [s.id, Date.parse(s.discovered_at)]));
  const [oldest] = [...SOURCES].sort((a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0));
  return (last.get(oldest) ?? 0) < Date.now() - DAY_MS ? oldest : null;
}

type ClassifyRow = { id: string; supplier_product_id: string; name: string; category: string | null; theme: string | null; supplier_cost_usd_cents: number; status: string };

/** Tri des nouveaux produits par l'IA. Sans IA configurée : le thème du mot-clé est gardé tel quel. */
async function classify(): Promise<number> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("trending_products")
    .select("id, supplier_product_id, name, category, theme, supplier_cost_usd_cents, status")
    .neq("status", "rejected") // y compris les produits affichés avant l'étape C
    .is("classified_at", null)
    .order("discovered_at", { ascending: true })
    .limit(CLASSIFY_PER_PASS)
    .returns<ClassifyRow[]>();
  if (!rows?.length) return 0;
  const now = new Date().toISOString();
  // Écriture groupée (upsert) : seules les colonnes données sont modifiées, et toutes les lignes doivent
  // avoir les mêmes (une colonne absente d'une ligne y serait mise à « null »).
  const keep = (r: ClassifyRow, theme: string | null, nameEn: string | null, nameFr: string | null) => ({
    id: r.id, supplier_product_id: r.supplier_product_id, name: r.name, supplier_cost_usd_cents: r.supplier_cost_usd_cents,
    classified_at: now, status: r.status, reject_reason: null, theme, name_en: nameEn, name_fr: nameFr,
  });
  const drop = (r: ClassifyRow, reason: string) => ({ ...keep(r, r.theme, null, null), status: "rejected", reject_reason: reason });

  if (!process.env.ANTHROPIC_API_KEY) {
    await admin.from("trending_products").upsert(
      rows.map((r) => (r.theme ? keep(r, r.theme, r.name, null) : drop(r, "unclassified"))),
      { onConflict: "id" },
    );
    return rows.length;
  }

  let classified = 0;
  for (let i = 0; i < rows.length; i += CLASSIFY_BATCH) {
    const batch = rows.slice(i, i + CLASSIFY_BATCH);
    const { data: log } = await admin.from("ai_generations").insert({ kind: "classify_trends", model: AI_MODEL }).select("id").single();
    try {
      const { results, usage } = await classifyTrends(
        batch.map((r) => ({ pid: r.supplier_product_id, name: r.name, category: r.category, hint: r.theme })),
        TREND_THEMES.map((t) => t.id),
      );
      if (log) await admin.from("ai_generations").update({ status: "succeeded", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, finished_at: new Date().toISOString() }).eq("id", log.id);
      const byPid = new Map(batch.map((r) => [r.supplier_product_id, r]));
      const updates = results.map((c) => {
        const row = byPid.get(c.pid)!;
        return c.theme ? keep(row, c.theme, c.nameEn || null, c.nameFr || null) : drop(row, `ai:${c.reason}`);
      });
      if (updates.length) {
        const { error } = await admin.from("trending_products").upsert(updates, { onConflict: "id" });
        if (error) throw new Error(error.message);
      }
      classified += updates.length;
    } catch (err) {
      // IA indisponible : nouvel essai au prochain passage.
      console.warn("Tri des tendances par l'IA :", err);
      if (log) await admin.from("ai_generations").update({ status: "failed", error: String(err).slice(0, 500), finished_at: new Date().toISOString() }).eq("id", log.id);
      break;
    }
  }
  return classified;
}

async function check(limit: number): Promise<{ checked: number; ready: number; rejected: number }> {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - RECHECK_MS).toISOString();
  const { data: rows } = await admin
    .from("trending_products")
    .select("id, supplier_product_id, status")
    .not("classified_at", "is", null)
    .not("theme", "is", null)
    .or(`status.eq.pending,and(status.eq.ready,checked_at.lt.${staleBefore})`)
    .order("status") // « pending » avant « ready »
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  const rules = await getModerationRules();
  let ready = 0;
  let rejected = 0;
  for (const row of rows ?? []) {
    const reject = async (reason: string) => {
      rejected++;
      await admin.from("trending_products").update({ status: "rejected", reject_reason: reason, checked_at: new Date().toISOString() }).eq("id", row.id);
    };
    try {
      const detail = await getProductDetail(row.supplier_product_id);
      if (!detail || detail.variants.length === 0 || detail.images.length === 0) {
        await reject("unavailable");
        continue;
      }
      if (findViolation(rules, [detail.name, detail.description], [detail.category])) {
        await reject("moderation");
        continue;
      }
      const variant = [...detail.variants].sort((a, b) => a.priceUsdCents - b.priceUsdCents)[0];
      const shipping = bestShippingOption(await getShippingOptions(variant.vid, "CA"), MAX_DELIVERY_DAYS);
      if (!shipping) {
        await reject("slow_delivery");
        continue;
      }
      ready++;
      await admin
        .from("trending_products")
        .update({
          status: "ready",
          reject_reason: null,
          supplier_variant_id: variant.vid,
          name: detail.name,
          description: detail.description.slice(0, 1500),
          category: detail.category,
          images: [...new Set([...(variant.image ? [variant.image] : []), ...detail.images])].slice(0, 6),
          supplier_cost_usd_cents: variant.priceUsdCents,
          shipping_cost_usd_cents: shipping.priceUsdCents,
          delivery_days_min: shipping.daysMin,
          delivery_days_max: shipping.daysMax,
          shipping_method: shipping.name,
          checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (err) {
      // Erreur passagère (réseau, limite d'appels) : nouvel essai au prochain passage.
      console.warn(`Tendance CJ ${row.supplier_product_id} :`, err);
    }
  }
  return { checked: rows?.length ?? 0, ready, rejected };
}

/** Recalcule le score de demande de tous les produits suivis (une seule écriture groupée). */
async function rescore() {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("trending_products")
    .select("id, supplier_product_id, name, supplier_cost_usd_cents, listed_count, sales_count, demand_score")
    .neq("status", "rejected")
    .limit(5000);
  if (!rows?.length) return;
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const { data: sold } = await admin
    .from("order_items")
    .select("supplier_product_id, quantity, orders!inner(paid_at)")
    .not("supplier_product_id", "is", null)
    .gte("orders.paid_at", since)
    .limit(50_000);
  const sales = new Map<string, number>();
  for (const s of sold ?? []) if (s.supplier_product_id) sales.set(s.supplier_product_id, (sales.get(s.supplier_product_id) ?? 0) + s.quantity);
  const signals = rows.map((r) => demandSignal(r.listed_count, sales.get(r.supplier_product_id) ?? 0));
  const reference = Math.max(...signals);
  const changed = rows
    .map((r, i) => ({ r, score: demandScore(signals[i], reference), salesCount: sales.get(r.supplier_product_id) ?? 0 }))
    .filter(({ r, score, salesCount }) => score !== r.demand_score || salesCount !== r.sales_count)
    .map(({ r, score, salesCount }) => ({ id: r.id, supplier_product_id: r.supplier_product_id, name: r.name, supplier_cost_usd_cents: r.supplier_cost_usd_cents, demand_score: score, sales_count: salesCount }));
  if (changed.length) {
    const { error } = await admin.from("trending_products").upsert(changed, { onConflict: "id" });
    if (error) console.warn("Score des tendances :", error.message);
  }
}

export async function refreshTrends(options: { checkLimit?: number } = {}): Promise<TrendsReport> {
  const source = await nextSource();
  const discovered = source ? await discover(source) : 0;
  const classified = await classify();
  const result = await check(options.checkLimit ?? CHECK_BATCH);
  await rescore();
  return { source, discovered, classified, ...result };
}
