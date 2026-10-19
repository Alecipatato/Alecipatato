"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { inputClasses } from "@/components/styles";
import { Alert, Spinner, SubmitButton } from "@/components/ui";
import type { SourcingState } from "@/lib/products/sourcing";
import { rejectProduct, startNewSearch, updateProductPrice } from "../../../products-actions";

const STEP_LABELS: Record<SourcingState["status"], string> = {
  searching: "Recherche dans le catalogue du fournisseur…",
  selecting: "L'IA choisit les produits les plus adaptés à votre boutique…",
  processing: "Vérification de la livraison au Canada, rédaction des fiches et calcul des prix…",
  done: "Recherche terminée.",
  failed: "La recherche n'a pas abouti.",
};

/** Fait avancer la recherche étape par étape et affiche la progression. */
export function SourcingRunner({ storeId, initial }: { storeId: string; initial: SourcingState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

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
          next = { error: "Connexion perdue. Rechargez la page pour reprendre la recherche." };
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
  }, [state, storeId, router]);

  const pct = state.status === "searching" ? 8 : state.status === "selecting" ? 20 : Math.min(100, 20 + Math.round((state.proposed / Math.max(state.target, 1)) * 80));

  if (state.status === "failed") return <Alert kind="error">{state.error ?? STEP_LABELS.failed} Essayez une nouvelle recherche avec d&apos;autres mots-clés.</Alert>;
  if (state.status === "done") return null;

  return (
    <div className="rounded-2xl border border-line bg-white p-6" role="status" aria-live="polite" data-sourcing-progress>
      <div className="flex items-center gap-3 font-medium">
        <Spinner />
        {STEP_LABELS[state.status]}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {state.proposed} produit{state.proposed > 1 ? "s" : ""} trouvé{state.proposed > 1 ? "s" : ""} sur {state.target} visés. Restez sur cette page : cela prend
        environ 2 à 3 minutes.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function PriceForm({ productId, priceCents }: { productId: string; priceCents: number }) {
  const [state, action] = useActionState(updateProductPrice, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <label className="sr-only" htmlFor={`price-${productId}`}>Prix de vente</label>
      <input
        id={`price-${productId}`}
        name="price"
        inputMode="decimal"
        defaultValue={(priceCents / 100).toFixed(2).replace(".", ",")}
        className={`${inputClasses} w-28 py-1.5`}
      />
      <SubmitButton variant="secondary" className="px-3 py-1.5 text-xs" pendingLabel="…">Modifier le prix</SubmitButton>
      {state.error && <p role="alert" className="w-full text-xs text-danger">{state.error}</p>}
      {state.message && <p role="status" className="w-full text-xs text-brand-strong">{state.message}</p>}
    </form>
  );
}

export function RejectForm({ productId, canReplace }: { productId: string; canReplace: boolean }) {
  return (
    <form action={rejectProduct} className="flex flex-wrap gap-2">
      <input type="hidden" name="product_id" value={productId} />
      {canReplace && (
        <SubmitButton name="replace" value="1" variant="secondary" className="px-3 py-1.5 text-xs" pendingLabel="Recherche d'un remplaçant…">
          Remplacer
        </SubmitButton>
      )}
      <SubmitButton variant="secondary" className="px-3 py-1.5 text-xs" pendingLabel="…">Refuser</SubmitButton>
    </form>
  );
}

export function NewSearchForm({ storeId, defaultKeywords }: { storeId: string; defaultKeywords: string }) {
  const [state, action] = useActionState(startNewSearch, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="store_id" value={storeId} />
      <label htmlFor="keywords" className="text-sm font-medium">Mots-clés de recherche (en anglais, séparés par des virgules)</label>
      <input id="keywords" name="keywords" defaultValue={defaultKeywords} className={inputClasses} placeholder="coffee grinder, espresso cup, milk frother" />
      <p className="text-xs text-muted">Le catalogue du fournisseur est en anglais. L&apos;IA rédigera ensuite les fiches en français.</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton variant="secondary" pendingLabel="Lancement…">Lancer une nouvelle recherche</SubmitButton>
    </form>
  );
}
