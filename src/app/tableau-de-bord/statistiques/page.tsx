import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { requireUser } from "@/lib/auth";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { getPlatformSettings } from "@/lib/settings";
import { changeBp, computeDashboardStats, dayKey, type StatsOrder } from "@/lib/stats";
import { formatPrice } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).stats.metaTitle };
}

const PERIODS = ["7", "30", "90"] as const;
type Period = (typeof PERIODS)[number];

type OrderRow = {
  store_id: string;
  paid_at: string;
  subtotal_cents: number;
  gross_margin_cents: number;
  commission_cents: number;
  store_payout_cents: number;
  refunded_cents: number;
  order_items: { title: string; quantity: number; unit_price_cents: number }[];
};

/** Tableau de bord des ventes : chiffres clés, comparaison, graphiques, meilleurs produits, versements. */
export default async function StatsPage({ searchParams }: PageProps<"/tableau-de-bord/statistiques">) {
  const user = await requireUser();
  const sp = await searchParams;
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.stats;
  const period: Period = PERIODS.includes(sp.periode as Period) ? (sp.periode as Period) : "30";
  const days = Number(period);
  const supabase = await createUserClient();

  const { data: stores } = await supabase.from("stores").select("id, name").eq("owner_id", user.id).order("created_at");
  const storeIds = (stores ?? []).map((s) => s.id);
  const storeId = typeof sp.boutique === "string" && storeIds.includes(sp.boutique) ? sp.boutique : null;
  const ids = storeId ? [storeId] : storeIds;

  if (ids.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted">{t.empty}</p>
      </div>
    );
  }

  const now = new Date();
  // Deux périodes (en cours + précédente) pour la comparaison.
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days * 2 - 1) * 86_400_000);
  const [{ data: orders }, { data: visits }, { data: payouts }, settings] = await Promise.all([
    supabase
      .from("orders")
      .select("store_id, paid_at, subtotal_cents, gross_margin_cents, commission_cents, store_payout_cents, refunded_cents, order_items(title, quantity, unit_price_cents)")
      .in("store_id", ids)
      .not("status", "in", "(pending,cancelled)")
      .not("paid_at", "is", null)
      .gte("paid_at", since.toISOString()),
    supabase.from("store_daily_stats").select("day, visitors, page_views").in("store_id", ids).gte("day", dayKey(since)),
    supabase.from("payouts").select("amount_cents, reversed_cents, status").in("store_id", ids),
    getPlatformSettings(),
  ]);

  const stats = computeDashboardStats(
    ((orders ?? []) as unknown as OrderRow[]).map(
      (o): StatsOrder => ({
        paidAt: o.paid_at,
        subtotalCents: Number(o.subtotal_cents),
        grossMarginCents: Number(o.gross_margin_cents),
        commissionCents: Number(o.commission_cents),
        storePayoutCents: Number(o.store_payout_cents),
        refundedCents: Number(o.refunded_cents),
        items: o.order_items.map((i) => ({ title: i.title, quantity: i.quantity, unitPriceCents: Number(i.unit_price_cents) })),
      }),
    ),
    (visits ?? []).map((v) => ({ day: v.day, visitors: v.visitors, pageViews: v.page_views })),
    days,
    now,
  );
  const paid = (payouts ?? []).filter((p) => p.status === "paid" || p.status === "reversed").reduce((n, p) => n + Number(p.amount_cents) - Number(p.reversed_cents), 0);
  const upcoming = (payouts ?? []).filter((p) => p.status === "pending" || p.status === "held").reduce((n, p) => n + Number(p.amount_cents) - Number(p.reversed_cents), 0);

  const price = (cents: number) => formatPrice(cents, "CAD", locale);
  const number = new Intl.NumberFormat(intlLocale(locale));
  const percent = (bp: number) => new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 }).format(bp / 10_000);
  const signedPercent = (bp: number) => new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(bp / 10_000);
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  const label = (day: string) => dayLabel.format(new Date(`${day}T12:00:00Z`));
  const { current: c, previous: p } = stats;

  const comparison = (cur: number, prev: number) => {
    const change = changeBp(cur, prev);
    if (change === null) return <p className="mt-1 text-xs text-muted">{t.noComparison}</p>;
    return (
      <p className={`mt-1 text-xs ${change > 0 ? "text-brand-strong" : change < 0 ? "text-danger" : "text-muted"}`}>
        <span aria-hidden>{change > 0 ? "▲ " : change < 0 ? "▼ " : ""}</span>
        {fmt(t.vsPrevious, { change: signedPercent(change), days })}
      </p>
    );
  };
  const href = (params: { periode?: string; boutique?: string | null }) => {
    const qs = new URLSearchParams();
    const per = params.periode ?? period;
    if (per !== "30") qs.set("periode", per);
    const b = params.boutique === undefined ? storeId : params.boutique;
    if (b) qs.set("boutique", b);
    const s = qs.toString();
    return `/tableau-de-bord/statistiques${s ? `?${s}` : ""}`;
  };

  const tiles: { label: string; value: string; extra?: React.ReactNode; hint?: string }[] = [
    { label: t.tiles.revenue, value: price(c.revenueCents), extra: comparison(c.revenueCents, p.revenueCents) },
    { label: t.tiles.orders, value: number.format(c.orders), extra: comparison(c.orders, p.orders) },
    { label: t.tiles.visitors, value: number.format(c.visitors), extra: comparison(c.visitors, p.visitors), hint: fmt(t.tiles.pageViews, { n: number.format(c.pageViews) }) },
    { label: t.tiles.conversion, value: c.conversionBp === null ? "—" : percent(c.conversionBp), hint: t.conversionHint },
    { label: t.tiles.average, value: price(c.averageOrderCents) },
    { label: t.tiles.margin, value: price(c.grossMarginCents) },
    { label: t.tiles.commission, value: price(c.commissionCents) },
    { label: t.tiles.earnings, value: price(c.earningsCents), hint: c.refundsCents > 0 ? `${t.tiles.refunds} : ${price(c.refundsCents)}` : undefined },
  ];

  const charts = [
    { title: t.charts.revenue, valueLabel: t.tiles.revenue, data: stats.daily.map((d) => ({ key: d.day, label: label(d.day), value: d.revenueCents, display: price(d.revenueCents) })) },
    { title: t.charts.visitors, valueLabel: t.tiles.visitors, data: stats.daily.map((d) => ({ key: d.day, label: label(d.day), value: d.visitors, display: number.format(d.visitors) })) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.intro}</p>
        </div>
        {/* Filtres sur une seule ligne, au-dessus des graphiques. */}
        <div className="flex flex-wrap items-center gap-3">
          {storeIds.length > 1 && (
            <form method="get" className="flex items-center gap-2 text-sm">
              {period !== "30" && <input type="hidden" name="periode" value={period} />}
              <label htmlFor="boutique" className="sr-only">{t.store}</label>
              <select id="boutique" name="boutique" defaultValue={storeId ?? ""} className="rounded-xl border border-line bg-white px-3 py-2">
                <option value="">{t.allStores}</option>
                {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="submit" className="rounded-xl border border-line bg-white px-3 py-2 font-medium">{t.show}</button>
            </form>
          )}
          <nav aria-label={t.period} className="flex rounded-xl border border-line bg-white p-1 text-sm">
            {PERIODS.map((per) => (
              <Link key={per} href={href({ periode: per })} aria-current={per === period ? "true" : undefined} className={`rounded-lg px-3 py-1.5 ${per === period ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"}`}>
                {t.periods[per]}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-kpis>
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{tile.value}</p>
            {tile.extra}
            {tile.hint && <p className="mt-1 text-xs text-muted">{tile.hint}</p>}
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {charts.map((chart) => (
          <div key={chart.title} className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">{chart.title}</h2>
            <div className="mt-4">
              {chart.data.some((d) => d.value > 0) ? <BarChart data={chart.data} title={chart.title} valueLabel={chart.valueLabel} /> : <p className="py-12 text-center text-sm text-muted">{t.charts.noData}</p>}
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted hover:text-ink">{t.charts.table}</summary>
              <table className="mt-2 w-full text-left tabular-nums">
                <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">{t.charts.day}</th><th className="py-1 text-right font-medium">{chart.valueLabel}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {chart.data.filter((d) => d.value > 0).map((d) => <tr key={d.key}><td className="py-1">{d.label}</td><td className="py-1 text-right">{d.display}</td></tr>)}
                </tbody>
              </table>
            </details>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">{t.top.title}</h2>
          {stats.topProducts.length > 0 ? (
            <table className="mt-3 w-full text-left text-sm tabular-nums" data-top-products>
              <thead className="text-xs text-muted">
                <tr><th className="py-2 font-medium">{t.top.product}</th><th className="py-2 text-right font-medium">{t.top.units}</th><th className="py-2 text-right font-medium">{t.top.revenue}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.topProducts.map((prod) => (
                  <tr key={prod.title}><td className="py-2 pr-3">{prod.title}</td><td className="py-2 text-right">{prod.quantity}</td><td className="py-2 text-right">{price(prod.revenueCents)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted">{t.top.empty}</p>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">{t.payouts.title}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t.payouts.paid}</dt><dd className="font-semibold tabular-nums">{price(paid)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{fmt(t.payouts.upcoming, { days: settings.payoutReserveDays })}</dt><dd className="font-semibold tabular-nums">{price(upcoming)}</dd></div>
          </dl>
          <Link href="/tableau-de-bord/paiements" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">{t.payouts.link} →</Link>
        </section>
      </div>
      <p className="text-xs text-muted">{t.visitsNote}</p>
    </div>
  );
}
