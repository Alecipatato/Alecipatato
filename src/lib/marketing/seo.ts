import type { Metadata } from "next";
import { publicStoreUrl } from "../tenant";
import type { Store, StoreProduct } from "../types";
import { SEO_DESCRIPTION_MAX, truncate } from "./settings";

/** Métadonnées d'une vitrine : titre, description, adresse canonique, aperçu de partage. */

export function storeSeoTitle(store: Store): string {
  return store.seo.title || [store.name, store.config.content.tagline].filter(Boolean).join(" — ");
}

export function storeSeoDescription(store: Store): string {
  return truncate(store.seo.description || store.config.content.hero.subtitle || store.config.content.tagline || store.name, SEO_DESCRIPTION_MAX);
}

const ogLocale = (store: Store) => (store.language === "fr" ? "fr_CA" : "en_CA");

export function storeHomeMetadata(store: Store, products: StoreProduct[]): Metadata {
  const url = publicStoreUrl(store);
  const image = products.find((p) => p.images[0])?.images[0];
  const title = storeSeoTitle(store);
  const description = storeSeoDescription(store);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${url}/` },
    openGraph: { type: "website", url: `${url}/`, siteName: store.name, title, description, locale: ogLocale(store), ...(image && { images: [{ url: image }] }) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export function productMetadata(store: Store, product: StoreProduct): Metadata {
  const url = `${publicStoreUrl(store)}/produit/${product.id}`;
  const title = `${product.title} | ${store.name}`;
  const description = truncate(product.description || product.highlights.join(". ") || product.title, SEO_DESCRIPTION_MAX);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: store.name, title, description, locale: ogLocale(store), ...(product.images[0] && { images: [{ url: product.images[0] }] }) },
    twitter: { card: product.images[0] ? "summary_large_image" : "summary", title, description },
  };
}

/** Données structurées schema.org « Product » (prix, disponibilité) pour les résultats Google. */
export function productJsonLd(store: Store, product: StoreProduct): string {
  const url = `${publicStoreUrl(store)}/produit/${product.id}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: product.images.length ? product.images : undefined,
    sku: product.id,
    brand: { "@type": "Brand", name: store.name },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: store.currency,
      price: (product.priceCents / 100).toFixed(2),
      availability: product.stock === null || product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  // « < » échappé : le JSON est inséré dans une balise <script>.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
