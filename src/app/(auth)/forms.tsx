"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, GoogleIcon, inputClasses, SubmitButton } from "@/components/ui";
import {
  type FormState,
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
} from "./actions";

const initial: FormState = {};

export function GoogleButton({ next, label }: { next?: string; label: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next ?? ""} />
      <SubmitButton variant="secondary" className="w-full" pendingLabel="Redirection vers Google…">
        <GoogleIcon />
        {label}
      </SubmitButton>
    </form>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function PasswordInput({ id, name, autoComplete }: { id: string; name: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={8}
        className={`${inputClasses} pr-20`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-medium text-muted hover:text-ink"
      >
        {visible ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Courriel" id="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClasses} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
          <Link href="/mot-de-passe-oublie" className="text-xs font-medium text-brand hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </div>
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label="Nom complet" id="full_name">
        <input id="full_name" name="full_name" autoComplete="name" required className={inputClasses} />
      </Field>
      <Field label="Courriel" id="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClasses} />
      </Field>
      <Field label="Mot de passe" id="password" hint="Au moins 8 caractères, avec des lettres et des chiffres.">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
        <span>
          J&apos;accepte les conditions d&apos;utilisation, dont la commission de 15 % sur la marge brute de chaque vente.
        </span>
      </label>
      <SubmitButton pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  if (state.message) return <Alert kind="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label="Courriel" id="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClasses} />
      </Field>
      <SubmitButton pendingLabel="Envoi…">Recevoir le lien</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label="Nouveau mot de passe" id="password" hint="Au moins 8 caractères, avec des lettres et des chiffres.">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirmez le mot de passe" id="password_confirm">
        <PasswordInput id="password_confirm" name="password_confirm" autoComplete="new-password" />
      </Field>
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmation, { email });
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <input type="hidden" name="email" value={state.email ?? email} />
      <SubmitButton variant="secondary" pendingLabel="Envoi…">Renvoyer le courriel</SubmitButton>
    </form>
  );
}

