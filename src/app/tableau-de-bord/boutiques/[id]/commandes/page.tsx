import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { RefundForm } from "./refund-form";

export const metadata: Metadata = { title: "Commandes" };

const ORDER_STATUS: Record<string, string> = {
  paid: "Payée",
  sent_to_supplier: "Envoyée au fournisseur",
  shipped: "Expédiée",
  delivered: "Livrée",
  partially_refunded: "Remboursée en partie",
  refunded: "Remboursée",
  failed: "Échec",
};
const PAYOUT_STATUS: Record<string, string> = {
  pending: "prévu le",
  held: "retenu (litige)",
  paid: "versé le",
  reversed: "annulé",
  failed: "échec",
};
const REFUNDABLE = ["paid", "partially_refunded", "sent_to_supplier", "shipped", "delivered"];
const dateFormat = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });

export default async function OrdersPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]/commandes">) {
  const user = await requireUser();
  const { id } = await params;
  const { rembourse } = await searchParams;
  const supabase = await createUserClient();

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
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Commandes</h1>
        <p className="mt-1 text-muted">Pour chaque vente : ce que l&apos;acheteur a payé, la commission de la plateforme et votre part.</p>
      </div>

      {typeof rembourse === "string" && (
        <Alert kind="success">
          Remboursement de la commande n° {rembourse} effectué. L&apos;acheteur le verra sur son relevé d&apos;ici 5 à 10 jours.
        </Alert>
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
                    <p className="font-semibold">Commande n° {order.order_number}</p>
                    <p className="text-sm text-muted">
                      {order.paid_at && dateFormat.format(new Date(order.paid_at))} · {order.customer_name ?? order.customer_email ?? "Acheteur"}
                    </p>
                    <p className="mt-1 text-sm">{items.map((i) => `${i.title} × ${i.quantity}`).join(", ")}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${order.disputed ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong"}`}>
                    {order.disputed ? "Litige en cours" : ORDER_STATUS[order.status] ?? order.status}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
                  <div><dt className="text-muted">Payé par l&apos;acheteur</dt><dd className="font-semibold tabular-nums">{formatPrice(Number(order.total_cents), order.currency)}</dd><dd className="text-xs text-muted">dont taxes {formatPrice(Number(order.tax_cents), order.currency)}</dd></div>
                  <div><dt className="text-muted">Marge brute</dt><dd className="font-semibold tabular-nums">{formatPrice(Number(order.gross_margin_cents), order.currency)}</dd></div>
                  <div><dt className="text-muted">Commission</dt><dd className="font-semibold tabular-nums">− {formatPrice(Number(order.commission_cents), order.currency)}</dd></div>
                  <div>
                    <dt className="text-muted">Votre part</dt>
                    <dd className="font-semibold tabular-nums text-brand-strong">{formatPrice(payout ? Number(payout.amount_cents) - Number(payout.reversed_cents) : Number(order.store_payout_cents), order.currency)}</dd>
                    {payout && <dd className="text-xs text-muted">{PAYOUT_STATUS[payout.status] ?? payout.status}{payoutDate && (payout.status === "pending" || payout.status === "paid") ? ` ${dateFormat.format(new Date(payoutDate))}` : ""}</dd>}
                  </div>
                </dl>

                {Number(order.refunded_cents) > 0 && (
                  <p className="mt-3 text-sm text-muted">Remboursé à l&apos;acheteur : {formatPrice(Number(order.refunded_cents), order.currency)}</p>
                )}
                {REFUNDABLE.includes(order.status) && !order.disputed && remaining > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-brand">Rembourser l&apos;acheteur</summary>
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
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center text-muted">Aucune commande pour l&apos;instant.</div>
      )}
    </div>
  );
}
