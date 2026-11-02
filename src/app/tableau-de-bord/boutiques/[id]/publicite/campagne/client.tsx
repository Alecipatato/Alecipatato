"use client";

import { useActionState, useState, useTransition } from "react";
import {
  type CampaignState,
  chooseMetaAccount,
  createMetaCampaign,
  deleteCampaignDraft,
  draftMetaCampaign,
  setMetaCampaignActive,
} from "@/app/tableau-de-bord/ads-campaign-actions";
import { Alert, buttonClasses, Field, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

const initial: CampaignState = {};

export function ChooseAccountForm({
  storeId,
  accounts,
  pages,
  current,
}: {
  storeId: string;
  accounts: { id: string; name: string; currency: string; active: boolean }[];
  pages: { id: string; name: string }[];
  current: { adAccountId: string | null; pageId: string | null };
}) {
  const { m } = useI18n();
  const t = m.ads.campaigns.choose;
  const [state, action] = useActionState(chooseMetaAccount.bind(null, storeId), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.adAccount} id="ad_account_id">
          <select id="ad_account_id" name="ad_account_id" defaultValue={current.adAccountId ?? ""} className={inputClasses} required>
            <option value="" disabled>—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency}){a.active ? "" : ` — ${t.inactive}`}</option>
            ))}
          </select>
        </Field>
        <Field label={t.page} id="page_id">
          <select id="page_id" name="page_id" defaultValue={current.pageId ?? ""} className={inputClasses} required>
            <option value="" disabled>—</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div><SubmitButton variant="secondary">{t.save}</SubmitButton></div>
    </form>
  );
}

export function DraftForm({ storeId, products, suggestedBudget, budgetHint }: { storeId: string; products: { id: string; title: string }[]; suggestedBudget: string; budgetHint: string }) {
  const { m } = useI18n();
  const t = m.ads.campaigns.draft;
  const [state, action] = useActionState(draftMetaCampaign.bind(null, storeId), initial);
  return (
    <form action={action} className="flex flex-col gap-4" data-draft-form>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label={t.product} id="product_id">
          <select id="product_id" name="product_id" className={inputClasses} required>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label={t.budget} id="daily_budget">
          <input id="daily_budget" name="daily_budget" inputMode="decimal" defaultValue={suggestedBudget} className={inputClasses} required />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">{budgetHint}</p>
      <div><SubmitButton pendingLabel={t.pending}>✨ {t.submit}</SubmitButton></div>
    </form>
  );
}

export function ReviewForm({
  storeId,
  draft,
}: {
  storeId: string;
  draft: { id: string; primaryText: string; headline: string; description: string; budget: string };
}) {
  const { m } = useI18n();
  const t = m.ads.campaigns.review;
  const [state, action] = useActionState(createMetaCampaign.bind(null, storeId), initial);
  const [deleting, startDelete] = useTransition();
  return (
    <form action={action} className="flex flex-col gap-4" data-review-form>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="campaign_id" value={draft.id} />
      <Field label={t.primaryText} id="primary_text">
        <textarea id="primary_text" name="primary_text" rows={4} defaultValue={draft.primaryText} className={inputClasses} required maxLength={2000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_12rem]">
        <Field label={t.headline} id="headline">
          <input id="headline" name="headline" defaultValue={draft.headline} className={inputClasses} required maxLength={255} />
        </Field>
        <Field label={t.description} id="description">
          <input id="description" name="description" defaultValue={draft.description} className={inputClasses} maxLength={255} />
        </Field>
        <Field label={t.budget} id="review_budget">
          <input id="review_budget" name="daily_budget" inputMode="decimal" defaultValue={draft.budget} className={inputClasses} required />
        </Field>
      </div>
      <ul className="grid gap-1 rounded-xl bg-paper p-4 text-sm sm:grid-cols-2">
        {t.summary.map((line) => <li key={line}>✓ {line}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel={t.creating}>{t.create}</SubmitButton>
        <button type="button" disabled={deleting} onClick={() => startDelete(() => deleteCampaignDraft(storeId, draft.id))} className={buttonClasses.secondary}>
          {t.delete}
        </button>
      </div>
    </form>
  );
}

/** Lancer / mettre en pause (avec confirmation avant de lancer : Meta commence à facturer). */
export function CampaignStatusButton({ storeId, campaignId, active }: { storeId: string; campaignId: string; active: boolean }) {
  const { m } = useI18n();
  const t = m.ads.campaigns.list;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        data-campaign-toggle={active ? "pause" : "launch"}
        disabled={pending}
        onClick={() => {
          if (!active && !window.confirm(t.launchConfirm)) return;
          start(async () => setError((await setMetaCampaignActive(storeId, campaignId, !active)).error ?? null));
        }}
        className={active ? buttonClasses.secondary : buttonClasses.primary}
      >
        {active ? t.pause : `▶ ${t.launch}`}
      </button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
