/**
 * Choix des variantes proposées à la vente (couleurs, tailles…). Fonctions pures, testées dans variants.test.ts.
 *  - on écarte les variantes en rupture ;
 *  - on garde au plus MAX_VARIANTS variantes, les moins chères d'abord (une par combinaison d'options) ;
 *  - la livraison dépend surtout du poids : un seul calcul par tranche de poids.
 */

export const MAX_VARIANTS = 6;
const WEIGHT_STEP_G = 100;

export interface VariantInput {
  vid: string;
  key: string | null;
  priceUsdCents: number;
  weightG: number | null;
  stock: number | null;
  image: string | null;
}

export function pickVariants<T extends VariantInput>(variants: T[], max = MAX_VARIANTS): T[] {
  const seen = new Set<string>();
  return variants
    .filter((v) => v.stock === null || v.stock > 0)
    .sort((a, b) => a.priceUsdCents - b.priceUsdCents || (b.image ? 1 : 0) - (a.image ? 1 : 0))
    .filter((v) => {
      const id = (v.key ?? v.vid).trim().toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, max);
}

/** Tranche de poids d'une variante (même tranche = même calcul de livraison). */
export function weightBucket(weightG: number | null): string {
  return weightG === null ? "?" : String(Math.ceil(weightG / WEIGHT_STEP_G));
}

/**
 * Variantes pour lesquelles demander les frais de livraison : la plus lourde de chaque tranche
 * (prudent : son tarif couvre les plus légères). Retourne tranche → vid.
 */
export function freightRepresentatives(variants: VariantInput[]): Map<string, string> {
  const heaviest = new Map<string, VariantInput>();
  for (const v of variants) {
    const bucket = weightBucket(v.weightG);
    const current = heaviest.get(bucket);
    if (!current || (v.weightG ?? 0) > (current.weightG ?? 0)) heaviest.set(bucket, v);
  }
  return new Map([...heaviest].map(([bucket, v]) => [bucket, v.vid]));
}
