import { getProductDetail, getVariantInventories } from "../cj/catalog";
import { getUsdCadRate } from "../fx";
import { repriceForCost } from "../money";
import { getPlatformSettings } from "../settings";
import { createAdminClient } from "../supabase/admin";

/**
 * Synchronisation des produits CJ (prix et stock, variante par variante). Appelée par la tâche
 * planifiée /api/cron/sync-products : chaque passage traite les produits vérifiés il y a le plus
 * longtemps. Avec un passage par heure, chaque produit est revu au moins une fois par jour.
 *  - coût en hausse : prix de la variante relevé pour garder la marge minimale ;
 *  - variante épuisée ou retirée : indisponible ; si c'était la variante par défaut, la fiche passe
 *    à la variante disponible la moins chère ;
 *  - plus aucune variante : produit retiré (ou en rupture).
 */

export interface SyncReport {
  checked: number;
  priceRaised: number;
  outOfStock: number;
  unavailable: number;
  errors: number;
}

type VariantCost = { costUsdCents: number; shippingUsdCents: number; shippingMethod?: string; daysMin?: number; daysMax?: number; stock?: number | null };
type PublicVariant = { vid: string; label: string; priceCents: number; image: string | null; inStock: boolean };

export async function syncSupplierProducts(limit = 25): Promise<SyncReport> {
  const admin = createAdminClient();
  const report: SyncReport = { checked: 0, priceRaised: 0, outOfStock: 0, unavailable: 0, errors: 0 };

  const { data: products, error } = await admin
    .from("products")
    .select("id, supplier_product_id, supplier_variant_id, supplier_cost_usd_cents, shipping_cost_usd_cents, shipping_method, delivery_days_min, delivery_days_max, price_cents, variants, variant_costs")
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
      report.checked++;
      if (!detail) {
        await admin.from("products").update({ status: "rejected", sync_status: "unavailable", sync_note: null, last_synced_at: now }).eq("id", product.id);
        report.unavailable++;
        continue;
      }

      let stockByVid: Map<string, number> | null = null;
      try {
        stockByVid = await getVariantInventories(product.supplier_product_id);
      } catch {
        // Stock indisponible : on garde les valeurs précédentes.
      }

      // Anciens produits (avant les variantes) : une seule variante, celle par défaut.
      const costs: Record<string, VariantCost> =
        product.variant_costs && Object.keys(product.variant_costs).length
          ? { ...(product.variant_costs as Record<string, VariantCost>) }
          : {
              [product.supplier_variant_id!]: {
                costUsdCents: Number(product.supplier_cost_usd_cents),
                shippingUsdCents: Number(product.shipping_cost_usd_cents),
                shippingMethod: product.shipping_method ?? undefined,
                daysMin: product.delivery_days_min ?? undefined,
                daysMax: product.delivery_days_max ?? undefined,
              },
            };
      const publicVariants = (Array.isArray(product.variants) ? product.variants : []) as PublicVariant[];
      const prices = new Map<string, number>(publicVariants.map((v) => [v.vid, v.priceCents]));
      prices.set(product.supplier_variant_id!, prices.get(product.supplier_variant_id!) ?? Number(product.price_cents));

      const available = new Map<string, boolean>();
      const raised = new Map<string, number>(); // vid → ancien prix
      for (const [vid, cost] of Object.entries(costs)) {
        const fresh = detail.variants.find((v) => v.vid === vid);
        const stock = stockByVid?.get(vid) ?? (stockByVid ? 0 : (cost.stock ?? null));
        available.set(vid, Boolean(fresh) && (stock === null || stock > 0));
        if (!fresh) continue;
        const r = repriceForCost({
          currentPriceCents: prices.get(vid) ?? Number(product.price_cents),
          supplierCostUsdCents: fresh.priceUsdCents,
          shippingUsdCents: cost.shippingUsdCents,
          fxRateUsdCad: fx.rate,
          minMarginRate: settings.minMarginRate,
        });
        if (r.raised) raised.set(vid, prices.get(vid) ?? Number(product.price_cents));
        prices.set(vid, r.priceCents);
        costs[vid] = { ...cost, costUsdCents: fresh.priceUsdCents, stock };
      }

      // Variante par défaut : la même si elle est disponible, sinon la disponible la moins chère.
      const candidates = Object.keys(costs).filter((vid) => available.get(vid));
      const defaultVid = available.get(product.supplier_variant_id!)
        ? product.supplier_variant_id!
        : candidates.sort((a, b) => (prices.get(a) ?? 0) - (prices.get(b) ?? 0))[0];

      if (!defaultVid) {
        // Plus rien à vendre : retiré chez CJ, ou tout est épuisé.
        const removed = Object.keys(costs).every((vid) => !detail.variants.some((v) => v.vid === vid));
        await admin
          .from("products")
          .update(
            removed
              ? { status: "rejected", sync_status: "unavailable", sync_note: null, last_synced_at: now }
              : {
                  stock: 0,
                  sync_status: "out_of_stock",
                  sync_note: null,
                  variant_costs: costs,
                  // Toutes les variantes sont épuisées : la fiche doit l'afficher, quelle que soit la variante.
                  variants: publicVariants.map((v) => ({ ...v, inStock: false })),
                  last_synced_at: now,
                },
          )
          .eq("id", product.id);
        if (removed) report.unavailable++;
        else report.outOfStock++;
        continue;
      }

      const d = costs[defaultVid];
      const defaultPrice = prices.get(defaultVid)!;
      const patch: Record<string, unknown> = {
        supplier_variant_id: defaultVid,
        supplier_cost_usd_cents: d.costUsdCents,
        shipping_cost_usd_cents: d.shippingUsdCents,
        ...(d.shippingMethod && { shipping_method: d.shippingMethod }),
        ...(d.daysMin !== undefined && { delivery_days_min: d.daysMin }),
        ...(d.daysMax !== undefined && { delivery_days_max: d.daysMax }),
        price_cents: defaultPrice,
        suggested_price_cents: repriceForCost({ currentPriceCents: defaultPrice, supplierCostUsdCents: d.costUsdCents, shippingUsdCents: d.shippingUsdCents, fxRateUsdCad: fx.rate, minMarginRate: settings.minMarginRate }).suggestedCents,
        stock: d.stock ?? null,
        variant_costs: costs,
        variants: publicVariants.map((v) => ({ ...v, priceCents: prices.get(v.vid) ?? v.priceCents, inStock: available.get(v.vid) ?? false })),
        last_synced_at: now,
      };

      if (raised.has(defaultVid)) {
        // Le coût a augmenté : on protège la marge minimale en relevant le prix.
        // Ancien prix (en cents) : le message est rédigé à l'affichage, dans la langue du client.
        Object.assign(patch, { sync_status: "price_raised", sync_note: String(raised.get(defaultVid)) });
        report.priceRaised++;
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
