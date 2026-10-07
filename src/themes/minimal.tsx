import { formatPrice } from "@/lib/store-config";
import type { StoreWithProducts } from "@/lib/types";
import { ProductImage, StoreFonts, storeCssVars } from "./shared";

/** Thème « minimal » : clair, aéré, élégant. */
export function MinimalTheme({ store, products }: StoreWithProducts) {
  const { content } = store.config;

  return (
    <div
      style={storeCssVars(store.config)}
      className="min-h-screen bg-[var(--store-bg)] font-[family-name:var(--store-font-body)] text-[var(--store-text)]"
    >
      <StoreFonts config={store.config} />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-[family-name:var(--store-font-heading)] text-2xl font-semibold">{store.name}</span>
        <nav className="hidden gap-8 text-sm opacity-80 sm:flex">
          <a href="#produits">Produits</a>
          <a href="#a-propos">À propos</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
        <p className="mb-4 text-sm uppercase tracking-[0.2em] text-[var(--store-primary)]">{content.tagline}</p>
        <h1 className="font-[family-name:var(--store-font-heading)] text-5xl font-semibold leading-tight sm:text-6xl">
          {content.hero.title}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg opacity-75">{content.hero.subtitle}</p>
        <a
          href="#produits"
          className="mt-10 inline-block rounded-full bg-[var(--store-primary)] px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          {content.hero.ctaLabel}
        </a>
      </section>

      {content.features.length > 0 && (
        <section className="border-y border-black/10">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
            {content.features.map((f) => (
              <div key={f.title} className="text-center">
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-1 text-sm opacity-70">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="produits" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-12 text-center font-[family-name:var(--store-font-heading)] text-4xl font-semibold">
          Nos produits
        </h2>
        {products.length === 0 ? (
          <p className="text-center opacity-60">Les produits arrivent bientôt.</p>
        ) : (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <article key={p.id} className="group">
                <ProductImage product={p} className="aspect-square w-full rounded-2xl" />
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">{p.title}</h3>
                    {p.description && <p className="mt-1 text-sm opacity-60">{p.description}</p>}
                  </div>
                  <span className="whitespace-nowrap font-medium text-[var(--store-primary)]">
                    {formatPrice(p.priceCents, store.currency)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="a-propos" className="bg-[var(--store-primary)]/5">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-[family-name:var(--store-font-heading)] text-4xl font-semibold">{content.about.title}</h2>
          <p className="mt-6 text-lg leading-relaxed opacity-80">{content.about.body}</p>
        </div>
      </section>

      <footer id="contact" className="mx-auto max-w-6xl px-6 py-12 text-center text-sm opacity-70">
        <p className="font-[family-name:var(--store-font-heading)] text-lg">{content.footerText}</p>
        {store.contactEmail && (
          <p className="mt-2">
            Contact : <a className="underline" href={`mailto:${store.contactEmail}`}>{store.contactEmail}</a>
          </p>
        )}
        <p className="mt-4">© {new Date().getFullYear()} {store.name}</p>
      </footer>
    </div>
  );
}
