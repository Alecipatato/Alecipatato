import { isCjConfigured } from "../cj/client";
import type { Locale } from "../i18n/config";
import { findViolation } from "../moderation/match";
import { getModerationRules } from "../moderation/rules";
import { createAdminClient } from "../supabase/admin";
import { SAMPLE_RISING, SAMPLE_TIKTOK, SAMPLE_TRENDS } from "./samples";
import { demandScore, demandSignal } from "./score";
import { isTrendTheme, type TrendThemeId } from "./themes";

/** Produit tendance prêt à être proposé au client (coûts en USD, comme chez le fournisseur). */
export interface TrendProduct {
  id: string;
  theme: TrendThemeId;
  source: "cj" | "sample";
  supplierProductId: string;
  name: string;
  description: string;
  highlights: string[];
  category: string | null;
  images: string[];
  supplierCostUsdCents: number;
  shippingUsdCents: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  listedCount: number;
  salesCount: number;
  demandScore: number;
  /** Indicateurs de CJ : produit de la zone TikTok, produit marqué « tendance ». */
  tiktok: boolean;
  rising: boolean;
}

/** Visuel d'un produit d'exemple (adresse relative : servie sur tous les domaines, vitrines comprises). */
export function sampleImageUrl(id: string): string {
  return `/api/trends/image/${id}.svg`;
}

function sampleTrends(locale: Locale): TrendProduct[] {
  const max = Math.max(...SAMPLE_TRENDS.map((s) => s.listed));
  return SAMPLE_TRENDS.map((s) => ({
    id: s.id,
    theme: s.theme,
    source: "sample",
    supplierProductId: s.id,
    name: s.name[locale],
    description: s.description[locale],
    highlights: s.highlights[locale],
    category: s.category[locale],
    images: [sampleImageUrl(s.id)],
    supplierCostUsdCents: s.supplierCostUsdCents,
    shippingUsdCents: s.shippingUsdCents,
    deliveryDaysMin: s.days[0],
    deliveryDaysMax: s.days[1],
    listedCount: s.listed,
    salesCount: 0,
    demandScore: demandScore(demandSignal(s.listed, 0), max),
    tiktok: SAMPLE_TIKTOK.has(s.id),
    rising: SAMPLE_RISING.has(s.id),
  }));
}

type Row = {
  id: string;
  theme: string;
  supplier_product_id: string;
  name: string;
  name_en: string | null;
  name_fr: string | null;
  description: string | null;
  category: string | null;
  images: unknown;
  supplier_cost_usd_cents: number;
  shipping_cost_usd_cents: number | null;
  delivery_days_min: number | null;
  delivery_days_max: number | null;
  listed_count: number;
  sales_count: number;
  demand_score: number;
  tiktok: boolean;
  trending: boolean;
};

/**
 * Produits tendance, du plus demandé au moins demandé. Avec CJ : le catalogue rafraîchi
 * par la tâche planifiée ; sinon : les produits d'exemple dans la langue demandée.
 * Les règles de modération sont réappliquées (elles peuvent avoir changé depuis le rafraîchissement).
 */
export async function getTrendingProducts(locale: Locale): Promise<TrendProduct[]> {
  let products: TrendProduct[];
  if (isCjConfigured()) {
    const { data } = await createAdminClient()
      .from("trending_products")
      .select("id, theme, supplier_product_id, name, name_en, name_fr, description, category, images, supplier_cost_usd_cents, shipping_cost_usd_cents, delivery_days_min, delivery_days_max, listed_count, sales_count, demand_score, tiktok, trending")
      .eq("status", "ready")
      .order("demand_score", { ascending: false })
      .limit(1500)
      .returns<Row[]>();
    products = (data ?? [])
      .filter((r) => isTrendTheme(r.theme) && r.shipping_cost_usd_cents !== null)
      .map((r) => ({
        id: r.id,
        theme: r.theme as TrendThemeId,
        source: "cj",
        supplierProductId: r.supplier_product_id,
        // Nom court rédigé par l'IA dans la langue de l'écran, sinon le nom du fournisseur (anglais).
        name: (locale === "fr" ? r.name_fr : r.name_en) || r.name_en || r.name,
        description: r.description ?? "",
        highlights: [],
        category: r.category,
        images: Array.isArray(r.images) ? r.images.filter((u): u is string => typeof u === "string") : [],
        supplierCostUsdCents: r.supplier_cost_usd_cents,
        shippingUsdCents: r.shipping_cost_usd_cents ?? 0,
        deliveryDaysMin: r.delivery_days_min ?? 0,
        deliveryDaysMax: r.delivery_days_max ?? 0,
        listedCount: r.listed_count,
        salesCount: r.sales_count,
        demandScore: r.demand_score,
        tiktok: r.tiktok,
        rising: r.trending,
      }));
  } else {
    products = sampleTrends(locale).sort((a, b) => b.demandScore - a.demandScore);
  }
  const rules = await getModerationRules();
  return products.filter((p) => !findViolation(rules, [p.name, p.description], [p.category]));
}
