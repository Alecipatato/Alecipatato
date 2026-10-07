import type { StoreWithProducts } from "./types";

/**
 * Boutiques de démonstration codées à la main (phase 1).
 * Elles fonctionnent sans base de données et montrent les deux thèmes :
 *   http://demo.localhost:3000   → thème « minimal »
 *   http://demo2.localhost:3000  → thème « bold »
 * Ces sous-domaines sont réservés : aucune vraie boutique ne peut les prendre.
 */
export const DEMO_STORES: Record<string, StoreWithProducts> = {
  demo: {
    store: {
      id: "demo",
      subdomain: "demo",
      customDomain: null,
      name: "Zen Atelier",
      theme: "minimal",
      contactEmail: "bonjour@zenatelier.example",
      currency: "CAD",
      config: {
        colors: { primary: "#3f6b4f", accent: "#c8a97e", background: "#faf8f4", text: "#1f2a24" },
        fonts: { heading: "Cormorant Garamond", body: "DM Sans" },
        content: {
          tagline: "Yoga & méditation, en toute simplicité",
          hero: {
            title: "Trouvez votre calme intérieur",
            subtitle:
              "Des accessoires de yoga et de méditation choisis pour accompagner votre pratique, du premier souffle à la dernière posture.",
            ctaLabel: "Découvrir la collection",
          },
          features: [
            { title: "Livraison au Canada", description: "Reçue en moins de 15 jours, suivi inclus." },
            { title: "Matières douces", description: "Liège, coton et fibres naturelles." },
            { title: "Retours faciles", description: "30 jours pour changer d'avis." },
          ],
          about: {
            title: "Notre philosophie",
            body: "Zen Atelier est né d'une idée simple : une pratique sereine commence par un espace apaisant. Chaque objet est sélectionné pour sa qualité et sa simplicité.",
          },
          footerText: "Respirez. Bougez. Recommencez.",
        },
      },
    },
    products: [
      { id: "d1", title: "Tapis de yoga en liège", description: "Antidérapant naturel, 4 mm d'épaisseur.", images: [], priceCents: 7900, stock: 24 },
      { id: "d2", title: "Coussin de méditation zafu", description: "Garni d'écorces de sarrasin, housse lavable.", images: [], priceCents: 4900, stock: 15 },
      { id: "d3", title: "Duo de blocs en liège", description: "Stabilité et confort pour toutes les postures.", images: [], priceCents: 3400, stock: 40 },
      { id: "d4", title: "Sangle en coton bio", description: "2,5 m, boucle métallique.", images: [], priceCents: 1900, stock: 60 },
      { id: "d5", title: "Diffuseur d'huiles essentielles", description: "Brume fine, lumière tamisée.", images: [], priceCents: 5900, stock: 12 },
      { id: "d6", title: "Bol chantant tibétain", description: "Fabriqué à la main, avec coussin et maillet.", images: [], priceCents: 8900, stock: 8 },
    ],
  },

  demo2: {
    store: {
      id: "demo2",
      subdomain: "demo2",
      customDomain: null,
      name: "VOLT GEAR",
      theme: "bold",
      contactEmail: "team@voltgear.example",
      currency: "CAD",
      config: {
        colors: { primary: "#ff3d00", accent: "#ffd600", background: "#0e0e10", text: "#f5f5f5" },
        fonts: { heading: "Bebas Neue", body: "Space Grotesk" },
        content: {
          tagline: "Équipement gaming qui frappe fort",
          hero: {
            title: "Montez de niveau",
            subtitle: "Claviers, souris et éclairage RGB pour les joueurs qui ne font aucun compromis.",
            ctaLabel: "Équipe-toi",
          },
          features: [
            { title: "Expédié rapidement", description: "Livraison au Canada en moins de 15 jours." },
            { title: "Testé par des joueurs", description: "Seulement du matériel qui tient la route." },
            { title: "Paiement sécurisé", description: "Vos données restent protégées." },
          ],
          about: {
            title: "Pourquoi VOLT",
            body: "On joue, on teste, on garde le meilleur. VOLT GEAR rassemble l'équipement qui fait vraiment la différence en partie.",
          },
          footerText: "Game on.",
        },
      },
    },
    products: [
      { id: "v1", title: "Clavier mécanique RGB 65 %", description: "Switchs remplaçables à chaud.", images: [], priceCents: 8900, stock: 30 },
      { id: "v2", title: "Souris ultralégère 59 g", description: "Capteur 26 000 DPI, sans fil.", images: [], priceCents: 6900, stock: 22 },
      { id: "v3", title: "Tapis de souris XXL", description: "90 × 40 cm, bords cousus.", images: [], priceCents: 2900, stock: 50 },
      { id: "v4", title: "Bande LED d'ambiance", description: "Synchronisée à la musique, 5 m.", images: [], priceCents: 3900, stock: 35 },
      { id: "v5", title: "Support casque avec hub USB", description: "Base antidérapante, 3 ports.", images: [], priceCents: 3400, stock: 18 },
      { id: "v6", title: "Micro USB streaming", description: "Cardioïde, bras articulé inclus.", images: [], priceCents: 9900, stock: 10 },
    ],
  },
};
