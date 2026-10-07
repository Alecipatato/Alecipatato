"use client";

import { useActionState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import { ALLOWED_FONTS, THEME_IDS, THEME_LABELS } from "@/lib/store-config";
import type { StoreConfig, ThemeId } from "@/lib/types";
import { updateStoreDesign } from "../../actions";

const COLOR_FIELDS: { key: keyof StoreConfig["colors"]; label: string }[] = [
  { key: "primary", label: "Principale (boutons)" },
  { key: "accent", label: "Accent (prix, badges)" },
  { key: "background", label: "Fond" },
  { key: "text", label: "Texte" },
];

/** Personnalisation manuelle : nom, style, couleurs, polices, textes. */
export function DesignForm({
  storeId,
  name,
  theme,
  config,
  contactEmail,
}: {
  storeId: string;
  name: string;
  theme: ThemeId;
  config: StoreConfig;
  contactEmail: string | null;
}) {
  const [state, action] = useActionState(updateStoreDesign, {});
  const { content } = config;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="store_id" value={storeId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de la boutique" id="name">
          <input id="name" name="name" required maxLength={60} defaultValue={name} className={inputClasses} />
        </Field>
        <Field label="Courriel de contact (affiché aux clients)" id="contact_email">
          <input id="contact_email" name="contact_email" type="email" defaultValue={contactEmail ?? ""} className={inputClasses} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Style</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {THEME_IDS.map((t) => (
            <label key={t} className="cursor-pointer rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
              <input type="radio" name="theme" value={t} defaultChecked={theme === t} className="sr-only" />
              <span className="block text-sm font-medium">{THEME_LABELS[t].name}</span>
              <span className="block text-xs text-muted">{THEME_LABELS[t].description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Couleurs</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLOR_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-sm">
              <input type="color" name={`color_${key}`} defaultValue={config.colors[key]} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-line" />
              <span className="leading-tight">{label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Si le texte devient difficile à lire sur le fond, sa couleur est corrigée automatiquement.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["heading", "body"] as const).map((kind) => (
          <Field key={kind} label={kind === "heading" ? "Police des titres" : "Police du texte"} id={`font_${kind}`}>
            <select id={`font_${kind}`} name={`font_${kind}`} defaultValue={config.fonts[kind]} className={inputClasses}>
              {ALLOWED_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        ))}
      </div>

      <div className="grid gap-4">
        <Field label="Slogan" id="tagline">
          <input id="tagline" name="tagline" maxLength={200} defaultValue={content.tagline} className={inputClasses} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Titre de la page d'accueil" id="hero_title">
            <input id="hero_title" name="hero_title" maxLength={200} defaultValue={content.hero.title} className={inputClasses} />
          </Field>
          <Field label="Texte du bouton" id="hero_cta">
            <input id="hero_cta" name="hero_cta" maxLength={50} defaultValue={content.hero.ctaLabel} className={inputClasses} />
          </Field>
        </div>
        <Field label="Sous-titre de la page d'accueil" id="hero_subtitle">
          <textarea id="hero_subtitle" name="hero_subtitle" rows={2} maxLength={500} defaultValue={content.hero.subtitle} className={inputClasses} />
        </Field>
        <Field label="Titre « À propos »" id="about_title">
          <input id="about_title" name="about_title" maxLength={200} defaultValue={content.about.title} className={inputClasses} />
        </Field>
        <Field label="Texte « À propos »" id="about_body">
          <textarea id="about_body" name="about_body" rows={4} maxLength={2000} defaultValue={content.about.body} className={inputClasses} />
        </Field>
        <Field label="Phrase du pied de page" id="footer_text">
          <input id="footer_text" name="footer_text" maxLength={300} defaultValue={content.footerText} className={inputClasses} />
        </Field>
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les modifications</SubmitButton>
      </div>
    </form>
  );
}
