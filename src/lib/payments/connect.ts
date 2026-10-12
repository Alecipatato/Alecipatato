import type Stripe from "stripe";
import { createAdminClient } from "../supabase/admin";
import { getStripe } from "../stripe";

/**
 * Stripe Connect Express : chaque client a un compte Stripe « connecté » qui
 * reçoit ses versements. Stripe gère la vérification d'identité et les
 * coordonnées bancaires ; la plateforme ne voit jamais ces informations.
 */

export interface ConnectStatus {
  accountId: string | null;
  /** Le client peut recevoir des versements (capacité « transfers » active). */
  ready: boolean;
  detailsSubmitted: boolean;
}

export function accountIsReady(account: Pick<Stripe.Account, "details_submitted" | "capabilities">): boolean {
  return Boolean(account.details_submitted) && account.capabilities?.transfers === "active";
}

/** Crée le compte Express du client s'il n'existe pas encore. */
export async function ensureConnectedAccount(user: { id: string; email?: string | null }): Promise<string> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_account_id").eq("id", user.id).single();
  if (profile?.stripe_account_id) return profile.stripe_account_id;

  const account = await getStripe().accounts.create(
    {
      type: "express",
      country: "CA",
      email: user.email ?? undefined,
      default_currency: "cad",
      // Charges sur le compte de la plateforme, puis transferts : seule la capacité « transfers » est requise.
      capabilities: { transfers: { requested: true } },
      metadata: { user_id: user.id },
    },
    { idempotencyKey: `connect-account-${user.id}` },
  );

  await admin.from("profiles").update({ stripe_account_id: account.id }).eq("id", user.id);
  return account.id;
}

/** Lien vers le formulaire Stripe (identité, compte bancaire). Valable quelques minutes. */
export async function createOnboardingLink(accountId: string, origin: string): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/tableau-de-bord/paiements?stripe=rafraichir`,
    return_url: `${origin}/tableau-de-bord/paiements?stripe=retour`,
  });
  return link.url;
}

/** Relit l'état du compte chez Stripe et le mémorise dans le profil. */
export async function refreshConnectStatus(userId: string): Promise<ConnectStatus> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_account_id").eq("id", userId).single();
  if (!profile?.stripe_account_id) return { accountId: null, ready: false, detailsSubmitted: false };

  const account = await getStripe().accounts.retrieve(profile.stripe_account_id);
  const ready = accountIsReady(account);
  await admin.from("profiles").update({ stripe_onboarding_complete: ready }).eq("id", userId);
  return { accountId: account.id, ready, detailsSubmitted: Boolean(account.details_submitted) };
}

/** Lien de connexion au tableau de bord Stripe Express du client (versements, coordonnées bancaires). */
export async function createExpressDashboardLink(accountId: string): Promise<string> {
  const link = await getStripe().accounts.createLoginLink(accountId);
  return link.url;
}
