/**
 * Guides publicitaires pas à pas (étape E-a). Les textes sont traduits (messages ads.guides) ;
 * ici seulement la structure : guides, étapes, vérifications automatiques et liens internes.
 * Une étape « auto » est cochée d'après les données de la boutique ; les autres sont cochées par le vendeur
 * (table ad_guide_progress).
 */

export type AutoCheck = "products" | "legal" | "online" | "content" | "metaPixel" | "tiktokPixel";
/** Écran de la plateforme où faire l'étape (relatif à /tableau-de-bord/boutiques/<id>). */
export type StepLink = "products" | "store" | "marketing";

export interface GuideStep {
  id: string;
  auto?: AutoCheck;
  link?: StepLink;
}

export const AD_GUIDES = [
  {
    id: "prepare",
    steps: [
      { id: "products", auto: "products", link: "products" },
      { id: "legal", auto: "legal", link: "store" },
      { id: "online", auto: "online", link: "store" },
      { id: "content", auto: "content", link: "marketing" },
      { id: "budget" },
    ],
  },
  {
    id: "meta",
    steps: [
      { id: "business" },
      { id: "adAccount" },
      { id: "pixel", auto: "metaPixel", link: "marketing" },
      { id: "campaign" },
      { id: "audience" },
      { id: "budget" },
      { id: "creative", link: "marketing" },
      { id: "launch" },
    ],
  },
  {
    id: "tiktok",
    steps: [
      { id: "account" },
      { id: "pixel", auto: "tiktokPixel", link: "marketing" },
      { id: "campaign" },
      { id: "adGroup" },
      { id: "video", link: "marketing" },
      { id: "spark" },
      { id: "launch" },
    ],
  },
  {
    id: "organic",
    steps: [
      { id: "profile" },
      { id: "script", link: "marketing" },
      { id: "film" },
      { id: "post" },
      { id: "rhythm" },
      { id: "reply" },
    ],
  },
  {
    id: "results",
    steps: [
      { id: "wait" },
      { id: "metrics" },
      { id: "stop" },
      { id: "scale" },
      { id: "refresh" },
    ],
  },
] as const satisfies readonly { id: string; steps: readonly GuideStep[] }[];

export type GuideId = (typeof AD_GUIDES)[number]["id"];

/** Clé d'une étape en base : « guide.étape » (ex. « meta.campaign »). */
export const stepKey = (guide: string, step: string) => `${guide}.${step}`;

/** Étapes cochables à la main (les étapes automatiques ne le sont pas). */
export function isManualStep(key: string): boolean {
  const [guideId, stepId] = key.split(".");
  const guide = AD_GUIDES.find((g) => g.id === guideId);
  const step = (guide?.steps as readonly GuideStep[] | undefined)?.find((s) => s.id === stepId);
  return Boolean(step && !step.auto);
}
