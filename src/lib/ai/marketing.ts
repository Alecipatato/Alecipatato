import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "../i18n/config";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from "../marketing/settings";
import { AI_MODEL, anthropicClient, StoreGenerationError } from "./store-generator";

/**
 * Contenus marketing générés par l'IA pour une boutique ou un produit :
 * scripts vidéo TikTok, textes publicitaires Meta/TikTok et suggestion SEO.
 * Réponse JSON stricte, toujours revalidée (parseMarketing).
 */

export interface MarketingInput {
  language: Locale;
  store: { name: string; tagline: string; niche: string };
  /** Produit mis en avant (sinon : la boutique entière, avec quelques produits). */
  product: { title: string; description: string | null; highlights: string[]; price: string } | null;
  otherProducts: string[];
}

export interface TikTokScript {
  title: string;
  hook: string;
  scenes: { visual: string; voiceover: string }[];
  onScreenText: string[];
  caption: string;
  hashtags: string[];
}

export interface AdCopy {
  platform: "meta" | "tiktok";
  primaryText: string;
  headline: string;
  description: string;
}

export interface MarketingContent {
  tiktokScripts: TikTokScript[];
  adCopies: AdCopy[];
  seo: { title: string; description: string };
}

const str = { type: "string" } as const;
const strArray = { type: "array", items: str } as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tiktok_scripts", "ad_copies", "seo"],
  properties: {
    tiktok_scripts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "hook", "scenes", "on_screen_text", "caption", "hashtags"],
        properties: {
          title: str,
          hook: str,
          scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["visual", "voiceover"], properties: { visual: str, voiceover: str } } },
          on_screen_text: strArray,
          caption: str,
          hashtags: strArray,
        },
      },
    },
    ad_copies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["platform", "primary_text", "headline", "description"],
        properties: { platform: { type: "string", enum: ["meta", "tiktok"] }, primary_text: str, headline: str, description: str },
      },
    },
    seo: { type: "object", additionalProperties: false, required: ["title", "description"], properties: { title: str, description: str } },
  },
};

const LANGUAGE: Record<Locale, string> = {
  en: "natural Canadian English",
  fr: "natural Québec French (vouvoiement in ads, a friendly tone in TikTok scripts)",
};

const SYSTEM = `You write marketing content for a small Canadian online store (dropshipped products, free shipping in Canada with tracking).

Produce:
- tiktok_scripts: exactly 2 short TikTok video scripts (15-30 seconds). Each has a working title, a hook for the first 2 seconds, 3 to 5 scenes (what to film + voice-over line), 2 to 4 short on-screen texts, a caption under 150 characters and 3 to 6 relevant hashtags (without spaces, starting with #).
- ad_copies: exactly 3 ad texts: 2 for Meta (Facebook/Instagram) and 1 for TikTok. Primary text under 300 characters, headline under 40 characters, description under 30 characters.
- seo: a page title under ${SEO_TITLE_MAX} characters and a meta description under ${SEO_DESCRIPTION_MAX} characters for the store's home page.

Rules you must follow (advertising policies and consumer protection law):
- Only use facts from the data provided. Never invent reviews, ratings, testimonials, sales numbers, certifications, awards, discounts, scarcity ("only 3 left") or deadlines.
- No medical, health, weight-loss or "guaranteed results" claims. No before/after promises.
- Never mention real brands, celebrities or competitors.
- Do not promise a delivery time shorter than "within 15 days" or any specific return policy.
- Keep it honest, concrete and specific to the products.`;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, max: number, count: number) => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, count) : []);

/** Vérifie et nettoie la réponse de l'IA. */
export function parseMarketing(raw: unknown): MarketingContent {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const scripts = (Array.isArray(r.tiktok_scripts) ? r.tiktok_scripts : []).filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null);
  const ads = (Array.isArray(r.ad_copies) ? r.ad_copies : []).filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null);
  const seo = (typeof r.seo === "object" && r.seo !== null ? r.seo : {}) as Record<string, unknown>;
  const content: MarketingContent = {
    tiktokScripts: scripts.slice(0, 3).map((s) => ({
      title: text(s.title, 100),
      hook: text(s.hook, 200),
      scenes: (Array.isArray(s.scenes) ? s.scenes : [])
        .filter((sc): sc is Record<string, unknown> => typeof sc === "object" && sc !== null)
        .slice(0, 6)
        .map((sc) => ({ visual: text(sc.visual, 300), voiceover: text(sc.voiceover, 300) })),
      onScreenText: list(s.on_screen_text, 80, 5),
      caption: text(s.caption, 220),
      hashtags: list(s.hashtags, 40, 8).map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
    })),
    adCopies: ads.slice(0, 4).map((a) => ({
      platform: a.platform === "tiktok" ? "tiktok" : "meta",
      primaryText: text(a.primary_text, 400),
      headline: text(a.headline, 60),
      description: text(a.description, 60),
    })),
    seo: { title: text(seo.title, SEO_TITLE_MAX), description: text(seo.description, SEO_DESCRIPTION_MAX) },
  };
  if (content.tiktokScripts.length === 0 && content.adCopies.length === 0) throw new StoreGenerationError("unreadable");
  return content;
}

/** Tous les textes produits (pour la modération). */
export function marketingTexts(c: MarketingContent): string[] {
  return [
    ...c.tiktokScripts.flatMap((s) => [s.title, s.hook, s.caption, ...s.onScreenText, ...s.hashtags, ...s.scenes.flatMap((sc) => [sc.visual, sc.voiceover])]),
    ...c.adCopies.flatMap((a) => [a.primaryText, a.headline, a.description]),
    c.seo.title,
    c.seo.description,
  ];
}

function describe(input: MarketingInput): string {
  const lines = [
    `Write everything in ${LANGUAGE[input.language]}.`,
    `Store: ${input.store.name} — ${input.store.tagline}`,
    `Niche: ${input.store.niche}`,
  ];
  if (input.product) {
    lines.push(
      "Focus the TikTok scripts and ads on this product:",
      `- Name: ${input.product.title}`,
      `- Price: ${input.product.price}`,
      `- Description: ${input.product.description ?? ""}`,
      `- Facts: ${input.product.highlights.join("; ")}`,
    );
  } else {
    lines.push("Promote the store as a whole.");
  }
  if (input.otherProducts.length) lines.push(`Other products in the store: ${input.otherProducts.join("; ")}`);
  return lines.join("\n");
}

export async function generateMarketing(input: MarketingInput): Promise<{ content: MarketingContent; usage: { inputTokens: number; outputTokens: number } }> {
  const client = anthropicClient();
  let response;
  try {
    response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: describe(input) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new StoreGenerationError("invalid_key");
    if (error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && error.status === 529)) throw new StoreGenerationError("overloaded");
    if (error instanceof Anthropic.APIConnectionError) throw new StoreGenerationError("unreachable");
    throw error;
  }
  if (response.stop_reason === "refusal") throw new StoreGenerationError("refused");
  if (response.stop_reason === "max_tokens") throw new StoreGenerationError("incomplete");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new StoreGenerationError("empty");
  let json: unknown;
  try {
    json = JSON.parse(block.text);
  } catch {
    throw new StoreGenerationError("unreadable");
  }
  return { content: parseMarketing(json), usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
}
