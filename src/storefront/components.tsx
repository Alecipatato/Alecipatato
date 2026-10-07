import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { formatPrice, googleFontsUrl } from "@/lib/store-config";
import type { Store, StoreProduct } from "@/lib/types";
import { AddToCartButton, CartLink } from "./cart";
import { storeCssVars } from "./theme";

/**
 * Préfixe des liens internes de la boutique :
 *  - "" quand elle est servie sur son domaine (zenyoga.mondomaine.com/produit/…)
 *  - "/s/<boutique>" en mode développement via localhost:3000/s/<boutique>
 */
export async function getStoreBase(site: string): Promise<string> {
  const base = (await headers()).get("x-store-base");
  return base ?? `/s/${encodeURIComponent(site)}`;
}

/** Catégories présentes dans les produits, dans l'ordre d'apparition, avec leur nombre de produits. */
export function categoriesOf(products: StoreProduct[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }));
}

export function categoryHref(base: string, category: string) {
  return `${base || ""}/?categorie=${encodeURIComponent(category)}`;
}

function SearchIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function StoreShell({
  store,
  products,
  base,
  children,
}: {
  store: Store;
  products: StoreProduct[];
  base: string;
  children: ReactNode;
}) {
  const home = base || "/";
  const categories = categoriesOf(products);
  const { content } = store.config;

  return (
    <div style={storeCssVars(store)} className="sf flex min-h-screen flex-col">
      <link rel="stylesheet" href={googleFontsUrl(store.config)} precedence="default" />

      <header className="sticky top-0 z-20 bg-[var(--sf-header-bg)] text-[var(--sf-header-fg)] shadow-[0_1px_0_var(--sf-line)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href={home} className="sf-heading text-2xl leading-none">{store.name}</Link>
          <form action={home} method="get" role="search" className="order-last flex w-full min-w-0 sm:order-none sm:flex-1">
            <label htmlFor="store-search" className="sr-only">Rechercher un produit</label>
            <input
              id="store-search"
              name="q"
              type="search"
              placeholder={`Rechercher dans ${store.name}`}
              className="min-w-0 flex-1 rounded-l-[var(--sf-radius)] border border-r-0 border-[var(--sf-line)] bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
            />
            <button type="submit" className="sf-btn rounded-l-none px-4" aria-label="Rechercher">
              <SearchIcon />
            </button>
          </form>
          <div className="ml-auto sm:ml-0">
            <CartLink storeId={store.id} href={`${base}/panier`} />
          </div>
        </div>
        {categories.length > 0 && (
          <nav aria-label="Catégories" className="border-t border-current/10">
            <ul className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 py-2.5 text-sm whitespace-nowrap sm:px-6">
              <li><Link href={home} className="opacity-90 hover:underline hover:opacity-100">Tous les produits</Link></li>
              {categories.map((c) => (
                <li key={c.name}>
                  <Link href={categoryHref(base, c.name)} className="opacity-90 hover:underline hover:opacity-100">{c.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-[var(--sf-line)] bg-[var(--sf-surface)]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="sf-heading text-xl">{store.name}</p>
            <p className="mt-2 text-sm text-[var(--sf-muted)]">{content.footerText || content.tagline}</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">Boutique</p>
            <ul className="mt-3 space-y-2 text-[var(--sf-muted)]">
              <li><Link href={home} className="hover:underline">Tous les produits</Link></li>
              {categories.slice(0, 4).map((c) => (
                <li key={c.name}><Link href={categoryHref(base, c.name)} className="hover:underline">{c.name}</Link></li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold">Nous joindre</p>
            <p className="mt-3 text-[var(--sf-muted)]">{store.contactEmail ?? "Adresse de contact bientôt disponible"}</p>
          </div>
        </div>
        <p className="border-t border-[var(--sf-line)] px-4 py-4 text-center text-xs text-[var(--sf-muted)]">
          © {new Date().getFullYear()} {store.name}. Prix en {store.currency}.
        </p>
      </footer>
    </div>
  );
}

/** Image du produit (fournisseur), ou visuel de remplacement s'il n'y en a pas. */
export function ProductImage({ product, className = "", index = 0 }: { product: StoreProduct; className?: string; index?: number }) {
  const src = product.images[index];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- images CJ : optimisation décidée en phase 3
    return <img src={src} alt={product.title} className={`object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div
      aria-hidden
      className={`relative flex items-center justify-center overflow-hidden bg-[var(--sf-surface)] ${className}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--store-primary),var(--store-accent))] opacity-15" />
      <span className="sf-heading relative text-5xl text-[var(--store-primary)] opacity-70">{product.title.charAt(0)}</span>
    </div>
  );
}

export function ProductCard({ product, store, base }: { product: StoreProduct; store: Store; base: string }) {
  const href = `${base}/produit/${product.id}`;
  return (
    <article className="group flex flex-col">
      <Link href={href} className="block overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)]">
        <ProductImage product={product} className="aspect-square w-full transition duration-300 group-hover:scale-[1.03]" />
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        {product.category && <p className="text-xs uppercase tracking-wider text-[var(--sf-muted)]">{product.category}</p>}
        <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
          <Link href={href} className="hover:underline">{product.title}</Link>
        </h3>
        <p className="mt-2 text-lg font-semibold tabular-nums text-[var(--store-price)]">
          {formatPrice(product.priceCents, store.currency)}
        </p>
        <div className="mt-auto pt-3">
          <AddToCartButton storeId={store.id} product={{ id: product.id, title: product.title, priceCents: product.priceCents }} compact />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, store, base }: { products: StoreProduct[]; store: Store; base: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} store={store} base={base} />
      ))}
    </div>
  );
}
