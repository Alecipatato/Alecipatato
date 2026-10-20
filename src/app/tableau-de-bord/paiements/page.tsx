import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { requireUser } from "@/lib/auth";
import { refreshConnectStatus } from "@/lib/payments/connect";
import { getPlatformSettings } from "@/lib/settings";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/store-config";
import { isStripeConfigured } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";
import { openStripeDashboard, startPayoutOnboarding } from "../payments-actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).sales.payments.metaTitle };
}

const PAYOUT_CLASSES = {
  pending: "bg-marigold-soft text-ink",
  held: "bg-danger-soft text-danger",
  paid: "bg-brand-soft text-brand-strong",
  reversed: "bg-paper text-muted border border-line",
  failed: "bg-danger-soft text-danger",
} as const;

export default async function PaymentsPage({ searchParams }: PageProps<"/tableau-de-bord/paiements">) {
  const user = await requireUser();
  const sp = await searchParams;
  const configured = isStripeConfigured();
  const supabase = await createUserClient();
  const locale = await getLocale();
  const t = (await getMessages(locale)).sales.payments;
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" });
  const price = (cents: number) => formatPrice(cents, "CAD", locale);

  // Au retour du formulaire Stripe, on relit l'état du compte.
  let status = { accountId: null as string | null, ready: false, detailsSubmitted: false };
  if (configured) {
    const { data: profile } = await supabase.from("profiles").select("stripe_account_id, stripe_onboarding_complete").eq("id", user.id).single();
    status = { accountId: profile?.stripe_account_id ?? null, ready: Boolean(profile?.stripe_onboarding_complete), detailsSubmitted: false };
    if (status.accountId && (sp.stripe === "retour" || !status.ready)) {
      try {
        status = await refreshConnectStatus(user.id);
      } catch (err) {
        console.error("État du compte Stripe :", err);
      }
    }
  }

  const [{ data: orders }, { data: payouts }, settings] = await Promise.all([
    supabase.from("orders").select("subtotal_cents, commission_cents, refunded_cents, status").in("status", ["paid", "sent_to_supplier", "shipped", "delivered", "partially_refunded", "refunded"]),
    supabase
      .from("payouts")
      .select("id, amount_cents, reversed_cents, status, available_at, paid_at, orders(order_number), stores(name)")
      .order("available_at", { ascending: false })
      .limit(50),
    getPlatformSettings(),
  ]);

  const sum = (rows: Record<string, unknown>[] | null, key: string) => (rows ?? []).reduce((n, r) => n + Number(r[key] ?? 0), 0);
  const paidOut = (payouts ?? []).filter((p) => p.status === "paid" || p.status === "reversed").reduce((n, p) => n + Number(p.amount_cents) - Number(p.reversed_cents), 0);
  const upcoming = (payouts ?? []).filter((p) => p.status === "pending" || p.status === "held").reduce((n, p) => n + Number(p.amount_cents), 0);
  const pct = Math.round(Number(settings.commissionRate) * 100);
  const commissionPct = locale === "fr" ? `${pct} %` : `${pct}%`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{fmt(t.intro, { days: settings.payoutReserveDays })}</p>
      </div>

      {sp.stripe === "erreur" && <Alert kind="error">{t.stripeError}</Alert>}

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.account}</h2>
        {!configured ? (
          <p className="mt-2 text-sm text-muted">{t.notEnabled}</p>
        ) : status.ready ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm font-medium text-brand-strong">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand" /> {t.ready}
            </p>
            <form action={openStripeDashboard}>
              <button type="submit" className={buttonClasses.secondary}>{t.openStripe}</button>
            </form>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted">
              {status.accountId ? t.incomplete : t.setupBody}
            </p>
            <form action={startPayoutOnboarding}>
              <button type="submit" className={buttonClasses.primary}>
                {status.accountId ? t.finish : t.setup}
              </button>
            </form>
          </div>
        )}
        {configured && !status.ready && (
          <p className="mt-4 rounded-lg bg-marigold-soft px-3 py-2 text-xs">{t.checkoutDisabled}</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t.tiles.sales, value: sum(orders, "subtotal_cents") },
          { label: t.tiles.refunds, value: sum(orders, "refunded_cents") },
          { label: t.tiles.paidOut, value: paidOut },
          { label: t.tiles.upcoming, value: upcoming },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{price(tile.value)}</p>
          </div>
        ))}
      </section>
      <p className="-mt-4 text-xs text-muted">
        {fmt(t.commissionNote, { pct: commissionPct, total: price(sum(orders, "commission_cents")) })}
      </p>

      <section className="rounded-2xl border border-line bg-white">
        <h2 className="px-6 pt-6 font-display text-xl font-bold">{t.payouts}</h2>
        {payouts && payouts.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-y border-line bg-paper text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">{t.columns.order}</th>
                  <th className="px-6 py-3 font-medium">{t.columns.store}</th>
                  <th className="px-6 py-3 font-medium">{t.columns.date}</th>
                  <th className="px-6 py-3 font-medium">{t.columns.status}</th>
                  <th className="px-6 py-3 text-right font-medium">{t.columns.amount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payouts.map((p) => {
                  const st = (p.status in PAYOUT_CLASSES ? p.status : "pending") as keyof typeof PAYOUT_CLASSES;
                  const date = p.paid_at ?? p.available_at;
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-medium">{fmt(t.orderNumber, { number: (p.orders as unknown as { order_number: string } | null)?.order_number ?? "" })}</td>
                      <td className="px-6 py-3 text-muted">{(p.stores as unknown as { name: string } | null)?.name}</td>
                      <td className="px-6 py-3 text-muted">{dateFormat.format(new Date(date))}</td>
                      <td className="px-6 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_CLASSES[st]}`}>{t.status[st]}</span></td>
                      <td className="px-6 py-3 text-right font-semibold tabular-nums">{price(Number(p.amount_cents) - Number(p.reversed_cents))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 pb-6 pt-2 text-sm text-muted">{t.empty}</p>
        )}
      </section>
    </div>
  );
}
