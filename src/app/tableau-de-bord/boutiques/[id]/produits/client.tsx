"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { inputClasses } from "@/components/styles";
import { Alert, Spinner, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import type { SourcingState } from "@/lib/products/sourcing";
import { rejectProduct, startNewSearch, updateProductPrice } from "../../../products-actions";

/** Erreur de recherche enregistrée (code ou détail technique) → message lisible. */
function sourcingError(error: string, m: Messages): string {
  const own = m.sales.products.sourcingErrors;
  if (error in own && error !== "generic") return own[error as keyof typeof own];
  if (error in m.errors.generation) return fmt(m.errors.generation[error as keyof typeof m.errors.generation], { reason: "" });
  return fmt(own.generic, { detail: error });
}

/** Fait avancer la recherche étape par étape et affiche la progression. */
export function SourcingRunner({ storeId, initial }: { storeId: string; initial: SourcingState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const { m } = useI18n();
  const t = m.sales.products;

  useEffect(() => {
    if (running.current || state.status === "done" || state.status === "failed") return;
    running.current = true;
    (async () => {
      let current = state;
      while (current.status !== "done" && current.status !== "failed") {
        let next: SourcingState | { error: string };
        try {
          const response = await fetch("/api/sourcing/advance", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ storeId, jobId: current.id }),
          });
          next = (await response.json()) as SourcingState | { error: string };
        } catch {
          next = { error: t.connectionLost };
        }
        // Une réponse normale contient aussi « error » (null) : on teste « status ».
        if (!("status" in next)) {
          setError(next.error);
          break;
        }
        current = next;
        setState(next);
      }
      running.current = false;
      router.refresh(); // affiche les produits trouvés
    })();
  }, [state, storeId, router, t.connectionLost]);

  const pct = state.status === "searching" ? 8 : state.status === "selecting" ? 20 : Math.min(100, 20 + Math.round((state.proposed / Math.max(state.target, 1)) * 80));

  if (state.status === "failed") {
    return <Alert kind="error">{state.error ? sourcingError(state.error, m) : t.steps.failed} {t.tryOther}</Alert>;
  }
  if (state.status === "done") return null;

  return (
    <div className="rounded-2xl border border-line bg-white p-6" role="status" aria-live="polite" data-sourcing-progress>
      <div className="flex items-center gap-3 font-medium">
        <Spinner />
        {t.steps[state.status]}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">{fmt(t.progress, { found: state.proposed, target: state.target })}</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function PriceForm({ productId, priceCents }: { productId: string; priceCents: number }) {
  const [state, action] = useActionState(updateProductPrice, {});
  const t = useI18n().m.sales.products;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <label className="sr-only" htmlFor={`price-${productId}`}>{t.price}</label>
      <input
        id={`price-${productId}`}
        name="price"
        inputMode="decimal"
        defaultValue={(priceCents / 100).toFixed(2)}
        className={`${inputClasses} w-28 py-1.5`}
      />
      <SubmitButton variant="secondary" className="px-3 py-1.5 text-xs" pendingLabel="…">{t.changePrice}</SubmitButton>
      {state.error && <p role="alert" className="w-full text-xs text-danger">{state.error}</p>}
      {state.message && <p role="status" className="w-full text-xs text-brand-strong">{state.message}</p>}
    </form>
  );
}

export function RejectForm({ productId, canReplace }: { productId: string; canReplace: boolean }) {
  const t = useI18n().m.sales.products;
  return (
    <form action={rejectProduct} className="flex flex-wrap gap-2">
      <input type="hidden" name="product_id" value={productId} />
      {canReplace && (
        <SubmitButton name="replace" value="1" variant="secondary" className="px-3 py-1.5 text-xs" pendingLabel={t.replacing}>
          {t.replace}
        </SubmitButton>
      )}
      <SubmitButton variant="secondary" className="px-3 py-1.5 text-xs" pendingLabel="…">{t.reject}</SubmitButton>
    </form>
  );
}

export function NewSearchForm({ storeId, defaultKeywords }: { storeId: string; defaultKeywords: string }) {
  const [state, action] = useActionState(startNewSearch, {});
  const t = useI18n().m.sales.products;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="store_id" value={storeId} />
      <label htmlFor="keywords" className="text-sm font-medium">{t.keywords}</label>
      <input id="keywords" name="keywords" defaultValue={defaultKeywords} className={inputClasses} placeholder="coffee grinder, espresso cup, milk frother" />
      <p className="text-xs text-muted">{t.keywordsHint}</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton variant="secondary" pendingLabel={t.launching}>{t.newSearch}</SubmitButton>
    </form>
  );
}
