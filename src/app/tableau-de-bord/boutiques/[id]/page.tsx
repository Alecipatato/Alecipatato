import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { briefLanguage, type StoreBrief } from "@/lib/ai/store-generator";
import { requireUser } from "@/lib/auth";
import { fmt, isLocale, plural } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { getPlatformSettings } from "@/lib/settings";
import { parseStoreConfig, parseTheme } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { baseDomainForHost, storeUrl } from "@/lib/tenant";
import { regenerateStore, setStoreOnline } from "../../actions";
import { BriefForm } from "../../brief-form";
import { DesignForm } from "./design-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.store.metaTitle };
}

export default async function StoreAdminPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();

  // La sécurité (RLS) garantit qu'un client ne lit que ses propres boutiques.
  const [{ data: store }, { data: products }, settings, m] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, subdomain, status, theme, config, contact_email, regeneration_count, generation_brief, suspension_reason, language")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase.from("products").select("id, title, category, price_cents, status, supplier").eq("store_id", id).order("position"),
    getPlatformSettings(),
    getMessages(),
  ]);
  if (!store) notFound();
  const t = m.dashboard.store;
  const brief = (store.generation_brief as Partial<StoreBrief> | null) ?? { niche: "" };
  const briefDefaults = { ...brief, language: isLocale(store.language) ? store.language : briefLanguage(brief) };

  const config = parseStoreConfig(store.config);
  const url = storeUrl(store.subdomain, baseDomainForHost((await headers()).get("host")));
  const regenerationsLeft = Math.max(settings.freePlan.maxRegenerationsPerStore - store.regeneration_count, 0);
  const suspended = store.status === "suspended";
  const online = store.status === "active";
  const hasSamples = (products ?? []).some((p) => p.supplier === "sample");
  const activeCount = (products ?? []).filter((p) => p.status === "active").length;
  const proposedCount = (products ?? []).filter((p) => p.status === "proposed").length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/tableau-de-bord" className="text-sm font-medium text-muted hover:text-ink">{m.dashboard.backToStores}</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-bold tracking-tight">{store.name}</h1>
            <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm font-medium text-brand hover:underline">{url} ↗</a>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className={buttonClasses.primary}>{t.view}</a>
            <Link href={`/tableau-de-bord/boutiques/${store.id}/commandes`} className={buttonClasses.secondary}>{t.orders}</Link>
            <Link href={`/tableau-de-bord/boutiques/${store.id}/messages`} className={buttonClasses.secondary}>{m.emails.inbox.link}</Link>
            {!suspended && (
              <form action={setStoreOnline}>
                <input type="hidden" name="store_id" value={store.id} />
                <input type="hidden" name="online" value={online ? "0" : "1"} />
                <button type="submit" className={buttonClasses.secondary}>{online ? t.goOffline : t.goOnline}</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {sp.nouvelle && <Alert kind="success">{t.created}</Alert>}
      {suspended && <Alert kind="error">{fmt(t.suspended, { reason: store.suspension_reason ? ` : ${store.suspension_reason}` : "" })}</Alert>}
      {!online && !suspended && <Alert kind="info">{t.offline}</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-2xl font-bold">{t.customize}</h2>
          <p className="mt-1 text-sm text-muted">{t.customizeBody}</p>
          <div className="mt-6">
            <DesignForm storeId={store.id} name={store.name} theme={parseTheme(store.theme)} config={config} contactEmail={store.contact_email} />
          </div>
        </section>

        <div className="flex flex-col gap-8">
          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">{t.products}</h2>
            <p className="mt-2 text-sm text-muted">
              {fmt(t.productsSummary, { count: activeCount })}
              {proposedCount > 0 && <> · <strong className="text-ink">{fmt(t.toReview, { count: proposedCount })}</strong></>}
            </p>
            {hasSamples && (
              <p className="mt-2 rounded-lg bg-marigold-soft px-3 py-2 text-xs text-ink">{t.samples}</p>
            )}
            <Link href={`/tableau-de-bord/boutiques/${store.id}/produits`} className={`${buttonClasses.secondary} mt-4 w-full`}>
              {t.manageProducts}
            </Link>
          </section>

          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">{t.regenerate}</h2>
            <p className="mt-1 text-sm text-muted">
              {t.regenerateBody}{" "}
              <strong className="text-ink">{plural(regenerationsLeft, t.regenerationsOne, t.regenerationsOther)}</strong>
            </p>
            {regenerationsLeft > 0 && !suspended ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand">{t.editAndRegenerate}</summary>
                <div className="mt-4">
                  <BriefForm
                    action={regenerateStore}
                    storeId={store.id}
                    defaults={briefDefaults}
                    submitLabel={t.regenerateSubmit}
                  />
                </div>
              </details>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
