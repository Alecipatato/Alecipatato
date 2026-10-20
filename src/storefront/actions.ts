"use server";

import { getOrigin } from "@/lib/auth";
import { DEMO_STORES } from "@/lib/demo-stores";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { CheckoutError, createCheckoutSession } from "@/lib/payments/checkout";
import { getStoreBySite } from "@/lib/stores";
import { PaymentsNotConfiguredError } from "@/lib/stripe";
import { getStoreBase } from "./components";

/** Bouton « Passer à la caisse » : renvoie l'adresse de la page de paiement Stripe. */
export async function startCheckout(
  site: string,
  lines: { productId: string; quantity: number }[],
): Promise<{ url?: string; error?: string }> {
  const data = await getStoreBySite(site);
  const t = (await getMessages(data?.store.language)).storefront.errors;
  if (DEMO_STORES[site]) return { error: t.demo };
  if (!data) return { error: t.unavailable };
  if (!Array.isArray(lines)) return { error: t.invalidCart };

  try {
    const storeUrl = `${await getOrigin()}${await getStoreBase(site)}`;
    const url = await createCheckoutSession({ storeId: data.store.id, lines, storeUrl });
    return { url };
  } catch (err) {
    if (err instanceof CheckoutError) return { error: fmt(t[err.code], { title: err.productTitle ?? "" }) };
    if (err instanceof PaymentsNotConfiguredError) return { error: t.notConfigured };
    console.error("Passage à la caisse :", err);
    return { error: t.generic };
  }
}
