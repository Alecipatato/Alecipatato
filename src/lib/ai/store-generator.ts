import Anthropic from "@anthropic-ai/sdk";
import { PALETTES } from "../palettes";
import { isLocale, type Locale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";
import { ALLOWED_FONTS, parseStoreConfig, parseTheme, THEME_IDS } from "../store-config";
import type { StoreConfig, ThemeId } from "../types";

/**
 * Génération d'une boutique par Claude.
 * L'IA renvoie un JSON strict (format imposé) : identité, textes et produits.
 * Les produits sont des EXEMPLES tant que le catalogue CJ n'est pas branché (phase 3).
 */

export const AI_MODEL = "claude-opus-5-5";

/** Ce que le client saisit dans le formulaire. */
export interface StoreBrief {
  niche: string;
  productTypes: string;
  theme: ThemeId | "auto";
  palette: string; // clé de PALETTES, "auto" ou "custom"
  primaryColor?: string;
  storeName?: string;
  /** Langue de la boutique (textes générés). Absente des anciennes boutiques : français. */
  language?: Locale;
  /**
   * Produits déjà choisis (par le client dans les produits tendance, ou automatiquement) :
   * l'IA construit la boutique autour d'eux et ne génère pas d'autres produits.
   */
  chosenProducts?: { name: string; category: string | null }[];
  /** Thème des produits tendance choisis (id de TREND_THEMES). */
  trendTheme?: string;
}

export function briefLanguage(brief: Partial<StoreBrief> | null | undefined): Locale {
  return isLocale(brief?.language) ? brief.language : "fr";
}

export interface GeneratedProduct {
  title: string;
  category: string;
  description: string;
  highlights: string[];
  priceCents: number;
}

export interface GeneratedStore {
  name: string;
  subdomainSuggestion: string;
  /** Mots-clés (anglais) pour chercher des produits dans le catalogue CJ. */
  searchKeywords: string[];
  theme: ThemeId;
  config: StoreConfig;
  products: GeneratedProduct[];
}

export type GenerationErrorCode = keyof (typeof MESSAGES)["en"]["errors"]["generation"];

/** Erreur montrée au client : `code` → message traduit (messages errors.generation). */
export class StoreGenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    readonly reason?: string,
  ) {
    super(reason ? `${code}: ${reason}` : code);
  }
}

const str = { type: "string" } as const;
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["refusal_reason", "name", "subdomain", "tagline", "theme", "colors", "fonts", "hero", "features", "about", "footer_text", "search_keywords", "products"],
  properties: {
    refusal_reason: { anyOf: [{ type: "string" }, { type: "null" }] },
    name: str,
    subdomain: str,
    tagline: str,
    theme: { type: "string", enum: THEME_IDS },
    colors: {
      type: "object",
      additionalProperties: false,
      required: ["primary", "accent", "background", "text"],
      properties: { primary: str, accent: str, background: str, text: str },
    },
    fonts: {
      type: "object",
      additionalProperties: false,
      required: ["heading", "body"],
      properties: { heading: { type: "string", enum: [...ALLOWED_FONTS] }, body: { type: "string", enum: [...ALLOWED_FONTS] } },
    },
    hero: {
      type: "object",
      additionalProperties: false,
      required: ["title", "subtitle", "cta_label"],
      properties: { title: str, subtitle: str, cta_label: str },
    },
    features: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["title", "description"], properties: { title: str, description: str } },
    },
    about: { type: "object", additionalProperties: false, required: ["title", "body"], properties: { title: str, body: str } },
    footer_text: str,
    search_keywords: { type: "array", items: str },
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "category", "description", "highlights", "price_cents"],
        properties: {
          title: str,
          category: str,
          description: str,
          highlights: { type: "array", items: str },
          price_cents: { type: "integer" },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You design complete dropshipping storefronts for small entrepreneurs in Canada. Your output is stored as data and rendered by a fixed storefront that works like Amazon: a catalogue page with search and categories, then a detail page per product.

Write every customer-facing text in the store language given in the request. Be concrete and specific to the niche; avoid hype and generic filler.

What to produce:
- name: a short, memorable, original store name (2-3 words max) that is not an existing brand.
- subdomain: lowercase letters, digits and hyphens only, 3-30 characters, derived from the name.
- tagline: under 60 characters.
- hero: a title under 60 characters, a subtitle of one or two sentences, and a call-to-action label under 30 characters.
- features: exactly 3 short reassurance points (delivery in Canada within 15 days with tracking, quality, service...). Do not promise a specific return or refund policy duration.
- about: a short paragraph about the store's point of view.
- footer_text: a short signature line.
- search_keywords: 4 to 6 short ENGLISH search phrases (1-3 words each) to find matching products in a dropshipping supplier catalogue, e.g. "coffee grinder", "milk frother". Generic product words only, no brand names.
- products: 12 products spread over 3 to 5 categories with short category names (1-3 words). Each product has a clear descriptive title, a 1-2 sentence description, 3 to 5 factual highlights (materials, dimensions, capacity, compatibility...), and a realistic retail price in CAD cents for a dropshipped item (typically 1500 to 15000).
- colors: hex values (#rrggbb). Text must be clearly readable on the background (contrast ratio of at least 4.5:1). The primary color is used for buttons.
- fonts: pick a heading and body pairing that fits the style from the allowed list.

Rules you must follow:
- Never use real brand names, trademarks, licensed characters or celebrity names, and never describe replicas or "inspired by" copies of branded goods.
- Never invent reviews, ratings, certifications, awards, medical or health claims, or "made in Canada" claims.
- If the requested niche is mainly about prohibited goods (weapons or weapon parts, drugs or drug paraphernalia, tobacco, vaping or cannabis, alcohol, adult content, prescription or medical products, supplements with health claims, live animals, gambling, counterfeit goods, hazardous materials), set refusal_reason to a short explanation in the store language, and return placeholder values with an empty products array. Otherwise set refusal_reason to null.`;

const LANGUAGE_INSTRUCTIONS: Record<Locale, string> = {
  en: "Store language: English. Use natural Canadian English (Canadian spelling, prices in CAD written like $24.99).",
  fr: "Store language: French. Use natural Québec French (vouvoiement, prices in CAD written like 24,99 $).",
};

export function describeBrief(brief: StoreBrief): string {
  const themes = MESSAGES.en.common.themes;
  const chosen = brief.chosenProducts ?? [];
  // Ce qui guide le style quand le client ne l'impose pas : sa description, sinon les produits choisis.
  const basis = chosen.length ? (brief.niche ? "the niche and the chosen products" : "the chosen products") : "the niche";
  const lines = [LANGUAGE_INSTRUCTIONS[briefLanguage(brief)]];
  if (brief.niche) lines.push(`Niche and target customers (from the owner, follow it): ${brief.niche}`);
  else lines.push("Niche: not specified by the owner. Infer the niche and the target customers from the chosen products.");

  if (chosen.length) {
    lines.push(
      `The owner already chose the products to sell. Build the store's name, identity, texts and style around them:\n${chosen
        .map((p) => `- ${p.name}${p.category ? ` (${p.category})` : ""}`)
        .join("\n")}`,
      "Products and search_keywords are already settled: return an empty products array and an empty search_keywords array.",
    );
  } else {
    lines.push(`Types of products to sell: ${brief.productTypes || "choose what fits the niche best"}`);
  }
  if (brief.storeName) lines.push(`Store name requested by the owner (use it exactly): ${brief.storeName}`);

  if (brief.theme === "auto") lines.push(`Style: choose the best fit for ${basis} among ${THEME_IDS.map((t) => `"${t}" (${themes[t].description})`).join(", ")}.`);
  else lines.push(`Style: "${brief.theme}" (${themes[brief.theme].description}), chosen by the owner. Return this theme.`);

  const palette = PALETTES[brief.palette];
  if (palette) lines.push(`Colors: use exactly this palette chosen by the owner: ${JSON.stringify(palette.colors)}.`);
  else if (brief.palette === "custom" && brief.primaryColor) lines.push(`Colors: the primary color must be ${brief.primaryColor}; choose matching accent, background and text colors.`);
  else lines.push(`Colors: choose a distinctive palette that fits ${basis}.`);

  return lines.join("\n");
}

type Json = Record<string, unknown>;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Vérifie et nettoie la réponse de l'IA (on ne fait jamais confiance aveuglément au JSON reçu). */
export function parseGeneratedStore(raw: unknown, brief: StoreBrief): GeneratedStore {
  if (typeof raw !== "object" || raw === null) throw new StoreGenerationError("unreadable");
  const r = raw as Json;

  if (typeof r.refusal_reason === "string" && r.refusal_reason.trim()) {
    throw new StoreGenerationError("refused_niche", r.refusal_reason.trim().slice(0, 300));
  }

  const hero = (r.hero ?? {}) as Json;
  let colors = (r.colors ?? {}) as StoreConfig["colors"];
  const palette = PALETTES[brief.palette];
  if (palette) colors = palette.colors;
  else if (brief.palette === "custom" && brief.primaryColor) colors = { ...colors, primary: brief.primaryColor };

  const config = parseStoreConfig({
    colors,
    fonts: r.fonts,
    content: {
      tagline: r.tagline,
      hero: { title: hero.title, subtitle: hero.subtitle, ctaLabel: hero.cta_label },
      features: r.features,
      about: r.about,
      footerText: r.footer_text,
    },
  });

  const fr = briefLanguage(brief) === "fr";
  const products = (Array.isArray(r.products) ? r.products : [])
    .filter((p): p is Json => typeof p === "object" && p !== null)
    .map((p) => ({
      title: text(p.title, 120),
      category: text(p.category, 40) || (fr ? "Divers" : "Miscellaneous"),
      description: text(p.description, 1000),
      highlights: (Array.isArray(p.highlights) ? p.highlights : []).map((h) => text(h, 200)).filter(Boolean).slice(0, 6),
      priceCents: Math.min(Math.max(Math.round(Number(p.price_cents) || 0), 500), 100000),
    }))
    .filter((p) => p.title)
    .slice(0, 20);

  // Produits déjà choisis : l'IA ne fournit que l'identité de la boutique.
  if (products.length === 0 && !brief.chosenProducts?.length) throw new StoreGenerationError("no_products");

  const name = text(brief.storeName, 60) || text(r.name, 60) || (fr ? "Ma boutique" : "My store");
  return {
    name,
    subdomainSuggestion: text(r.subdomain, 40),
    searchKeywords: (Array.isArray(r.search_keywords) ? r.search_keywords : [])
      .map((k) => text(k, 40).toLowerCase())
      .filter((k) => /^[a-z0-9 \-]{2,40}$/.test(k))
      .slice(0, 6),
    theme: brief.theme === "auto" ? parseTheme(r.theme) : brief.theme,
    config,
    products,
  };
}

export interface GenerationResult {
  store: GeneratedStore;
  usage: { inputTokens: number; outputTokens: number };
}

export async function generateStore(brief: StoreBrief): Promise<GenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new StoreGenerationError("not_configured");
  }
  const client = new Anthropic();

  let response;
  try {
    response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      // Si le modèle refuse pour une raison de sécurité, l'API réessaie avec un modèle de repli.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: describeBrief(brief) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new StoreGenerationError("invalid_key");
    }
    if (error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && error.status === 529)) {
      throw new StoreGenerationError("overloaded");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new StoreGenerationError("unreachable");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new StoreGenerationError("refused");
  }
  if (response.stop_reason === "max_tokens") {
    throw new StoreGenerationError("incomplete");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new StoreGenerationError("empty");

  let json: unknown;
  try {
    json = JSON.parse(textBlock.text);
  } catch {
    throw new StoreGenerationError("unreadable");
  }

  return {
    store: parseGeneratedStore(json, brief),
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
