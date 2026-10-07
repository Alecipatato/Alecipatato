import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createUserClient } from "./supabase/server";

/** Utilisateur connecté (vérifié auprès de Supabase), ou null. */
export async function getCurrentUser() {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Utilisateur connecté, sinon redirection vers la page de connexion. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

/** Adresse du site telle que vue par le visiteur (ex. http://localhost:3000). */
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

/** N'accepte qu'un chemin interne (« /… ») pour éviter les redirections vers un autre site. */
export function safeNextPath(next: string | null | undefined, fallback = "/tableau-de-bord"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Traduit les erreurs Supabase Auth en messages clairs. */
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Courriel ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Votre adresse courriel n'est pas encore confirmée. Cliquez sur le lien reçu par courriel.";
    case "weak_password":
      return "Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.";
    case "same_password":
      return "Le nouveau mot de passe doit être différent de l'ancien.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    case "user_already_exists":
    case "email_exists":
      return "Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez votre mot de passe.";
    case "signup_disabled":
      return "Les inscriptions sont temporairement fermées.";
    default:
      return "Une erreur est survenue. Réessayez dans un instant.";
  }
}
