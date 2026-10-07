import type { StoreConfig, ThemeId } from "./types";

/**
 * Validation des données de boutique lues en base.
 * Toute valeur absente ou invalide est remplacée par une valeur par défaut,
 * pour qu'une boutique ne « casse » jamais à l'affichage.
 */

export const THEME_IDS: ThemeId[] = ["minimal", "bold", "elegant"];

export const THEME_LABELS: Record<ThemeId, { name: string; description: string }> = {
  minimal: { name: "Minimal", description: "Clair, aéré et moderne" },
  bold: { name: "Audacieux", description: "Contrasté, gros titres, énergique" },
  elegant: { name: "Élégant", description: "Raffiné, typographie classique" },
};

/** Polices Google Fonts autorisées (liste fermée : on ne charge rien d'arbitraire). */
export const ALLOWED_FONTS = [
  "Inter",
  "Lora",
  "Playfair Display",
  "Montserrat",
  "Poppins",
  "Space Grotesk",
  "DM Sans",
  "Bebas Neue",
  "Cormorant Garamond",
  "Work Sans",
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  colors: { primary: "#111827", accent: "#6b7280", background: "#ffffff", text: "#111827" },
  fonts: { heading: "Inter", body: "Inter" },
  content: {
    tagline: "",
    hero: { title: "Bienvenue", subtitle: "", ctaLabel: "Voir les produits" },
    features: [],
    about: { title: "À propos", body: "" },
    footerText: "",
  },
};

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string, max = 2000) =>
  typeof v === "string" ? v.slice(0, max) : fallback;
const color = (v: unknown, fallback: string) =>
  typeof v === "string" && HEX_COLOR.test(v) ? v : fallback;
const font = (v: unknown, fallback: string) =>
  typeof v === "string" && (ALLOWED_FONTS as readonly string[]).includes(v) ? v : fallback;

export function parseTheme(raw: unknown): ThemeId {
  return THEME_IDS.includes(raw as ThemeId) ? (raw as ThemeId) : "minimal";
}

export function parseStoreConfig(raw: unknown): StoreConfig {
  const d = DEFAULT_STORE_CONFIG;
  const c = isObject(raw) ? raw : {};
  const colors = isObject(c.colors) ? c.colors : {};
  const fonts = isObject(c.fonts) ? c.fonts : {};
  const content = isObject(c.content) ? c.content : {};
  const hero = isObject(content.hero) ? content.hero : {};
  const about = isObject(content.about) ? content.about : {};
  const features = Array.isArray(content.features) ? content.features : [];

  return {
    colors: ensureReadableColors({
      primary: color(colors.primary, d.colors.primary),
      accent: color(colors.accent, d.colors.accent),
      background: color(colors.background, d.colors.background),
      text: color(colors.text, d.colors.text),
    }),
    fonts: {
      heading: font(fonts.heading, d.fonts.heading),
      body: font(fonts.body, d.fonts.body),
    },
    content: {
      tagline: str(content.tagline, d.content.tagline, 200),
      hero: {
        title: str(hero.title, d.content.hero.title, 200),
        subtitle: str(hero.subtitle, d.content.hero.subtitle, 500),
        ctaLabel: str(hero.ctaLabel, d.content.hero.ctaLabel, 50),
      },
      features: features
        .filter(isObject)
        .slice(0, 6)
        .map((f) => ({ title: str(f.title, "", 100), description: str(f.description, "", 300) })),
      about: {
        title: str(about.title, d.content.about.title, 200),
        body: str(about.body, d.content.about.body),
      },
      footerText: str(content.footerText, d.content.footerText, 300),
    },
  };
}

/** URL Google Fonts pour les polices d'une boutique. */
export function googleFontsUrl(config: StoreConfig): string {
  const families = [...new Set([config.fonts.heading, config.fonts.body])]
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/** Luminance relative WCAG d'une couleur #rrggbb (0 = noir, 1 = blanc). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Couleur de texte lisible (noir ou blanc) sur un fond donné. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#111111") >= contrastRatio(background, "#ffffff") ? "#111111" : "#ffffff";
}

/** Garantit un texte lisible : si le contraste texte/fond est trop faible, on corrige le texte. */
export function ensureReadableColors(colors: StoreConfig["colors"]): StoreConfig["colors"] {
  if (contrastRatio(colors.text, colors.background) >= 4.5) return colors;
  return { ...colors, text: readableOn(colors.background) };
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(cents / 100);
}
