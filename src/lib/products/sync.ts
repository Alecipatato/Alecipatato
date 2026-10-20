import { getProductDetail, getVariantStock } from "../cj/catalog";
import { getUsdCadRate } from "../fx";
import { minimumPriceCents, suggestRetailPriceCents, usdToCadCents } from "../money";
import { getPlatformSettings } from "../settings";
import { createAdminClient } from "../supabase/admin";

/**
 * Synchronisation des produits CJ (prix et stock). Appelée par la tâche
 * planifiée /api/cron/sync-products : chaque passage traite les produits
 * vérifiés il y a le plus longtemps. Avec un passage par heure, chaque produit
 * est revu au moins une fois par jour.
 */

export interface SyncReport {
  checked: number;
  priceRaised: number;
  outOfStock: number;
  unavailable: number;
  errors: number;
}

export async function syncSupplierProducts(limit = 25): Promise<SyncReport> {
  const admin = createAdminClient();
  const report: SyncReport = { checked: 0, priceRaised: 0, outOfStock: 0, unavailable: 0, errors: 0 };

  const { data: products, error } = await admin
    .from("products")
    .select("id, supplier_product_id, supplier_variant_id, shipping_cost_usd_cents, price_cents")
    .eq("supplier", "cj")
    .in("status", ["proposed", "active"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`Lecture des produits impossible : ${error.message}`);
  if (!products?.length) return report;

  const settings = await getPlatformSettings();
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const now = new Date().toISOString();

  for (const product of products) {
    try {
      const detail = await getProductDetail(product.supplier_product_id);
      const variant = detail?.variants.find((v) => v.vid === product.supplier_variant_id);
      report.checked++;

      if (!variant) {
        await admin
          .from("products")
          .update({ status: "rejected", sync_status: "unavailable", sync_note: null, last_synced_at: now })
          .eq("id", product.id);
        report.unavailable++;
        continue;
      }

      let stock: number | null = null;
      try {
        stock = await getVariantStock(variant.vid);
      } catch {
        // Stock indisponible : on garde la valeur précédente.
      }

      const costCadCents = usdToCadCents(variant.priceUsdCents + Number(product.shipping_cost_usd_cents), fx.rate);
      const minPrice = minimumPriceCents(costCadCents, settings.minMarginRate);
      const suggested = suggestRetailPriceCents(costCadCents, settings.minMarginRate);
      const currentPrice = Number(product.price_cents);

      const patch: Record<string, unknown> = {
        supplier_cost_usd_cents: variant.priceUsdCents,
        suggested_price_cents: suggested,
        last_synced_at: now,
        ...(stock !== null && { stock }),
      };

      if (currentPrice < minPrice) {
        // Le coût a augmenté : on protège la marge minimale en relevant le prix.
        Object.assign(patch, {
          price_cents: suggested,
          sync_status: "price_raised",
          // Ancien prix (en cents) : le message est rédigé à l'affichage, dans la langue du client.
          sync_note: String(currentPrice),
        });
        report.priceRaised++;
      } else if (stock === 0) {
        Object.assign(patch, { sync_status: "out_of_stock", sync_note: null });
        report.outOfStock++;
      } else {
        Object.assign(patch, { sync_status: "ok", sync_note: null });
      }

      await admin.from("products").update(patch).eq("id", product.id);
    } catch (err) {
      console.warn(`Synchronisation du produit ${product.id} :`, err);
      report.errors++;
    }
  }
  return report;
}
