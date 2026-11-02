"use client";

import { useActionState, useState } from "react";
import { type CommissionTiersState, updateCommissionTiers } from "@/app/admin/actions";
import { Alert, buttonClasses, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/** Paliers modifiables : montant de départ (dollars) et taux (pour cent). */
export function TiersForm({ initial }: { initial: { from: string; rate: string }[] }) {
  const { m } = useI18n();
  const t = m.admin.commission;
  const [rows, setRows] = useState(initial.map((r, i) => ({ ...r, key: i })));
  const [state, action] = useActionState(updateCommissionTiers, {} as CommissionTiersState);
  return (
    <form action={action} className="flex flex-col gap-4" data-tiers-form>
      {state.error && <Alert kind="error">{t.errors[state.error]}</Alert>}
      {state.saved && <Alert kind="success">{t.saved}</Alert>}
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 text-sm font-medium">
        <span>{t.from}</span>
        <span>{t.rate}</span>
        <span />
        {rows.map((row, i) => (
          <div key={row.key} className="contents" data-tier-row={i}>
            <input name="from" defaultValue={row.from} readOnly={i === 0} inputMode="decimal" aria-label={t.from} className={`${inputClasses} ${i === 0 ? "bg-paper" : ""}`} />
            <input name="rate" defaultValue={row.rate} inputMode="decimal" aria-label={t.rate} className={inputClasses} />
            <button type="button" disabled={i === 0} onClick={() => setRows(rows.filter((r) => r.key !== row.key))} className={`${buttonClasses.secondary} disabled:invisible`}>
              {t.remove}
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.length < 10 && (
          <button type="button" onClick={() => setRows([...rows, { from: "", rate: "", key: Math.max(...rows.map((r) => r.key)) + 1 }])} className={buttonClasses.secondary}>
            + {t.add}
          </button>
        )}
        <SubmitButton>{t.save}</SubmitButton>
      </div>
    </form>
  );
}
