import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { aiCostByKind, aiCostCents, flagReasons, platformRevenue, refundPlatformCostCents, type FlagReason, type PlatformOrder } from "@/lib/admin-stats";
import { isCjConfigured } from "@/lib/cj/client";
import { getCjBalance } from "@/lib/cj/orders";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { findViolation } from "@/lib/moderation/match";
import { describeViolation, getModerationRules } from "@/lib/moderation/rules";
import { getPlatformSettings } from "@/lib/settings";
import { dayKey, lastDays } from "@/lib/stats";
import { formatPrice, parseStoreConfig } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.overview.title };
}

const PERIODS = ["7", "30", "90"] as const;
type Period = (typeof PERIODS)[number];

type OrderRow = {
  store_id: string;
  paid_at: string;
  subtotal_cents: number;
  total_cents: number;
  commission_cents: number;
  stripe_fee_cents: number;
  refunded_cents: number;
  disputed: boolean;
  cj_status: string | null;
};

/** Tableau de bord admin : revenus de la plateforme, coûts de l'IA, portefeuille CJ, boutiques à surveiller. */
export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.admin.overview;
  const period: Period = PERIODS.includes(sp.periode as Period) ? (sp.periode as Period) : "30";
  const days = Number(period);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000).toISOString();
  const admin = createAdminClient();

  const [{ data: orders }, { data: refunds }, { data: aiRows }, { data: stores }, { data: payouts }, { data: cjQueue }, settings, rules] = await Promise.all([
    admin
      .from("orders")
      .select("store_id, paid_at, subtotal_cents, total_cents, commission_cents, stripe_fee_cents, refunded_cents, disputed, cj_status")
      .not("status", "in", "(pending,cancelled)")
      .not("paid_at", "is", null)
      .gte("paid_at", since)
      .limit(10_000),
    admin.from("refunds").select("platform_debit_cents, amount_cents, orders(tax_cents, total_cents)").in("status", ["succeeded", "lost"]).gte("created_at", since).limit(10_000),
    admin.from("ai_generations").select("kind, model, input_tokens, output_tokens").gte("created_at", since).limit(20_000),
    admin.from("stores").select("id, name, subdomain, status, config, created_at, products(moderation_reason)").limit(2_000),
    admin.from("payouts").select("amount_cents, reversed_cents").in("status", ["pending", "held"]),
    admin.from("orders").select("cj_status, cj_paid, status").or("cj_status.eq.failed,and(cj_status.eq.sent,cj_paid.eq.false)").limit(1_000),
    getPlatformSettings(),
    getModerationRules(),
  ]);

  // Solde du portefeuille CJ : facultatif (CJ non configuré ou indisponible).
  let balance: Awaited<ReturnType<typeof getCjBalance>> = null;
  if (isCjConfigured()) {
    try {
      balance = await getCjBalance();
    } catch (err) {
      console.warn("Solde CJ :", err);
    }
  }

  const rows = (orders ?? []) as OrderRow[];
  const toPlatformOrder = (o: OrderRow): PlatformOrder => ({
    storeId: o.store_id,
    subtotalCents: Number(o.subtotal_cents),
    totalCents: Number(o.total_cents),
    commissionCents: Number(o.commission_cents),
    stripeFeeCents: Number(o.stripe_fee_cents),
    refundedCents: Number(o.refunded_cents),
    disputed: o.disputed,
  });
  const platformOrders = rows.map(toPlatformOrder);
  const refundCost = refundPlatformCostCents(
    (refunds ?? []).map((r) => {
      const order = r.orders as unknown as { tax_cents: number; total_cents: number } | null;
      return { platformDebitCents: Number(r.platform_debit_cents), amountCents: Number(r.amount_cents), orderTaxCents: Number(order?.tax_cents ?? 0), orderTotalCents: Number(order?.total_cents ?? 0) };
    }),
  );
  const revenue = platformRevenue(platformOrders, refundCost, settings.stripeFeesPaidBy);
  const calls = (aiRows ?? []).map((r) => ({ kind: r.kind, model: r.model, inputTokens: r.input_tokens ?? 0, outputTokens: r.output_tokens ?? 0 }));
  const aiTotal = aiCostCents(calls, settings.aiPricing);
  const byKind = aiCostByKind(calls, settings.aiPricing);
  const payoutsDue = (payouts ?? []).reduce((n, p) => n + Number(p.amount_cents) - Number(p.reversed_cents), 0);
  const cjFailed = (cjQueue ?? []).filter((o) => o.cj_status === "failed").length;
  const cjUnpaid = (cjQueue ?? []).filter((o) => o.cj_status === "sent" && !o.cj_paid).length;

  const allStores = (stores ?? []) as unknown as { id: string; name: string; subdomain: string; status: string; config: unknown; created_at: string; products: { moderation_reason: string | null }[] }[];
  const daily = lastDays(days, now).map((day) => ({ day, commission: rows.filter((o) => o.paid_at.slice(0, 10) === day).reduce((n, o) => n + Number(o.commission_cents), 0) }));
  const storeSales = new Map<string, number>();
  for (const o of rows) storeSales.set(o.store_id, (storeSales.get(o.store_id) ?? 0) + Number(o.subtotal_cents));
  const topStores = [...storeSales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, sales]) => ({ store: allStores.find((s) => s.id === id), sales }));

  const flagged = allStores
    .map((store) => {
      const c = parseStoreConfig(store.config).content;
      const text = findViolation(rules, [store.name, c.tagline, c.hero.title, c.hero.subtitle, c.about.title, c.about.body, c.footerText]);
      const reasons = flagReasons({
        orders: platformOrders.filter((o) => o.storeId === store.id),
        blockedProducts: store.products.filter((p) => p.moderation_reason).length,
        textFlag: text ? describeViolation(text, m) : null,
        cjFailures: rows.filter((o) => o.store_id === store.id && o.cj_status === "failed").length,
        suspended: store.status === "suspended",
      });
      return { store, reasons };
    })
    .filter((f) => f.reasons.length > 0)
    .slice(0, 50);

  const cad = (cents: number) => formatPrice(cents, "CAD", locale);
  const usd = (cents: number) => formatPrice(cents, "USD", locale);
  const number = new Intl.NumberFormat(intlLocale(locale));
  const percent = (bp: number) => new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(bp / 10_000);
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  const reasonText = (r: FlagReason) =>
    r.type === "refund_rate" ? fmt(t.reasons.refund_rate, { rate: percent(r.bp) }) : r.type === "text_flag" ? fmt(t.reasons.text_flag, { detail: r.detail }) : r.type === "suspended" ? t.reasons.suspended : fmt(t.reasons[r.type], { count: r.count });

  const tiles = [
    { label: t.gmv, value: cad(revenue.gmvCents) },
    { label: t.orders, value: number.format(revenue.orders) },
    { label: t.commission, value: cad(revenue.commissionCents) },
    { label: t.net, value: cad(revenue.netCents), hint: t.netHint, strong: true },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.intro}</p>
        </div>
        <nav aria-label={m.stats.period} className="flex rounded-xl border border-line bg-white p-1 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={p === "30" ? "/admin" : `/admin?periode=${p}`} aria-current={p === period ? "true" : undefined} className={`rounded-lg px-3 py-1.5 ${p === period ? "bg-ink font-semibold text-white" : "text-muted hover:text-ink"}`}>
              {m.stats.periods[p]}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-label={t.revenue} className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-admin-kpis>
        {tiles.map((tile) => (
          <div key={tile.label} className={`rounded-2xl border p-5 ${tile.strong ? "border-brand/30 bg-brand-soft" : "border-line bg-white"}`}>
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{tile.value}</p>
            {tile.hint && <p className="mt-1 text-xs text-muted">{tile.hint}</p>}
          </div>
        ))}
      </section>
      <dl className="-mt-4 flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted">
        <div className="flex gap-2"><dt>{t.refundCost} :</dt><dd className="font-medium tabular-nums text-ink">− {cad(revenue.refundCostCents)}</dd></div>
        <div className="flex gap-2"><dt>{t.stripeFees} :</dt><dd className="font-medium tabular-nums text-ink">− {cad(revenue.stripeFeesCents)}</dd></div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">{t.chart}</h2>
          <div className="mt-4">
            {daily.some((d) => d.commission > 0) ? (
              <BarChart title={t.chart} valueLabel={t.commission} data={daily.map((d) => ({ key: d.day, label: dayLabel.format(new Date(`${d.day}T12:00:00Z`)), value: d.commission, display: cad(d.commission) }))} />
            ) : (
              <p className="py-12 text-center text-sm text-muted">{m.stats.charts.noData}</p>
            )}
          </div>
        </section>
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-white p-5" data-cj-wallet>
            <h2 className="font-semibold">{t.cj}</h2>
            {balance ? (
              <>
                <p className="mt-2 text-sm text-muted">{t.cjBalance}</p>
                <p className="font-display text-2xl font-bold tabular-nums">{usd(balance.availableUsdCents)}</p>
                {balance.frozenUsdCents > 0 && <p className="text-xs text-muted">{fmt(t.cjFrozen, { amount: usd(balance.frozenUsdCents) })}</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{t.cjUnavailable}</p>
            )}
            {cjUnpaid > 0 && <p className="mt-2 text-sm font-medium text-danger">{fmt(t.cjUnpaid, { n: cjUnpaid })}</p>}
            {cjFailed > 0 && <p className="mt-1 text-sm font-medium text-danger">{fmt(t.cjFailed, { n: cjFailed })}</p>}
            <Link href="/admin/commandes" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">{t.cjLink} →</Link>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">{t.payoutsDue}</h2>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">{cad(payoutsDue)}</p>
            <p className="text-xs text-muted">{t.payoutsDueHint}</p>
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5" data-ai-costs>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{t.ai}</h2>
            <p className="text-sm">{t.aiTotal} : <strong className="tabular-nums">{usd(aiTotal)}</strong></p>
          </div>
          {byKind.length > 0 ? (
            <table className="mt-3 w-full text-left text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr><th className="py-2 font-medium">{t.aiColumns.kind}</th><th className="py-2 text-right font-medium">{t.aiColumns.calls}</th><th className="py-2 text-right font-medium">{t.aiColumns.tokens}</th><th className="py-2 text-right font-medium">{t.aiColumns.cost}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byKind.map((k) => (
                  <tr key={k.kind}>
                    <td className="py-2">{t.aiKinds[k.kind as keyof typeof t.aiKinds] ?? k.kind}</td>
                    <td className="py-2 text-right">{number.format(k.calls)}</td>
                    <td className="py-2 text-right">{number.format(k.tokens)}</td>
                    <td className="py-2 text-right">{usd(k.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted">{t.aiNone}</p>
          )}
          <p className="mt-3 text-xs text-muted">{t.aiHint}</p>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">{t.stores}</h2>
          <p className="mt-2 text-sm">
            {fmt(t.storesTotal, { total: allStores.length, active: allStores.filter((s) => s.status === "active").length, suspended: allStores.filter((s) => s.status === "suspended").length })}
          </p>
          <p className="text-sm text-muted">{fmt(t.newStores, { n: allStores.filter((s) => s.created_at >= since).length })}</p>
          <h3 className="mt-4 text-sm font-semibold">{t.topStores}</h3>
          <ol className="mt-2 space-y-1.5 text-sm">
            {topStores.map(({ store, sales }) => (
              <li key={store?.id ?? sales} className="flex justify-between gap-3"><span className="truncate">{store?.name ?? "—"}</span><span className="tabular-nums">{cad(sales)}</span></li>
            ))}
          </ol>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5" data-flagged>
        <h2 className="font-semibold">{t.flagged} <span className="text-muted">({flagged.length})</span></h2>
        <p className="mt-1 text-sm text-muted">{t.flaggedIntro}</p>
        {flagged.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.flaggedNone}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {flagged.map(({ store, reasons }) => (
              <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-flagged-store={store.subdomain}>
                <div className="min-w-0">
                  <p className="font-medium">{store.name} <span className="text-sm font-normal text-muted">· {store.subdomain}</span></p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {reasons.map((r) => (
                      <li key={r.type} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.type === "suspended" || r.type === "disputes" ? "bg-danger-soft text-danger" : "bg-marigold-soft text-ink"}`}>{reasonText(r)}</li>
                    ))}
                  </ul>
                </div>
                <Link href={`/admin/boutiques?q=${encodeURIComponent(store.subdomain)}`} className="text-sm font-semibold text-brand hover:underline">{t.manage} →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted">{dayKey(new Date(since))} → {dayKey(now)}</p>
    </div>
  );
}
