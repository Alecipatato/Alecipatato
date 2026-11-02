import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { metaCampaignsAvailable } from "@/lib/ads/connections";
import { AD_GUIDES, type AutoCheck, type GuideStep, type StepLink, stepKey } from "@/lib/ads/guides";
import { requireUser } from "@/lib/auth";
import { getUsdCadRate } from "@/lib/fx";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { missingLegalFields, parseLegalInfo } from "@/lib/legal/store-legal";
import { parsePixels } from "@/lib/marketing/settings";
import { adBudgetPlan, estimateProductEconomics, rateToBasisPoints } from "@/lib/money";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { StepToggle } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).ads.metaTitle };
}

/** Produits en vente minimum avant de payer des publicités. */
const MIN_PRODUCTS = 5;

/** Publicité d'une boutique : choix guides / campagnes, repères de budget, guides pas à pas. */
export default async function AdsPage({ params }: PageProps<"/tableau-de-bord/boutiques/[id]/publicite">) {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, name, status, pixels, legal_info").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store) notFound();
  const [{ data: products }, { count: assetCount }, { data: progress }, settings] = await Promise.all([
    admin.from("products").select("price_cents, supplier_cost_usd_cents, shipping_cost_usd_cents").eq("store_id", store.id).eq("status", "active"),
    admin.from("marketing_assets").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    admin.from("ad_guide_progress").select("step_key").eq("store_id", store.id),
    getPlatformSettings(),
  ]);
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.ads;
  const price = (cents: number) => formatPrice(cents, "CAD", locale);
  const commission = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 2 }).format(rateToBasisPoints(settings.commissionRate) / 10_000);

  // Gain du vendeur par vente, au prix réel de chaque produit.
  const plan = adBudgetPlan(
    (products ?? []).map(
      (p) =>
        estimateProductEconomics({
          supplierCostUsdCents: Number(p.supplier_cost_usd_cents),
          shippingUsdCents: Number(p.shipping_cost_usd_cents),
          fxRateUsdCad: fx.rate,
          minMarginRate: settings.minMarginRate,
          commissionRate: settings.commissionRate,
          priceCents: Number(p.price_cents),
        }).ownerProfitCents,
    ),
  );

  const campaigns = metaCampaignsAvailable();
  const pixels = parsePixels(store.pixels);
  const auto: Record<AutoCheck, boolean> = {
    products: (products?.length ?? 0) >= MIN_PRODUCTS,
    legal: missingLegalFields(parseLegalInfo(store.legal_info)).length === 0,
    online: store.status === "active",
    content: (assetCount ?? 0) > 0,
    metaPixel: Boolean(pixels.meta),
    tiktokPixel: Boolean(pixels.tiktok),
  };
  const done = new Set((progress ?? []).map((p) => p.step_key));
  const isDone = (guide: string, step: GuideStep) => (step.auto ? auto[step.auto] : done.has(stepKey(guide, step.id)));
  const links: Record<StepLink, string> = {
    products: `/tableau-de-bord/boutiques/${store.id}/produits`,
    store: `/tableau-de-bord/boutiques/${store.id}`,
    marketing: `/tableau-de-bord/boutiques/${store.id}/marketing`,
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/tableau-de-bord/boutiques/${store.id}`} className="text-sm font-medium text-muted hover:text-ink">← {store.name}</Link>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t.intro}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <a href="#guides" data-ads-choice="guides" className="group rounded-2xl border-2 border-brand/30 bg-white p-6 transition hover:border-brand">
          <p className="text-3xl" aria-hidden>📘</p>
          <h2 className="mt-3 font-display text-xl font-bold">{t.choose.guides.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.choose.guides.text}</p>
          <p className="mt-4 text-sm font-semibold text-brand group-hover:underline">{t.choose.guides.cta} ↓</p>
        </a>
        <Link href={`/tableau-de-bord/boutiques/${store.id}/publicite/campagne`} data-ads-choice="campaigns" className={`group rounded-2xl border bg-white p-6 transition ${campaigns ? "border-line hover:border-brand" : "border-line opacity-75"}`}>
          <p className="text-3xl" aria-hidden>🚀</p>
          <h2 className="mt-3 font-display text-xl font-bold">{t.choose.campaigns.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.choose.campaigns.text}</p>
          {campaigns ? (
            <p className="mt-4 text-sm font-semibold text-brand group-hover:underline">{t.choose.campaigns.cta} →</p>
          ) : (
            <p className="mt-4 inline-block rounded-full bg-paper px-3 py-1 text-xs font-semibold text-muted">{t.choose.campaigns.soon}</p>
          )}
        </Link>
      </div>

      <p className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand-strong">{t.money}</p>

      <section className="rounded-2xl border border-line bg-white p-6" data-ad-budget>
        <h2 className="font-display text-xl font-bold">{t.budget.title}</h2>
        <p className="mt-1 text-sm text-muted">{fmt(t.budget.intro, { commission })}</p>
        {plan ? (
          <>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: "avg", label: t.budget.avgProfit, value: price(plan.avgProfitCents), hint: null },
                { key: "breakEven", label: t.budget.breakEven, value: price(plan.breakEvenCpaCents), hint: t.budget.breakEvenHint },
                { key: "target", label: t.budget.target, value: price(plan.targetCpaCents), hint: t.budget.targetHint },
                { key: "daily", label: t.budget.daily, value: price(plan.dailyBudgetCents), hint: t.budget.dailyHint },
              ].map((x) => (
                <div key={x.key} data-budget={x.key} className="rounded-xl bg-paper p-4">
                  <dt className="text-xs font-medium text-muted">{x.label}</dt>
                  <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{x.value}</dd>
                  {x.hint && <p className="mt-1 text-xs text-muted">{x.hint}</p>}
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm" data-budget="test">
              <span className="font-semibold">{t.budget.test} : {price(plan.testBudgetCents)}</span>{" "}
              <span className="text-muted">— {fmt(t.budget.testHint, { days: plan.testDays, daily: price(plan.dailyBudgetCents) })}</span>
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.budget.none}</p>
        )}
        <p className="mt-4 text-xs text-muted">{t.budget.disclaimer}</p>
      </section>

      <section id="guides" className="scroll-mt-6">
        <h2 className="font-display text-2xl font-bold">{t.guides.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.guides.intro}</p>
        <p className="mt-3 max-w-3xl rounded-xl bg-marigold-soft px-4 py-3 text-sm">{t.guides.rules}</p>
        <div className="mt-5 flex flex-col gap-4">
          {AD_GUIDES.map((guide, gi) => {
            const g = t.guides.list[guide.id];
            const steps = guide.steps as readonly GuideStep[];
            const count = steps.filter((s) => isDone(guide.id, s)).length;
            return (
              <details key={guide.id} data-guide={guide.id} open={gi === 0} className="group rounded-2xl border border-line bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-display text-lg font-bold">{g.title}</h3>
                    <p className="mt-0.5 text-sm text-muted">{g.intro}</p>
                  </div>
                  <span data-guide-progress className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${count === steps.length ? "bg-brand text-white" : "bg-paper text-muted"}`}>
                    {fmt(t.guides.progress, { done: count, total: steps.length })}
                  </span>
                </summary>
                <ol className="flex flex-col divide-y divide-line border-t border-line">
                  {steps.map((step, si) => {
                    const s = (g.steps as Record<string, { title: string; text: string }>)[step.id];
                    const key = stepKey(guide.id, step.id);
                    const ok = isDone(guide.id, step);
                    return (
                      <li key={step.id} data-step={key} data-done={ok || undefined} className="flex gap-4 p-5">
                        {step.auto ? (
                          <span
                            title={t.guides.auto}
                            aria-label={ok ? t.guides.auto : t.guides.todo}
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${ok ? "bg-brand text-white" : "border-2 border-dashed border-line text-muted"}`}
                          >
                            {ok ? "✓" : si + 1}
                          </span>
                        ) : (
                          <StepToggle storeId={store.id} stepKey={key} done={ok} />
                        )}
                        <div className="min-w-0">
                          <p className={`font-semibold ${ok ? "text-muted line-through decoration-1" : ""}`}>{s.title}</p>
                          <p className="mt-1 text-sm text-muted">{s.text}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            {step.auto && <span className={ok ? "text-brand" : "text-muted"}>{ok ? `✓ ${t.guides.auto}` : t.guides.todo}</span>}
                            {step.link && (
                              <Link href={links[step.link]} className="font-semibold text-brand hover:underline">{t.guides.open} →</Link>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
