"use client";

import { useActionState, useState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import type { StoreBrief } from "@/lib/ai/store-generator";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n/config";
import { PALETTES } from "@/lib/palettes";
import { THEME_IDS } from "@/lib/store-config";
import type { ActionState } from "./actions";

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
  const { locale, m } = useI18n();
  const t = m.dashboard.brief;
  const paletteName = (key: string) => m.common.palettes[key as keyof typeof m.common.palettes] ?? key;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {storeId && <input type="hidden" name="store_id" value={storeId} />}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <Field label={t.niche} id="niche" hint={t.nicheHint}>
        <textarea
          id="niche"
          name="niche"
          required
          minLength={10}
          maxLength={1000}
          rows={4}
          defaultValue={defaults?.niche}
          placeholder={t.nichePlaceholder}
          className={inputClasses}
        />
      </Field>

      <Field label={t.productTypes} id="product_types" hint={t.productTypesHint}>
        <input
          id="product_types"
          name="product_types"
          maxLength={500}
          value={productTypes}
          onChange={(e) => setProductTypes(e.target.value)}
          placeholder={t.productTypesPlaceholder}
          className={inputClasses}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {t.ideas.map((idea) => (
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
        <legend className="text-sm font-medium">{t.style}</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="relative flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
            <input type="radio" name="theme" value="auto" defaultChecked={!defaults?.theme || defaults.theme === "auto"} className="sr-only" />
            <div aria-hidden className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line text-xs font-semibold text-brand">{t.ai}</div>
            <span className="text-sm font-medium">{t.letAi}</span>
          </label>
          {THEME_IDS.map((t) => (
            <label key={t} className="relative flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
              <input type="radio" name="theme" value={t} defaultChecked={defaults?.theme === t} className="sr-only" />
              <ThemeThumb theme={t} />
              <span className="text-sm font-medium">{m.common.themes[t].name}</span>
              <span className="-mt-1.5 text-xs text-muted">{m.common.themes[t].description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">{t.colors}</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["auto", t.letAi], ...Object.keys(PALETTES).map((k) => [k, paletteName(k)]), ["custom", t.myColor]].map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
              <input type="radio" name="palette" value={key} checked={palette === key} onChange={() => setPalette(key)} className="sr-only" />
              <span aria-hidden className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
                {PALETTES[key] ? (
                  Object.values(PALETTES[key].colors).map((c, i) => <span key={i} className="h-6 w-3" style={{ background: c }} />)
                ) : key === "auto" ? (
                  <span className="grid h-6 w-12 place-items-center text-[10px] font-bold text-brand">{t.ai}</span>
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
            <label htmlFor="primary_color" className="text-sm text-muted">{t.primaryColor}</label>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.storeName} id="store_name" hint={t.storeNameHint}>
          <input id="store_name" name="store_name" maxLength={60} defaultValue={defaults?.storeName} className={inputClasses} />
        </Field>
        <Field label={t.language} id="language" hint={t.languageHint}>
          <select id="language" name="language" defaultValue={defaults?.language ?? locale} className={inputClasses}>
            {LOCALES.map((l) => <option key={l} value={l}>{m.common.storeLanguages[l]}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{t.duration}</p>
        <SubmitButton pendingLabel={t.pending} className="px-6">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
