import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { getStoreBySite } from "@/lib/stores";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata({ params }: PageProps<"/s/[site]/suivi">): Promise<Metadata> {
  const data = await getStoreBySite(decodeURIComponent((await params).site));
  const title = MESSAGES[data?.store.language ?? "en"].storefront.tracking.metaTitle;
  return { title: { absolute: data ? `${title} | ${data.store.name}` : title }, robots: { index: false } };
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** Suivi public d'une commande : numéro de commande + courriel utilisé au paiement. */
export default async function TrackingPage({ params, searchParams }: PageProps<"/s/[site]/suivi">) {
  const data = await getStoreBySite(decodeURIComponent((await params).site));
  if (!data) notFound();
  const { store } = data;
  const t = MESSAGES[store.language].storefront.tracking;
  const sp = await searchParams;
  const number = param(sp.commande).toUpperCase().slice(0, 20);
  const email = param(sp.courriel).toLowerCase().slice(0, 200);

  let order = null;
  if (number && email) {
    const { data: row } = await createAdminClient()
      .from("orders")
      .select("order_number, status, paid_at, customer_email, cj_status, shipped_at, delivered_at, tracking_number, tracking_url, carrier, refunded_cents, total_cents")
      .eq("store_id", store.id)
      .eq("order_number", number)
      .not("status", "in", "(pending,cancelled)")
      .maybeSingle();
    // Le courriel doit correspondre : sans lui, on ne révèle rien (pas même l'existence de la commande).
    if (row && row.customer_email?.toLowerCase() === email) order = row;
  }

  const dateFormat = new Intl.DateTimeFormat(intlLocale(store.language), { day: "numeric", month: "long", year: "numeric" });
  const steps = order
    ? [
        { label: t.steps.paid, done: true },
        { label: t.steps.preparing, done: order.cj_status === "sent" || ["sent_to_supplier", "shipped", "delivered"].includes(order.status) },
        { label: t.steps.shipped, done: Boolean(order.shipped_at) || ["shipped", "delivered"].includes(order.status) },
        { label: t.steps.delivered, done: Boolean(order.delivered_at) || order.status === "delivered" },
      ]
    : [];
  const fieldClass = "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-white px-4 py-2.5 text-sm text-neutral-900 focus:outline-none";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="sf-heading text-3xl">{t.title}</h1>
      <p className="mt-2 text-[var(--sf-muted)]">{t.intro}</p>

      <form method="get" className="mt-8 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.number}
          <input name="commande" required defaultValue={number} autoComplete="off" className={`${fieldClass} uppercase`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.email}
          <input name="courriel" type="email" required defaultValue={email} autoComplete="email" className={fieldClass} />
        </label>
        <button type="submit" className="sf-btn px-6 py-2.5 text-sm">{t.submit}</button>
      </form>

      {number && email && !order && (
        <p role="alert" className="mt-8 rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-surface)] px-5 py-4 text-sm">{t.notFound}</p>
      )}

      {order && (
        <section className="mt-10 rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-6" data-tracking>
          <h2 className="sf-heading text-2xl">{fmt(t.order, { number: order.order_number })}</h2>
          {order.paid_at && <p className="mt-1 text-sm text-[var(--sf-muted)]">{fmt(t.placed, { date: dateFormat.format(new Date(order.paid_at)) })}</p>}

          <ol className="mt-6 grid gap-3 sm:grid-cols-4">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm sm:flex-col sm:items-start">
                <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-[var(--store-primary)] text-[var(--store-on-primary)]" : "border border-[var(--sf-line)] text-[var(--sf-muted)]"}`}>
                  {s.done ? "✓" : ""}
                </span>
                <span className={s.done ? "font-semibold" : "text-[var(--sf-muted)]"}>{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 border-t border-[var(--sf-line)] pt-5 text-sm">
            {order.tracking_number ? (
              <>
                <p>{fmt(t.trackingNumber, { number: order.tracking_number })}</p>
                {order.carrier && <p className="mt-1 text-[var(--sf-muted)]">{fmt(t.carrier, { carrier: order.carrier })}</p>}
                {order.tracking_url && (
                  <a href={order.tracking_url} target="_blank" rel="noreferrer" className="sf-btn-outline mt-4 px-5 py-2.5 text-sm">{t.openTracking}</a>
                )}
              </>
            ) : (
              <p className="text-[var(--sf-muted)]">{t.noTracking}</p>
            )}
          </div>

          {Number(order.refunded_cents) > 0 && (
            <p className="mt-5 text-sm font-medium">{Number(order.refunded_cents) >= Number(order.total_cents) ? t.refunded : t.partiallyRefunded}</p>
          )}
        </section>
      )}
    </div>
  );
}
