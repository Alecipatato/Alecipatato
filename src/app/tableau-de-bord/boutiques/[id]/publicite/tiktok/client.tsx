"use client";

import { useActionState, useState, useTransition } from "react";
import {
  chooseTiktokAccount,
  createTiktokCampaign,
  deleteTiktokDraft,
  draftTiktokCampaign,
  setTiktokCampaignActive,
  type TiktokCampaignState,
} from "@/app/tableau-de-bord/tiktok-campaign-actions";
import { Alert, buttonClasses, Field, inputClasses, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

const initial: TiktokCampaignState = {};

export function ChooseTiktokForm({
  storeId,
  advertisers,
  identities,
  current,
}: {
  storeId: string;
  advertisers: { id: string; name: string; currency: string }[];
  identities: { id: string; name: string }[];
  current: { advertiserId: string | null; identityId: string | null };
}) {
  const { m } = useI18n();
  const t = m.ads.tiktok.choose;
  const [state, action] = useActionState(chooseTiktokAccount.bind(null, storeId), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.advertiser} id="advertiser_id">
          <select id="advertiser_id" name="advertiser_id" defaultValue={current.advertiserId ?? ""} className={inputClasses} required>
            <option value="" disabled>—</option>
            {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        </Field>
        <Field label={t.identity} id="identity_id">
          <select id="identity_id" name="identity_id" defaultValue={current.identityId ?? ""} className={inputClasses} required>
            <option value="" disabled>—</option>
            {identities.map((i) => <option key={i.id} value={i.id}>@{i.name}</option>)}
          </select>
        </Field>
      </div>
      <div><SubmitButton variant="secondary">{t.save}</SubmitButton></div>
    </form>
  );
}

export function TiktokDraftForm({
  storeId,
  products,
  videos,
  suggestedBudget,
  budgetHint,
}: {
  storeId: string;
  products: { id: string; title: string }[];
  videos: { itemId: string; text: string; public: boolean }[];
  suggestedBudget: string;
  budgetHint: string;
}) {
  const { m } = useI18n();
  const t = m.ads.tiktok.draft;
  const d = m.ads.campaigns.draft;
  const [state, action] = useActionState(draftTiktokCampaign.bind(null, storeId), initial);
  return (
    <form action={action} className="flex flex-col gap-4" data-tiktok-draft-form>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.video} id="tiktok_item_id" hint={t.videoHint}>
        <select id="tiktok_item_id" name="tiktok_item_id" className={inputClasses} required>
          {videos.map((v) => (
            <option key={v.itemId} value={v.itemId}>{(v.text || v.itemId).slice(0, 80)}{v.public ? "" : ` (${t.private})`}</option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label={d.product} id="product_id">
          <select id="product_id" name="product_id" className={inputClasses} required>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label={d.budget} id="daily_budget">
          <input id="daily_budget" name="daily_budget" inputMode="decimal" defaultValue={suggestedBudget} className={inputClasses} required />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">{budgetHint}</p>
      <div><SubmitButton pendingLabel={d.pending}>✨ {d.submit}</SubmitButton></div>
    </form>
  );
}

export function TiktokReviewForm({ storeId, draft }: { storeId: string; draft: { id: string; adText: string; budget: string } }) {
  const { m } = useI18n();
  const t = m.ads.tiktok.review;
  const r = m.ads.campaigns.review;
  const [state, action] = useActionState(createTiktokCampaign.bind(null, storeId), initial);
  const [text, setText] = useState(draft.adText);
  const [deleting, startDelete] = useTransition();
  return (
    <form action={action} className="flex flex-col gap-4" data-tiktok-review-form>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="campaign_id" value={draft.id} />
      <Field label={t.text} id="ad_text" hint={`${text.length}/100`}>
        <textarea id="ad_text" name="ad_text" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={100} required className={inputClasses} />
      </Field>
      <Field label={r.budget} id="review_budget">
        <input id="review_budget" name="daily_budget" inputMode="decimal" defaultValue={draft.budget} className={`${inputClasses} max-w-48`} required />
      </Field>
      <ul className="grid gap-1 rounded-xl bg-paper p-4 text-sm sm:grid-cols-2">
        {t.summary.map((line) => <li key={line}>✓ {line}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel={r.creating}>{r.create}</SubmitButton>
        <button type="button" disabled={deleting} onClick={() => startDelete(() => deleteTiktokDraft(storeId, draft.id))} className={buttonClasses.secondary}>{r.delete}</button>
      </div>
    </form>
  );
}

/** Lancer / mettre en pause (confirmation avant de lancer : TikTok commence à facturer). */
export function TiktokStatusButton({ storeId, campaignId, active }: { storeId: string; campaignId: string; active: boolean }) {
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
          if (!active && !window.confirm(m.ads.tiktok.launchConfirm)) return;
          start(async () => setError((await setTiktokCampaignActive(storeId, campaignId, !active)).error ?? null));
        }}
        className={active ? buttonClasses.secondary : buttonClasses.primary}
      >
        {active ? t.pause : `▶ ${t.launch}`}
      </button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
