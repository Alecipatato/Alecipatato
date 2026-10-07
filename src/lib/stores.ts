import { cache } from "react";
import { DEMO_STORES } from "./demo-stores";
import { parseStoreConfig, parseTheme } from "./store-config";
import { createPublicClient } from "./supabase/public";
import type { StoreWithProducts } from "./types";

const STORE_COLUMNS = "id, subdomain, custom_domain, name, theme, config, contact_email, currency";
const PRODUCT_COLUMNS = "id, title, description, category, highlights, images, price_cents, stock";

/**
 * Charge une boutique active et ses produits actifs.
 * `site` = sous-domaine (« zenyoga ») ou domaine personnalisé (« boutique.com »).
 * Retourne null si la boutique n'existe pas ou n'est pas active.
 *
 * `cache` évite de refaire la requête quand la même page en a besoin deux fois
 * (métadonnées + contenu).
 */
export const getStoreBySite = cache(async (site: string): Promise<StoreWithProducts | null> => {
  const demo = DEMO_STORES[site];
  if (demo) return demo;

  const supabase = createPublicClient();
  if (!supabase) return null; // Supabase pas encore configuré : seules les démos existent.

  const column = site.includes(".") ? "custom_domain" : "subdomain";
  const { data: row, error } = await supabase
    .from("stores")
    .select(STORE_COLUMNS)
    .eq(column, site)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Lecture de la boutique « ${site} » impossible : ${error.message}`);
  if (!row) return null;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("store_id", row.id)
    .eq("status", "active")
    .order("position");
  if (productsError) throw new Error(`Lecture des produits impossible : ${productsError.message}`);

  return {
    store: {
      id: row.id,
      subdomain: row.subdomain,
      customDomain: row.custom_domain,
      name: row.name,
      theme: parseTheme(row.theme),
      config: parseStoreConfig(row.config),
      contactEmail: row.contact_email,
      currency: row.currency,
    },
    products: (products ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      highlights: Array.isArray(p.highlights) ? p.highlights.filter((h): h is string => typeof h === "string") : [],
      images: Array.isArray(p.images) ? p.images.filter((i): i is string => typeof i === "string") : [],
      priceCents: Number(p.price_cents),
      stock: p.stock,
    })),
  };
});
