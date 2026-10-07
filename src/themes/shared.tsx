import type { CSSProperties } from "react";
import { googleFontsUrl } from "@/lib/store-config";
import type { StoreConfig, StoreProduct } from "@/lib/types";

/**
 * Transforme les couleurs/polices du JSON en variables CSS, utilisables dans
 * Tailwind : `bg-[var(--store-primary)]`, `font-[family-name:var(--store-font-heading)]`…
 */
export function storeCssVars(config: StoreConfig): CSSProperties {
  return {
    "--store-primary": config.colors.primary,
    "--store-accent": config.colors.accent,
    "--store-bg": config.colors.background,
    "--store-text": config.colors.text,
    "--store-font-heading": `"${config.fonts.heading}", ui-serif, Georgia, serif`,
    "--store-font-body": `"${config.fonts.body}", ui-sans-serif, system-ui, sans-serif`,
  } as CSSProperties;
}

/** Charge les polices Google de la boutique (React place la balise dans <head>). */
export function StoreFonts({ config }: { config: StoreConfig }) {
  return <link rel="stylesheet" href={googleFontsUrl(config)} precedence="default" />;
}

/** Image du produit (fournisseur), ou visuel de remplacement s'il n'y en a pas. */
export function ProductImage({ product, className = "" }: { product: StoreProduct; className?: string }) {
  const src = product.images[0];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- images CJ : optimisation décidée en phase 3
    return <img src={src} alt={product.title} className={`object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center bg-gradient-to-br from-[var(--store-primary)] to-[var(--store-accent)] text-5xl font-bold text-white/80 ${className}`}
    >
      {product.title.charAt(0)}
    </div>
  );
}
