"use client";

import { useOptimistic, useTransition } from "react";
import { setGuideStep } from "@/app/tableau-de-bord/ads-actions";
import { useI18n } from "@/lib/i18n/client";

/** Case à cocher d'une étape manuelle d'un guide (enregistrée tout de suite). */
export function StepToggle({ storeId, stepKey, done }: { storeId: string; stepKey: string; done: boolean }) {
  const { m } = useI18n();
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimistic}
      aria-label={optimistic ? m.ads.guides.markTodo : m.ads.guides.markDone}
      data-step-toggle={stepKey}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await setGuideStep(storeId, stepKey, !optimistic);
        })
      }
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-sm font-bold transition ${optimistic ? "border-brand bg-brand text-white" : "border-line bg-white text-transparent hover:border-brand"}`}
    >
      ✓
    </button>
  );
}
