import { formatPrice } from "@/lib/store-config";
import type { StoreWithProducts } from "@/lib/types";
import { ProductImage, StoreFonts, storeCssVars } from "./shared";

/** Thème « bold » : contrasté, gros titres, énergique. */
export function BoldTheme({ store, products }: StoreWithProducts) {
  const { content } = store.config;

  return (
    <div
      style={storeCssVars(store.config)}
      className="min-h-screen bg-[var(--store-bg)] font-[family-name:var(--store-font-body)] text-[var(--store-text)]"
    >
      <StoreFonts config={store.config} />

      <div className="bg-[var(--store-accent)] py-2 text-center text-xs font-bold uppercase tracking-widest text-black">
        {content.tagline}
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <span className="font-[family-name:var(--store-font-heading)] text-4xl tracking-wide text-[var(--store-primary)]">
          {store.name}
        </span>
        <a
          href="#produits"
          className="border-2 border-[var(--store-text)] px-4 py-2 text-sm font-bold uppercase transition hover:bg-[var(--store-text)] hover:text-[var(--store-bg)]"
        >
          Boutique
        </a>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--store-primary)] opacity-30 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32">
          <h1 className="max-w-4xl font-[family-name:var(--store-font-heading)] text-7xl uppercase leading-none sm:text-9xl">
            {content.hero.title}
          </h1>
          <p className="mt-8 max-w-xl text-xl opacity-80">{content.hero.subtitle}</p>
          <a
            href="#produits"
            className="mt-10 inline-block bg-[var(--store-primary)] px-10 py-4 text-lg font-bold uppercase text-white transition hover:-translate-y-0.5"
          >
            {content.hero.ctaLabel} →
          </a>
        </div>
      </section>

      {content.features.length > 0 && (
        <section className="grid border-y-2 border-[var(--store-text)]/20 sm:grid-cols-3">
          {content.features.map((f) => (
            <div key={f.title} className="border-[var(--store-text)]/20 p-8 sm:border-r-2 sm:last:border-r-0">
              <h3 className="font-[family-name:var(--store-font-heading)] text-2xl uppercase text-[var(--store-accent)]">
                {f.title}
              </h3>
              <p className="mt-2 opacity-70">{f.description}</p>
            </div>
          ))}
        </section>
      )}

      <section id="produits" className="mx-auto max-w-7xl px-6 py-24">
        <h2 className="mb-12 font-[family-name:var(--store-font-heading)] text-6xl uppercase">Produits</h2>
        {products.length === 0 ? (
          <p className="opacity-60">Les produits arrivent bientôt.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <article
                key={p.id}
                className="group bg-white/5 p-4 ring-1 ring-white/10 transition hover:ring-2 hover:ring-[var(--store-primary)]"
              >
                <ProductImage product={p} className="aspect-[4/3] w-full" />
                <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
                {p.description && <p className="mt-1 text-sm opacity-60">{p.description}</p>}
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-[family-name:var(--store-font-heading)] text-3xl text-[var(--store-accent)]">
                    {formatPrice(p.priceCents, store.currency)}
                  </span>
                  <span className="bg-[var(--store-primary)] px-3 py-1 text-xs font-bold uppercase text-white">
                    Ajouter
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-[var(--store-primary)] text-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="font-[family-name:var(--store-font-heading)] text-6xl uppercase">{content.about.title}</h2>
          <p className="mt-6 max-w-3xl text-xl leading-relaxed">{content.about.body}</p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-10 text-sm opacity-70 sm:flex-row sm:justify-between">
        <span className="font-[family-name:var(--store-font-heading)] text-2xl uppercase">{content.footerText}</span>
        <span>
          {store.contactEmail && (
            <a className="underline" href={`mailto:${store.contactEmail}`}>{store.contactEmail}</a>
          )}{" "}
          · © {new Date().getFullYear()} {store.name}
        </span>
      </footer>
    </div>
  );
}
