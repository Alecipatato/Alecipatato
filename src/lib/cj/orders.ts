import { cjRequest } from "./client";
import { type CjCreatedOrder, type CjOrderDetail, normalizeBalance, normalizeCreatedOrder, normalizeOrderDetail } from "./normalize";

/**
 * Commandes CJ : création, paiement depuis le portefeuille CJ, suivi.
 * Conforme à la doc CJ (vérifiée le 2026-10-26) ; à valider avec une vraie clé (seul normalize.ts lit les réponses).
 */

export interface CjOrderInput {
  /** Identifiant unique côté plateforme (empêche CJ de créer deux fois la même commande). */
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string | null;
  address: { line1: string; line2: string | null; city: string; province: string; postalCode: string; country: string };
  logisticName: string;
  items: { vid: string; quantity: number }[];
}

/** Transmission active seulement si CJ_ORDERS_ENABLED=true (règle du projet : sandbox, validation avant le réel). */
export function cjOrdersEnabled(): boolean {
  return process.env.CJ_ORDERS_ENABLED === "true";
}

/** Paiement automatique depuis le portefeuille CJ (USD) si CJ_AUTO_PAY=true ; sinon paiement manuel chez CJ. */
export function cjAutoPayEnabled(): boolean {
  return process.env.CJ_AUTO_PAY === "true";
}

/** Commandes « sandbox » chez CJ (aucun vrai débit) tant que CJ_SANDBOX n'est pas explicitement "false". */
export function cjSandbox(): boolean {
  return process.env.CJ_SANDBOX !== "false";
}

// Longueurs maximales acceptées par createOrderV2.
const cut = (value: string, max: number) => value.trim().slice(0, max);

export async function createCjOrder(input: CjOrderInput): Promise<CjCreatedOrder> {
  const data = await cjRequest("POST", "/shopping/order/createOrderV2", {
    body: {
      orderNumber: cut(input.orderNumber, 50),
      shippingCountryCode: input.address.country,
      shippingCountry: input.address.country === "CA" ? "Canada" : input.address.country,
      shippingProvince: cut(input.address.province, 50),
      shippingCity: cut(input.address.city, 50),
      shippingAddress: cut(input.address.line1, 200),
      shippingAddress2: cut(input.address.line2 ?? "", 200),
      shippingZip: cut(input.address.postalCode, 20),
      shippingCustomerName: cut(input.customerName, 50),
      shippingPhone: cut(input.phone, 20),
      email: cut(input.email ?? "", 50),
      logisticName: input.logisticName,
      fromCountryCode: "CN",
      remark: "",
      // 3 = créer seulement (le paiement se fait ensuite avec payBalanceV2) ; 1/absent = page de paiement (déprécié).
      payType: 3,
      isSandbox: cjSandbox() ? 1 : 0,
      products: input.items.map((i) => ({ vid: i.vid, quantity: i.quantity })),
    },
  });
  const order = normalizeCreatedOrder(data);
  if (!order) throw new Error("CJ n'a pas renvoyé d'identifiant de commande.");
  return order;
}

/**
 * Paie la commande avec le solde du portefeuille CJ : payBalanceV2 avec l'identifiant d'expédition
 * (obligatoire quand une commande est découpée en plusieurs envois), sinon l'ancienne méthode par orderId.
 */
export async function payCjOrder(order: Pick<CjCreatedOrder, "orderId" | "shipmentOrderId">): Promise<void> {
  if (order.shipmentOrderId) await cjRequest("POST", "/shopping/pay/payBalanceV2", { body: { shipmentOrderId: order.shipmentOrderId } });
  else await cjRequest("POST", "/shopping/pay/payBalance", { body: { orderId: order.orderId } });
}

export async function getCjOrder(cjOrderId: string): Promise<CjOrderDetail | null> {
  return normalizeOrderDetail(await cjRequest("GET", "/shopping/order/getOrderDetail", { query: { orderId: cjOrderId } }));
}

/** Solde disponible du portefeuille CJ (USD), pour le tableau de bord admin. */
export async function getCjBalance(): Promise<{ availableUsdCents: number; frozenUsdCents: number } | null> {
  return normalizeBalance(await cjRequest("GET", "/shopping/pay/getBalance"));
}
