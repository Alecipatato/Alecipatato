import { getUsdCadRate } from "../fx";
import { estimateProductEconomics } from "../money";
import { getPlatformSettings } from "../settings";
import type { TrendProduct } from "./catalog";

/** Produits tendance d'exemple (sans clé CJ) : mis en vente directement, au prix conseillé. */
export async function trendSampleRows(storeId: string, products: TrendProduct[], firstPosition = 0) {
  const settings = await getPlatformSettings();
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  return products.map((p, i) => {
    const e = estimateProductEconomics({
      supplierCostUsdCents: p.supplierCostUsdCents,
      shippingUsdCents: p.shippingUsdCents,
      fxRateUsdCad: fx.rate,
      minMarginRate: settings.minMarginRate,
      commissionRate: settings.commissionRate,
    });
    return {
      store_id: storeId,
      supplier: "sample",
      supplier_product_id: p.supplierProductId,
      title: p.name,
      category: p.category,
      description: p.description,
      highlights: p.highlights,
      images: p.images,
      price_cents: e.priceCents,
      suggested_price_cents: e.priceCents,
      supplier_cost_usd_cents: p.supplierCostUsdCents,
      shipping_cost_usd_cents: p.shippingUsdCents,
      delivery_days_min: p.deliveryDaysMin,
      delivery_days_max: p.deliveryDaysMax,
      status: "active",
      position: firstPosition + i,
    };
  });
}

