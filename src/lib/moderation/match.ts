/**
 * Comparaison d'un texte avec les règles de modération (fonctions pures, testées dans match.test.ts).
 * Insensible à la casse et aux accents ; mots entiers seulement (« gun » ne bloque pas « begun »).
 */

export type ModerationKind = "brand" | "counterfeit" | "prohibited" | "category";

export interface ModerationRule {
  kind: ModerationKind;
  term: string;
}

export interface Violation {
  kind: ModerationKind;
  term: string;
}

export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Expression régulière d'un terme : mots entiers, espaces et tirets interchangeables. */
function termPattern(term: string): RegExp {
  const words = normalizeText(term).trim().split(/[\s-]+/).filter(Boolean).map(escape);
  // \b ne fonctionne qu'avec des lettres/chiffres : on délimite par « pas une lettre ni un chiffre ».
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s-]+")}(?![\\p{L}\\p{N}])`, "u");
}

const cache = new Map<string, RegExp>();
function pattern(term: string): RegExp {
  let re = cache.get(term);
  if (!re) {
    re = termPattern(term);
    cache.set(term, re);
  }
  return re;
}

/**
 * Première règle enfreinte par les textes (titre, description…), ou null.
 * Les règles « category » ne s'appliquent qu'aux noms de catégorie (`categories`).
 */
export function findViolation(
  rules: ModerationRule[],
  texts: (string | null | undefined)[],
  categories: (string | null | undefined)[] = [],
): Violation | null {
  const text = normalizeText(texts.filter(Boolean).join(" \n "));
  const category = normalizeText(categories.filter(Boolean).join(" \n "));
  for (const rule of rules) {
    const target = rule.kind === "category" ? category : text;
    if (target && pattern(rule.term).test(target)) return { kind: rule.kind, term: rule.term };
  }
  return null;
}
