import type Stripe from "stripe";
import { splitMargin, splitRefund } from "../money";
import { getPlatformSettings } from "../settings";
import { createAdminClient } from "../supabase/admin";
import { getStripe } from "../stripe";
import { accountIsReady } from "./connect";
import { recoverFromStore } from "./payouts";

/**
 * Traitement des événements Stripe (webhook). Chaque fonction est idempotente :
 * Stripe peut envoyer le même événement plusieurs fois, ou dans le désordre.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

/**
 * Paiement confirmé : finalise la commande (montants réels, taxes, frais Stripe,
 * commission) et programme le versement du client après la réserve.
 * Appelée par le webhook ET par la page de remerciement (le premier arrivé gagne).
 */
export async function finalizePaidSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return;

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, store_id, status, subtotal_cents, supplier_cost_cents, supplier_shipping_cents, commission_rate")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "pending") return;

  const settings = await getPlatformSettings();
  const paymentIntentId = idOf(session.payment_intent);
  let chargeId: string | null = null;
  let stripeFeeCents = 0;
  if (paymentIntentId) {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    chargeId = charge?.id ?? idOf(pi.latest_charge);
    const balance = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    stripeFeeCents = balance?.fee ?? 0;
  }

  // Les coûts fournisseur ont été convertis en CAD (au taux du jour) à la création de la commande.
  const subtotalCents = session.amount_subtotal ?? Number(order.subtotal_cents);
  const grossMarginCents = subtotalCents - Number(order.supplier_cost_cents) - Number(order.supplier_shipping_cents);
  const { commissionCents, storePayoutCents } = splitMargin({
    grossMarginCents,
    commissionRate: String(order.commission_rate),
    stripeFeeCents,
    stripeFeesPaidBy: settings.stripeFeesPaidBy,
  });

  const shipping = session.collected_information?.shipping_details ?? null;

  // Mise à jour conditionnelle : seul le premier appel (webhook ou page de remerciement) passe.
  const { data: updated } = await admin
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      customer_email: session.customer_details?.email ?? null,
      customer_name: shipping?.name ?? session.customer_details?.name ?? null,
      shipping_address: shipping?.address ?? null,
      subtotal_cents: subtotalCents,
      shipping_cents: session.total_details?.amount_shipping ?? 0,
      tax_cents: session.total_details?.amount_tax ?? 0,
      total_cents: session.amount_total ?? subtotalCents,
      gross_margin_cents: grossMarginCents,
      commission_cents: commissionCents,
      store_payout_cents: storePayoutCents,
      stripe_fee_cents: stripeFeeCents,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (!updated?.length) return;

  if (subtotalCents !== Number(order.subtotal_cents)) {
    console.warn(`Commande ${order.id} : sous-total Stripe (${subtotalCents}) différent de la commande (${order.subtotal_cents}).`);
  }

  await admin.from("payouts").insert({
    store_id: order.store_id,
    order_id: order.id,
    amount_cents: storePayoutCents,
    currency: "CAD",
    available_at: new Date(Date.now() + settings.payoutReserveDays * DAY_MS).toISOString(),
    status: "pending",
  });
}

async function findOrderByPayment(paymentIntentId: string | null, chargeId: string | null) {
  const admin = createAdminClient();
  const columns = "id, status, total_cents, tax_cents, commission_cents, refunded_cents, disputed";
  if (paymentIntentId) {
    const { data } = await admin.from("orders").select(columns).eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
    if (data) return data;
  }
  if (chargeId) {
    const { data } = await admin.from("orders").select(columns).eq("stripe_charge_id", chargeId).maybeSingle();
    if (data) return data;
  }
  return null;
}

/**
 * Enregistre un remboursement (lancé depuis le tableau de bord ou depuis Stripe)
 * et applique automatiquement les règles : qui paie, commission rendue ou non.
 */
export async function recordRefund(refund: Stripe.Refund): Promise<void> {
  if (refund.status === "failed" || refund.status === "canceled") return;
  const order = await findOrderByPayment(idOf(refund.payment_intent), idOf(refund.charge));
  if (!order) return;

  const admin = createAdminClient();
  const settings = await getPlatformSettings();
  const split = splitRefund({
    type: "refund",
    amountCents: refund.amount,
    order: { totalCents: Number(order.total_cents), taxCents: Number(order.tax_cents), commissionCents: Number(order.commission_cents) },
    rules: settings.refundRules,
  });

  // L'unicité de stripe_refund_id garantit un seul enregistrement par remboursement.
  const { data: row, error } = await admin
    .from("refunds")
    .insert({
      order_id: order.id,
      type: "refund",
      amount_cents: refund.amount,
      currency: refund.currency.toUpperCase(),
      reason: refund.reason ?? refund.metadata?.reason ?? null,
      status: refund.status === "succeeded" ? "succeeded" : "pending",
      commission_refunded: split.commissionRefundCents > 0,
      commission_refund_cents: split.commissionRefundCents,
      store_debit_cents: split.storeDebitCents,
      platform_debit_cents: split.platformDebitCents,
      stripe_refund_id: refund.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return; // déjà enregistré
    throw new Error(`Enregistrement du remboursement impossible : ${error.message}`);
  }

  const { recoveredCents } = await recoverFromStore(order.id, split.storeDebitCents, `refund-${refund.id}`);
  if (recoveredCents < split.storeDebitCents) {
    // Ce qui n'a pas pu être repris au client reste à la charge de la plateforme.
    await admin
      .from("refunds")
      .update({ store_debit_cents: recoveredCents, platform_debit_cents: split.platformDebitCents + (split.storeDebitCents - recoveredCents) })
      .eq("id", row.id);
  }

  const refunded = Number(order.refunded_cents) + refund.amount;
  await admin
    .from("orders")
    .update({ refunded_cents: refunded, status: refunded >= Number(order.total_cents) ? "refunded" : "partially_refunded" })
    .eq("id", order.id);
}

/** Un remboursement a finalement échoué : on le signale (régularisation manuelle si un montant a été repris). */
async function markRefundFailed(refund: Stripe.Refund) {
  await createAdminClient().from("refunds").update({ status: "failed" }).eq("stripe_refund_id", refund.id);
  console.error(`Remboursement ${refund.id} échoué : vérifier le versement du client concerné.`);
}

/** Rétrofacturation ouverte : on retient le versement du client jusqu'à la décision. */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const order = await findOrderByPayment(idOf(dispute.payment_intent), idOf(dispute.charge));
  if (!order) return;
  const admin = createAdminClient();
  const settings = await getPlatformSettings();
  const split = splitRefund({
    type: "chargeback",
    amountCents: dispute.amount,
    order: { totalCents: Number(order.total_cents), taxCents: Number(order.tax_cents), commissionCents: Number(order.commission_cents) },
    rules: settings.refundRules,
    disputeFeeCents: settings.disputeFeeCents,
  });

  const { error } = await admin.from("refunds").insert({
    order_id: order.id,
    type: "chargeback",
    amount_cents: dispute.amount,
    currency: dispute.currency.toUpperCase(),
    reason: dispute.reason,
    status: "pending",
    commission_refunded: split.commissionRefundCents > 0,
    commission_refund_cents: split.commissionRefundCents,
    dispute_fee_cents: split.disputeFeeCents,
    // Montants prévus ; rien n'est repris au client tant que le litige n'est pas perdu.
    store_debit_cents: split.storeDebitCents,
    platform_debit_cents: split.platformDebitCents,
    stripe_dispute_id: dispute.id,
  });
  if (error && error.code !== "23505") throw new Error(`Enregistrement du litige impossible : ${error.message}`);

  await admin.from("orders").update({ disputed: true }).eq("id", order.id);
  await admin.from("payouts").update({ status: "held" }).eq("order_id", order.id).eq("status", "pending");
}

/** Litige clos : gagné → on libère le versement ; perdu → on applique les règles. */
async function handleDisputeClosed(dispute: Stripe.Dispute) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("refunds")
    .select("id, order_id, status, store_debit_cents, platform_debit_cents")
    .eq("stripe_dispute_id", dispute.id)
    .maybeSingle();
  if (!row || row.status !== "pending") return;

  if (dispute.status === "won" || dispute.status === "warning_closed") {
    await admin.from("refunds").update({ status: "won", store_debit_cents: 0, platform_debit_cents: 0 }).eq("id", row.id);
  } else if (dispute.status === "lost") {
    const storeDebit = Number(row.store_debit_cents);
    const { recoveredCents } = await recoverFromStore(row.order_id, storeDebit, `dispute-${dispute.id}`);
    await admin
      .from("refunds")
      .update({
        status: "lost",
        store_debit_cents: recoveredCents,
        platform_debit_cents: Number(row.platform_debit_cents) + (storeDebit - recoveredCents),
      })
      .eq("id", row.id);
    const { data: order } = await admin.from("orders").select("refunded_cents, total_cents").eq("id", row.order_id).single();
    if (order) {
      const refunded = Number(order.refunded_cents) + dispute.amount;
      await admin
        .from("orders")
        .update({ refunded_cents: refunded, status: refunded >= Number(order.total_cents) ? "refunded" : "partially_refunded" })
        .eq("id", row.order_id);
    }
  } else {
    return;
  }

  await admin.from("orders").update({ disputed: false }).eq("id", row.order_id);
  await admin.from("payouts").update({ status: "pending" }).eq("order_id", row.order_id).eq("status", "held");
}

async function handleAccountUpdated(account: Stripe.Account) {
  await createAdminClient()
    .from("profiles")
    .update({ stripe_onboarding_complete: accountIsReady(account) })
    .eq("stripe_account_id", account.id);
}

async function handleSessionClosedUnpaid(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return;
  await createAdminClient().from("orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "pending");
}

/** Point d'entrée du webhook. Retourne false si l'événement avait déjà été traité. */
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`Journal des événements Stripe indisponible : ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await finalizePaidSession(event.data.object);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await handleSessionClosedUnpaid(event.data.object);
        break;
      case "refund.created":
      case "refund.updated":
        if (event.data.object.status === "failed" || event.data.object.status === "canceled") await markRefundFailed(event.data.object);
        else await recordRefund(event.data.object);
        break;
      case "refund.failed":
        await markRefundFailed(event.data.object);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object);
        break;
      case "charge.dispute.closed":
        await handleDisputeClosed(event.data.object);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;
    }
  } catch (err) {
    // On oublie l'événement pour que Stripe le renvoie plus tard.
    await admin.from("stripe_events").delete().eq("id", event.id);
    throw err;
  }
  return true;
}
