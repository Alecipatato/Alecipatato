import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { RefundForm } from "./refund-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).sales.orders.metaTitle };
}

const REFUNDABLE = ["paid", "partially_refunded", "sent_to_supplier", "shipped", "delivered"];
const label = <T extends Record<string, string>>(labels: T, key: string) => (key in labels ? labels[key as keyof T] : key);

export default async function OrdersPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]/commandes">) {
  const user = await requireUser();
  const { id } = await params;
  const { rembourse } = await searchParams;
  const supabase = await createUserClient();
  const locale = await getLocale();
  const t = (await getMessages(locale)).sales.orders;
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" });
  const price = (cents: number | string, currency: string) => formatPrice(Number(cents), currency, locale);

  const { data: store } = await supabase.from("stores").select("id, name").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store) notFound();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, paid_at, customer_name, customer_email, currency, subtotal_cents, tax_cents, total_cents, gross_margin_cents, commission_cents, store_payout_cents, refunded_cents, disputed, order_items(title, quantity), payouts(status, amount_cents, reversed_cents, available_at, paid_at)")
    .eq("store_id", store.id)
    .not("status", "in", "(pending,cancelled)")
    .order("paid_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/tableau-de-bord/boutiques/${store.id}`} className="text-sm font-medium text-muted hover:text-ink">← {store.name}</Link>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </div>

      {typeof rembourse === "string" && (
        <Alert kind="success">{fmt(t.refunded, { number: rembourse })}</Alert>
      )}

      {orders && orders.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => {
            const payout = (order.payouts as unknown as { status: string; amount_cents: number; reversed_cents: number; available_at: string; paid_at: string | null }[] | null)?.[0];
            const items = (order.order_items ?? []) as { title: string; quantity: number }[];
            const remaining = Number(order.total_cents) - Number(order.refunded_cents);
            const payoutDate = payout?.paid_at ?? payout?.available_at;
            return (
              <li key={order.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{fmt(t.order, { number: order.order_number })}</p>
                    <p className="text-sm text-muted">
                      {order.paid_at && dateFormat.format(new Date(order.paid_at))} · {order.customer_name ?? order.customer_email ?? t.buyer}
                    </p>
                    <p className="mt-1 text-sm">{items.map((i) => `${i.title} × ${i.quantity}`).join(", ")}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${order.disputed ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong"}`}>
                    {order.disputed ? t.dispute : label(t.status, order.status)}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
                  <div><dt className="text-muted">{t.paidByBuyer}</dt><dd className="font-semibold tabular-nums">{price(order.total_cents, order.currency)}</dd><dd className="text-xs text-muted">{fmt(t.taxes, { amount: price(order.tax_cents, order.currency) })}</dd></div>
                  <div><dt className="text-muted">{t.margin}</dt><dd className="font-semibold tabular-nums">{price(order.gross_margin_cents, order.currency)}</dd></div>
                  <div><dt className="text-muted">{t.commission}</dt><dd className="font-semibold tabular-nums">− {price(order.commission_cents, order.currency)}</dd></div>
                  <div>
                    <dt className="text-muted">{t.yourShare}</dt>
                    <dd className="font-semibold tabular-nums text-brand-strong">{price(payout ? Number(payout.amount_cents) - Number(payout.reversed_cents) : Number(order.store_payout_cents), order.currency)}</dd>
                    {payout && <dd className="text-xs text-muted">{label(t.payoutStatus, payout.status)}{payoutDate && (payout.status === "pending" || payout.status === "paid") ? ` ${dateFormat.format(new Date(payoutDate))}` : ""}</dd>}
                  </div>
                </dl>

                {Number(order.refunded_cents) > 0 && (
                  <p className="mt-3 text-sm text-muted">{fmt(t.refundedToBuyer, { amount: price(order.refunded_cents, order.currency) })}</p>
                )}
                {REFUNDABLE.includes(order.status) && !order.disputed && remaining > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-brand">{t.refundBuyer}</summary>
                    <div className="mt-3">
                      <RefundForm orderId={order.id} remainingCents={remaining} currency={order.currency} />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center text-muted">{t.empty}</div>
      )}
    </div>
  );
}
