import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finalizePaidSession } from "@/lib/payments/events";
import { fmt } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { rich } from "@/lib/i18n/rich";
import { formatPrice } from "@/lib/store-config";
import { getStoreBySite } from "@/lib/stores";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { ClearCart } from "@/storefront/cart";
import { getStoreBase } from "@/storefront/components";

export async function generateMetadata({ params }: PageProps<"/s/[site]/commande/merci">): Promise<Metadata> {
  const data = await getStoreBySite(decodeURIComponent((await params).site));
  return { title: { absolute: MESSAGES[data?.store.language ?? "en"].storefront.thanks.metaTitle }, robots: { index: false } };
}

async function loadOrder(sessionId: string, storeId: string) {
  return createAdminClient()
    .from("orders")
    .select("id, order_number, status, customer_email, subtotal_cents, tax_cents, shipping_cents, total_cents, currency, order_items(title, quantity, unit_price_cents)")
    .eq("stripe_checkout_session_id", sessionId)
    .eq("store_id", storeId)
    .maybeSingle();
}

/** Page affichée après le paiement Stripe. */
export default async function ThankYouPage({ params, searchParams }: PageProps<"/s/[site]/commande/merci">) {
  const { site } = await params;
  const decoded = decodeURIComponent(site);
  const data = await getStoreBySite(decoded);
  const sessionId = (await searchParams).session_id;
  if (!data || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) notFound();

  let { data: order } = await loadOrder(sessionId, data.store.id);
  if (!order) notFound();

  // Si la notification de Stripe n'est pas encore arrivée, on vérifie le paiement directement.
  if (order.status === "pending") {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    await finalizePaidSession(session);
    ({ data: order } = await loadOrder(sessionId, data.store.id));
    if (!order) notFound();
  }

  const base = await getStoreBase(decoded);
  const paid = order.status !== "pending" && order.status !== "cancelled";
  const items = (order.order_items ?? []) as { title: string; quantity: number; unit_price_cents: number }[];
  const t = MESSAGES[data.store.language].storefront.thanks;
  const price = (cents: number | string) => formatPrice(Number(cents), order.currency, data.store.language);

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      {paid && <ClearCart storeId={data.store.id} />}
      <div className="text-center">
        <div aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--store-primary)] text-2xl text-[var(--store-on-primary)]">✓</div>
        <h1 className="sf-heading mt-5 text-3xl">{paid ? t.title : t.pendingTitle}</h1>
        <p className="mt-3 text-[var(--sf-muted)]">
          {paid
            ? <>{rich(t.order, { b: (s) => <strong className="text-[var(--store-text)]">{s}</strong> }, { number: order.order_number })}{order.customer_email && fmt(t.confirmation, { email: order.customer_email })}.</>
            : t.pendingBody}
        </p>
      </div>

      <div className="mt-10 rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-6">
        <ul className="divide-y divide-[var(--sf-line)]">
          {items.map((item) => (
            <li key={item.title} className="flex justify-between gap-4 py-3 text-sm">
              <span>{item.title} <span className="text-[var(--sf-muted)]">× {item.quantity}</span></span>
              <span className="tabular-nums">{price(Number(item.unit_price_cents) * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-[var(--sf-line)] pt-4 text-sm tabular-nums">
          <div className="flex justify-between"><dt>{t.subtotal}</dt><dd>{price(order.subtotal_cents)}</dd></div>
          <div className="flex justify-between"><dt>{t.shipping}</dt><dd>{Number(order.shipping_cents) === 0 ? t.free : price(order.shipping_cents)}</dd></div>
          <div className="flex justify-between"><dt>{t.taxes}</dt><dd>{price(order.tax_cents)}</dd></div>
          <div className="flex justify-between pt-1 text-base font-semibold"><dt>{t.total}</dt><dd>{price(order.total_cents)}</dd></div>
        </dl>
      </div>

      <p className="mt-6 text-center text-sm text-[var(--sf-muted)]">{t.shippingNote}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`${base}/suivi?commande=${encodeURIComponent(order.order_number)}`} className="sf-btn-outline px-6 py-3 text-sm">{t.trackLink}</Link>
        <Link href={base || "/"} className="sf-btn px-6 py-3 text-sm">{t.continue}</Link>
      </div>
    </div>
  );
}
