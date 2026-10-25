import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/styles";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isCjConfigured } from "@/lib/cj/client";
import { getUsdCadRate } from "@/lib/fx";
import { intlLocale, plural } from "@/lib/i18n/config";
import { rich } from "@/lib/i18n/rich";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { rateToBasisPoints } from "@/lib/money";
import { getPlatformSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import { toTrendCards } from "@/lib/trends/cards";
import { getTrendingProducts } from "@/lib/trends/catalog";
import { createStore } from "../actions";
import { BriefForm } from "../brief-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.create.metaTitle };
}

/**
 * Nouvelle boutique : choix de la méthode, puis
 *  - ?mode=produits : galerie des produits tendance + description facultative ;
 *  - ?mode=ia : description (facultative) et l'IA s'occupe de tout.
 */
export default async function NewStorePage({ searchParams }: PageProps<"/tableau-de-bord/nouvelle">) {
  const user = await requireUser();
  const supabase = await createUserClient();
  const sp = await searchParams;
  const mode = sp.mode === "produits" ? "products" : sp.mode === "ia" ? "ai" : null;
  const [{ count }, settings, m, locale] = await Promise.all([
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    getPlatformSettings(),
    getMessages(),
    getLocale(),
  ]);
  const t = m.dashboard.create;
  const tm = m.trends.modes;
  const max = settings.freePlan.maxStores;
  const limitReached = (count ?? 0) >= max;

  const header = (
    <>
      <Link href={mode ? "/tableau-de-bord/nouvelle" : "/tableau-de-bord"} className="text-sm font-medium text-muted hover:text-ink">
        {mode ? tm.change : m.dashboard.backToStores}
      </Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{mode === "products" ? tm.products.title : mode === "ai" ? tm.ai.title : t.title}</h1>
      <p className="mt-2 text-muted">{t.subtitle}</p>
    </>
  );

  if (limitReached) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <Alert kind="info">
            {rich(
              plural(max, t.limitOne, t.limitOther),
              { link: (s) => <Link href="/tableau-de-bord" className="font-semibold underline">{s}</Link> },
              { max },
            )}
          </Alert>
        </div>
      </div>
    );
  }

  if (mode === "products") {
    const [products, fx] = await Promise.all([getTrendingProducts(locale), getUsdCadRate(settings.usdCadFallbackRate)]);
    const cards = toTrendCards(products, { fxRateUsdCad: fx.rate, minMarginRate: settings.minMarginRate, commissionRate: settings.commissionRate });
    const commissionLabel = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 2 }).format(
      rateToBasisPoints(settings.commissionRate) / 10_000,
    );
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <div className="mt-8 rounded-2xl border border-line bg-white p-5 sm:p-8">
          <BriefForm action={createStore} submitLabel={t.submit} mode="products" trends={{ cards, commissionLabel, sample: !isCjConfigured() }} />
        </div>
      </div>
    );
  }

  if (mode === "ai") {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <BriefForm action={createStore} submitLabel={t.submit} mode="ai" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-muted">{tm.title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[
          { href: "/tableau-de-bord/nouvelle?mode=produits", icon: "🔥", copy: tm.products, primary: true },
          { href: "/tableau-de-bord/nouvelle?mode=ia", icon: "✨", copy: tm.ai, primary: false },
        ].map(({ href, icon, copy, primary }) => (
          <Link key={href} href={href} className="group flex flex-col gap-3 rounded-2xl border border-line bg-white p-6 transition hover:border-brand hover:shadow-sm">
            <span aria-hidden className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-2xl">{icon}</span>
            <span className="font-display text-xl font-bold">{copy.title}</span>
            <span className="text-sm text-muted">{copy.text}</span>
            <span className={`${primary ? buttonClasses.primary : buttonClasses.secondary} mt-auto self-start`}>{copy.cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
