import Stripe from "stripe";

/**
 * Client Stripe côté serveur.
 * Sécurité : les clés LIVE (sk_live_…) sont refusées tant que STRIPE_ALLOW_LIVE
 * n'est pas explicitement à "true" (règle du projet : clés test uniquement).
 */

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("Les paiements ne sont pas encore configurés (clé STRIPE_SECRET_KEY manquante).");
  }
}

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentsNotConfiguredError();
  if (key.startsWith("sk_live_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Clé Stripe LIVE refusée : seules les clés de test sont autorisées pour l'instant.");
  }

  // STRIPE_API_BASE : serveur Stripe simulé pour les tests locaux (jamais avec une clé live).
  const base = !key.startsWith("sk_live_") && process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;

  cached = new Stripe(key, {
    // Client « fetch » : fonctionne aussi sur Cloudflare Workers.
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    appInfo: { name: "Kreo" },
    ...(base && {
      host: base.hostname,
      port: Number(base.port) || (base.protocol === "http:" ? 80 : 443),
      protocol: base.protocol === "http:" ? "http" : "https",
    }),
  });
  return cached;
}

/** Stripe Tax activé par défaut ; STRIPE_AUTOMATIC_TAX=false le désactive (ex. avant d'avoir configuré Stripe Tax). */
export function automaticTaxEnabled(): boolean {
  return process.env.STRIPE_AUTOMATIC_TAX !== "false";
}
