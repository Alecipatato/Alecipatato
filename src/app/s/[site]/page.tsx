import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySite } from "@/lib/stores";
import type { StoreProduct } from "@/lib/types";
import { categoriesOf, categoryHref, getStoreBase, ProductGrid } from "@/storefront/components";

/** Page principale d'une boutique : tous les produits, recherche, catégories, tri. */

const SORTS = {
  pertinence: "Pertinence",
  "prix-croissant": "Prix croissant",
  "prix-decroissant": "Prix décroissant",
} as const;
type Sort = keyof typeof SORTS;

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function matches(product: StoreProduct, query: string) {
  const haystack = normalize([product.title, product.description, product.category, ...product.highlights].join(" "));
  return normalize(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export async function generateMetadata({ params }: PageProps<"/s/[site]">): Promise<Metadata> {
  const { site } = await params;
  const data = await getStoreBySite(decodeURIComponent(site));
  if (!data) return { title: "Boutique introuvable" };
  return {
    title: { absolute: `${data.store.name} — ${data.store.config.content.tagline}` },
    description: data.store.config.content.hero.subtitle || data.store.config.content.tagline,
  };
}

export default async function StoreHomePage({ params, searchParams }: PageProps<"/s/[site]">) {
  const { site } = await params;
  const decoded = decodeURIComponent(site);
  const data = await getStoreBySite(decoded);
  if (!data) notFound();
  const { store, products } = data;
  const base = await getStoreBase(decoded);
  const home = base || "/";

  const sp = await searchParams;
  const query = param(sp.q).slice(0, 100);
  const category = param(sp.categorie);
  const sort: Sort = param(sp.tri) in SORTS ? (param(sp.tri) as Sort) : "pertinence";

  let results = products.filter((p) => (!category || p.category === category) && (!query || matches(p, query)));
  if (sort === "prix-croissant") results = [...results].sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "prix-decroissant") results = [...results].sort((a, b) => b.priceCents - a.priceCents);

  const browsing = !query && !category;
  const { content } = store.config;
  const categories = categoriesOf(products);
  const sortHref = (s: Sort) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (category) qs.set("categorie", category);
    if (s !== "pertinence") qs.set("tri", s);
    const str = qs.toString();
    return str ? `${base}/?${str}` : home;
  };

  return (
    <>
      {browsing && (
        <section className="border-b border-[var(--sf-line)] bg-[var(--sf-surface)]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr] md:items-center md:py-16">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--store-primary)]">{content.tagline}</p>
              <h1 className="sf-heading mt-3 text-4xl leading-tight sm:text-5xl">{content.hero.title}</h1>
              <p className="mt-4 max-w-xl text-lg text-[var(--sf-muted)]">{content.hero.subtitle}</p>
              <a href="#produits" className="sf-btn mt-7 px-7 py-3.5 text-sm">{content.hero.ctaLabel}</a>
            </div>
            {content.features.length > 0 && (
              <ul className="grid gap-3">
                {content.features.map((f) => (
                  <li key={f.title} className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--store-bg)] p-4">
                    <p className="font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--sf-muted)]">{f.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <div id="produits" className="mx-auto grid max-w-7xl scroll-mt-28 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <p className="text-sm font-semibold">Catégories</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <Link href={home} className={!category ? "font-semibold text-[var(--store-primary)]" : "text-[var(--sf-muted)] hover:underline"}>
                Tous les produits <span className="opacity-60">({products.length})</span>
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.name}>
                <Link
                  href={categoryHref(base, c.name)}
                  className={category === c.name ? "font-semibold text-[var(--store-primary)]" : "text-[var(--sf-muted)] hover:underline"}
                >
                  {c.name} <span className="opacity-60">({c.count})</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="sf-heading text-2xl sm:text-3xl">
                {query ? `Résultats pour « ${query} »` : category || "Tous les produits"}
              </h2>
              <p className="mt-1 text-sm text-[var(--sf-muted)]">
                {results.length} produit{results.length > 1 ? "s" : ""}
                {query && category && ` dans ${category}`}
              </p>
            </div>
            <nav aria-label="Trier" className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <Link
                  key={s}
                  href={sortHref(s)}
                  aria-current={s === sort ? "true" : undefined}
                  className={`rounded-full border px-3 py-1.5 ${s === sort ? "border-[var(--store-text)] font-semibold" : "border-[var(--sf-line)] text-[var(--sf-muted)] hover:border-[var(--store-text)]"}`}
                >
                  {SORTS[s]}
                </Link>
              ))}
            </nav>
          </div>

          {results.length > 0 ? (
            <ProductGrid products={results} store={store} base={base} />
          ) : (
            <div className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-surface)] px-6 py-14 text-center">
              <p className="font-semibold">Aucun produit ne correspond à votre recherche.</p>
              <p className="mt-1 text-sm text-[var(--sf-muted)]">Essayez un autre mot, ou parcourez toutes les catégories.</p>
              <Link href={home} className="sf-btn-outline mt-5 px-5 py-2.5 text-sm">Voir tous les produits</Link>
            </div>
          )}
        </section>
      </div>

      {browsing && (
        <section className="mx-auto max-w-3xl px-4 py-8 text-center sm:px-6">
          <h2 className="sf-heading text-3xl">{content.about.title}</h2>
          <p className="mt-4 leading-relaxed text-[var(--sf-muted)]">{content.about.body}</p>
        </section>
      )}
    </>
  );
}
