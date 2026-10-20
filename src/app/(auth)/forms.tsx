"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, GoogleIcon, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
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
  const { m } = useI18n();
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next ?? ""} />
      <SubmitButton variant="secondary" className="w-full" pendingLabel={m.auth.google.redirecting}>
        <GoogleIcon />
        {label}
      </SubmitButton>
    </form>
  );
}

export function Divider() {
  const { m } = useI18n();
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
      <span className="h-px flex-1 bg-line" />
      {m.auth.or}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function PasswordInput({ id, name, autoComplete }: { id: string; name: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  const { m } = useI18n();
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
        {visible ? m.auth.hide : m.auth.show}
      </button>
    </div>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial);
  const { auth: t } = useI18n().m;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={t.email} id="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClasses} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">{t.password}</label>
          <Link href="/mot-de-passe-oublie" className="text-xs font-medium text-brand hover:underline">
            {t.signIn.forgot}
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </div>
      <SubmitButton pendingLabel={t.signIn.pending}>{t.signIn.submit}</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initial);
  const { auth: t } = useI18n().m;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.signUp.fullName} id="full_name">
        <input id="full_name" name="full_name" autoComplete="name" required className={inputClasses} />
      </Field>
      <Field label={t.email} id="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClasses} />
      </Field>
      <Field label={t.password} id="password" hint={t.passwordHint}>
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
        <span>{t.signUp.terms}</span>
      </label>
      <SubmitButton pendingLabel={t.signUp.pending}>{t.signUp.submit}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  const { auth: t } = useI18n().m;
  if (state.message) return <Alert kind="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.email} id="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClasses} />
      </Field>
      <SubmitButton pendingLabel={t.forgot.pending}>{t.forgot.submit}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  const { auth: t } = useI18n().m;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.reset.newPassword} id="password" hint={t.passwordHint}>
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label={t.reset.confirm} id="password_confirm">
        <PasswordInput id="password_confirm" name="password_confirm" autoComplete="new-password" />
      </Field>
      <SubmitButton pendingLabel={t.reset.pending}>{t.reset.submit}</SubmitButton>
    </form>
  );
}

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmation, { email });
  const { auth: t } = useI18n().m;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <input type="hidden" name="email" value={state.email ?? email} />
      <SubmitButton variant="secondary" pendingLabel={t.checkEmail.pending}>{t.checkEmail.resend}</SubmitButton>
    </form>
  );
}

