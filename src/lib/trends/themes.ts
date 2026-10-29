/**
 * Thèmes des produits tendance. Les noms affichés sont traduits (messages trends.themes) ;
 * les mots-clés (anglais) servent à chercher les produits populaires dans le catalogue CJ.
 */
export const TREND_THEMES = [
  { id: "kitchen", emoji: "☕", keywords: ["coffee accessories", "kitchen gadget", "kitchen organizer"] },
  { id: "fitness", emoji: "🧘", keywords: ["yoga mat", "resistance bands", "fitness accessories"] },
  { id: "pets", emoji: "🐾", keywords: ["pet toy", "dog accessories", "cat bed"] },
  { id: "home", emoji: "🕯️", keywords: ["home decor", "led night light", "storage basket"] },
  { id: "tech", emoji: "🔌", keywords: ["phone stand", "wireless charger", "desk organizer"] },
  { id: "outdoor", emoji: "🏕️", keywords: ["camping gear", "travel organizer", "water bottle"] },
  { id: "beauty", emoji: "💄", keywords: ["makeup brush", "hair accessories", "nail art"] },
  { id: "fashion", emoji: "👜", keywords: ["women bag", "jewelry", "sunglasses"] },
  { id: "kids", emoji: "🧸", keywords: ["kids toy", "baby accessories", "educational toy"] },
  { id: "car", emoji: "🚗", keywords: ["car accessories", "car organizer", "car phone holder"] },
  { id: "garden", emoji: "🌿", keywords: ["garden tools", "plant pot", "solar light"] },
] as const;

export type TrendThemeId = (typeof TREND_THEMES)[number]["id"];

export function isTrendTheme(value: unknown): value is TrendThemeId {
  return TREND_THEMES.some((t) => t.id === value);
}
