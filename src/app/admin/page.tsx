import type { Metadata } from "next";
import { headers } from "next/headers";
import { Alert, SubmitButton } from "@/components/ui";
import { buttonClasses, inputClasses } from "@/components/styles";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { findViolation } from "@/lib/moderation/match";
import { describeViolation, getModerationRules } from "@/lib/moderation/rules";
import { parseStoreConfig } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { baseDomainForHost, storeUrl } from "@/lib/tenant";
import { reactivateStore, suspendStore } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.metaTitle };
}

const STATUS_CLASSES = {
  active: "bg-brand-soft text-brand-strong",
  draft: "bg-paper text-muted border border-line",
  suspended: "bg-danger-soft text-danger",
} as const;

type StoreRow = {
  id: string;
  name: string;
  subdomain: string;
  status: keyof typeof STATUS_CLASSES;
  config: unknown;
  created_at: string;
  suspension_reason: string | null;
  profiles: { email: string } | null;
  products: { status: string; moderation_reason: string | null }[];
};

/** Toutes les boutiques : statut, propriétaire, produits bloqués, textes à vérifier, suspension. */
export default async function AdminStoresPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.admin;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const admin = createAdminClient();

  const [{ data }, rules] = await Promise.all([
    admin
      .from("stores")
      .select("id, name, subdomain, status, config, created_at, suspension_reason, profiles(email), products(status, moderation_reason)")
      .order("created_at", { ascending: false })
      .limit(500),
    getModerationRules(),
  ]);
  const all = (data ?? []) as unknown as StoreRow[];
  const needle = query.toLowerCase();
  const stores = needle
    ? all.filter((s) => [s.name, s.subdomain, s.profiles?.email ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : all;
  const blockedTotal = all.reduce((n, s) => n + s.products.filter((p) => p.moderation_reason).length, 0);
  const baseDomain = baseDomainForHost((await headers()).get("host"));
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" });
  const result = typeof sp.resultat === "string" ? sp.resultat : null;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>

      {result === "motif-requis" && <Alert kind="error">{t.reasonRequired}</Alert>}
      {result && result in t.results && <Alert kind="success">{t.results[result as keyof typeof t.results]}</Alert>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t.stats.stores, value: all.length },
          { label: t.stats.active, value: all.filter((s) => s.status === "active").length },
          { label: t.stats.suspended, value: all.filter((s) => s.status === "suspended").length },
          { label: t.stats.blocked, value: blockedTotal },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{tile.value}</p>
          </div>
        ))}
      </section>

      <form method="get" className="flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">{t.search}</label>
        <input id="q" name="q" type="search" defaultValue={query} placeholder={t.search} className={inputClasses} />
        <button type="submit" className={buttonClasses.secondary}>{t.searchButton}</button>
      </form>

      {stores.length === 0 ? (
        <p className="text-muted">{t.noStores}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {stores.map((store) => {
            const config = parseStoreConfig(store.config);
            const c = config.content;
            const flag = findViolation(rules, [store.name, c.tagline, c.hero.title, c.hero.subtitle, c.about.title, c.about.body, c.footerText]);
            const blocked = store.products.filter((p) => p.moderation_reason).length;
            const forSale = store.products.filter((p) => p.status === "active").length;
            return (
              <li key={store.id} className="rounded-2xl border border-line bg-white p-5" data-store={store.subdomain}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={storeUrl(store.subdomain, baseDomain)} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                        {store.name}
                      </a>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[store.status] ?? STATUS_CLASSES.draft}`}>
                        {m.dashboard.status[store.status] ?? store.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {store.subdomain}.{baseDomain} · {store.profiles?.email} · {dateFormat.format(new Date(store.created_at))}
                    </p>
                    <p className="mt-1 text-sm">
                      {fmt(m.dashboard.store.productsSummary, { count: forSale })}
                      {blocked > 0 && <span className="ml-2 font-semibold text-danger">{fmt(t.blockedCount, { n: blocked })}</span>}
                    </p>
                    {flag && <p className="mt-2 rounded-lg bg-marigold-soft px-2.5 py-1.5 text-xs">{fmt(t.flagged, { reason: describeViolation(flag, m) })}</p>}
                    {store.status === "suspended" && store.suspension_reason && (
                      <p className="mt-2 text-sm text-danger">{fmt(t.suspendedReason, { reason: store.suspension_reason })}</p>
                    )}
                  </div>
                  {store.status === "suspended" ? (
                    <form action={reactivateStore}>
                      <input type="hidden" name="store_id" value={store.id} />
                      <SubmitButton variant="secondary">{t.reactivate}</SubmitButton>
                    </form>
                  ) : (
                    <form action={suspendStore} className="flex w-full max-w-sm flex-wrap items-end gap-2 sm:w-auto">
                      <input type="hidden" name="store_id" value={store.id} />
                      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                        {t.suspendReason}
                        <input name="reason" required maxLength={300} className={`${inputClasses} py-2`} />
                      </label>
                      <SubmitButton variant="secondary" className="py-2 text-danger" pendingLabel={t.suspending}>{t.suspend}</SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
