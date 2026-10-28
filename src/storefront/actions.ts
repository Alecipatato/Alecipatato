"use server";

import { headers } from "next/headers";
import { getOrigin } from "@/lib/auth";
import { DEMO_STORES } from "@/lib/demo-stores";
import { fmt } from "@/lib/i18n/config";
import { sendEmail } from "@/lib/email/resend";
import { getMessages } from "@/lib/i18n/server";
import { CheckoutError, createCheckoutSession } from "@/lib/payments/checkout";
import { getStoreBySite } from "@/lib/stores";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentsNotConfiguredError } from "@/lib/stripe";
import { getStoreBase } from "./components";

/** Bouton « Passer à la caisse » : renvoie l'adresse de la page de paiement Stripe. */
export async function startCheckout(
  site: string,
  lines: { productId: string; variantId?: string; quantity: number }[],
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

export type ContactState = { sent?: boolean; error?: string };

/** Formulaire « Nous joindre » : message enregistré et envoyé au propriétaire (réponse directe à l'acheteur). */
export async function sendContactMessage(site: string, _prev: ContactState, formData: FormData): Promise<ContactState> {
  const data = await getStoreBySite(site);
  const t = (await getMessages(data?.store.language)).emails;
  if (!data) return { error: t.contact.errors.failed };
  // Champ piège invisible : rempli seulement par les robots.
  if (String(formData.get("website") ?? "")) return { sent: true };

  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const orderNumber = String(formData.get("order_number") ?? "").trim().toUpperCase().slice(0, 20);
  const message = String(formData.get("message") ?? "").trim().slice(0, 3000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) return { error: t.contact.errors.invalid };
  if (DEMO_STORES[site]) return { sent: true }; // boutiques de démonstration : rien n'est envoyé

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("contact_messages").select("id", { count: "exact", head: true }).eq("store_id", data.store.id).eq("email", email).gte("created_at", since);
  if ((count ?? 0) >= 5) return { error: t.contact.errors.tooMany };

  const { error } = await admin.from("contact_messages").insert({ store_id: data.store.id, name, email, order_number: orderNumber || null, message });
  if (error) {
    console.error("Message de contact :", error);
    return { error: t.contact.errors.failed };
  }

  const { data: owner } = await admin.from("stores").select("profiles(email)").eq("id", data.store.id).single();
  const to = data.store.contactEmail ?? (owner?.profiles as unknown as { email: string } | null)?.email;
  if (to) {
    const vars = { name, email, store: data.store.name, message, order: orderNumber ? fmt(t.contactNotice.order, { number: orderNumber }) : "" };
    await sendEmail({ to, subject: fmt(t.contactNotice.subject, vars), text: fmt(t.contactNotice.body, vars), replyTo: email });
  }
  return { sent: true };
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

/** Compte une page vue (et un visiteur au premier affichage de la session). Les robots sont ignorés. */
export async function recordVisit(site: string, newVisitor: boolean): Promise<void> {
  if (DEMO_STORES[site]) return;
  if (BOT.test((await headers()).get("user-agent") ?? "")) return;
  const data = await getStoreBySite(site);
  if (!data) return;
  const { error } = await createAdminClient().rpc("record_store_visit", { p_store_id: data.store.id, p_new_visitor: newVisitor === true });
  if (error) console.error("Statistiques de visite :", error.message);
}
