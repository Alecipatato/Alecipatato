"use client";

import { useActionState, useState } from "react";
import { Alert, SubmitButton } from "@/components/ui";
import { inputClasses } from "@/components/styles";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import type { TrendCard } from "@/lib/trends/cards";
import { MAX_SELECTION } from "@/lib/trends/score";
import { addChosenProducts, addProductsByAi } from "../../../../add-products-actions";
import { TrendPicker } from "../../../../trend-picker";

/** « Choisir dans la liste » : galerie des produits tendance (tous thèmes, à partir d'un produit). */
export function AddFromList({ storeId, cards, commissionLabel, sample }: { storeId: string; cards: TrendCard[]; commissionLabel: string; sample: boolean }) {
  const [state, action] = useActionState(addChosenProducts.bind(null, storeId), {});
  const [selected, setSelected] = useState<string[]>([]);
  const t = useI18n().m.trends.add;
  return (
    <form action={action} className="flex flex-col gap-6">
      {selected.map((id) => <input key={id} type="hidden" name="product_ids" value={id} />)}
      <TrendPicker
        cards={cards}
        selected={selected}
        onChange={setSelected}
        commissionLabel={commissionLabel}
        sample={sample}
        continueTarget="ajouter"
        minSelection={1}
        sameTheme={false}
        subtitle={fmt(t.subtitle, { max: MAX_SELECTION })}
      />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div id="ajouter" className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{selected.length ? "" : t.chooseFirst}</p>
        <SubmitButton disabled={selected.length === 0} className="px-6">{t.submit}</SubmitButton>
      </div>
    </form>
  );
}

/** « Laisser l'IA choisir » : nombre de produits, puis recherche automatique. */
export function AddByAi({ storeId }: { storeId: string }) {
  const [state, action] = useActionState(addProductsByAi.bind(null, storeId), {});
  const t = useI18n().m.trends.add;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="count">
        {t.howMany}
        <select id="count" name="count" defaultValue="5" className={`${inputClasses} max-w-40`}>
          {[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted">{t.aiHint}</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton className="self-start px-6">{t.aiSubmit}</SubmitButton>
    </form>
  );
}
