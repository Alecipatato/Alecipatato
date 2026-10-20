import { fmt, isLocale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";
import { formatPrice, parseStoreConfig } from "../store-config";
import { createAdminClient } from "../supabase/admin";
import { platformUrl, publicStoreUrl } from "../tenant";
import { type BuyerEmailKind, buildBuyerEmail } from "./buyer-templates";
import { sendEmail } from "./resend";

/**
 * Envoi des courriels de commande. Chaque courriel n'est envoyé qu'une fois : la date d'envoi
 * est posée AVANT l'envoi (mise à jour conditionnelle), et retirée si l'envoi échoue.
 */

const SENT_COLUMN: Record<BuyerEmailKind, "confirmation_email_at" | "shipped_email_at" | "delivered_email_at"> = {
  confirmation: "confirmation_email_at",
  shipped: "shipped_email_at",
  delivered: "delivered_email_at",
};

type OrderForEmail = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_address: BuyerAddress | null;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  stores: { name: string; subdomain: string; custom_domain: string | null; domain_status: string | null; language: string; config: unknown; contact_email: string | null; owner_id: string } | null;
  order_items: { title: string; quantity: number; unit_price_cents: number }[];
};
type BuyerAddress = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null };

const COLUMNS =
  "id, order_number, customer_name, customer_email, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_address, tracking_number, tracking_url, carrier, stores(name, subdomain, custom_domain, domain_status, language, config, contact_email, owner_id), order_items(title, quantity, unit_price_cents)";

/** Envoie un courriel de commande à l'acheteur (une seule fois). Retourne true s'il est parti. */
export async function sendBuyerEmail(orderId: string, kind: BuyerEmailKind): Promise<boolean> {
  const admin = createAdminClient();
  const column = SENT_COLUMN[kind];
  const { data } = await admin
    .from("orders")
    .update({ [column]: new Date().toISOString() })
    .eq("id", orderId)
    .is(column, null)
    .select(COLUMNS)
    .maybeSingle();
  const order = data as unknown as OrderForEmail | null;
  if (!order?.stores || !order.customer_email) return false;

  const store = order.stores;
  const language = isLocale(store.language) ? store.language : "en";
  const email = buildBuyerEmail(kind, {
    store: { name: store.name, language, primaryColor: parseStoreConfig(store.config).colors.primary, contactEmail: store.contact_email, url: publicStoreUrl({ subdomain: store.subdomain, customDomain: store.domain_status === "active" ? store.custom_domain : null }) },
    order: {
      number: order.order_number,
      customerName: order.customer_name,
      currency: order.currency,
      items: order.order_items.map((i) => ({ title: i.title, quantity: i.quantity, unitPriceCents: Number(i.unit_price_cents) })),
      subtotalCents: Number(order.subtotal_cents),
      shippingCents: Number(order.shipping_cents),
      taxCents: Number(order.tax_cents),
      totalCents: Number(order.total_cents),
      address: order.shipping_address,
      trackingNumber: order.tracking_number,
      trackingUrl: order.tracking_url,
      carrier: order.carrier,
    },
  });
  const sent = await sendEmail({ to: order.customer_email, ...email, fromName: store.name, replyTo: store.contact_email });
  // Échec : on retire la date pour qu'un prochain passage réessaie.
  if (!sent) await admin.from("orders").update({ [column]: null }).eq("id", order.id);
  return sent;
}

/** Prévient le propriétaire de la boutique d'une nouvelle vente. */
export async function notifyOwnerOfOrder(orderId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("orders").select(COLUMNS).eq("id", orderId).maybeSingle();
  const order = data as unknown as OrderForEmail | null;
  if (!order?.stores) return false;
  const { data: owner } = await admin.from("profiles").select("email").eq("id", order.stores.owner_id).maybeSingle();
  if (!owner?.email) return false;
  const language = isLocale(order.stores.language) ? order.stores.language : "en";
  const t = MESSAGES[language].emails.newOrder;
  const vars = {
    store: order.stores.name,
    number: order.order_number,
    total: formatPrice(Number(order.total_cents), order.currency, language),
    items: order.order_items.map((i) => `${i.title} × ${i.quantity}`).join(", "),
    url: `${platformUrl()}/tableau-de-bord`,
  };
  return sendEmail({ to: owner.email, subject: fmt(t.subject, vars), text: fmt(t.body, vars) });
}

/**
 * Rattrapage (tâche planifiée) : courriels qui n'ont pas pu partir (service indisponible…).
 * Seulement si Resend est configuré, et sur les commandes récentes.
 */
export async function sendMissedBuyerEmails(): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [confirmations, shipped, delivered] = await Promise.all([
    admin.from("orders").select("id").not("paid_at", "is", null).gte("paid_at", since).is("confirmation_email_at", null).not("status", "in", "(pending,cancelled)").limit(30),
    admin.from("orders").select("id").not("shipped_at", "is", null).gte("shipped_at", since).is("shipped_email_at", null).is("delivered_at", null).limit(30),
    admin.from("orders").select("id").not("delivered_at", "is", null).gte("delivered_at", since).is("delivered_email_at", null).limit(30),
  ]);
  let sent = 0;
  for (const o of confirmations.data ?? []) if (await sendBuyerEmail(o.id, "confirmation")) sent++;
  for (const o of shipped.data ?? []) if (await sendBuyerEmail(o.id, "shipped")) sent++;
  for (const o of delivered.data ?? []) if (await sendBuyerEmail(o.id, "delivered")) sent++;
  return sent;
}
