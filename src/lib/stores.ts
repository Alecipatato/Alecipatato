import { cache } from "react";
import { DEMO_STORES } from "./demo-stores";
import { isLocale } from "./i18n/config";
import { parseLegalInfo } from "./legal/store-legal";
import { parsePixels, parseSeo } from "./marketing/settings";
import { parseStoreConfig, parseTheme } from "./store-config";
import { createPublicClient } from "./supabase/public";
import type { StoreVariant, StoreWithProducts } from "./types";

const STORE_COLUMNS = "id, subdomain, custom_domain, name, theme, config, contact_email, currency, language, legal_info, seo, pixels, domain_status";
const PRODUCT_COLUMNS = "id, title, description, category, highlights, images, price_cents, stock, delivery_days_min, delivery_days_max, long_description, specs, description_images, variants";

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

  // Domaine personnalisé : servi seulement une fois vérifié par Cloudflare (domain_status = active).
  const isCustom = site.includes(".");
  let query = supabase.from("stores").select(STORE_COLUMNS).eq(isCustom ? "custom_domain" : "subdomain", site).eq("status", "active");
  if (isCustom) query = query.eq("domain_status", "active");
  const { data: row, error } = await query.maybeSingle();
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
      customDomain: row.domain_status === "active" ? row.custom_domain : null,
      name: row.name,
      theme: parseTheme(row.theme),
      config: parseStoreConfig(row.config),
      contactEmail: row.contact_email,
      currency: row.currency,
      language: isLocale(row.language) ? row.language : "en",
      legalInfo: parseLegalInfo(row.legal_info),
      seo: parseSeo(row.seo),
      pixels: parsePixels(row.pixels),
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
      deliveryDaysMin: p.delivery_days_min,
      deliveryDaysMax: p.delivery_days_max,
      longDescription: p.long_description,
      specs: parseSpecs(p.specs),
      descriptionImages: stringList(p.description_images),
      variants: parseVariants(p.variants),
    })),
  };
});

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

function parseSpecs(value: unknown): { label: string; value: string }[] {
  return (Array.isArray(value) ? value : [])
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && typeof x.label === "string" && typeof x.value === "string")
    .map((x) => ({ label: String(x.label), value: String(x.value) }));
}

function parseVariants(value: unknown): StoreVariant[] {
  return (Array.isArray(value) ? value : [])
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && typeof x.vid === "string" && Number.isInteger(x.priceCents))
    .map((x) => ({
      vid: String(x.vid),
      label: typeof x.label === "string" ? x.label : String(x.vid),
      priceCents: Number(x.priceCents),
      image: typeof x.image === "string" ? x.image : null,
      inStock: x.inStock !== false,
    }));
}
