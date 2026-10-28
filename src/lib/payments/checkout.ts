import { getUsdCadRate } from "../fx";
import { fmt, isLocale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";
import { computeOrderFinancials } from "../money";
import { getPlatformSettings } from "../settings";
import { createAdminClient } from "../supabase/admin";
import { automaticTaxEnabled, getStripe, isLiveMode } from "../stripe";

/**
 * Passage à la caisse (« separate charges and transfers ») :
 * l'acheteur paie la PLATEFORME via Stripe Checkout ; la part du client lui
 * sera transférée après la réserve (voir payouts.ts).
 */

export type CheckoutErrorCode = "unavailable" | "notAccepting" | "emptyCart" | "itemGone" | "outOfStock" | "samples";

/** Erreur montrée à l'acheteur : `code` → message traduit (messages storefront.errors). */
export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    readonly productTitle?: string,
  ) {
    super(code);
  }
}

export interface CartLine {
  productId: string;
  /** Variante choisie (couleur, taille…) ; absente pour un produit sans variantes. */
  variantId?: string;
  quantity: number;
}

type VariantCost = { costUsdCents?: number; shippingUsdCents?: number };
type PublicVariant = { vid?: string; label?: string; priceCents?: number; inStock?: boolean };

const MAX_QUANTITY = 20;
const MAX_LINES = 50;

function orderNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Statut « paiements » d'une boutique : le propriétaire a-t-il terminé son inscription Stripe ? */
export async function storeAcceptsPayments(storeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("owner_id, status").eq("id", storeId).maybeSingle();
  if (!store || store.status !== "active") return false;
  const { data: owner } = await admin.from("profiles").select("stripe_onboarding_complete").eq("id", store.owner_id).single();
  return Boolean(owner?.stripe_onboarding_complete);
}

/**
 * Crée la commande (en attente) et la session Stripe Checkout.
 * Les prix et la disponibilité sont TOUJOURS relus en base : le panier du navigateur n'est pas fiable.
 */
export async function createCheckoutSession(params: {
  storeId: string;
  lines: CartLine[];
  /** Adresse publique de la boutique, ex. https://zenyoga.mondomaine.com (sans « / » final). */
  storeUrl: string;
}): Promise<string> {
  const admin = createAdminClient();

  const { data: store } = await admin.from("stores").select("id, name, status, currency, language").eq("id", params.storeId).maybeSingle();
  if (!store || store.status !== "active") throw new CheckoutError("unavailable");
  if (!(await storeAcceptsPayments(store.id))) {
    throw new CheckoutError("notAccepting");
  }

  // Regroupe les doublons (même produit, même variante) et valide les quantités.
  const wanted = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const line of params.lines.slice(0, MAX_LINES)) {
    if (typeof line.productId !== "string" || !Number.isInteger(line.quantity) || line.quantity < 1) continue;
    const variantId = typeof line.variantId === "string" && line.variantId ? line.variantId : null;
    const key = `${line.productId}|${variantId ?? ""}`;
    const quantity = Math.min((wanted.get(key)?.quantity ?? 0) + line.quantity, MAX_QUANTITY);
    wanted.set(key, { productId: line.productId, variantId, quantity });
  }
  if (wanted.size === 0) throw new CheckoutError("emptyCart");

  const productIds = [...new Set([...wanted.values()].map((w) => w.productId))];
  const { data: products, error } = await admin
    .from("products")
    .select("id, title, price_cents, supplier, supplier_product_id, supplier_variant_id, supplier_cost_usd_cents, shipping_cost_usd_cents, stock, status, variants, variant_costs")
    .eq("store_id", store.id)
    .in("id", productIds);
  if (error) throw new Error(`Lecture des produits impossible : ${error.message}`);

  const byId = new Map((products ?? []).filter((p) => p.status === "active").map((p) => [p.id, p]));
  // Prix, coût et livraison de chaque ligne, toujours relus en base (variante choisie ou version par défaut).
  const lines = [...wanted.values()].map((w) => {
    const p = byId.get(w.productId);
    if (!p) throw new CheckoutError("itemGone");
    const variants = (Array.isArray(p.variants) ? p.variants : []) as PublicVariant[];
    const costs = (p.variant_costs ?? {}) as Record<string, VariantCost>;
    if (w.variantId && w.variantId !== p.supplier_variant_id) {
      const v = variants.find((x) => x.vid === w.variantId);
      const c = costs[w.variantId];
      if (!v || !c || !Number.isInteger(v.priceCents) || !Number.isInteger(c.costUsdCents) || !Number.isInteger(c.shippingUsdCents)) throw new CheckoutError("itemGone");
      if (v.inStock === false) throw new CheckoutError("outOfStock", `${p.title} (${v.label})`);
      return {
        product: p, quantity: w.quantity, variantId: w.variantId, variantLabel: v.label ?? null,
        unitPriceCents: Number(v.priceCents), unitSupplierCostUsdCents: Number(c.costUsdCents), unitShippingUsdCents: Number(c.shippingUsdCents),
      };
    }
    // Version par défaut (ou produit sans variantes).
    const v = variants.find((x) => x.vid === p.supplier_variant_id);
    if (v?.inStock === false || (p.stock !== null && p.stock < w.quantity)) throw new CheckoutError("outOfStock", p.title);
    return {
      product: p, quantity: w.quantity, variantId: p.supplier_variant_id, variantLabel: v?.label ?? null,
      unitPriceCents: Number(p.price_cents), unitSupplierCostUsdCents: Number(p.supplier_cost_usd_cents), unitShippingUsdCents: Number(p.shipping_cost_usd_cents),
    };
  });
  if (isLiveMode() && lines.some((l) => l.product.supplier === "sample")) {
    throw new CheckoutError("samples");
  }

  const settings = await getPlatformSettings();
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const supplierShippingUsdCents = lines.reduce((sum, l) => sum + l.unitShippingUsdCents * l.quantity, 0);

  // Calcul provisoire (avant taxes et frais Stripe) ; recalculé à la confirmation du paiement.
  const financials = computeOrderFinancials({
    lines,
    supplierShippingUsdCents,
    fxRateUsdCad: fx.rate,
    commissionRate: settings.commissionRate,
  });

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      order_number: orderNumber(),
      status: "pending",
      currency: store.currency,
      subtotal_cents: financials.subtotalCents,
      total_cents: financials.subtotalCents,
      supplier_cost_cents: financials.supplierCostCents,
      supplier_shipping_cents: financials.supplierShippingCents,
      fx_rate_usd_cad: fx.rate,
      gross_margin_cents: financials.grossMarginCents,
      commission_rate: settings.commissionRate,
      commission_cents: financials.commissionCents,
      store_payout_cents: financials.storePayoutCents,
    })
    .select("id, order_number")
    .single();
  if (orderError) throw new Error(`Création de la commande impossible : ${orderError.message}`);

  const { error: itemsError } = await admin.from("order_items").insert(
    lines.map((l) => ({
      order_id: order.id,
      product_id: l.product.id,
      // Le libellé de la variante suit le titre partout (merci, courriels, tableaux de bord).
      title: l.variantLabel ? `${l.product.title} — ${l.variantLabel}` : l.product.title,
      variant_label: l.variantLabel,
      supplier_product_id: l.product.supplier_product_id,
      supplier_variant_id: l.variantId,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents,
      unit_supplier_cost_usd_cents: l.unitSupplierCostUsdCents,
    })),
  );
  if (itemsError) throw new Error(`Enregistrement des articles impossible : ${itemsError.message}`);

  const currency = store.currency.toLowerCase();
  const language = isLocale(store.language) ? store.language : "en";
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      locale: language === "fr" ? "fr-CA" : "en",
      client_reference_id: order.id,
      metadata: { order_id: order.id, store_id: store.id },
      line_items: lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency,
          unit_amount: l.unitPriceCents,
          tax_behavior: "exclusive",
          product_data: {
            name: l.variantLabel ? `${l.product.title} — ${l.variantLabel}` : l.product.title,
            tax_code: "txcd_99999999", // biens corporels (général)
            metadata: { product_id: l.product.id },
          },
        },
      })),
      automatic_tax: { enabled: automaticTaxEnabled() },
      shipping_address_collection: { allowed_countries: ["CA"] },
      // Le transporteur du fournisseur exige un numéro de téléphone.
      phone_number_collection: { enabled: true },
      // Rappel des conditions de vente (page légale de la boutique) sous le bouton de paiement.
      custom_text: { submit: { message: fmt(MESSAGES[language].legal.checkoutTerms, { url: `${params.storeUrl}/legal/conditions` }) } },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: language === "fr" ? "Livraison standard avec suivi" : "Standard shipping with tracking",
            fixed_amount: { amount: 0, currency },
            tax_behavior: "exclusive",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 15 },
            },
          },
        },
      ],
      payment_intent_data: {
        transfer_group: order.id,
        description: `${store.name} — commande ${order.order_number}`,
        metadata: { order_id: order.id, store_id: store.id },
      },
      success_url: `${params.storeUrl}/commande/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${params.storeUrl}/panier`,
    },
    { idempotencyKey: `checkout-${order.id}` },
  );

  await admin.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
  if (!session.url) throw new Error("Stripe n'a pas renvoyé d'adresse de paiement.");
  return session.url;
}
