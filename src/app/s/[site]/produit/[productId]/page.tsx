import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmt } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { productJsonLd, productMetadata } from "@/lib/marketing/seo";
import { getStoreBySite } from "@/lib/stores";
import { TrackEvent } from "@/storefront/pixels";
import { categoryHref, getStoreBase, ProductGrid } from "@/storefront/components";
import { ProductView } from "@/storefront/product-view";

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
  if (!data) return { title: MESSAGES.en.storefront.productNotFound };
  return productMetadata(data.store, data.product);
}

/**
 * Fiche produit « comme Amazon » : galerie (vignettes, zoom, visionneuse), variantes, encadré d'achat,
 * puis description détaillée avec les photos du fournisseur, caractéristiques et produits similaires.
 * Le vendeur ne modifie pas la fiche : elle est rédigée par l'IA à partir des données du fournisseur.
 */
export default async function ProductPage({ params, searchParams }: PageProps<"/s/[site]/produit/[productId]">) {
  const data = await load(params);
  if (!data) notFound();
  const { store, product, products } = data;
  const base = await getStoreBase(data.site);
  const variantParam = (await searchParams).v;
  const t = MESSAGES[store.language].storefront;
  const { deliveryDaysMin: min, deliveryDaysMax: max } = product;
  const delivery = max ? fmt(min && min !== max ? t.deliveryRange : t.deliveryExact, { min: min ?? max, max }) : t.deliveryGeneric;
  const paragraphs = (product.longDescription ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const specs = product.specs ?? [];
  const descriptionImages = product.descriptionImages ?? [];

  const related = products
    .filter((p) => p.id !== product.id)
    .sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Données structurées pour les moteurs de recherche (JSON échappé). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd(store, product) }} />
      <TrackEvent event="ViewContent" params={{ content_ids: [product.id], content_name: product.title, content_type: "product", value: product.priceCents / 100, currency: store.currency }} />
      <nav aria-label={t.breadcrumb} className="text-sm text-[var(--sf-muted)]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href={base || "/"} className="hover:underline">{t.home}</Link></li>
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

      <ProductView
        storeId={store.id}
        storeName={store.name}
        currency={store.currency}
        product={product}
        categoryHref={product.category ? categoryHref(base, product.category) : null}
        delivery={delivery}
        initialVariant={typeof variantParam === "string" ? variantParam : null}
      />

      {(paragraphs.length > 0 || descriptionImages.length > 0 || specs.length > 0) && (
        <div className="mt-16 grid gap-12 border-t border-[var(--sf-line)] pt-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {(paragraphs.length > 0 || descriptionImages.length > 0) && (
            <section data-long-description>
              <h2 className="sf-heading text-2xl">{t.product.description}</h2>
              <div className="mt-4 max-w-[68ch] space-y-4 leading-relaxed">
                {paragraphs.map((para, i) => <p key={i}>{para}</p>)}
              </div>
              {descriptionImages.length > 0 && (
                <div className="mt-8 flex flex-col gap-4">
                  {descriptionImages.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- photos du fournisseur
                    <img key={src} src={src} alt="" loading="lazy" className="w-full max-w-3xl rounded-[var(--sf-radius)] border border-[var(--sf-line)]" />
                  ))}
                </div>
              )}
            </section>
          )}
          {specs.length > 0 && (
            <section data-specs className="min-w-0">
              <h2 className="sf-heading text-2xl">{t.product.specs}</h2>
              <table className="mt-4 w-full overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] text-sm">
                <tbody>
                  {specs.map((spec, i) => (
                    <tr key={`${spec.label}-${i}`} className="border-b border-[var(--sf-line)] last:border-0">
                      <th scope="row" className="w-2/5 bg-[var(--sf-surface)] px-4 py-2.5 text-left align-top font-medium">{spec.label}</th>
                      <td className="px-4 py-2.5">{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-16 border-t border-[var(--sf-line)] pt-10">
          <h2 className="sf-heading mb-6 text-2xl">{t.related}</h2>
          <ProductGrid products={related} store={store} base={base} />
        </section>
      )}
    </div>
  );
}
