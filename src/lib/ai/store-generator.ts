import Anthropic from "@anthropic-ai/sdk";
import { PALETTES } from "../palettes";
import { ALLOWED_FONTS, parseStoreConfig, parseTheme, THEME_IDS, THEME_LABELS } from "../store-config";
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
  theme: ThemeId;
  config: StoreConfig;
  products: GeneratedProduct[];
}

export class StoreGenerationError extends Error {}

const str = { type: "string" } as const;
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["refusal_reason", "name", "subdomain", "tagline", "theme", "colors", "fonts", "hero", "features", "about", "footer_text", "products"],
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

const SYSTEM_PROMPT = `You design complete dropshipping storefronts for small entrepreneurs in Québec and the rest of Canada. Your output is stored as data and rendered by a fixed storefront that works like Amazon: a catalogue page with search and categories, then a detail page per product.

Write every customer-facing text in natural Québec French (vouvoiement, Canadian spelling and prices in CAD with "$" after the number when you mention one). Be concrete and specific to the niche; avoid hype and generic filler.

What to produce:
- name: a short, memorable, original store name (2-3 words max) that is not an existing brand.
- subdomain: lowercase letters, digits and hyphens only, 3-30 characters, derived from the name.
- tagline: under 60 characters.
- hero: a title under 60 characters, a subtitle of one or two sentences, and a call-to-action label under 30 characters.
- features: exactly 3 short reassurance points (delivery in Canada within 15 days with tracking, quality, service...). Do not promise a specific return or refund policy duration.
- about: a short paragraph about the store's point of view.
- footer_text: a short signature line.
- products: 12 products spread over 3 to 5 categories with short category names (1-3 words). Each product has a clear descriptive title, a 1-2 sentence description, 3 to 5 factual highlights (materials, dimensions, capacity, compatibility...), and a realistic retail price in CAD cents for a dropshipped item (typically 1500 to 15000).
- colors: hex values (#rrggbb). Text must be clearly readable on the background (contrast ratio of at least 4.5:1). The primary color is used for buttons.
- fonts: pick a heading and body pairing that fits the style from the allowed list.

Rules you must follow:
- Never use real brand names, trademarks, licensed characters or celebrity names, and never describe replicas or "inspired by" copies of branded goods.
- Never invent reviews, ratings, certifications, awards, medical or health claims, or "made in Canada" claims.
- If the requested niche is mainly about prohibited goods (weapons or weapon parts, drugs or drug paraphernalia, tobacco, vaping or cannabis, alcohol, adult content, prescription or medical products, supplements with health claims, live animals, gambling, counterfeit goods, hazardous materials), set refusal_reason to a short explanation in French, and return placeholder values with an empty products array. Otherwise set refusal_reason to null.`;

function describeBrief(brief: StoreBrief): string {
  const lines = [
    `Niche and target customers: ${brief.niche}`,
    `Types of products to sell: ${brief.productTypes || "choose what fits the niche best"}`,
  ];
  if (brief.storeName) lines.push(`Store name requested by the owner (use it exactly): ${brief.storeName}`);

  if (brief.theme === "auto") lines.push(`Style: choose the best fit among ${THEME_IDS.map((t) => `"${t}" (${THEME_LABELS[t].description})`).join(", ")}.`);
  else lines.push(`Style: "${brief.theme}" (${THEME_LABELS[brief.theme].description}). Return this theme.`);

  const palette = PALETTES[brief.palette];
  if (palette) lines.push(`Colors: use exactly this palette: ${JSON.stringify(palette.colors)}.`);
  else if (brief.palette === "custom" && brief.primaryColor) lines.push(`Colors: the primary color must be ${brief.primaryColor}; choose matching accent, background and text colors.`);
  else lines.push("Colors: choose a distinctive palette that fits the niche.");

  return lines.join("\n");
}

type Json = Record<string, unknown>;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Vérifie et nettoie la réponse de l'IA (on ne fait jamais confiance aveuglément au JSON reçu). */
export function parseGeneratedStore(raw: unknown, brief: StoreBrief): GeneratedStore {
  if (typeof raw !== "object" || raw === null) throw new StoreGenerationError("Réponse de l'IA illisible.");
  const r = raw as Json;

  if (typeof r.refusal_reason === "string" && r.refusal_reason.trim()) {
    throw new StoreGenerationError(`Cette niche ne peut pas être acceptée : ${r.refusal_reason.trim()}`);
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

  const products = (Array.isArray(r.products) ? r.products : [])
    .filter((p): p is Json => typeof p === "object" && p !== null)
    .map((p) => ({
      title: text(p.title, 120),
      category: text(p.category, 40) || "Divers",
      description: text(p.description, 1000),
      highlights: (Array.isArray(p.highlights) ? p.highlights : []).map((h) => text(h, 200)).filter(Boolean).slice(0, 6),
      priceCents: Math.min(Math.max(Math.round(Number(p.price_cents) || 0), 500), 100000),
    }))
    .filter((p) => p.title)
    .slice(0, 20);

  if (products.length === 0) throw new StoreGenerationError("L'IA n'a proposé aucun produit. Réessayez avec une description plus précise.");

  const name = text(brief.storeName, 60) || text(r.name, 60) || "Ma boutique";
  return {
    name,
    subdomainSuggestion: text(r.subdomain, 40),
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
    throw new StoreGenerationError("La génération par IA n'est pas encore configurée sur ce serveur (clé ANTHROPIC_API_KEY manquante).");
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
      throw new StoreGenerationError("La clé d'accès à l'IA est invalide (configuration du serveur).");
    }
    if (error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && error.status === 529)) {
      throw new StoreGenerationError("L'IA est très sollicitée en ce moment. Réessayez dans une minute.");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new StoreGenerationError("Impossible de joindre le service d'IA. Réessayez dans un instant.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new StoreGenerationError("L'IA a refusé cette demande. Reformulez votre description de niche.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new StoreGenerationError("La réponse de l'IA était incomplète. Réessayez.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new StoreGenerationError("Réponse de l'IA vide.");

  let json: unknown;
  try {
    json = JSON.parse(textBlock.text);
  } catch {
    throw new StoreGenerationError("Réponse de l'IA illisible. Réessayez.");
  }

  return {
    store: parseGeneratedStore(json, brief),
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
