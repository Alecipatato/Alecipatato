import { isCjConfigured } from "../cj/client";
import { trackingUrl } from "../cj/normalize";
import { cjAutoPayEnabled, cjOrdersEnabled, createCjOrder, getCjOrder, payCjOrder } from "../cj/orders";
import { sendBuyerEmail, sendMissedBuyerEmails } from "../email/order-emails";
import { alertAdmin } from "../email/resend";
import { createAdminClient } from "../supabase/admin";

/**
 * Exécution des commandes (phase 6) :
 *   1. chaque commande payée est transmise à CJ (et payée depuis le portefeuille CJ si CJ_AUTO_PAY=true) ;
 *   2. en cas d'échec : nouvel essai automatique (délais croissants), alerte courriel à l'admin ;
 *   3. le suivi CJ est relu régulièrement : numéro de suivi, expédition, livraison.
 * Les produits d'exemple ne sont JAMAIS transmis.
 */

export const MAX_CJ_ATTEMPTS = 5;
const MINUTE = 60_000;
/** Délai avant le prochain essai, selon le nombre d'essais déjà faits. */
const RETRY_DELAYS = [0, 15 * MINUTE, 60 * MINUTE, 3 * 60 * MINUTE, 6 * 60 * MINUTE];
const TRACKING_INTERVAL = 4 * 60 * MINUTE;
const DEFAULT_LOGISTIC = "CJPacket Ordinary";

export type TransmitResult = "sent" | "failed" | "skipped" | "disabled" | "busy";

type Address = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null };
type ClaimedOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: Address | null;
  cj_attempts: number;
  stores: { name: string } | null;
  order_items: { quantity: number; supplier_variant_id: string | null; title: string; products: { supplier: string; shipping_method: string | null } | null }[];
};

/** Transmet une commande payée à CJ. Sans danger si appelée deux fois (verrou « sending »). */
export async function transmitOrder(orderId: string): Promise<TransmitResult> {
  if (!cjOrdersEnabled() || !isCjConfigured()) return "disabled";
  const admin = createAdminClient();

  // Verrou : une seule exécution à la fois peut passer la commande en « sending ».
  const { data } = await admin
    .from("orders")
    .update({ cj_status: "sending", cj_last_attempt_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "paid")
    .or("cj_status.is.null,cj_status.eq.failed")
    .select("id, order_number, customer_name, customer_email, customer_phone, shipping_address, cj_attempts, stores(name), order_items(quantity, supplier_variant_id, title, products(supplier, shipping_method))")
    .maybeSingle();
  const order = data as unknown as ClaimedOrder | null;
  if (!order) return "busy";

  const items = order.order_items;
  if (items.length === 0 || items.some((i) => i.products?.supplier !== "cj" || !i.supplier_variant_id)) {
    await admin.from("orders").update({ cj_status: "skipped", cj_error: null }).eq("id", order.id);
    return "skipped";
  }

  const attempts = order.cj_attempts + 1;
  try {
    const a = order.shipping_address ?? {};
    if (!a.line1 || !a.city || !a.postal_code || !a.country) throw new Error("Adresse de livraison incomplète.");
    const created = await createCjOrder({
      orderNumber: order.id,
      customerName: order.customer_name ?? "",
      phone: order.customer_phone ?? "",
      email: order.customer_email,
      address: { line1: a.line1, line2: a.line2 ?? null, city: a.city, province: a.state ?? "", postalCode: a.postal_code, country: a.country },
      logisticName: items.find((i) => i.products?.shipping_method)?.products?.shipping_method ?? DEFAULT_LOGISTIC,
      items: items.map((i) => ({ vid: i.supplier_variant_id!, quantity: i.quantity })),
    });
    // Enregistré tout de suite : si le paiement échoue, la commande existe déjà chez CJ.
    await admin
      .from("orders")
      .update({ cj_status: "sent", cj_order_id: created.orderId, status: "sent_to_supplier", cj_attempts: attempts, cj_error: null })
      .eq("id", order.id);

    if (cjAutoPayEnabled()) {
      try {
        await payCjOrder(created);
        await admin.from("orders").update({ cj_paid: true }).eq("id", order.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await admin.from("orders").update({ cj_error: `Paiement CJ : ${message}`.slice(0, 500) }).eq("id", order.id);
        await alertAdmin(
          `Paiement CJ impossible — commande ${order.order_number}`,
          `La commande ${order.order_number} (${order.stores?.name ?? ""}) a été créée chez CJ (${created.orderId}) mais n'a pas pu être payée avec le portefeuille CJ.\n\nErreur : ${message}\n\nVérifiez le solde du portefeuille CJ puis payez la commande dans l'espace CJ.`,
        );
      }
    }
    return "sent";
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`Transmission CJ de la commande ${order.order_number} :`, err);
    await admin.from("orders").update({ cj_status: "failed", cj_error: message, cj_attempts: attempts }).eq("id", order.id);
    // Alerte au premier échec, puis quand les essais automatiques sont épuisés.
    if (attempts === 1 || attempts >= MAX_CJ_ATTEMPTS) {
      const final = attempts >= MAX_CJ_ATTEMPTS;
      await alertAdmin(
        `Commande CJ en échec — ${order.order_number}${final ? " (essais épuisés)" : ""}`,
        `La commande ${order.order_number} (${order.stores?.name ?? ""}) n'a pas pu être transmise à CJ.\n\nErreur : ${message}\nEssai ${attempts} sur ${MAX_CJ_ATTEMPTS}.\n\n${final ? "Aucun nouvel essai automatique : corrigez le problème puis relancez la commande depuis l'espace admin (Commandes fournisseur)." : "Un nouvel essai automatique aura lieu plus tard."}`,
      );
    }
    return "failed";
  }
}

export interface FulfillmentReport {
  enabled: boolean;
  sent: number;
  failed: number;
  skipped: number;
  tracked: number;
  shipped: number;
  delivered: number;
  /** Courriels de rattrapage envoyés. */
  emails: number;
}

/** Transmet les commandes payées en attente (premiers envois et nouveaux essais dont le délai est écoulé). */
export async function transmitPendingOrders(report: FulfillmentReport, now = Date.now()): Promise<void> {
  const { data } = await createAdminClient()
    .from("orders")
    .select("id, cj_status, cj_attempts, cj_last_attempt_at")
    .eq("status", "paid")
    .or(`cj_status.is.null,and(cj_status.eq.failed,cj_attempts.lt.${MAX_CJ_ATTEMPTS})`)
    .order("paid_at")
    .limit(30);
  for (const order of data ?? []) {
    const last = order.cj_last_attempt_at ? new Date(order.cj_last_attempt_at).getTime() : 0;
    if (order.cj_status === "failed" && now - last < RETRY_DELAYS[Math.min(order.cj_attempts, RETRY_DELAYS.length - 1)]) continue;
    const result = await transmitOrder(order.id);
    if (result === "sent" || result === "failed" || result === "skipped") report[result]++;
  }
}

/** Relit chez CJ le statut des commandes transmises : suivi, expédition, livraison. */
export async function syncTracking(report: FulfillmentReport, now = new Date()): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("id, order_number, status, cj_order_id, cj_order_status, shipped_at, tracking_checked_at")
    .eq("cj_status", "sent")
    .in("status", ["sent_to_supplier", "shipped", "partially_refunded"])
    .is("delivered_at", null)
    .or(`tracking_checked_at.is.null,tracking_checked_at.lt.${new Date(now.getTime() - TRACKING_INTERVAL).toISOString()}`)
    .limit(50);

  for (const order of data ?? []) {
    if (!order.cj_order_id) continue;
    try {
      const detail = await getCjOrder(order.cj_order_id);
      if (!detail) continue;
      report.tracked++;
      const patch: Record<string, unknown> = { tracking_checked_at: now.toISOString(), cj_order_status: detail.rawStatus };
      if (detail.trackingNumber) {
        Object.assign(patch, { tracking_number: detail.trackingNumber, tracking_url: trackingUrl(detail.trackingNumber), carrier: detail.carrier });
      }
      // Une commande remboursée en partie garde ce statut ; seules les dates d'expédition changent.
      const followsShipping = order.status === "sent_to_supplier" || order.status === "shipped";
      if ((detail.stage === "shipped" || detail.stage === "delivered") && !order.shipped_at) {
        patch.shipped_at = now.toISOString();
        if (followsShipping) patch.status = "shipped";
        report.shipped++;
      }
      if (detail.stage === "delivered") {
        patch.delivered_at = now.toISOString();
        if (followsShipping) patch.status = "delivered";
        report.delivered++;
      }
      if (detail.stage === "cancelled" && order.cj_order_status !== detail.rawStatus) {
        await alertAdmin(
          `Commande annulée chez CJ — ${order.order_number}`,
          `CJ indique que la commande ${order.order_number} (CJ ${order.cj_order_id}) est annulée (statut « ${detail.rawStatus} »).\n\nL'acheteur a payé : remboursez-le ou recréez la commande chez CJ.`,
        );
      }
      await admin.from("orders").update(patch).eq("id", order.id);
      // Courriels à l'acheteur (une seule fois chacun).
      if (patch.delivered_at) await sendBuyerEmail(order.id, "delivered");
      else if (patch.shipped_at || (detail.trackingNumber && order.shipped_at)) await sendBuyerEmail(order.id, "shipped");
    } catch (err) {
      console.warn(`Suivi CJ de la commande ${order.order_number} :`, err);
    }
  }
}

/** Tâche planifiée : transmission + suivi. */
export async function runFulfillment(): Promise<FulfillmentReport> {
  const report: FulfillmentReport = { enabled: cjOrdersEnabled() && isCjConfigured(), sent: 0, failed: 0, skipped: 0, tracked: 0, shipped: 0, delivered: 0, emails: 0 };
  if (!isCjConfigured()) {
    report.emails = await sendMissedBuyerEmails();
    return report;
  }
  if (report.enabled) await transmitPendingOrders(report);
  await syncTracking(report);
  report.emails = await sendMissedBuyerEmails();
  return report;
}

/** Relance manuelle (espace admin) d'une commande en échec : remet le compteur d'essais à zéro. */
export async function retryOrder(orderId: string): Promise<TransmitResult> {
  // Une commande restée « sending » plus de 15 minutes (envoi interrompu) peut aussi être relancée ;
  // CJ refuse un second envoi du même orderNumber, ce qui évite les doublons.
  const stale = new Date(Date.now() - 15 * MINUTE).toISOString();
  await createAdminClient()
    .from("orders")
    .update({ cj_status: "failed", cj_attempts: 0 })
    .eq("id", orderId)
    .or(`cj_status.eq.failed,and(cj_status.eq.sending,cj_last_attempt_at.lt.${stale})`);
  return transmitOrder(orderId);
}
