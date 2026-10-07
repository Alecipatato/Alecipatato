import type { StoreProduct, StoreWithProducts } from "./types";

/**
 * Boutiques de démonstration codées à la main.
 * Elles fonctionnent sans base de données et montrent les trois styles :
 *   http://demo.localhost:3000   → « minimal »
 *   http://demo2.localhost:3000  → « bold »
 *   http://demo3.localhost:3000  → « elegant »
 * Ces sous-domaines sont réservés : aucune vraie boutique ne peut les prendre.
 */

const p = (
  id: string,
  title: string,
  category: string,
  priceCents: number,
  description: string,
  highlights: string[],
): StoreProduct => ({ id, title, category, priceCents, description, highlights, images: [], stock: 20 });

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
        colors: { primary: "#3f6b4f", accent: "#a8743a", background: "#faf8f4", text: "#1f2a24" },
        fonts: { heading: "Cormorant Garamond", body: "DM Sans" },
        content: {
          tagline: "Yoga et méditation, en toute simplicité",
          hero: {
            title: "Trouvez votre calme intérieur",
            subtitle: "Des accessoires choisis pour accompagner votre pratique, du premier souffle à la dernière posture.",
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
      p("d1", "Tapis de yoga en liège", "Tapis", 7900, "Un tapis naturel qui adhère mieux à mesure que vous transpirez.", ["Liège naturel et caoutchouc", "4 mm d'épaisseur", "183 × 61 cm", "Sangle de transport incluse"]),
      p("d2", "Tapis de voyage pliable", "Tapis", 5900, "Léger et pliable, il se glisse dans une valise.", ["1,5 mm d'épaisseur", "Pèse 900 g", "Surface antidérapante"]),
      p("d3", "Coussin de méditation zafu", "Méditation", 4900, "Un coussin ferme qui soutient une posture droite.", ["Garni d'écorces de sarrasin", "Housse en coton lavable", "Poignée de transport"]),
      p("d4", "Banc de méditation en bambou", "Méditation", 6400, "Pour méditer à genoux sans douleur aux chevilles.", ["Bambou massif", "Pieds pliables", "Supporte 120 kg"]),
      p("d5", "Bol chantant tibétain", "Méditation", 8900, "Un son profond pour ouvrir et clore vos séances.", ["Fabriqué à la main", "Coussin et maillet inclus", "Diamètre 12 cm"]),
      p("d6", "Duo de blocs en liège", "Accessoires", 3400, "Stabilité et confort pour toutes les postures.", ["Lot de 2 blocs", "23 × 15 × 7,5 cm", "Bords arrondis"]),
      p("d7", "Sangle en coton bio", "Accessoires", 1900, "Pour approfondir les étirements en douceur.", ["2,5 m de long", "Boucle métallique", "Coton biologique"]),
      p("d8", "Traversin de yoga restauratif", "Accessoires", 5400, "Soutien idéal pour le yoga doux et restauratif.", ["Housse amovible", "Garnissage en coton", "66 × 23 cm"]),
      p("d9", "Diffuseur d'huiles essentielles", "Ambiance", 5900, "Brume fine et lumière tamisée pour créer votre bulle.", ["Réservoir de 300 ml", "Arrêt automatique", "7 couleurs de lumière"]),
      p("d10", "Coffret de bougies à la sauge", "Ambiance", 3900, "Trois bougies parfumées pour vos rituels du soir.", ["Cire de soja", "35 h de combustion chacune", "Mèche en coton"]),
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
      p("v1", "Clavier mécanique RGB 65 %", "Claviers", 8900, "Compact, réactif et entièrement personnalisable.", ["Switchs remplaçables à chaud", "Rétroéclairage RGB par touche", "Câble USB-C détachable"]),
      p("v2", "Clavier sans fil ultra-plat", "Claviers", 7400, "Pour un bureau épuré sans sacrifier la vitesse.", ["Bluetooth et 2,4 GHz", "Autonomie de 200 h", "Touches silencieuses"]),
      p("v3", "Souris ultralégère 59 g", "Souris", 6900, "Légère comme une plume, précise comme un laser.", ["Capteur 26 000 DPI", "Sans fil, 70 h d'autonomie", "Patins en PTFE"]),
      p("v4", "Souris ergonomique verticale", "Souris", 4900, "Moins de tension au poignet pendant les longues sessions.", ["6 boutons programmables", "Angle de 57°", "4 niveaux de DPI"]),
      p("v5", "Tapis de souris XXL", "Accessoires", 2900, "Toute la place pour votre clavier et votre souris.", ["90 × 40 cm", "Bords cousus", "Base antidérapante"]),
      p("v6", "Support casque avec hub USB", "Accessoires", 3400, "Rangez votre casque et branchez vos appareils.", ["3 ports USB 3.0", "Base lestée", "Éclairage RGB"]),
      p("v7", "Bande LED d'ambiance", "Éclairage", 3900, "Une ambiance qui suit le rythme de votre jeu.", ["5 m de long", "Synchronisée à la musique", "Contrôle par application"]),
      p("v8", "Barre lumineuse pour écran", "Éclairage", 4400, "Éclaire votre bureau sans reflet sur l'écran.", ["Température réglable", "Alimentation USB", "Se fixe sans outil"]),
      p("v9", "Micro USB streaming", "Audio", 9900, "Une voix claire pour vos streams et vos appels.", ["Capsule cardioïde", "Bras articulé inclus", "Bouton sourdine tactile"]),
      p("v10", "Casque gaming 7.1", "Audio", 8400, "Entendez chaque pas avant qu'il n'arrive.", ["Son surround virtuel 7.1", "Micro antibruit amovible", "Coussinets en mousse à mémoire"]),
    ],
  },

  demo3: {
    store: {
      id: "demo3",
      subdomain: "demo3",
      customDomain: null,
      name: "Maison Lumen",
      theme: "elegant",
      contactEmail: "contact@maisonlumen.example",
      currency: "CAD",
      config: {
        colors: { primary: "#7a4b2a", accent: "#9c6b2f", background: "#fbf7f2", text: "#2b211b" },
        fonts: { heading: "Playfair Display", body: "Work Sans" },
        content: {
          tagline: "Décoration et art de vivre",
          hero: {
            title: "La lumière juste, pour chaque pièce",
            subtitle: "Lampes, céramiques et textiles pour une maison chaleureuse et lumineuse.",
            ctaLabel: "Explorer la collection",
          },
          features: [
            { title: "Livraison au Canada", description: "En moins de 15 jours, emballage soigné." },
            { title: "Pièces sélectionnées", description: "Des objets simples qui traversent les modes." },
            { title: "Service attentionné", description: "Une question ? Nous répondons sous 24 h." },
          ],
          about: {
            title: "Maison Lumen",
            body: "Nous croyons qu'un intérieur se construit lentement, avec des objets que l'on aime regarder chaque jour. Notre sélection privilégie les matières naturelles et les lignes intemporelles.",
          },
          footerText: "Vivre bien, simplement.",
        },
      },
    },
    products: [
      p("m1", "Lampe de table en céramique", "Luminaires", 12900, "Un pied en céramique émaillée et un abat-jour en lin.", ["Hauteur 45 cm", "Abat-jour en lin naturel", "Ampoule E26 non incluse"]),
      p("m2", "Suspension en rotin", "Luminaires", 9900, "Une lumière tamisée aux ombres délicates.", ["Diamètre 40 cm", "Rotin tressé à la main", "Câble de 1,2 m"]),
      p("m3", "Applique murale en laiton", "Luminaires", 8900, "Une touche dorée pour un couloir ou une chambre.", ["Laiton brossé", "Bras orientable", "Interrupteur intégré"]),
      p("m4", "Vase en grès texturé", "Céramique", 5400, "Une forme organique pour fleurs séchées ou fraîches.", ["Hauteur 28 cm", "Intérieur émaillé étanche", "Pièce unique"]),
      p("m5", "Lot de 4 tasses artisanales", "Céramique", 4800, "Pour le café du matin et le thé de l'après-midi.", ["Contenance 300 ml", "Va au lave-vaisselle", "Émail réactif"]),
      p("m6", "Coupe décorative en terre cuite", "Céramique", 3900, "Pour vider vos poches ou présenter des fruits.", ["Diamètre 30 cm", "Terre cuite naturelle", "Finition mate"]),
      p("m7", "Plaid en laine bouclée", "Textiles", 11900, "Doux et chaud pour les soirées d'hiver.", ["130 × 170 cm", "Laine et coton", "Franges nouées"]),
      p("m8", "Housse de coussin en lin lavé", "Textiles", 3400, "Un lin froissé au toucher naturel.", ["50 × 50 cm", "Fermeture éclair cachée", "Lin 100 %"]),
      p("m9", "Bougie parfumée bois de cèdre", "Parfums d'intérieur", 4200, "Des notes boisées et chaleureuses.", ["Cire végétale", "50 h de combustion", "Pot en verre réutilisable"]),
      p("m10", "Diffuseur à bâtonnets ambre", "Parfums d'intérieur", 3800, "Un parfum discret qui dure des semaines.", ["Contenance 200 ml", "8 bâtonnets en rotin", "Dure environ 10 semaines"]),
    ],
  },
};

export const DEMO_SUBDOMAINS = new Set(Object.keys(DEMO_STORES));
