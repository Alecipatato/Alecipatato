/** Réglages marketing d'une boutique (colonnes stores.seo et stores.pixels), toujours validés. */

export interface StoreSeo {
  /** Titre pour Google (≤ 70 caractères). Vide = nom + slogan. */
  title: string;
  /** Méta-description (≤ 160 caractères). Vide = sous-titre de l'accueil. */
  description: string;
}

export interface StorePixels {
  /** Identifiant du pixel Meta (chiffres). */
  meta: string | null;
  /** Identifiant du pixel TikTok (lettres majuscules et chiffres). */
  tiktok: string | null;
}

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;
export const META_PIXEL_PATTERN = /^\d{8,20}$/;
export const TIKTOK_PIXEL_PATTERN = /^[A-Z0-9]{10,30}$/;

const obj = (raw: unknown) => (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseSeo(raw: unknown): StoreSeo {
  const o = obj(raw);
  return { title: text(o.title, SEO_TITLE_MAX), description: text(o.description, SEO_DESCRIPTION_MAX) };
}

export function parsePixels(raw: unknown): StorePixels {
  const o = obj(raw);
  const meta = typeof o.meta === "string" && META_PIXEL_PATTERN.test(o.meta) ? o.meta : null;
  const tiktok = typeof o.tiktok === "string" && TIKTOK_PIXEL_PATTERN.test(o.tiktok) ? o.tiktok : null;
  return { meta, tiktok };
}

export const hasPixels = (p: StorePixels) => Boolean(p.meta || p.tiktok);

/** Coupe un texte à `max` caractères sans couper un mot (pour les méta-descriptions). */
export function truncate(textValue: string, max: number): string {
  const clean = textValue.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd()}…`;
}

/** Saisie du formulaire SEO → valeurs enregistrées (espaces normalisés, longueurs maximales). */
export function parseStoreSeoInput(title: string, description: string): StoreSeo {
  return parseSeo({ title, description });
}
