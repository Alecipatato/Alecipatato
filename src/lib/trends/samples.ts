import type { Locale } from "../i18n/config";
import type { TrendThemeId } from "./themes";

/**
 * Produits tendance d'EXEMPLE, utilisés tant que la clé CJ n'est pas configurée (démo, tests).
 * Coûts et délais réalistes pour un produit expédié de Chine vers le Canada ; « listed » imite
 * l'indicateur CJ (nombre de boutiques qui vendent le produit). Visuels : /api/trends/image/<id>.svg.
 */
export interface SampleTrend {
  id: string;
  theme: TrendThemeId;
  emoji: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  highlights: Record<Locale, string[]>;
  category: Record<Locale, string>;
  supplierCostUsdCents: number;
  shippingUsdCents: number;
  days: [number, number];
  listed: number;
}

const p = (
  id: string,
  theme: TrendThemeId,
  emoji: string,
  en: [string, string, string, string[]],
  fr: [string, string, string, string[]],
  supplierCostUsdCents: number,
  shippingUsdCents: number,
  days: [number, number],
  listed: number,
): SampleTrend => ({
  id,
  theme,
  emoji,
  name: { en: en[0], fr: fr[0] },
  category: { en: en[1], fr: fr[1] },
  description: { en: en[2], fr: fr[2] },
  highlights: { en: en[3], fr: fr[3] },
  supplierCostUsdCents,
  shippingUsdCents,
  days,
  listed,
});

export const SAMPLE_TRENDS: SampleTrend[] = [
  // Cuisine et café
  p("s-kitchen-1", "kitchen", "☕",
    ["Manual ceramic burr coffee grinder", "Coffee", "A compact hand grinder with adjustable ceramic burrs for a consistent grind, from espresso to French press.", ["Adjustable ceramic burrs", "Stainless steel body", "Holds 30 g of beans"]],
    ["Moulin à café manuel à meules céramique", "Café", "Un moulin à main compact aux meules céramique réglables, pour une mouture régulière de l'espresso à la cafetière à piston.", ["Meules céramique réglables", "Corps en acier inoxydable", "Contient 30 g de grains"]],
    1180, 410, [8, 12], 4820),
  p("s-kitchen-2", "kitchen", "🥛",
    ["Rechargeable handheld milk frother", "Coffee", "Froths milk in seconds for lattes and hot chocolate; charges by USB-C.", ["3 speeds", "USB-C charging", "Stainless steel whisk"]],
    ["Mousseur à lait rechargeable", "Café", "Fait mousser le lait en quelques secondes pour les lattés et chocolats chauds ; se recharge par USB-C.", ["3 vitesses", "Recharge USB-C", "Fouet en acier inoxydable"]],
    690, 350, [7, 12], 6240),
  p("s-kitchen-3", "kitchen", "⚖️",
    ["Digital coffee scale with timer", "Coffee", "Weighs to 0.1 g with a built-in timer for precise pour-over brewing.", ["0.1 g precision", "Built-in timer", "Up to 3 kg"]],
    ["Balance à café numérique avec minuterie", "Café", "Pèse au 0,1 g près avec minuterie intégrée pour un café filtre précis.", ["Précision 0,1 g", "Minuterie intégrée", "Jusqu'à 3 kg"]],
    950, 450, [8, 13], 3150),
  p("s-kitchen-4", "kitchen", "🫙",
    ["Airtight glass storage jars, set of 4", "Storage", "Borosilicate glass jars with bamboo lids to keep coffee, tea and dry goods fresh.", ["Borosilicate glass", "Bamboo lids with seal", "4 × 800 ml"]],
    ["Bocaux en verre hermétiques, lot de 4", "Rangement", "Bocaux en verre borosilicate avec couvercles en bambou pour garder café, thé et aliments secs au frais.", ["Verre borosilicate", "Couvercles en bambou étanches", "4 × 800 ml"]],
    1420, 690, [9, 14], 2210),
  p("s-kitchen-5", "kitchen", "🔪",
    ["Magnetic knife strip, 40 cm", "Storage", "A wall-mounted magnetic bar that frees counter space and keeps knives within reach.", ["40 cm long", "Strong magnets", "Screws included"]],
    ["Barre aimantée pour couteaux, 40 cm", "Rangement", "Une barre murale aimantée qui libère le comptoir et garde les couteaux à portée de main.", ["40 cm de long", "Aimants puissants", "Vis incluses"]],
    620, 380, [8, 12], 1860),
  p("s-kitchen-6", "kitchen", "🍵",
    ["Double-wall glass mugs, set of 2", "Coffee", "Insulated glass mugs that keep drinks hot while staying cool to the touch.", ["Double-wall glass", "350 ml each", "Dishwasher safe"]],
    ["Tasses en verre double paroi, lot de 2", "Café", "Des tasses en verre isolantes qui gardent les boissons chaudes sans brûler les doigts.", ["Verre double paroi", "350 ml chacune", "Lave-vaisselle"]],
    780, 520, [8, 13], 3940),

  // Sport et yoga
  p("s-fitness-1", "fitness", "🧘",
    ["Non-slip yoga mat, 6 mm", "Yoga", "A cushioned, non-slip mat with alignment lines for yoga and floor workouts.", ["6 mm thick", "Alignment lines", "Carry strap included"]],
    ["Tapis de yoga antidérapant, 6 mm", "Yoga", "Un tapis coussiné et antidérapant avec lignes d'alignement pour le yoga et les exercices au sol.", ["6 mm d'épaisseur", "Lignes d'alignement", "Sangle de transport incluse"]],
    1350, 890, [9, 14], 5410),
  p("s-fitness-2", "fitness", "💪",
    ["Resistance bands, set of 5", "Training", "Five latex bands of increasing resistance for strength training at home or on the go.", ["5 resistance levels", "Natural latex", "Storage pouch"]],
    ["Bandes de résistance, lot de 5", "Entraînement", "Cinq bandes en latex de résistance croissante pour se renforcer à la maison ou en voyage.", ["5 niveaux de résistance", "Latex naturel", "Pochette de rangement"]],
    480, 330, [7, 12], 7320),
  p("s-fitness-3", "fitness", "🦶",
    ["Foam roller, 33 cm", "Recovery", "A firm textured foam roller for stretching and warming up before or after training.", ["33 × 14 cm", "Textured surface", "Hollow core"]],
    ["Rouleau en mousse, 33 cm", "Récupération", "Un rouleau en mousse ferme et texturé pour s'étirer et s'échauffer avant ou après l'entraînement.", ["33 × 14 cm", "Surface texturée", "Cœur creux"]],
    890, 760, [9, 14], 2980),
  p("s-fitness-4", "fitness", "🪢",
    ["Adjustable speed jump rope", "Training", "A tangle-free jump rope with ball bearings and adjustable steel cable.", ["Ball-bearing handles", "Adjustable length", "Coated steel cable"]],
    ["Corde à sauter rapide ajustable", "Entraînement", "Une corde à sauter qui ne s'emmêle pas, avec roulements à billes et câble d'acier ajustable.", ["Poignées à roulements", "Longueur ajustable", "Câble d'acier gainé"]],
    390, 300, [7, 12], 4150),
  p("s-fitness-5", "fitness", "🧱",
    ["Cork yoga blocks, set of 2", "Yoga", "Natural cork blocks that support balance and deepen stretches.", ["Natural cork", "23 × 15 × 7.5 cm", "Rounded edges"]],
    ["Blocs de yoga en liège, lot de 2", "Yoga", "Des blocs en liège naturel qui aident l'équilibre et approfondissent les étirements.", ["Liège naturel", "23 × 15 × 7,5 cm", "Bords arrondis"]],
    1120, 840, [9, 14], 1720),
  p("s-fitness-6", "fitness", "🧴",
    ["Insulated sports bottle, 750 ml", "Accessories", "Stainless steel bottle that keeps water cold for 24 hours.", ["750 ml", "Double-wall steel", "Leak-proof lid"]],
    ["Gourde de sport isotherme, 750 ml", "Accessoires", "Une gourde en acier inoxydable qui garde l'eau froide 24 heures.", ["750 ml", "Acier double paroi", "Bouchon étanche"]],
    870, 560, [8, 13], 3660),

  // Animaux
  p("s-pets-1", "pets", "🐾",
    ["Interactive treat puzzle for dogs", "Dogs", "A slide-and-lift puzzle that keeps dogs busy and slows down treat time.", ["3 difficulty levels", "Non-slip base", "Easy to clean"]],
    ["Jeu de réflexion à friandises pour chien", "Chiens", "Un casse-tête à glisser et soulever qui occupe le chien et ralentit la prise de friandises.", ["3 niveaux de difficulté", "Base antidérapante", "Facile à nettoyer"]],
    760, 590, [8, 13], 6890),
  p("s-pets-2", "pets", "🐈",
    ["Calming round pet bed", "Cats", "A soft, raised-rim bed that cats and small dogs love to curl up in.", ["Plush faux fur", "Machine washable", "50 cm diameter"]],
    ["Coussin rond douillet pour animaux", "Chats", "Un coussin moelleux à rebord surélevé où chats et petits chiens aiment se blottir.", ["Fausse fourrure douce", "Lavable en machine", "50 cm de diamètre"]],
    1290, 980, [9, 14], 8120),
  p("s-pets-3", "pets", "🦮",
    ["Retractable dog leash, 5 m", "Dogs", "A retractable leash with one-button lock and a comfortable grip.", ["5 m tape", "One-button brake", "For dogs up to 25 kg"]],
    ["Laisse rétractable pour chien, 5 m", "Chiens", "Une laisse rétractable avec blocage à un bouton et poignée confortable.", ["Sangle de 5 m", "Frein à un bouton", "Chiens jusqu'à 25 kg"]],
    690, 450, [8, 12], 3520),
  p("s-pets-4", "pets", "🪶",
    ["Feather wand cat toy set", "Cats", "A telescopic wand with replaceable feather and bell attachments.", ["Telescopic wand", "5 attachments", "Bell included"]],
    ["Canne à plumes pour chat, ensemble", "Chats", "Une canne télescopique avec embouts interchangeables à plumes et grelot.", ["Canne télescopique", "5 embouts", "Grelot inclus"]],
    340, 260, [7, 12], 5260),
  p("s-pets-5", "pets", "🥣",
    ["Slow feeder bowl", "Dogs", "A maze bowl that helps fast eaters slow down at mealtime.", ["Food-safe plastic", "Non-slip base", "Holds 500 ml"]],
    ["Gamelle anti-glouton", "Chiens", "Une gamelle à labyrinthe qui aide les chiens gourmands à manger plus lentement.", ["Plastique alimentaire", "Base antidérapante", "Contient 500 ml"]],
    420, 400, [8, 12], 4470),
  p("s-pets-6", "pets", "🪮",
    ["Self-cleaning slicker brush", "Grooming", "A grooming brush whose pins retract at the push of a button to release fur.", ["Retractable pins", "Ergonomic handle", "For short and long coats"]],
    ["Brosse autonettoyante pour poils", "Toilettage", "Une brosse de toilettage dont les picots se rétractent d'un clic pour retirer les poils.", ["Picots rétractables", "Poignée ergonomique", "Poils courts et longs"]],
    510, 380, [8, 12], 6010),

  // Maison et déco
  p("s-home-1", "home", "🌙",
    ["Sunset projection lamp", "Lighting", "Projects a warm sunset glow on walls for a cozy atmosphere.", ["16 colours", "Rotates 180°", "USB powered"]],
    ["Lampe à projection coucher de soleil", "Éclairage", "Projette une lueur de coucher de soleil sur les murs pour une ambiance chaleureuse.", ["16 couleurs", "Rotation 180°", "Alimentation USB"]],
    830, 620, [8, 13], 7680),
  p("s-home-2", "home", "🕯️",
    ["Flameless LED candles, set of 3", "Lighting", "Real-wax LED candles with a flickering flame and remote timer.", ["Real wax", "Remote with timer", "Battery powered"]],
    ["Bougies LED sans flamme, lot de 3", "Éclairage", "Des bougies LED en vraie cire avec flamme vacillante et minuterie à distance.", ["Vraie cire", "Télécommande avec minuterie", "À piles"]],
    1050, 720, [9, 14], 3890),
  p("s-home-3", "home", "🧺",
    ["Woven cotton storage baskets, set of 3", "Storage", "Soft rope baskets for blankets, toys and plants.", ["Cotton rope", "3 sizes", "Sturdy handles"]],
    ["Paniers de rangement en corde de coton, lot de 3", "Rangement", "Des paniers souples en corde pour les couvertures, jouets et plantes.", ["Corde de coton", "3 tailles", "Poignées solides"]],
    1380, 1090, [10, 15], 2740),
  p("s-home-4", "home", "🪴",
    ["Self-watering ceramic planter", "Plants", "A ceramic pot with a hidden water reservoir for worry-free plants.", ["Hidden reservoir", "Water level window", "15 cm diameter"]],
    ["Pot céramique à réserve d'eau", "Plantes", "Un pot en céramique avec réservoir caché pour des plantes sans souci.", ["Réservoir caché", "Indicateur de niveau", "15 cm de diamètre"]],
    920, 830, [9, 14], 2360),
  p("s-home-5", "home", "💡",
    ["Motion sensor LED strip lights", "Lighting", "Stick-on lights that turn on automatically in closets, stairs and under cabinets.", ["Motion sensor", "Rechargeable", "Magnetic mount"]],
    ["Réglettes LED à détecteur de mouvement", "Éclairage", "Des lumières adhésives qui s'allument seules dans les placards, escaliers et sous les armoires.", ["Détecteur de mouvement", "Rechargeables", "Fixation aimantée"]],
    640, 420, [8, 12], 5930),
  p("s-home-6", "home", "🖼️",
    ["Floating wall shelves, set of 2", "Decor", "Minimal wooden shelves with hidden brackets for books and plants.", ["Solid wood", "Hidden brackets", "60 cm long"]],
    ["Tablettes murales flottantes, lot de 2", "Déco", "Des tablettes en bois épurées à fixations invisibles pour livres et plantes.", ["Bois massif", "Fixations invisibles", "60 cm de long"]],
    1590, 1240, [10, 15], 1980),

  // Accessoires tech
  p("s-tech-1", "tech", "📱",
    ["Adjustable aluminium phone stand", "Desk", "A sturdy, foldable stand for video calls, recipes and streaming.", ["Aluminium alloy", "Adjustable angle", "Folds flat"]],
    ["Support de téléphone ajustable en aluminium", "Bureau", "Un support solide et pliable pour les appels vidéo, les recettes et les vidéos.", ["Alliage d'aluminium", "Angle ajustable", "Se plie à plat"]],
    450, 350, [7, 12], 7150),
  p("s-tech-2", "tech", "🔋",
    ["3-in-1 wireless charging station", "Charging", "Charges a phone, earbuds and a watch at the same time.", ["15 W fast charging", "3 devices", "Non-slip base"]],
    ["Station de recharge sans fil 3 en 1", "Recharge", "Recharge en même temps un téléphone, des écouteurs et une montre.", ["Recharge rapide 15 W", "3 appareils", "Base antidérapante"]],
    1560, 690, [8, 13], 6420),
  p("s-tech-3", "tech", "🗂️",
    ["Felt desk mat, 80 × 30 cm", "Desk", "A soft felt mat that protects the desk and keeps the mouse gliding.", ["Wool felt", "80 × 30 cm", "Non-slip back"]],
    ["Sous-main en feutre, 80 × 30 cm", "Bureau", "Un tapis en feutre doux qui protège le bureau et facilite la souris.", ["Feutre de laine", "80 × 30 cm", "Dos antidérapant"]],
    720, 610, [8, 13], 2890),
  p("s-tech-4", "tech", "🎧",
    ["Under-desk headphone hanger", "Desk", "A clamp-on hook that keeps headphones tidy and off the desk.", ["No-drill clamp", "Rotates 360°", "Holds 2 headsets"]],
    ["Crochet à casque sous le bureau", "Bureau", "Un crochet à pince qui range le casque hors du bureau.", ["Pince sans perçage", "Rotation 360°", "Tient 2 casques"]],
    330, 270, [7, 12], 3310),
  p("s-tech-5", "tech", "🔌",
    ["Cable organizer box", "Charging", "Hides power strips and loose cables for a tidy setup.", ["Fits most power bars", "Cable slots on both sides", "Fire-retardant ABS"]],
    ["Boîte cache-câbles", "Recharge", "Cache les multiprises et les câbles pour un coin bureau bien rangé.", ["Pour la plupart des multiprises", "Fentes des deux côtés", "ABS ignifuge"]],
    890, 780, [9, 14], 2470),
  p("s-tech-6", "tech", "💻",
    ["Ergonomic laptop riser", "Desk", "Lifts the laptop to eye level and improves airflow.", ["6 height levels", "Aluminium", "Folds to pocket size"]],
    ["Support ergonomique pour portable", "Bureau", "Élève l'ordinateur à hauteur des yeux et améliore la ventilation.", ["6 hauteurs", "Aluminium", "Se plie en format poche"]],
    1190, 760, [8, 13], 5580),

  // Plein air et voyage
  p("s-outdoor-1", "outdoor", "🏕️",
    ["Rechargeable camping lantern", "Camping", "A bright, collapsible lantern that doubles as a power bank.", ["3 light modes", "USB-C rechargeable", "Water resistant"]],
    ["Lanterne de camping rechargeable", "Camping", "Une lanterne lumineuse et pliable qui sert aussi de batterie d'appoint.", ["3 modes d'éclairage", "Recharge USB-C", "Résiste aux éclaboussures"]],
    1090, 680, [8, 13], 4380),
  p("s-outdoor-2", "outdoor", "🎒",
    ["Packing cubes, set of 6", "Travel", "Lightweight zipped cubes that keep suitcases organized.", ["6 sizes", "Mesh top panel", "Water-repellent fabric"]],
    ["Cubes de rangement de voyage, lot de 6", "Voyage", "Des cubes zippés et légers qui gardent la valise bien rangée.", ["6 tailles", "Dessus en filet", "Tissu déperlant"]],
    980, 720, [9, 14], 5120),
  p("s-outdoor-3", "outdoor", "🪑",
    ["Ultralight folding camp chair", "Camping", "A compact chair that packs into its own bag for hikes and festivals.", ["Holds 120 kg", "1 kg", "Carry bag included"]],
    ["Chaise de camping pliante ultralégère", "Camping", "Une chaise compacte qui se range dans son sac pour la randonnée et les festivals.", ["Supporte 120 kg", "1 kg", "Sac de transport inclus"]],
    1890, 1360, [10, 15], 2650),
  p("s-outdoor-4", "outdoor", "🧭",
    ["Waterproof dry bag, 20 L", "Hiking", "Keeps clothes and electronics dry while kayaking or hiking.", ["20 litres", "Roll-top closure", "Shoulder strap"]],
    ["Sac étanche, 20 L", "Randonnée", "Garde vêtements et appareils au sec en kayak ou en randonnée.", ["20 litres", "Fermeture à enroulement", "Bandoulière"]],
    760, 610, [8, 13], 3170),
  p("s-outdoor-5", "outdoor", "🔦",
    ["Rechargeable LED headlamp", "Hiking", "A light, bright headlamp with a motion-sensor mode.", ["Motion sensor", "USB-C rechargeable", "5 modes"]],
    ["Lampe frontale LED rechargeable", "Randonnée", "Une lampe frontale légère et puissante avec mode détecteur de mouvement.", ["Détecteur de mouvement", "Recharge USB-C", "5 modes"]],
    560, 400, [8, 12], 4960),
  p("s-outdoor-6", "outdoor", "🛏️",
    ["Neck travel pillow with memory foam", "Travel", "Supportive memory-foam pillow with a washable cover for long trips.", ["Memory foam", "Washable cover", "Compression bag"]],
    ["Oreiller de voyage en mousse à mémoire", "Voyage", "Un oreiller cervical en mousse à mémoire avec housse lavable pour les longs trajets.", ["Mousse à mémoire de forme", "Housse lavable", "Sac de compression"]],
    830, 640, [8, 13], 3780),
];

/** Exemples présentés comme populaires sur TikTok (démo du filtre « Tendance TikTok »). */
export const SAMPLE_TIKTOK = new Set(["s-kitchen-2", "s-fitness-1", "s-fitness-3", "s-pets-1", "s-pets-2", "s-home-2", "s-tech-1", "s-outdoor-3"]);
/** Exemples présentés comme « en hausse » (indicateur « tendance » de CJ). */
export const SAMPLE_RISING = new Set(["s-kitchen-2", "s-pets-1", "s-home-4", "s-tech-3"]);
