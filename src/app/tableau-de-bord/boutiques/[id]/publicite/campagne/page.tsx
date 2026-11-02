import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { disconnectMeta } from "@/app/tableau-de-bord/ads-campaign-actions";
import { buttonClasses } from "@/components/styles";
import { Alert } from "@/components/ui";
import { getAdConnection, metaCampaignsAvailable } from "@/lib/ads/connections";
import { getMetaInsights, listMetaAdAccounts, listMetaPages, type MetaInsights } from "@/lib/ads/meta";
import { requireUser } from "@/lib/auth";
import { getSellerCommission } from "@/lib/commission";
import { getUsdCadRate } from "@/lib/fx";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { parsePixels } from "@/lib/marketing/settings";
import { adBudgetPlan, estimateProductEconomics } from "@/lib/money";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { CampaignStatusButton, ChooseAccountForm, DraftForm, ReviewForm } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).ads.campaigns.metaTitle };
}

const RESULTS = ["connecte", "refuse", "invalide", "echec", "deconnecte"] as const;
type Result = (typeof RESULTS)[number];

/** Campagnes Meta d'une boutique : connexion du compte publicitaire, brouillon par l'IA, création en pause, lancement. */
export default async function CampaignPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]/publicite/campagne">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, name, status, pixels, currency").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store) notFound();
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.ads.campaigns;
  const price = (cents: number) => formatPrice(cents, "CAD", locale);
  const base = `/tableau-de-bord/boutiques/${store.id}`;
  const result = RESULTS.includes(sp.meta as Result) ? (sp.meta as Result) : null;

  const header = (
    <div>
      <Link href={`${base}/publicite`} className="text-sm font-medium text-muted hover:text-ink">{t.back}</Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-1 max-w-3xl text-muted">{t.intro}</p>
    </div>
  );
  if (!metaCampaignsAvailable()) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert kind="info">{t.notConfigured}</Alert>
        <Link href={`${base}/publicite#guides`} className={`${buttonClasses.secondary} self-start`}>{m.ads.choose.guides.cta}</Link>
      </div>
    );
  }

  const connection = await getAdConnection(store.id, "meta");
  const pixelId = parsePixels(store.pixels).meta;
  const suspended = store.status === "suspended";

  // Compte relié : comptes publicitaires et pages lus chez Meta s'il faut (re)choisir.
  const choosing = Boolean(connection) && (!connection?.adAccountId || !connection.pageId || sp.changer === "1");
  let accounts: Awaited<ReturnType<typeof listMetaAdAccounts>> = [];
  let pages: Awaited<ReturnType<typeof listMetaPages>> = [];
  let metaDown = false;
  if (connection && choosing) {
    try {
      [accounts, pages] = await Promise.all([listMetaAdAccounts(connection.accessToken), listMetaPages(connection.accessToken)]);
    } catch {
      metaDown = true;
    }
  }
  const ready = Boolean(connection?.adAccountId && connection.pageId) && !choosing;

  const [{ data: products }, { data: campaigns }, settings] = await Promise.all([
    admin.from("products").select("id, title, price_cents, supplier_cost_usd_cents, shipping_cost_usd_cents").eq("store_id", store.id).eq("status", "active").order("position"),
    admin.from("ad_campaigns").select("*").eq("store_id", store.id).eq("platform", "meta").order("created_at", { ascending: false }).limit(20),
    getPlatformSettings(),
  ]);
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  // Taux du vendeur (commission dégressive) pour des estimations justes.
  const sellerRate = (await getSellerCommission(user.id)).rate;
  const plan = adBudgetPlan(
    (products ?? []).map((p) =>
      estimateProductEconomics({ supplierCostUsdCents: Number(p.supplier_cost_usd_cents), shippingUsdCents: Number(p.shipping_cost_usd_cents), fxRateUsdCad: fx.rate, minMarginRate: settings.minMarginRate, commissionRate: sellerRate, priceCents: Number(p.price_cents) }).ownerProfitCents,
    ),
  );
  const suggested = plan?.dailyBudgetCents ?? 2000;
  const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");
  const draft = (campaigns ?? []).find((c) => c.id === sp.brouillon && c.status === "draft") ?? null;

  // Résultats des campagnes créées (lus chez Meta ; ignorés si Meta ne répond pas).
  const insights = new Map<string, MetaInsights | null>();
  if (connection) {
    await Promise.all(
      (campaigns ?? [])
        .filter((c) => c.external_campaign_id && (c.status === "active" || c.status === "paused"))
        .slice(0, 10)
        .map(async (c) => insights.set(c.id, await getMetaInsights(connection.accessToken, c.external_campaign_id!).catch(() => null))),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header}
      {result && <Alert kind={result === "connecte" || result === "deconnecte" ? "success" : "error"}>{t.results[result]}</Alert>}
      {sp.creee && <Alert kind="success">{t.created}</Alert>}
      <p className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand-strong">{m.ads.money}</p>

      {!connection ? (
        <section className="rounded-2xl border border-line bg-white p-6" data-meta-connect>
          <p className="font-semibold">{t.before}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {t.requirements.map((r) => <li key={r}>{r}</li>)}
          </ul>
          {!pixelId && <p className="mt-3 text-sm"><Link href={`${base}/marketing`} className="font-semibold text-brand hover:underline">{t.pixelMissing}</Link></p>}
          {!suspended && <a href={`/api/ads/meta/connect?store=${store.id}`} className={`${buttonClasses.primary} mt-5`}>{t.connect}</a>}
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-white p-6" data-meta-connected>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-brand-strong">✓ {t.connected}</p>
              {connection.adAccountId && connection.pageId && (
                <p className="mt-1 text-sm text-muted">{fmt(t.choose.current, { account: `${connection.adAccountName} (${connection.adAccountCurrency})`, page: connection.pageName ?? "" })}</p>
              )}
            </div>
            <div className="flex gap-2">
              {ready && <Link href="?changer=1" className={buttonClasses.secondary}>{t.choose.change}</Link>}
              <form action={disconnectMeta.bind(null, store.id)}><button type="submit" data-meta-disconnect className={buttonClasses.secondary}>{t.disconnect}</button></form>
            </div>
          </div>
          {choosing && (
            <div className="mt-5 border-t border-line pt-5">
              <h2 className="font-display text-lg font-bold">{t.choose.title}</h2>
              {metaDown ? (
                <Alert kind="error">{t.reconnect}</Alert>
              ) : accounts.length === 0 || pages.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t.choose.none}</p>
              ) : (
                <div className="mt-4"><ChooseAccountForm storeId={store.id} accounts={accounts} pages={pages} current={{ adAccountId: connection.adAccountId, pageId: connection.pageId }} /></div>
              )}
            </div>
          )}
        </section>
      )}

      {ready && !suspended && (
        !pixelId ? (
          <Alert kind="info"><Link href={`${base}/marketing`} className="font-semibold underline">{t.pixelMissing}</Link></Alert>
        ) : draft ? (
          <section id="brouillon" className="scroll-mt-6 rounded-2xl border-2 border-brand/30 bg-white p-6" data-campaign-draft={draft.id}>
            <h2 className="font-display text-xl font-bold">{t.review.title}</h2>
            <p className="mt-1 text-sm text-muted">{t.review.intro}</p>
            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_18rem]">
              <ReviewForm storeId={store.id} draft={{ id: draft.id, primaryText: draft.primary_text, headline: draft.headline, description: draft.description, budget: dollars(Number(draft.daily_budget_cents)) }} />
              {/* Aperçu simplifié de la publicité */}
              <figure className="overflow-hidden rounded-xl border border-line bg-white text-sm shadow-sm" data-ad-preview>
                <p className="px-3 py-2 font-semibold">{connection?.pageName}</p>
                <p className="line-clamp-3 px-3 pb-2 text-muted">{draft.primary_text}</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- image du fournisseur */}
                <img src={draft.image_url} alt="" className="aspect-square w-full bg-paper object-cover" />
                <figcaption className="flex items-center justify-between gap-2 bg-paper px-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-semibold">{draft.headline}</span><span className="block truncate text-xs text-muted">{draft.description}</span></span>
                  <span className="shrink-0 rounded-md bg-line px-2 py-1 text-xs font-semibold">Shop now</span>
                </figcaption>
              </figure>
            </div>
            <p className="mt-3 break-all text-xs text-muted">{fmt(t.review.link, { url: draft.link_url })}</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">{t.draft.title}</h2>
            <div className="mt-4">
              {(products ?? []).length === 0 ? (
                <p className="text-sm text-muted">{m.ads.budget.none}</p>
              ) : (
                <DraftForm storeId={store.id} products={(products ?? []).map((p) => ({ id: p.id, title: p.title }))} suggestedBudget={dollars(suggested)} budgetHint={fmt(t.draft.budgetHint, { amount: price(suggested) })} />
              )}
            </div>
          </section>
        )
      )}

      {connection && (
        <section>
          <h2 className="mb-4 font-display text-2xl font-bold">{t.list.title}</h2>
          {(campaigns ?? []).filter((c) => c.status !== "draft").length === 0 ? (
            <p className="text-sm text-muted">{t.list.empty}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {(campaigns ?? []).filter((c) => c.status !== "draft").map((c) => {
                const r = insights.get(c.id);
                return (
                  <article key={c.id} data-campaign={c.id} data-status={c.status} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.name}</p>
                      <p className="mt-1 text-sm text-muted">
                        <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${c.status === "active" ? "bg-brand text-white" : c.status === "failed" ? "bg-danger-soft text-danger" : "bg-paper text-muted"}`}>{t.list.status[c.status as keyof typeof t.list.status]}</span>
                        {fmt(t.list.budget, { amount: price(Number(c.daily_budget_cents)) })}
                      </p>
                      {c.status === "failed" && c.error && <p className="mt-2 text-sm text-danger">{fmt(t.list.error, { reason: c.error })}</p>}
                      {(c.status === "active" || c.status === "paused") && (
                        r ? (
                          <dl className="mt-3 flex gap-6 text-sm" data-insights>
                            <div><dt className="text-xs text-muted">{t.list.spend}</dt><dd className="font-semibold tabular-nums">{price(r.spendCents)}</dd></div>
                            <div><dt className="text-xs text-muted">{t.list.clicks}</dt><dd className="font-semibold tabular-nums">{r.clicks}</dd></div>
                            <div><dt className="text-xs text-muted">{t.list.purchases}</dt><dd className="font-semibold tabular-nums">{r.purchases}</dd></div>
                          </dl>
                        ) : (
                          <p className="mt-2 text-xs text-muted">{t.list.noData}</p>
                        )
                      )}
                      {c.external_campaign_id && connection.adAccountId && (
                        <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${connection.adAccountId.replace(/^act_/, "")}&selected_campaign_ids=${c.external_campaign_id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">{t.list.manage} ↗</a>
                      )}
                    </div>
                    {!suspended && (c.status === "active" || c.status === "paused") && <CampaignStatusButton storeId={store.id} campaignId={c.id} active={c.status === "active"} />}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
