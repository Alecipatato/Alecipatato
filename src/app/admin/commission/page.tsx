import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { marginByOwner } from "@/lib/commission";
import { getMessages, getLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/config";
import { commissionTierFor, rateToBasisPoints } from "@/lib/money";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/store-config";
import { TiersForm } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.commission.metaTitle };
}

/** Administration de la commission dégressive : paliers et répartition des vendeurs. */
export default async function CommissionAdminPage() {
  await requireAdmin();
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.admin.commission;
  const settings = await getPlatformSettings();
  const percent = (rate: string) => new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 2 }).format(rateToBasisPoints(rate) / 10_000);
  const decimal = (bp: number) => (bp / 100).toString().replace(".", locale === "fr" ? "," : ".");

  // Vendeurs par palier : marge brute des 30 derniers jours de chaque vendeur.
  const byOwner = await marginByOwner();
  const counts = settings.commissionTiers.map(() => 0);
  for (const margin of byOwner.values()) counts[commissionTierFor(settings.commissionTiers, margin).index]++;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.intro}</p>
      </div>
      <section className="rounded-2xl border border-line bg-white p-6">
        <TiersForm initial={settings.commissionTiers.map((tier) => ({ from: String(tier.fromMarginCents / 100), rate: decimal(rateToBasisPoints(tier.rate)) }))} />
      </section>
      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.sellers}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {settings.commissionTiers.map((tier, i) => (
            <li key={tier.fromMarginCents} data-tier-count={i} className="rounded-xl bg-paper p-4">
              <p className="font-display text-2xl font-bold">{percent(tier.rate)}</p>
              <p className="text-xs text-muted">≥ {formatPrice(tier.fromMarginCents, "CAD", locale)}</p>
              <p className="mt-2 text-sm font-semibold tabular-nums">{counts[i]}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
