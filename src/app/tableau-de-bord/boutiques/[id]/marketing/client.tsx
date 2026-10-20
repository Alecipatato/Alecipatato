"use client";

import { useActionState, useState } from "react";
import { Alert, Field, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, type StorePixels, type StoreSeo } from "@/lib/marketing/settings";
import { generateMarketingContent, updateStorePixels, updateStoreSeo } from "../../../marketing-actions";

/** Titre et description pour Google, avec compteur et aperçu. */
export function SeoForm({ storeId, seo, defaults, url }: { storeId: string; seo: StoreSeo; defaults: StoreSeo; url: string }) {
  const [state, action] = useActionState(updateStoreSeo, {});
  const [title, setTitle] = useState(seo.title);
  const [description, setDescription] = useState(seo.description);
  const t = useI18n().m.marketingTools.seo;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="store_id" value={storeId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <Field label={t.pageTitle} id="seo_title" hint={fmt(t.chars, { n: title.length, max: SEO_TITLE_MAX })}>
        <input id="seo_title" name="seo_title" maxLength={SEO_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaults.title} className={inputClasses} />
      </Field>
      <Field label={t.description} id="seo_description" hint={fmt(t.chars, { n: description.length, max: SEO_DESCRIPTION_MAX })}>
        <textarea id="seo_description" name="seo_description" rows={3} maxLength={SEO_DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={defaults.description} className={inputClasses} />
      </Field>
      <div className="rounded-xl border border-line bg-paper p-4" aria-label={t.preview}>
        <p className="text-xs text-muted">{t.preview}</p>
        <p className="mt-1 truncate text-xs text-[#1a7f37]">{url}</p>
        <p className="truncate text-lg text-[#1a0dab]">{title || defaults.title}</p>
        <p className="line-clamp-2 text-sm text-[#4d5156]">{description || defaults.description}</p>
      </div>
      <SubmitButton variant="secondary">{t.submit}</SubmitButton>
    </form>
  );
}

export function PixelsForm({ storeId, pixels }: { storeId: string; pixels: StorePixels }) {
  const [state, action] = useActionState(updateStorePixels, {});
  const t = useI18n().m.marketingTools.pixels;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="store_id" value={storeId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <Field label={t.meta} id="meta_pixel" hint={t.metaHint}>
        <input id="meta_pixel" name="meta_pixel" inputMode="numeric" defaultValue={pixels.meta ?? ""} placeholder="123456789012345" className={inputClasses} />
      </Field>
      <Field label={t.tiktok} id="tiktok_pixel" hint={t.tiktokHint}>
        <input id="tiktok_pixel" name="tiktok_pixel" defaultValue={pixels.tiktok ?? ""} placeholder="C4ABCDEF1234567890" className={`${inputClasses} uppercase`} />
      </Field>
      <p className="text-xs text-muted">{t.events}</p>
      <SubmitButton variant="secondary">{t.submit}</SubmitButton>
    </form>
  );
}

export function GenerateForm({ storeId, products }: { storeId: string; products: { id: string; title: string }[] }) {
  const [state, action] = useActionState(generateMarketingContent, {});
  const t = useI18n().m.marketingTools.ai;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="store_id" value={storeId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1.5 text-sm font-medium">
          {t.focus}
          <select name="product_id" className={inputClasses}>
            <option value="">{t.wholeStore}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <SubmitButton pendingLabel={t.generating}>{t.generate}</SubmitButton>
      </div>
    </form>
  );
}

/** Copie un texte dans le presse-papiers. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const t = useI18n().m.marketingTools.ai;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted hover:text-ink"
    >
      {copied ? t.copied : t.copy}
    </button>
  );
}

/** Applique la suggestion SEO de l'IA. */
export function ApplySeoButton({ storeId, seo }: { storeId: string; seo: StoreSeo }) {
  const [state, action] = useActionState(updateStoreSeo, {});
  const t = useI18n().m.marketingTools.ai;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="store_id" value={storeId} />
      <input type="hidden" name="seo_title" value={seo.title} />
      <input type="hidden" name="seo_description" value={seo.description} />
      <SubmitButton variant="secondary" className="px-3 py-1.5 text-xs">{t.applySeo}</SubmitButton>
      {state.message && <span role="status" className="text-xs text-brand-strong">{state.message}</span>}
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
