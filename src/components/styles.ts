/**
 * Classes CSS partagées. Fichier sans "use client" : utilisable par les pages
 * générées côté serveur comme par les composants interactifs.
 */

export const buttonClasses = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-60",
  ghost: "inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline",
};

export const inputClasses =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
