"use client";

import { useActionState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { ALLOWED_FONTS, THEME_IDS } from "@/lib/store-config";
import type { StoreConfig, ThemeId } from "@/lib/types";
import { updateStoreDesign } from "../../actions";

const COLOR_KEYS = ["primary", "accent", "background", "text"] as const satisfies readonly (keyof StoreConfig["colors"])[];
const COLOR_LABEL = { primary: "colorPrimary", accent: "colorAccent", background: "colorBackground", text: "colorText" } as const;

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
  const { m } = useI18n();
  const t = m.dashboard.design;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="store_id" value={storeId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} id="name">
          <input id="name" name="name" required maxLength={60} defaultValue={name} className={inputClasses} />
        </Field>
        <Field label={t.contactEmail} id="contact_email">
          <input id="contact_email" name="contact_email" type="email" defaultValue={contactEmail ?? ""} className={inputClasses} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t.style}</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {THEME_IDS.map((id) => (
            <label key={id} className="cursor-pointer rounded-xl border border-line bg-white p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
              <input type="radio" name="theme" value={id} defaultChecked={theme === id} className="sr-only" />
              <span className="block text-sm font-medium">{m.common.themes[id].name}</span>
              <span className="block text-xs text-muted">{m.common.themes[id].description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">{t.colors}</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLOR_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-sm">
              <input type="color" name={`color_${key}`} defaultValue={config.colors[key]} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-line" />
              <span className="leading-tight">{t[COLOR_LABEL[key]]}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t.contrastNote}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["heading", "body"] as const).map((kind) => (
          <Field key={kind} label={kind === "heading" ? t.fontHeading : t.fontBody} id={`font_${kind}`}>
            <select id={`font_${kind}`} name={`font_${kind}`} defaultValue={config.fonts[kind]} className={inputClasses}>
              {ALLOWED_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        ))}
      </div>

      <div className="grid gap-4">
        <Field label={t.tagline} id="tagline">
          <input id="tagline" name="tagline" maxLength={200} defaultValue={content.tagline} className={inputClasses} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label={t.heroTitle} id="hero_title">
            <input id="hero_title" name="hero_title" maxLength={200} defaultValue={content.hero.title} className={inputClasses} />
          </Field>
          <Field label={t.heroCta} id="hero_cta">
            <input id="hero_cta" name="hero_cta" maxLength={50} defaultValue={content.hero.ctaLabel} className={inputClasses} />
          </Field>
        </div>
        <Field label={t.heroSubtitle} id="hero_subtitle">
          <textarea id="hero_subtitle" name="hero_subtitle" rows={2} maxLength={500} defaultValue={content.hero.subtitle} className={inputClasses} />
        </Field>
        <Field label={t.aboutTitle} id="about_title">
          <input id="about_title" name="about_title" maxLength={200} defaultValue={content.about.title} className={inputClasses} />
        </Field>
        <Field label={t.aboutBody} id="about_body">
          <textarea id="about_body" name="about_body" rows={4} maxLength={2000} defaultValue={content.about.body} className={inputClasses} />
        </Field>
        <Field label={t.footerText} id="footer_text">
          <input id="footer_text" name="footer_text" maxLength={300} defaultValue={content.footerText} className={inputClasses} />
        </Field>
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton pendingLabel={t.pending}>{t.submit}</SubmitButton>
      </div>
    </form>
  );
}
