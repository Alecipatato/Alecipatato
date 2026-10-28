import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses } from "@/components/styles";
import { requireUser } from "@/lib/auth";
import { isCjConfigured } from "@/lib/cj/client";
import { getUsdCadRate } from "@/lib/fx";
import { intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { rateToBasisPoints } from "@/lib/money";
import { getPlatformSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import { toTrendCards } from "@/lib/trends/cards";
import { availableTrends } from "../../../../add-products-actions";
import { AddByAi, AddFromList } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).trends.add.metaTitle };
}

/**
 * Ajouter des produits à une boutique : choix de la méthode, puis
 *  - ?mode=liste : galerie des produits tendance (tous thèmes, sauf ceux déjà dans la boutique) ;
 *  - ?mode=ia : l'IA choisit les produits.
 * Dans les deux cas l'IA rédige la fiche ; le vendeur ne la modifie pas.
 */
export default async function AddProductsPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]/produits/ajouter">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();
  const { data: store } = await supabase.from("stores").select("id, name, status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store || store.status === "suspended") notFound();
  const [m, locale] = await Promise.all([getMessages(), getLocale()]);
  const t = m.trends.add;
  const mode = sp.mode === "liste" ? "list" : sp.mode === "ia" ? "ai" : null;
  const base = `/tableau-de-bord/boutiques/${store.id}/produits/ajouter`;

  const header = (
    <>
      <Link href={mode ? base : `/tableau-de-bord/boutiques/${store.id}/produits`} className="text-sm font-medium text-muted hover:text-ink">
        {mode ? m.trends.modes.change : t.back}
      </Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{mode === "list" ? t.list.title : mode === "ai" ? t.ai.title : t.title}</h1>
      <p className="mt-2 max-w-3xl text-muted">{t.intro}</p>
    </>
  );

  if (mode === "list") {
    const [products, settings] = await Promise.all([availableTrends(store.id), getPlatformSettings()]);
    const fx = await getUsdCadRate(settings.usdCadFallbackRate);
    const cards = toTrendCards(products ?? [], { fxRateUsdCad: fx.rate, minMarginRate: settings.minMarginRate, commissionRate: settings.commissionRate });
    const commissionLabel = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 2 }).format(rateToBasisPoints(settings.commissionRate) / 10_000);
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <div className="mt-8 rounded-2xl border border-line bg-white p-5 sm:p-8">
          <AddFromList storeId={store.id} cards={cards} commissionLabel={commissionLabel} sample={!isCjConfigured()} />
        </div>
      </div>
    );
  }

  if (mode === "ai") {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <AddByAi storeId={store.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { href: `${base}?mode=liste`, icon: "🛍️", copy: t.list, primary: true },
          { href: `${base}?mode=ia`, icon: "✨", copy: t.ai, primary: false },
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
