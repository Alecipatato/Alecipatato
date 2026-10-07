"use client";

import { useActionState, useState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import type { StoreBrief } from "@/lib/ai/store-generator";
import { PALETTES } from "@/lib/palettes";
import { THEME_IDS, THEME_LABELS } from "@/lib/store-config";
import type { ActionState } from "./actions";

const PRODUCT_IDEAS = ["Accessoires de cuisine", "Articles pour animaux", "Décoration intérieure", "Équipement de sport", "Gadgets technos", "Bijoux et accessoires"];

/** Mini-aperçu de chaque style. */
function ThemeThumb({ theme }: { theme: (typeof THEME_IDS)[number] }) {
  const header = { minimal: "bg-white border-b border-black/10", bold: "bg-[#1f6f5c]", elegant: "bg-[#2b211b]" }[theme];
  const radius = { minimal: "rounded-md", bold: "rounded-none", elegant: "rounded-sm" }[theme];
  return (
    <div aria-hidden className="overflow-hidden rounded-lg border border-line bg-white">
      <div className={`h-3 ${header}`} />
      <div className="grid grid-cols-3 gap-1 p-1.5">
        {[0, 1, 2].map((i) => <div key={i} className={`aspect-square bg-black/10 ${radius}`} />)}
      </div>
    </div>
  );
}

export function BriefForm({
  action,
  defaults,
  storeId,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: Partial<StoreBrief>;
  storeId?: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [palette, setPalette] = useState(defaults?.palette ?? "auto");
  const [productTypes, setProductTypes] = useState(defaults?.productTypes ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {storeId && <input type="hidden" name="store_id" value={storeId} />}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <Field label="Votre niche et votre clientèle" id="niche" hint="Plus vous êtes précis, plus la boutique sera réussie.">
        <textarea
          id="niche"
          name="niche"
          required
          minLength={10}
          maxLength={1000}
          rows={4}
          defaultValue={defaults?.niche}
          placeholder="Ex. : Des accessoires écoresponsables pour les amateurs de café qui veulent préparer un bon espresso à la maison."
          className={inputClasses}
        />
      </Field>

      <Field label="Quel type de produits ?" id="product_types" hint="Facultatif : laissez vide pour que l'IA choisisse.">
        <input
          id="product_types"
          name="product_types"
          maxLength={500}
          value={productTypes}
          onChange={(e) => setProductTypes(e.target.value)}
          placeholder="Ex. : moulins, tasses, balances, accessoires de barista"
          className={inputClasses}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {PRODUCT_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setProductTypes(idea)}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted hover:border-brand hover:text-brand"
            >
              {idea}
            </button>
          ))}
        </div>
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Style de la boutique</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="relative flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
            <input type="radio" name="theme" value="auto" defaultChecked={!defaults?.theme || defaults.theme === "auto"} className="sr-only" />
            <div aria-hidden className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line text-xs font-semibold text-brand">IA</div>
            <span className="text-sm font-medium">Laisser l&apos;IA choisir</span>
          </label>
          {THEME_IDS.map((t) => (
            <label key={t} className="relative flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
              <input type="radio" name="theme" value={t} defaultChecked={defaults?.theme === t} className="sr-only" />
              <ThemeThumb theme={t} />
              <span className="text-sm font-medium">{THEME_LABELS[t].name}</span>
              <span className="-mt-1.5 text-xs text-muted">{THEME_LABELS[t].description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Couleurs</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["auto", "Laisser l'IA choisir"], ...Object.entries(PALETTES).map(([k, v]) => [k, v.label]), ["custom", "Ma couleur"]].map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
              <input type="radio" name="palette" value={key} checked={palette === key} onChange={() => setPalette(key)} className="sr-only" />
              <span aria-hidden className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
                {PALETTES[key] ? (
                  Object.values(PALETTES[key].colors).map((c, i) => <span key={i} className="h-6 w-3" style={{ background: c }} />)
                ) : key === "auto" ? (
                  <span className="grid h-6 w-12 place-items-center text-[10px] font-bold text-brand">IA</span>
                ) : (
                  <span className="h-6 w-12 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                )}
              </span>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
        {palette === "custom" && (
          <div className="mt-3 flex items-center gap-3">
            <input id="primary_color" name="primary_color" type="color" defaultValue={defaults?.primaryColor ?? "#1f6f5c"} className="h-10 w-14 cursor-pointer rounded-lg border border-line" />
            <label htmlFor="primary_color" className="text-sm text-muted">Couleur principale (boutons). L&apos;IA choisit les couleurs qui l&apos;accompagnent.</label>
          </div>
        )}
      </fieldset>

      <Field label="Nom de la boutique" id="store_name" hint="Facultatif : l'IA peut en proposer un.">
        <input id="store_name" name="store_name" maxLength={60} defaultValue={defaults?.storeName} className={inputClasses} />
      </Field>

      <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">La génération prend généralement de 20 à 60 secondes.</p>
        <SubmitButton pendingLabel="L'IA crée votre boutique…" className="px-6">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
