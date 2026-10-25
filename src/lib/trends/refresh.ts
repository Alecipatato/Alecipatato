import { getProductDetail, getShippingOptions, searchProducts } from "../cj/catalog";
import { bestShippingOption, type CjProductSummary } from "../cj/normalize";
import { findViolation } from "../moderation/match";
import { getModerationRules } from "../moderation/rules";
import { MAX_DELIVERY_DAYS } from "../products/sourcing";
import { createAdminClient } from "../supabase/admin";
import { demandScore, demandSignal } from "./score";
import { TREND_THEMES } from "./themes";

/**
 * Rafraîchissement des produits tendance depuis CJ (tâche planifiée /api/cron/trends, toutes les heures) :
 *   1. découverte (une fois par jour) : produits les plus importés par les boutiques CJ, par thème ;
 *   2. vérification (par lots, à chaque passage) : fiche, variante la moins chère, livraison Canada ≤ 15 jours ;
 *   3. score de demande : boutiques CJ + ventes réelles sur la plateforme (30 jours).
 * Chaque passage reste court (environ 1 appel CJ par seconde).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PER_THEME = 12;
const CHECK_BATCH = 8;
const STALE_DAYS = 3;

export interface TrendsReport {
  discovered: number;
  checked: number;
  ready: number;
  rejected: number;
}

async function discover(): Promise<number> {
  const admin = createAdminClient();
  const rules = await getModerationRules();
  const now = new Date().toISOString();
  const rows = [];
  for (const theme of TREND_THEMES) {
    const found = new Map<string, CjProductSummary>();
    for (const keyword of theme.keywords) {
      try {
        for (const p of await searchProducts(keyword, 20)) {
          if (p.image && p.priceUsdCents >= 100 && p.priceUsdCents <= 8000 && !findViolation(rules, [p.name], [p.category])) found.set(p.pid, p);
        }
      } catch (err) {
        console.warn(`Tendances CJ « ${keyword} » :`, err);
      }
    }
    const top = [...found.values()].sort((a, b) => b.listedCount - a.listedCount).slice(0, PER_THEME);
    rows.push(
      ...top.map((p) => ({
        theme: theme.id,
        supplier_product_id: p.pid,
        name: p.name,
        category: p.category,
        images: [p.image],
        supplier_cost_usd_cents: p.priceUsdCents,
        listed_count: p.listedCount,
        discovered_at: now,
      })),
    );
  }
  if (rows.length === 0) return 0;
  const { error } = await admin.from("trending_products").upsert(rows, { onConflict: "supplier_product_id" });
  if (error) throw new Error(`Enregistrement des tendances impossible : ${error.message}`);
  // Produits qui ne sont plus dans les meilleurs depuis quelques jours : retirés.
  await admin
    .from("trending_products")
    .update({ status: "rejected", reject_reason: "not_trending" })
    .lt("discovered_at", new Date(Date.now() - STALE_DAYS * DAY_MS).toISOString())
    .neq("status", "rejected");
  return rows.length;
}

async function check(limit: number): Promise<{ checked: number; ready: number; rejected: number }> {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - DAY_MS).toISOString();
  const { data: rows } = await admin
    .from("trending_products")
    .select("id, supplier_product_id, status")
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

/** Recalcule le score de demande de tous les produits suivis. */
async function rescore() {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("trending_products").select("id, supplier_product_id, listed_count, sales_count, demand_score").neq("status", "rejected");
  if (!rows?.length) return;
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const { data: sold } = await admin
    .from("order_items")
    .select("supplier_product_id, quantity, orders!inner(paid_at)")
    .in("supplier_product_id", rows.map((r) => r.supplier_product_id))
    .gte("orders.paid_at", since);
  const sales = new Map<string, number>();
  for (const s of sold ?? []) if (s.supplier_product_id) sales.set(s.supplier_product_id, (sales.get(s.supplier_product_id) ?? 0) + s.quantity);
  const signals = rows.map((r) => demandSignal(r.listed_count, sales.get(r.supplier_product_id) ?? 0));
  const reference = Math.max(...signals);
  for (const [i, r] of rows.entries()) {
    const salesCount = sales.get(r.supplier_product_id) ?? 0;
    const score = demandScore(signals[i], reference);
    if (score !== r.demand_score || salesCount !== r.sales_count) {
      await admin.from("trending_products").update({ demand_score: score, sales_count: salesCount }).eq("id", r.id);
    }
  }
}

export async function refreshTrends(options: { checkLimit?: number } = {}): Promise<TrendsReport> {
  const admin = createAdminClient();
  const { data: last } = await admin.from("trending_products").select("discovered_at").order("discovered_at", { ascending: false }).limit(1).maybeSingle();
  const discovered = !last || Date.parse(last.discovered_at) < Date.now() - DAY_MS ? await discover() : 0;
  const result = await check(options.checkLimit ?? CHECK_BATCH);
  await rescore();
  return { discovered, ...result };
}
