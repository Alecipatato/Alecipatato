/**
 * Demande des produits tendance et vérification d'une sélection.
 * Fonctions pures, testées dans trends.test.ts.
 *
 * Indicateur de demande : nombre de boutiques qui vendent le produit chez le fournisseur
 * (CJ « listedNum »), plus les ventes réelles sur la plateforme (une vente pèse SALE_WEIGHT boutiques).
 * Le score (0-100) suit une échelle logarithmique par rapport au produit le plus demandé ;
 * DEMAND_SCALE fixe l'ordre de grandeur (quelques centaines de boutiques = demande déjà réelle).
 */

export const SALE_WEIGHT = 20;
export const DEMAND_SCALE = 200;
export const MIN_SELECTION = 3;
export const MAX_SELECTION = 20;

export type DemandLevel = "very_high" | "high" | "medium" | "low";

export function demandSignal(listedCount: number, salesCount: number): number {
  return Math.max(listedCount, 0) + Math.max(salesCount, 0) * SALE_WEIGHT;
}

/** Score de 0 à 100 ; `referenceSignal` = signal du produit le plus demandé du catalogue. */
export function demandScore(signal: number, referenceSignal: number): number {
  if (referenceSignal <= 0 || signal <= 0) return 0;
  const score = Math.round((100 * Math.log1p(signal / DEMAND_SCALE)) / Math.log1p(referenceSignal / DEMAND_SCALE));
  return Math.min(Math.max(score, 0), 100);
}

export function demandLevel(score: number): DemandLevel {
  if (score >= 80) return "very_high";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

/**
 * Thème choisi quand le client laisse l'IA tout faire sans rien décrire : un des 3 thèmes
 * les plus demandés (moyenne de leurs 6 meilleurs produits), au hasard pour varier les boutiques.
 */
export function pickAutoTheme(products: { theme: string; demandScore: number }[], random = Math.random): string | null {
  const byTheme = new Map<string, number[]>();
  for (const p of products) byTheme.set(p.theme, [...(byTheme.get(p.theme) ?? []), p.demandScore]);
  const ranked = [...byTheme.entries()]
    .filter(([, scores]) => scores.length >= MIN_SELECTION)
    .map(([theme, scores]) => {
      const top = [...scores].sort((a, b) => b - a).slice(0, 6);
      return { theme, avg: top.reduce((s, x) => s + x, 0) / top.length };
    })
    .sort((a, b) => b.avg - a.avg || a.theme.localeCompare(b.theme))
    .slice(0, 3);
  if (ranked.length === 0) return null;
  return ranked[Math.min(Math.floor(random() * ranked.length), ranked.length - 1)].theme;
}

export type SelectionError = "too_few" | "too_many" | "unknown_product" | "mixed_themes";

/** Vérifie la sélection du client : produits connus, d'un seul thème, entre 3 et 20. */
export function validateSelection<T extends { id: string; theme: string }>(
  ids: string[],
  catalogue: T[],
): { ok: true; theme: string; products: T[] } | { ok: false; error: SelectionError } {
  const unique = [...new Set(ids)];
  if (unique.length < MIN_SELECTION) return { ok: false, error: "too_few" };
  if (unique.length > MAX_SELECTION) return { ok: false, error: "too_many" };
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const products = unique.map((id) => byId.get(id));
  if (products.some((p) => !p)) return { ok: false, error: "unknown_product" };
  const chosen = products as T[];
  const theme = chosen[0].theme;
  if (chosen.some((p) => p.theme !== theme)) return { ok: false, error: "mixed_themes" };
  return { ok: true, theme, products: chosen };
}
