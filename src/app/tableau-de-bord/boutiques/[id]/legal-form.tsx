"use client";

import { useActionState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { StoreLegalInfo } from "@/lib/legal/store-legal";
import { updateStoreLegal } from "../../actions";

/** Informations légales : nom légal, adresse, responsable Loi 25, délai de retour. */
export function LegalForm({ storeId, info }: { storeId: string; info: StoreLegalInfo }) {
  const [state, action] = useActionState(updateStoreLegal, {});
  const t = useI18n().m.legal.form;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="store_id" value={storeId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <Field label={t.legalName} id="legal_name">
        <input id="legal_name" name="legal_name" maxLength={120} defaultValue={info.legalName} className={inputClasses} />
      </Field>
      <Field label={t.address} id="address" hint={t.addressHint}>
        <textarea id="address" name="address" rows={2} maxLength={300} defaultValue={info.address} className={inputClasses} />
      </Field>
      <Field label={t.privacyOfficer} id="privacy_officer" hint={t.privacyOfficerHint}>
        <input id="privacy_officer" name="privacy_officer" maxLength={120} defaultValue={info.privacyOfficer} className={inputClasses} />
      </Field>
      <Field label={t.returnDays} id="return_days">
        <input id="return_days" name="return_days" type="number" min={14} max={90} required defaultValue={info.returnDays} className={`${inputClasses} w-28`} />
      </Field>
      <SubmitButton variant="secondary" pendingLabel={t.pending}>{t.submit}</SubmitButton>
    </form>
  );
}
