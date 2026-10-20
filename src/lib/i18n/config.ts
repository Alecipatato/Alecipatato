/**
 * Langues de la plateforme. L'anglais est la langue principale (par défaut).
 * Fonctions pures, testées dans config.test.ts.
 */

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";
/** En-tête posé par le proxy sur les pages de boutique (jamais accepté venant du navigateur). */
export const STORE_SITE_HEADER = "x-store-site";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Pays dont la langue principale est le français. */
const FRENCH_COUNTRIES = new Set(["FR", "BE", "LU", "MC", "SN", "CI", "CM", "ML", "BF", "NE", "BJ", "TG", "GA", "CG", "CD", "MG", "HT", "RE", "GP", "MQ", "GF", "PF", "NC", "PM", "YT", "BL", "MF", "WF"]);
/** Provinces canadiennes majoritairement francophones. */
const FRENCH_CANADIAN_REGIONS = new Set(["QC"]);

/** Langue d'une région (code pays ISO + code de région éventuel), ou null si inconnue. */
export function localeForRegion(country: string | null | undefined, region?: string | null): Locale | null {
  const c = country?.trim().toUpperCase();
  if (!c || c === "XX" || c === "T1") return null;
  if (c === "CA") return region && FRENCH_CANADIAN_REGIONS.has(region.trim().toUpperCase()) ? "fr" : "en";
  return FRENCH_COUNTRIES.has(c) ? "fr" : "en";
}

/** Première langue prise en charge dans l'en-tête Accept-Language (« fr-CA,fr;q=0.9,en;q=0.8 »). */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { lang: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.lang).find(isLocale) ?? null;
}

/**
 * Choix de la langue, par ordre de priorité :
 *  1. le choix du visiteur (cookie « lang ») ;
 *  2. sa région (fournie par l'hébergeur, ex. Cloudflare : pays + province) ;
 *  3. la langue de son navigateur ;
 *  4. l'anglais.
 */
export function detectLocale(input: {
  cookie?: string | null;
  country?: string | null;
  region?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return localeForRegion(input.country, input.region) ?? localeFromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

/** Insère des valeurs dans un texte : fmt("{count} produits", { count: 3 }) → « 3 produits ». */
export function fmt(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Choisit la forme singulier/pluriel : plural(2, "{n} produit", "{n} produits") → « 2 produits ». */
export function plural(n: number, one: string, other: string): string {
  return fmt(Math.abs(n) <= 1 ? one : other, { n });
}

/** Locale Intl pour les nombres, prix et dates. */
export function intlLocale(locale: Locale): string {
  return locale === "fr" ? "fr-CA" : "en-CA";
}
