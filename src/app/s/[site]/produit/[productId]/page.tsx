import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/store-config";
import { getStoreBySite } from "@/lib/stores";
import { BuyBox } from "@/storefront/cart";
import { categoryHref, getStoreBase, ProductGrid, ProductImage } from "@/storefront/components";

async function load(params: PageProps<"/s/[site]/produit/[productId]">["params"]) {
  const { site, productId } = await params;
  const decoded = decodeURIComponent(site);
  const data = await getStoreBySite(decoded);
  const product = data?.products.find((p) => p.id === productId);
  if (!data || !product) return null;
  return { ...data, product, site: decoded };
}

export async function generateMetadata({ params }: PageProps<"/s/[site]/produit/[productId]">): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Produit introuvable" };
  return {
    title: { absolute: `${data.product.title} | ${data.store.name}` },
    description: data.product.description ?? undefined,
  };
}

/** Fiche produit : galerie, prix, points forts, ajout au panier, produits similaires. */
export default async function ProductPage({ params }: PageProps<"/s/[site]/produit/[productId]">) {
  const data = await load(params);
  if (!data) notFound();
  const { store, product, products } = data;
  const base = await getStoreBase(data.site);
  const inStock = product.stock === null || product.stock > 0;

  const related = products
    .filter((p) => p.id !== product.id)
    .sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Fil d'Ariane" className="text-sm text-[var(--sf-muted)]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href={base || "/"} className="hover:underline">Accueil</Link></li>
          {product.category && (
            <>
              <li aria-hidden>›</li>
              <li><Link href={categoryHref(base, product.category)} className="hover:underline">{product.category}</Link></li>
            </>
          )}
          <li aria-hidden>›</li>
          <li className="truncate text-[var(--store-text)]" aria-current="page">{product.title}</li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr_300px]">
        <div className="flex flex-col gap-3">
          <ProductImage product={product} className="aspect-square w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)]" />
          {product.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {product.images.slice(1, 6).map((_, i) => (
                <ProductImage key={i} product={product} index={i + 1} className="aspect-square w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)]" />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {product.category && (
            <Link href={categoryHref(base, product.category)} className="text-sm font-medium text-[var(--store-primary)] hover:underline">
              {product.category}
            </Link>
          )}
          <h1 className="sf-heading mt-1 text-3xl leading-tight sm:text-4xl">{product.title}</h1>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-[var(--store-price)]">{formatPrice(product.priceCents, store.currency)}</p>
          {product.description && <p className="mt-4 leading-relaxed text-[var(--sf-muted)]">{product.description}</p>}

          {product.highlights.length > 0 && (
            <div className="mt-6 border-t border-[var(--sf-line)] pt-6">
              <h2 className="font-semibold">À propos de cet article</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {product.highlights.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </div>
          )}
        </div>

        <aside className="h-fit rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-5 lg:sticky lg:top-32">
          <p className="text-2xl font-semibold tabular-nums">{formatPrice(product.priceCents, store.currency)}</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${inStock ? "bg-emerald-500" : "bg-red-500"}`} />
            {inStock ? "En stock" : "Temporairement en rupture de stock"}
          </p>
          <p className="mt-1 text-sm text-[var(--sf-muted)]">Livraison au Canada avec numéro de suivi.</p>
          <div className="mt-5">
            {inStock && <BuyBox storeId={store.id} product={{ id: product.id, title: product.title, priceCents: product.priceCents }} />}
          </div>
          <p className="mt-4 text-xs text-[var(--sf-muted)]">Vendu par {store.name}.</p>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-[var(--sf-line)] pt-10">
          <h2 className="sf-heading mb-6 text-2xl">Vous aimerez aussi</h2>
          <ProductGrid products={related} store={store} base={base} />
        </section>
      )}
    </div>
  );
}
