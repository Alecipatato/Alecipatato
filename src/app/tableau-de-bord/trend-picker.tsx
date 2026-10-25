"use client";

import { useMemo, useState } from "react";
import { inputClasses } from "@/components/styles";
import { useI18n } from "@/lib/i18n/client";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { formatPrice } from "@/lib/store-config";
import type { TrendCard } from "@/lib/trends/cards";
import { MAX_SELECTION, MIN_SELECTION } from "@/lib/trends/score";
import { TREND_THEMES, type TrendThemeId } from "@/lib/trends/themes";

type Sort = "demand" | "profit" | "price";

const LEVEL_STYLES = {
  very_high: "bg-brand text-white",
  high: "bg-brand-soft text-brand-strong",
  medium: "bg-marigold-soft text-ink",
  low: "bg-paper text-muted",
} as const;

/**
 * Galerie des produits tendance : image, demande et chiffres de chaque produit.
 * La sélection (même thème, 3 à 20 produits) est gardée par le formulaire parent.
 */
export function TrendPicker({
  cards,
  selected,
  onChange,
  commissionLabel,
  sample,
  continueTarget,
}: {
  cards: TrendCard[];
  selected: string[];
  onChange: (ids: string[]) => void;
  commissionLabel: string;
  sample: boolean;
  continueTarget: string;
}) {
  const { locale, m } = useI18n();
  const t = m.trends.picker;
  const [theme, setTheme] = useState<TrendThemeId | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("demand");
  const price = (cents: number) => formatPrice(cents, "CAD", locale);
  const number = (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n);
  const percent = (bp: number) => new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(bp / 10_000);

  const selectedTheme = cards.find((c) => c.id === selected[0])?.theme ?? null;
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) map.set(c.theme, (map.get(c.theme) ?? 0) + 1);
    return map;
  }, [cards]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    const list = cards.filter((c) => (theme === "all" || c.theme === theme) && (!q || c.name.toLocaleLowerCase(locale).includes(q)));
    const key: Record<Sort, (c: TrendCard) => number> = { demand: (c) => c.demandScore, profit: (c) => c.profitCents, price: (c) => -c.priceCents };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [cards, theme, query, sort, locale]);

  function toggle(card: TrendCard) {
    if (selected.includes(card.id)) {
      onChange(selected.filter((id) => id !== card.id));
      return;
    }
    if (selected.length === 0) setTheme(card.theme); // la suite du choix se fait dans ce thème
    onChange([...selected, card.id]);
  }

  const themeName = (id: TrendThemeId) => m.trends.themes[id];

  return (
    <section aria-labelledby="trends-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <h2 id="trends-title" className="font-display text-2xl font-bold tracking-tight">{t.title}</h2>
          <p className="mt-1 text-sm text-muted">{fmt(t.subtitle, { min: MIN_SELECTION, max: MAX_SELECTION })}</p>
        </div>
        <aside data-cost-notice className="flex max-w-sm gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm lg:shrink-0">
          <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-brand" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-semibold text-brand-strong">{t.costNotice}</p>
            <p className="mt-1 text-xs text-muted">{fmt(t.costNoticeDetail, { commission: commissionLabel })}</p>
          </div>
        </aside>
      </div>

      {sample && <p className="text-xs text-muted">{t.sample}</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label={t.title} className="flex flex-wrap gap-2">
          {(["all", ...TREND_THEMES.map((x) => x.id)] as const).map((id) => {
            const count = id === "all" ? cards.length : (counts.get(id) ?? 0);
            if (id !== "all" && count === 0) return null;
            const emoji = id === "all" ? null : TREND_THEMES.find((x) => x.id === id)?.emoji;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={theme === id}
                onClick={() => setTheme(id)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-muted transition hover:border-brand hover:text-brand aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white"
              >
                {emoji && <span aria-hidden className="mr-1">{emoji}</span>}
                {id === "all" ? t.allThemes : themeName(id)} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 lg:shrink-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} // la galerie est dans le formulaire : Entrée ne doit pas l'envoyer
            placeholder={t.search} aria-label={t.search} className={`${inputClasses} min-w-0 flex-1 lg:w-56`} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t.sort} className={`${inputClasses} w-auto shrink-0`}>
            {(Object.keys(t.sorts) as Sort[]).map((s) => <option key={s} value={s}>{t.sort} : {t.sorts[s]}</option>)}
          </select>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">{t.empty}</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">{t.noResults}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => {
            const isSelected = selected.includes(c.id);
            const otherTheme = !isSelected && selectedTheme !== null && c.theme !== selectedTheme;
            const full = !isSelected && selected.length >= MAX_SELECTION;
            return (
              <li
                key={c.id}
                data-trend={c.id}
                data-selected={isSelected || undefined}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition ${isSelected ? "border-brand ring-2 ring-brand/25" : "border-line"} ${otherTheme ? "opacity-55" : ""}`}
              >
                <div className="relative aspect-square bg-paper">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- images du fournisseur
                    <img src={c.image} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div aria-hidden className="grid h-full place-items-center text-4xl text-muted">{c.name.charAt(0)}</div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-ink shadow-sm">
                    {themeName(c.theme)}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5">{c.name}</h3>

                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-muted">{t.demand}</span>
                      <span data-demand={c.demandLevel} className={`rounded-full px-2 py-0.5 font-semibold ${LEVEL_STYLES[c.demandLevel]}`}>{t.levels[c.demandLevel]}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-label={t.demand} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.demandScore}>
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(c.demandScore, 4)}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      {fmt(c.listedCount === 1 ? t.storesOne : t.storesOther, { n: number(c.listedCount) })}
                      {c.salesCount > 0 && <> · {fmt(t.sales, { n: number(c.salesCount) })}</>}
                    </p>
                  </div>

                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs">
                    <dt className="text-muted">{t.supplierPrice}</dt>
                    <dd className="text-right tabular-nums">{price(c.supplierCadCents)}</dd>
                    <dt className="text-muted">{fmt(t.shipping, { min: c.daysMin, max: c.daysMax })}</dt>
                    <dd className="text-right tabular-nums">{price(c.shippingCadCents)}</dd>
                    <dt className="font-medium">{t.suggestedPrice}</dt>
                    <dd className="text-right text-sm font-semibold tabular-nums">{price(c.priceCents)}</dd>
                    <dt className="font-medium text-brand-strong" title={fmt(t.profitHint, { commission: commissionLabel })}>{t.profit}</dt>
                    <dd className="text-right text-sm font-semibold tabular-nums text-brand-strong">{price(c.profitCents)}</dd>
                  </dl>
                  <p className="-mt-1 text-[11px] text-muted">{fmt(t.margin, { percent: percent(c.marginBp) })}</p>

                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    disabled={otherTheme || full}
                    aria-pressed={isSelected}
                    className={`mt-auto rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${isSelected ? "bg-brand text-white hover:bg-brand-strong" : "border border-line bg-white text-ink hover:border-brand hover:text-brand disabled:hover:border-line disabled:hover:text-ink"}`}
                  >
                    {isSelected ? `✓ ${t.chosen}` : otherTheme ? t.otherTheme : full ? t.full : t.choose}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">{fmt(t.profitHint, { commission: commissionLabel })}</p>

      {selected.length > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{fmt(t.selectedCount, { n: selected.length, max: MAX_SELECTION })}</span>
            {selectedTheme && <span className="text-muted"> · {fmt(t.theme, { theme: themeName(selectedTheme) })}</span>}
            {selected.length < MIN_SELECTION && <span className="text-muted"> · {fmt(t.minHint, { min: MIN_SELECTION })}</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChange([])} className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-ink/30">{t.clear}</button>
            <a
              href={`#${continueTarget}`}
              aria-disabled={selected.length < MIN_SELECTION}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              {t.continue} ↓
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
