import { cjRequest } from "./client";
import { type CjCreatedOrder, type CjOrderDetail, normalizeBalance, normalizeCreatedOrder, normalizeOrderDetail } from "./normalize";

/**
 * Commandes CJ : création, paiement depuis le portefeuille CJ, suivi.
 * ⚠️ Écrit sans accès à la documentation CJ : noms de champs à valider avec une vraie clé
 * (seul normalize.ts lit les réponses).
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

export async function createCjOrder(input: CjOrderInput): Promise<CjCreatedOrder> {
  const data = await cjRequest("POST", "/shopping/order/createOrderV2", {
    body: {
      orderNumber: input.orderNumber,
      shippingCountryCode: input.address.country,
      shippingCountry: input.address.country === "CA" ? "Canada" : input.address.country,
      shippingProvince: input.address.province,
      shippingCity: input.address.city,
      shippingAddress: input.address.line1,
      shippingAddress2: input.address.line2 ?? "",
      shippingZip: input.address.postalCode,
      shippingCustomerName: input.customerName,
      shippingPhone: input.phone,
      email: input.email ?? "",
      logisticName: input.logisticName,
      fromCountryCode: "CN",
      remark: "",
      products: input.items.map((i) => ({ vid: i.vid, quantity: i.quantity })),
    },
  });
  const order = normalizeCreatedOrder(data);
  if (!order) throw new Error("CJ n'a pas renvoyé d'identifiant de commande.");
  return order;
}

/** Paie la commande avec le solde du portefeuille CJ. */
export async function payCjOrder(cjOrderId: string): Promise<void> {
  await cjRequest("POST", "/shopping/pay/payBalance", { body: { orderId: cjOrderId } });
}

export async function getCjOrder(cjOrderId: string): Promise<CjOrderDetail | null> {
  return normalizeOrderDetail(await cjRequest("GET", "/shopping/order/getOrderDetail", { query: { orderId: cjOrderId } }));
}

/** Solde disponible du portefeuille CJ (USD), pour le tableau de bord admin. */
export async function getCjBalance(): Promise<{ availableUsdCents: number; frozenUsdCents: number } | null> {
  return normalizeBalance(await cjRequest("GET", "/shopping/pay/getBalance"));
}
