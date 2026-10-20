"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

const I18nContext = createContext<{ locale: Locale; m: Messages }>({ locale: "en", m: MESSAGES.en });

/** Fournit la langue aux composants « client » (la page serveur choisit la langue). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, m: MESSAGES[locale] }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

function GlobeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" strokeLinejoin="round" />
    </svg>
  );
}

/** Choix de la langue : mémorisé un an dans un cookie, puis la page est rechargée côté serveur. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, m } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={`inline-flex items-center gap-1.5 text-sm text-muted ${className}`}>
      <GlobeIcon />
      <span className="sr-only">{m.common.language}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          document.cookie = `${LOCALE_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          startTransition(() => router.refresh());
        }}
        className="cursor-pointer rounded-md bg-transparent py-1 pr-1 font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
        ))}
      </select>
    </label>
  );
}
