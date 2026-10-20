import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Messages } from "./i18n/messages";
import { createAdminClient } from "./supabase/admin";
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

/** L'utilisateur a-t-il le rôle administrateur (profiles.role = 'admin') ? */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

/** Administrateur connecté, sinon page introuvable (on ne révèle pas l'existence de l'espace admin). */
export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) notFound();
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

/** Erreurs Supabase Auth → clé du message clair (messages auth.errors). */
export function authErrorKey(error: { code?: string }): keyof Messages["auth"]["errors"] {
  switch (error.code) {
    case "invalid_credentials":
    case "email_not_confirmed":
    case "weak_password":
    case "same_password":
    case "signup_disabled":
      return error.code;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limit";
    case "user_already_exists":
    case "email_exists":
      return "user_exists";
    default:
      return "generic";
  }
}
