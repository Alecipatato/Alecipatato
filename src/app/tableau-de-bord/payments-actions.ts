"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrigin, requireUser } from "@/lib/auth";
import { createExpressDashboardLink, createOnboardingLink, ensureConnectedAccount } from "@/lib/payments/connect";
import { recordRefund } from "@/lib/payments/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export type RefundState = { error?: string };

/** Démarre (ou reprend) l'inscription Stripe Express pour recevoir les versements. */
export async function startPayoutOnboarding() {
  const user = await requireUser();
  let url: string;
  try {
    const accountId = await ensureConnectedAccount(user);
    url = await createOnboardingLink(accountId, await getOrigin());
  } catch (err) {
    console.error("Inscription Stripe :", err);
    redirect("/tableau-de-bord/paiements?stripe=erreur");
  }
  redirect(url);
}

/** Ouvre l'espace Stripe Express du client (coordonnées bancaires, historique des virements). */
export async function openStripeDashboard() {
  const user = await requireUser();
  const { data: profile } = await createAdminClient().from("profiles").select("stripe_account_id").eq("id", user.id).single();
  if (!profile?.stripe_account_id) redirect("/tableau-de-bord/paiements");
  let url: string;
  try {
    url = await createExpressDashboardLink(profile.stripe_account_id);
  } catch (err) {
    console.error("Lien Stripe Express :", err);
    redirect("/tableau-de-bord/paiements?stripe=erreur");
  }
  redirect(url);
}

/** « 12,50 » ou « 12.50 » → 1250 cents. */
function parseAmountCents(text: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim().replace(/\s|\$/g, ""));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

const REFUNDABLE = ["paid", "partially_refunded", "sent_to_supplier", "shipped", "delivered"];

/** Rembourse un acheteur (totalement ou partiellement). Les règles de partage s'appliquent automatiquement. */
export async function refundOrder(_prev: RefundState, formData: FormData): Promise<RefundState> {
  const user = await requireUser();
  const admin = createAdminClient();
  const orderId = String(formData.get("order_id") ?? "");

  const { data: order } = await admin
    .from("orders")
    .select("id, store_id, order_number, status, total_cents, refunded_cents, currency, stripe_payment_intent_id, disputed, stores!inner(owner_id)")
    .eq("id", orderId)
    .maybeSingle();
  const owner = (order?.stores as unknown as { owner_id: string } | null)?.owner_id;
  if (!order || owner !== user.id) return { error: "Commande introuvable." };
  if (!REFUNDABLE.includes(order.status) || !order.stripe_payment_intent_id) return { error: "Cette commande ne peut pas être remboursée." };
  if (order.disputed) return { error: "Un litige est en cours sur cette commande : le remboursement passe par Stripe." };

  const remaining = Number(order.total_cents) - Number(order.refunded_cents);
  const amountText = String(formData.get("amount") ?? "").trim();
  const amount = amountText ? parseAmountCents(amountText) : remaining;
  if (amount === null || amount <= 0) return { error: "Montant invalide." };
  if (amount > remaining) return { error: "Le montant dépasse ce qui reste à rembourser." };

  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount,
        reason: "requested_by_customer",
        metadata: { order_id: order.id, requested_by: user.id },
      },
      { idempotencyKey: `refund-${order.id}-${order.refunded_cents}-${amount}` },
    );
    // Enregistré tout de suite (le webhook, s'il arrive ensuite, est ignoré).
    await recordRefund(refund);
  } catch (err) {
    console.error("Remboursement :", err);
    return { error: "Le remboursement a échoué. Réessayez ou contactez le support." };
  }

  // Confirmation affichée en haut de la liste (le formulaire disparaît si tout est remboursé).
  revalidatePath(`/tableau-de-bord/boutiques/${order.store_id}/commandes`);
  redirect(`/tableau-de-bord/boutiques/${order.store_id}/commandes?rembourse=${encodeURIComponent(order.order_number)}`);
}
