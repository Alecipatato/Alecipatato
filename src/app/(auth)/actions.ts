"use server";

import { redirect } from "next/navigation";
import { authErrorMessage, getOrigin, safeNextPath } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string; email?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(formData: FormData) {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Le mot de passe doit contenir des lettres et des chiffres.";
  }
  return null;
}

/** Création de compte par courriel : Supabase envoie le courriel de confirmation. */
export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 100);

  if (!EMAIL_PATTERN.test(email)) return { error: "Adresse courriel invalide.", email };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, email };
  if (formData.get("terms") !== "on") return { error: "Vous devez accepter les conditions d'utilisation.", email };

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=/tableau-de-bord`,
      data: { full_name: fullName },
    },
  });
  if (error) return { error: authErrorMessage(error), email };

  // Confirmation désactivée (rare) : l'utilisateur est déjà connecté.
  if (data.session) redirect("/tableau-de-bord");
  redirect(`/verifier-courriel?courriel=${encodeURIComponent(email)}`);
}

/** Connexion courriel + mot de passe. */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Entrez votre courriel et votre mot de passe.", email };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error), email };

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

/** Connexion ou inscription avec Google (redirection vers Google). */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await getOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/connexion?erreur=google");
  redirect(data.url);
}

/** Envoie le courriel « mot de passe oublié ». */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  if (!EMAIL_PATTERN.test(email)) return { error: "Adresse courriel invalide.", email };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reinitialiser-mot-de-passe`,
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { error: authErrorMessage(error), email };
  }
  // Même message que le compte existe ou non : on ne révèle pas quelles adresses sont inscrites.
  return {
    message: "Si un compte existe avec cette adresse, vous allez recevoir un courriel avec un lien pour choisir un nouveau mot de passe.",
    email,
  };
}

/** Enregistre le nouveau mot de passe (après le lien reçu par courriel). */
export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("password_confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Ce lien a expiré. Refaites une demande de réinitialisation." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };
  redirect("/tableau-de-bord?message=mot-de-passe-modifie");
}

/** Renvoie le courriel de confirmation d'inscription. */
export async function resendConfirmation(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  if (!EMAIL_PATTERN.test(email)) return { error: "Adresse courriel invalide.", email };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await getOrigin()}/auth/callback?next=/tableau-de-bord` },
  });
  if (error) return { error: authErrorMessage(error), email };
  return { message: "Courriel renvoyé. Pensez à vérifier vos indésirables.", email };
}

export async function signOut() {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/");
}
