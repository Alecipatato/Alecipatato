"use client";

import { useActionState } from "react";
import { inputClasses } from "@/components/styles";
import { SubmitButton } from "@/components/ui";
import { formatPrice } from "@/lib/store-config";
import { refundOrder } from "../../../payments-actions";

export function RefundForm({ orderId, remainingCents, currency }: { orderId: string; remainingCents: number; currency: string }) {
  const [state, action] = useActionState(refundOrder, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Montant (vide = tout, {formatPrice(remainingCents, currency)})
        <input name="amount" inputMode="decimal" placeholder="ex. 12,50" className={`${inputClasses} w-36 py-2`} />
      </label>
      <SubmitButton variant="secondary" className="py-2" pendingLabel="Remboursement…">Rembourser</SubmitButton>
      {state.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
