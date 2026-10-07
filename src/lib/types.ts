/**
 * Format des données d'une boutique.
 * C'est ce JSON (colonne stores.config) que l'IA génère.
 */

export type ThemeId = "minimal" | "bold" | "elegant";

export interface StoreConfig {
  colors: {
    primary: string;    // boutons, accents forts
    accent: string;     // touches secondaires (prix, badges)
    background: string;
    text: string;
  };
  fonts: {
    heading: string;    // doit figurer dans ALLOWED_FONTS
    body: string;
  };
  content: {
    tagline: string;
    hero: { title: string; subtitle: string; ctaLabel: string };
    features: { title: string; description: string }[];
    about: { title: string; body: string };
    footerText: string;
  };
}

export interface Store {
  id: string;
  subdomain: string;
  customDomain: string | null;
  name: string;
  theme: ThemeId;
  config: StoreConfig;
  contactEmail: string | null;
  currency: string;
}

/** Produit tel qu'affiché au public (jamais les coûts fournisseur). */
export interface StoreProduct {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  highlights: string[];
  images: string[];
  priceCents: number;
  stock: number | null;
}

export interface StoreWithProducts {
  store: Store;
  products: StoreProduct[];
}
