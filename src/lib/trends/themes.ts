/**
 * Thèmes des produits tendance. Les noms affichés sont traduits (messages trends.themes) ;
 * les mots-clés (anglais) servent à chercher les produits populaires dans le catalogue CJ.
 */
export const TREND_THEMES = [
  { id: "kitchen", emoji: "☕", keywords: ["coffee accessories", "kitchen gadget", "kitchen organizer", "baking tools", "spice rack"] },
  { id: "fitness", emoji: "🧘", keywords: ["yoga mat", "resistance bands", "fitness accessories", "jump rope", "massage roller"] },
  { id: "pets", emoji: "🐾", keywords: ["pet toy", "dog accessories", "cat bed"] },
  { id: "home", emoji: "🕯️", keywords: ["home decor", "led night light", "storage basket", "throw pillow cover", "bathroom organizer"] },
  { id: "tech", emoji: "🔌", keywords: ["phone stand", "wireless charger", "desk organizer", "bluetooth speaker", "cable organizer"] },
  { id: "outdoor", emoji: "🏕️", keywords: ["camping gear", "travel organizer", "water bottle", "camping lantern", "hiking backpack"] },
  { id: "beauty", emoji: "💄", keywords: ["makeup brush", "hair accessories", "nail art", "makeup organizer", "hair clip"] },
  { id: "fashion", emoji: "👜", keywords: ["women bag", "jewelry", "sunglasses", "wallet", "watch strap"] },
  { id: "kids", emoji: "🧸", keywords: ["kids toy", "baby accessories", "educational toy", "puzzle toy", "kids lunch box"] },
  { id: "car", emoji: "🚗", keywords: ["car accessories", "car organizer", "car phone holder", "car cleaning", "car seat cushion"] },
  { id: "garden", emoji: "🌿", keywords: ["garden tools", "plant pot", "solar light", "garden decor", "watering can"] },
] as const;

export type TrendThemeId = (typeof TREND_THEMES)[number]["id"];

export function isTrendTheme(value: unknown): value is TrendThemeId {
  return TREND_THEMES.some((t) => t.id === value);
}
