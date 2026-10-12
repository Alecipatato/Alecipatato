"use server";

import { getOrigin } from "@/lib/auth";
import { DEMO_STORES } from "@/lib/demo-stores";
import { CheckoutError, createCheckoutSession } from "@/lib/payments/checkout";
import { getStoreBySite } from "@/lib/stores";
import { PaymentsNotConfiguredError } from "@/lib/stripe";
import { getStoreBase } from "./components";

/** Bouton « Passer à la caisse » : renvoie l'adresse de la page de paiement Stripe. */
export async function startCheckout(
  site: string,
  lines: { productId: string; quantity: number }[],
): Promise<{ url?: string; error?: string }> {
  if (DEMO_STORES[site]) return { error: "Boutique de démonstration : le paiement est désactivé." };
  const data = await getStoreBySite(site);
  if (!data) return { error: "Cette boutique n'est pas disponible." };
  if (!Array.isArray(lines)) return { error: "Panier invalide." };

  try {
    const storeUrl = `${await getOrigin()}${await getStoreBase(site)}`;
    const url = await createCheckoutSession({ storeId: data.store.id, lines, storeUrl });
    return { url };
  } catch (err) {
    if (err instanceof CheckoutError || err instanceof PaymentsNotConfiguredError) return { error: err.message };
    console.error("Passage à la caisse :", err);
    return { error: "Le paiement n'a pas pu démarrer. Réessayez dans un instant." };
  }
}
