import { getUsdCadRate } from "../fx";
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
  quantity: number;
}

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

  // Regroupe les doublons et valide les quantités.
  const quantities = new Map<string, number>();
  for (const line of params.lines.slice(0, MAX_LINES)) {
    if (typeof line.productId !== "string" || !Number.isInteger(line.quantity) || line.quantity < 1) continue;
    quantities.set(line.productId, Math.min((quantities.get(line.productId) ?? 0) + line.quantity, MAX_QUANTITY));
  }
  if (quantities.size === 0) throw new CheckoutError("emptyCart");

  const { data: products, error } = await admin
    .from("products")
    .select("id, title, price_cents, supplier, supplier_product_id, supplier_variant_id, supplier_cost_usd_cents, shipping_cost_usd_cents, stock, status")
    .eq("store_id", store.id)
    .in("id", [...quantities.keys()]);
  if (error) throw new Error(`Lecture des produits impossible : ${error.message}`);

  const available = (products ?? []).filter((p) => p.status === "active");
  if (available.length !== quantities.size) {
    throw new CheckoutError("itemGone");
  }
  for (const p of available) {
    if (p.stock !== null && p.stock < (quantities.get(p.id) ?? 0)) {
      throw new CheckoutError("outOfStock", p.title);
    }
  }
  if (isLiveMode() && available.some((p) => p.supplier === "sample")) {
    throw new CheckoutError("samples");
  }

  const settings = await getPlatformSettings();
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const lines = available.map((p) => ({
    product: p,
    quantity: quantities.get(p.id)!,
    unitPriceCents: Number(p.price_cents),
    unitSupplierCostUsdCents: Number(p.supplier_cost_usd_cents),
  }));
  const supplierShippingUsdCents = lines.reduce((sum, l) => sum + Number(l.product.shipping_cost_usd_cents) * l.quantity, 0);

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
      title: l.product.title,
      supplier_product_id: l.product.supplier_product_id,
      supplier_variant_id: l.product.supplier_variant_id,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents,
      unit_supplier_cost_usd_cents: l.unitSupplierCostUsdCents,
    })),
  );
  if (itemsError) throw new Error(`Enregistrement des articles impossible : ${itemsError.message}`);

  const currency = store.currency.toLowerCase();
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      locale: store.language === "fr" ? "fr-CA" : "en",
      client_reference_id: order.id,
      metadata: { order_id: order.id, store_id: store.id },
      line_items: lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency,
          unit_amount: l.unitPriceCents,
          tax_behavior: "exclusive",
          product_data: {
            name: l.product.title,
            tax_code: "txcd_99999999", // biens corporels (général)
            metadata: { product_id: l.product.id },
          },
        },
      })),
      automatic_tax: { enabled: automaticTaxEnabled() },
      shipping_address_collection: { allowed_countries: ["CA"] },
      // Le transporteur du fournisseur exige un numéro de téléphone.
      phone_number_collection: { enabled: true },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: store.language === "fr" ? "Livraison standard avec suivi" : "Standard shipping with tracking",
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
