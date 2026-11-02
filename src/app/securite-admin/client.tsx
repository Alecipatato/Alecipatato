"use client";

import { useActionState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { type MfaState, startTotpEnrollment, verifyTotp } from "./actions";

function CodeForm({ state, action, mode }: { state: MfaState & { factorId: string }; action: (formData: FormData) => void; mode: "enroll" | "verify" }) {
  const { m } = useI18n();
  const t = m.admin.mfa;
  return (
    <form action={action} className="flex flex-col gap-4" data-mfa-verify>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="factor_id" value={state.factorId} />
      <input type="hidden" name="mode" value={mode} />
      <Field label={t.code} id="code">
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus className={`${inputClasses} max-w-40 text-center font-mono text-lg tracking-widest`} />
      </Field>
      <div><SubmitButton pendingLabel={t.verifying}>{t.verify}</SubmitButton></div>
    </form>
  );
}

/** Première configuration : afficher le code QR, puis vérifier un code. */
export function EnrollTotp() {
  const { m } = useI18n();
  const t = m.admin.mfa;
  const [enroll, startAction] = useActionState(startTotpEnrollment, {} as MfaState);
  const [verify, verifyAction] = useActionState(verifyTotp, {} as MfaState);
  if (!enroll.factorId) {
    return (
      <form action={startAction} className="flex flex-col gap-4">
        {enroll.error && <Alert kind="error">{enroll.error}</Alert>}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">{t.setupSteps.map((step) => <li key={step}>{step}</li>)}</ol>
        <div><SubmitButton>{t.start}</SubmitButton></div>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- code QR fourni par Supabase (image SVG en data URI) */}
        <img src={enroll.qr} alt="QR" width={180} height={180} className="rounded-xl border border-line bg-white p-2" data-mfa-qr />
        <div className="min-w-0">
          <p className="text-sm font-medium">{t.secret}</p>
          <code data-mfa-secret className="mt-1 block break-all rounded-lg bg-paper px-3 py-2 font-mono text-sm">{enroll.secret}</code>
        </div>
      </div>
      <CodeForm state={{ error: verify.error, factorId: enroll.factorId }} action={verifyAction} mode="enroll" />
    </div>
  );
}

/** Connexions suivantes : un code de l'application suffit. */
export function VerifyTotp({ factorId }: { factorId: string }) {
  const [state, action] = useActionState(verifyTotp, { factorId } as MfaState);
  return <CodeForm state={{ ...state, factorId }} action={action} mode="verify" />;
}
