"use client";

import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { sendContactMessage } from "./actions";

const field = "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-white px-4 py-2.5 text-sm text-neutral-900 focus:outline-none";

export function ContactForm({ site }: { site: string }) {
  const [state, action, pending] = useActionState(sendContactMessage.bind(null, site), {});
  const t = useI18n().m.emails.contact;
  if (state.sent) return <p role="status" className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-surface)] px-5 py-4">{t.sent}</p>;
  return (
    <form action={action} className="grid gap-4">
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.name}
          <input name="name" required maxLength={100} autoComplete="name" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.email}
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.orderNumber}
        <input name="order_number" maxLength={20} className={`${field} uppercase sm:max-w-xs`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.message}
        <textarea name="message" required minLength={10} maxLength={3000} rows={6} className={field} />
      </label>
      {/* Champ piège pour les robots (invisible pour les visiteurs). */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <div>
        <button type="submit" disabled={pending} className="sf-btn px-6 py-3 text-sm">{pending ? t.sending : t.submit}</button>
      </div>
    </form>
  );
}
