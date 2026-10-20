import { headers } from "next/headers";
import Link from "next/link";
import { buttonClasses } from "@/components/styles";
import { DEMO_STORES } from "@/lib/demo-stores";
import { PLATFORM_NAME } from "@/lib/platform";
import { fmt } from "@/lib/i18n/config";
import { rich } from "@/lib/i18n/rich";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/store-config";
import { baseDomainForHost, getRootDomain, storeUrl } from "@/lib/tenant";

/** Exemple de calcul affiché dans la section Tarif (mêmes règles que la plateforme). */
const EXAMPLE = { price: 5000, supplier: 1800, shipping: 700 };
const exampleMargin = EXAMPLE.price - EXAMPLE.supplier - EXAMPLE.shipping;
const exampleCommission = Math.round(exampleMargin * 0.15);

export default async function HomePage() {
  // En local, on reprend le port réellement utilisé (3000, 3001…) pour les liens des démos.
  const demoBase = baseDomainForHost((await headers()).get("host"));
  const preview = DEMO_STORES.demo;
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.marketing;
  const price = (cents: number) => formatPrice(cents, "CAD", locale);

  return (
    <>
      {/* Accroche */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-marigold/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {t.badge}
            </p>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
              {t.heroLine1}<br />
              <span className="text-brand">{t.heroLine2}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {fmt(t.heroBody, { platform: PLATFORM_NAME })}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/inscription" className={`${buttonClasses.primary} px-6 py-3.5 text-base`}>{t.ctaCreate}</Link>
              <a href="#demos" className={`${buttonClasses.secondary} px-6 py-3.5 text-base`}>{t.ctaExamples}</a>
            </div>
            <p className="mt-4 text-sm text-muted">{t.noCard}</p>
          </div>

          {/* Aperçu : un brief devient une boutique */}
          <div className="relative">
            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.previewLabel}</p>
              <p className="mt-2 text-sm leading-relaxed">{t.previewBrief}</p>
            </div>
            <div aria-hidden className="mx-auto my-2 h-8 w-px bg-gradient-to-b from-line to-brand" />
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-xl shadow-ink/5">
              <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e0]" /><span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e0]" /><span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e0]" />
                <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-xs text-muted">zenatelier.{getRootDomain().split(":")[0]}</span>
              </div>
              <div style={{ background: preview.store.config.colors.background, color: preview.store.config.colors.text }}>
                <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
                  <span className="font-semibold" style={{ fontFamily: "Georgia, serif" }}>{preview.store.name}</span>
                  <span className="h-7 flex-1 rounded-md border border-black/10 bg-white" />
                  <span className="text-xs">{t.previewCart}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 p-4">
                  {preview.products.slice(0, 3).map((p) => (
                    <div key={p.id}>
                      <div className="aspect-square rounded-lg" style={{ background: `linear-gradient(135deg, ${preview.store.config.colors.primary}33, ${preview.store.config.colors.accent}33)` }} />
                      <p className="mt-1.5 line-clamp-1 text-[11px]">{p.title}</p>
                      <p className="text-xs font-semibold" style={{ color: preview.store.config.colors.accent }}>{price(p.priceCents)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnement */}
      <section id="fonctionnement" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">{t.stepsTitle}</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {t.steps.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-line bg-paper p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ce que l'IA crée */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-bold tracking-tight">{t.featuresTitle}</h2>
          <p className="mt-4 text-lg text-muted">{t.featuresBody}</p>
        </div>
        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((f) => (
            <div key={f.title} className="border-t-2 border-brand pt-4">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Démos */}
      <section id="demos" className="scroll-mt-20 bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">{t.demosTitle}</h2>
          <p className="mt-4 max-w-2xl text-lg text-white/70">{t.demosBody}</p>
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {Object.values(DEMO_STORES).map(({ store, products }) => (
              <li key={store.id}>
                <a
                  href={storeUrl(store.subdomain, demoBase)}
                  className="group block overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition hover:ring-white/40"
                >
                  <div className="p-5" style={{ background: store.config.colors.background, color: store.config.colors.text }}>
                    <p className="text-lg font-semibold">{store.name}</p>
                    <p className="text-xs opacity-70">{store.config.content.tagline}</p>
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {products.slice(0, 4).map((p) => (
                        <span key={p.id} className="aspect-square rounded-md" style={{ background: `linear-gradient(135deg, ${store.config.colors.primary}, ${store.config.colors.accent})`, opacity: 0.35 }} />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4 text-sm">
                    <span>{fmt(t.demoStyle, { theme: locale === "fr" ? m.common.themes[store.theme].name.toLowerCase() : m.common.themes[store.theme].name })}</span>
                    <span className="text-white/60 transition group-hover:text-white">{t.visit}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tarif */}
      <section id="tarif" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-4xl font-bold tracking-tight">{t.pricingTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              {rich(t.pricingBody, { b: (s) => <strong className="text-ink">{s}</strong> })}
            </p>
            <Link href="/inscription" className={`${buttonClasses.primary} mt-8 px-6 py-3.5`}>{t.pricingCta}</Link>
          </div>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold">{t.example.title}</p>
            <dl className="mt-4 space-y-3 text-sm tabular-nums">
              <div className="flex justify-between"><dt>{t.example.price}</dt><dd>{price(EXAMPLE.price)}</dd></div>
              <div className="flex justify-between text-muted"><dt>{t.example.supplier}</dt><dd>− {price(EXAMPLE.supplier)}</dd></div>
              <div className="flex justify-between text-muted"><dt>{t.example.shipping}</dt><dd>− {price(EXAMPLE.shipping)}</dd></div>
              <div className="flex justify-between border-t border-line pt-3 font-medium"><dt>{t.example.margin}</dt><dd>{price(exampleMargin)}</dd></div>
              <div className="flex justify-between text-muted"><dt>{fmt(t.example.commission, { platform: PLATFORM_NAME })}</dt><dd>− {price(exampleCommission)}</dd></div>
              <div className="flex justify-between rounded-xl bg-brand-soft px-3 py-3 text-base font-semibold text-brand-strong">
                <dt>{t.example.profit}</dt><dd>{price(exampleMargin - exampleCommission)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">{t.example.note}</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-white">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">{t.faqTitle}</h2>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {t.faq.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.q}
                  <span aria-hidden className="text-xl text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Appel final */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-brand px-8 py-14 text-center text-white sm:px-14">
          <div aria-hidden className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-marigold/30 blur-3xl" />
          <h2 className="relative font-display text-4xl font-bold tracking-tight">{t.finalTitle}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/80">{t.finalBody}</p>
          <Link href="/inscription" className="relative mt-8 inline-flex rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-strong transition hover:bg-marigold-soft">
            {t.ctaCreate}
          </Link>
        </div>
      </section>
    </>
  );
}
