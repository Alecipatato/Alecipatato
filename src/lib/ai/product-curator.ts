import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "../i18n/config";
import { AI_MODEL, StoreGenerationError } from "./store-generator";

/**
 * L'IA choisit les produits du catalogue CJ qui conviennent à une boutique,
 * puis rédige leurs fiches dans la langue de la boutique (titre, description, points forts, catégorie).
 * Deux appels courts plutôt qu'un long : chaque requête reste rapide.
 */

export interface CuratorCandidate {
  pid: string;
  name: string;
  priceUsdCents: number;
  category: string | null;
}

export interface RewriteInput {
  pid: string;
  name: string;
  description: string;
  variantName: string | null;
  /** Données du fournisseur (facultatives) : la fiche complète ne s'appuie que sur elles. */
  materials?: string[];
  packaging?: string[];
  weightText?: string | null;
  optionNames?: string | null;
  /** Options des variantes proposées (ex. « Olive green 40cm ») à traduire. */
  variantKeys?: string[];
  /** Dimensions (mm) et poids (g) de la variante par défaut. */
  dimensionsMm?: { length: number; width: number; height: number } | null;
  weightG?: number | null;
}

export interface ProductCopy {
  pid: string;
  title: string;
  description: string;
  highlights: string[];
  category: string;
  /** Description détaillée (paragraphes séparés par une ligne vide). */
  longDescription: string;
  /** Caractéristiques : uniquement des faits fournis par le fournisseur. */
  specs: { label: string; value: string }[];
  /** Options de variante (texte du fournisseur) → libellé traduit. */
  variantLabels: Record<string, string>;
}

const str = { type: "string" } as const;

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

async function callJson(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<{ data: unknown; usage: AiUsage }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new StoreGenerationError("not_configured");
  }
  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && error.status === 529)) {
      throw new StoreGenerationError("overloaded");
    }
    if (error instanceof Anthropic.APIConnectionError) throw new StoreGenerationError("unreachable");
    throw error;
  }
  if (response.stop_reason === "refusal") throw new StoreGenerationError("refused");
  if (response.stop_reason === "max_tokens") throw new StoreGenerationError("incomplete");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new StoreGenerationError("empty");
  try {
    return { data: JSON.parse(block.text), usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
  } catch {
    throw new StoreGenerationError("unreadable");
  }
}

const SELECT_SYSTEM = `You curate products for a small online store in Canada that sells dropshipped goods. You receive the store's niche and a list of candidate products from a supplier catalogue (English names, supplier cost in USD).

Pick the products that make a coherent, attractive catalogue for this niche, ranked from best to worst.
- Prefer products that clearly fit the niche, look giftable or useful, and are not near-duplicates of each other. Vary product types.
- Exclude anything branded or licensed (real brand names, logos, characters, "compatible with <brand>" is fine only for generic accessories), replicas, adult items, weapons, drugs or paraphernalia, tobacco/vaping, alcohol, medical or health-claim products, supplements, live animals, hazardous goods, and anything a payment processor would prohibit.
- Exclude products whose name suggests poor quality or that are unrelated to the niche.
Return only pids that appear in the list.`;

/** Classe les candidats ; retourne les pid retenus, du meilleur au moins bon. */
export async function selectProducts(niche: string, candidates: CuratorCandidate[], count: number): Promise<{ pids: string[]; usage: AiUsage }> {
  const lines = candidates.map((c) => `${c.pid} | ${c.name} | ${(c.priceUsdCents / 100).toFixed(2)} USD${c.category ? ` | ${c.category}` : ""}`);
  const { data: raw, usage } = await callJson(
    SELECT_SYSTEM,
    `Store niche: ${niche}\n\nPick up to ${count} products, best first.\n\nCandidates (pid | name | cost | category):\n${lines.join("\n")}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["pids"],
      properties: { pids: { type: "array", items: str } },
    },
    2000,
  );
  const allowed = new Set(candidates.map((c) => c.pid));
  const pids = (raw as { pids?: unknown }).pids;
  return {
    pids: [...new Set((Array.isArray(pids) ? pids : []).filter((p): p is string => typeof p === "string" && allowed.has(p)))].slice(0, count),
    usage,
  };
}

const REWRITE_LANGUAGE: Record<Locale, string> = {
  en: "natural Canadian English",
  fr: "natural Québec French (vouvoiement)",
};

const rewriteSystem = (language: Locale) => `You write product pages for a small online store in Canada. You receive supplier product data in English. For each product, write in ${REWRITE_LANGUAGE[language]}:
- title: a clear, descriptive product name under 70 characters, no brand names, no ALL CAPS, no keyword stuffing.
- description: 1 or 2 sentences that say what the product is and why it is useful.
- highlights: 3 to 5 short factual bullet points taken ONLY from the supplier data (material, dimensions, capacity, compatibility, contents). Never invent specifications, certifications, health claims, reviews or origin claims. Convert inches/pounds to metric when given.
- category: a short store category (1-3 words) — reuse one of the existing categories when it fits.
- long_description: 2 to 4 short paragraphs (separated by a blank line) for the product page: what it is, how it is used, what is in the box. Only facts present in the supplier data; no invented features, materials, dimensions, certifications, health claims, reviews or origin claims.
- specs: up to 10 label/value pairs for a specifications table (e.g. material, dimensions, weight, capacity, colours available, package contents), translated, taken ONLY from the supplier data. Convert units to metric. Omit anything not given.
- variant_labels: for each supplier variant option text given, a short natural label (e.g. "Olive green 40cm" → "Vert olive · 40 cm"). Return exactly one entry per given option, with "key" copied unchanged.
Brand names: never put a brand in the title; for accessories that are compatible with a brand's device, you may say "compatible with <device>" in the description or specs only.`;

/** Rédige les fiches produits dans la langue de la boutique. */
export async function rewriteProducts(
  storeContext: { niche: string; categories: string[]; language: Locale },
  products: RewriteInput[],
): Promise<{ copies: ProductCopy[]; usage: AiUsage }> {
  const payload = products.map((p) => ({
    pid: p.pid,
    name: p.name,
    variant: p.variantName,
    supplier_description: p.description.slice(0, 2500),
    materials: p.materials ?? [],
    packaging: p.packaging ?? [],
    weight_grams: p.weightG ?? p.weightText ?? null,
    dimensions_mm: p.dimensionsMm ?? null,
    option_names: p.optionNames ?? null,
    variant_options: p.variantKeys ?? [],
  }));
  const { data: raw, usage } = await callJson(
    rewriteSystem(storeContext.language),
    `Store niche: ${storeContext.niche}\nExisting categories: ${storeContext.categories.join(", ") || "(none yet)"}\n\nProducts:\n${JSON.stringify(payload)}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["products"],
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["pid", "title", "description", "highlights", "category", "long_description", "specs", "variant_labels"],
            properties: {
              pid: str,
              title: str,
              description: str,
              highlights: { type: "array", items: str },
              category: str,
              long_description: str,
              specs: {
                type: "array",
                items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: str, value: str } },
              },
              variant_labels: {
                type: "array",
                items: { type: "object", additionalProperties: false, required: ["key", "label"], properties: { key: str, label: str } },
              },
            },
          },
        },
      },
    },
    12000,
  );

  const wanted = new Set(products.map((p) => p.pid));
  const list = (raw as { products?: unknown }).products;
  const copies = (Array.isArray(list) ? list : [])
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && wanted.has(String((p as Record<string, unknown>).pid)))
    .map((p) => ({
      pid: String(p.pid),
      title: String(p.title ?? "").trim().slice(0, 120),
      description: String(p.description ?? "").trim().slice(0, 1000),
      highlights: (Array.isArray(p.highlights) ? p.highlights : []).map((h) => String(h).trim().slice(0, 200)).filter(Boolean).slice(0, 6),
      category: String(p.category ?? "").trim().slice(0, 40) || (storeContext.language === "fr" ? "Divers" : "Miscellaneous"),
      longDescription: String(p.long_description ?? "").trim().slice(0, 3000),
      specs: (Array.isArray(p.specs) ? p.specs : [])
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((x) => ({ label: String(x.label ?? "").trim().slice(0, 60), value: String(x.value ?? "").trim().slice(0, 200) }))
        .filter((x) => x.label && x.value)
        .slice(0, 12),
      variantLabels: Object.fromEntries(
        (Array.isArray(p.variant_labels) ? p.variant_labels : [])
          .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
          .map((x) => [String(x.key ?? ""), String(x.label ?? "").trim().slice(0, 60)])
          .filter(([key, label]) => key && label),
      ),
    }))
    .filter((p) => p.title);
  return { copies, usage };
}
