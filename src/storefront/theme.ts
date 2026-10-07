import type { CSSProperties } from "react";
import { contrastRatio, readableOn } from "@/lib/store-config";
import type { Store, ThemeId } from "@/lib/types";

/**
 * Toutes les boutiques partagent la même structure (style Amazon).
 * Le « thème » ne change que l'apparence : arrondis, en-tête, typographie.
 */
interface ThemeStyle {
  radius: string;
  header: "background" | "primary" | "inverted";
  headingCase: "none" | "uppercase";
  headingWeight: number;
  headingTracking: string;
}

export const THEME_STYLES: Record<ThemeId, ThemeStyle> = {
  minimal: { radius: "14px", header: "background", headingCase: "none", headingWeight: 600, headingTracking: "-0.01em" },
  bold: { radius: "2px", header: "primary", headingCase: "uppercase", headingWeight: 700, headingTracking: "0.02em" },
  elegant: { radius: "6px", header: "inverted", headingCase: "none", headingWeight: 500, headingTracking: "0" },
};

/** Variables CSS d'une boutique, lues par les composants de src/storefront. */
export function storeCssVars(store: Store): CSSProperties {
  const { colors, fonts } = store.config;
  const style = THEME_STYLES[store.theme];
  const headerBg = { background: colors.background, primary: colors.primary, inverted: colors.text }[style.header];
  const headerFg = { background: colors.text, primary: readableOn(colors.primary), inverted: colors.background }[style.header];
  // Le prix utilise la couleur d'accent seulement si elle reste lisible sur le fond.
  const price = contrastRatio(colors.accent, colors.background) >= 3 ? colors.accent : colors.text;

  return {
    "--store-primary": colors.primary,
    "--store-on-primary": readableOn(colors.primary),
    "--store-accent": colors.accent,
    "--store-on-accent": readableOn(colors.accent),
    "--store-bg": colors.background,
    "--store-text": colors.text,
    "--store-price": price,
    "--store-font-heading": `"${fonts.heading}", ui-serif, Georgia, serif`,
    "--store-font-body": `"${fonts.body}", ui-sans-serif, system-ui, sans-serif`,
    "--sf-radius": style.radius,
    "--sf-header-bg": headerBg,
    "--sf-header-fg": headerFg,
    "--sf-heading-case": style.headingCase,
    "--sf-heading-weight": String(style.headingWeight),
    "--sf-heading-tracking": style.headingTracking,
  } as CSSProperties;
}
