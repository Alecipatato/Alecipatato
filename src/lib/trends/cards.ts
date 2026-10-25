import { estimateProductEconomics } from "../money";
import type { TrendProduct } from "./catalog";
import { type DemandLevel, demandLevel } from "./score";
import type { TrendThemeId } from "./themes";

/** Ce que la galerie affiche pour un produit tendance (montants en CAD, calculés sur le serveur). */
export interface TrendCard {
  id: string;
  theme: TrendThemeId;
  name: string;
  image: string | null;
  demandScore: number;
  demandLevel: DemandLevel;
  listedCount: number;
  salesCount: number;
  supplierCadCents: number;
  shippingCadCents: number;
  daysMin: number;
  daysMax: number;
  priceCents: number;
  profitCents: number;
  marginBp: number;
}

export function toTrendCards(
  products: TrendProduct[],
  rates: { fxRateUsdCad: string; minMarginRate: string; commissionRate: string },
): TrendCard[] {
  return products.map((p) => {
    const e = estimateProductEconomics({
      supplierCostUsdCents: p.supplierCostUsdCents,
      shippingUsdCents: p.shippingUsdCents,
      fxRateUsdCad: rates.fxRateUsdCad,
      minMarginRate: rates.minMarginRate,
      commissionRate: rates.commissionRate,
    });
    return {
      id: p.id,
      theme: p.theme,
      name: p.name,
      image: p.images[0] ?? null,
      demandScore: p.demandScore,
      demandLevel: demandLevel(p.demandScore),
      listedCount: p.listedCount,
      salesCount: p.salesCount,
      supplierCadCents: e.supplierCadCents,
      shippingCadCents: e.shippingCadCents,
      daysMin: p.deliveryDaysMin,
      daysMax: p.deliveryDaysMax,
      priceCents: e.priceCents,
      profitCents: e.ownerProfitCents,
      marginBp: e.marginBp,
    };
  });
}
