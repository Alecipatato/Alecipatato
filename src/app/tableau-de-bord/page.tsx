import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { requireUser } from "@/lib/auth";
import { fmt, plural } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { getPlatformSettings } from "@/lib/settings";
import { parseStoreConfig } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { baseDomainForHost, storeUrl } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.list.metaTitle };
}

const STATUS_CLASSES = {
  active: "bg-brand-soft text-brand-strong",
  draft: "bg-paper text-muted border border-line",
  suspended: "bg-danger-soft text-danger",
} as const;

export default async function DashboardPage({ searchParams }: PageProps<"/tableau-de-bord">) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createUserClient();
  const [{ data: stores }, settings, m] = await Promise.all([
    supabase.from("stores").select("id, name, subdomain, status, config, created_at, products(count)").eq("owner_id", user.id).order("created_at"),
    getPlatformSettings(),
    getMessages(),
  ]);
  const t = m.dashboard.list;
  const baseDomain = baseDomainForHost((await headers()).get("host"));
  const count = stores?.length ?? 0;
  const max = settings.freePlan.maxStores;
  const canCreate = count < max;
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      {sp.bienvenue && <Alert kind="success">{t.welcome}</Alert>}
      {sp.message === "mot-de-passe-modifie" && <Alert kind="success">{t.passwordChanged}</Alert>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{firstName ? fmt(t.hello, { name: firstName }) : t.title}</h1>
          <p className="mt-1 text-muted">{fmt(count > 1 ? t.quotaOther : t.quotaOne, { count, max })}</p>
        </div>
        {canCreate && <Link href="/tableau-de-bord/nouvelle" className={buttonClasses.primary}>{t.create}</Link>}
      </div>

      {stores && stores.length > 0 ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {stores.map((store) => {
            const config = parseStoreConfig(store.config);
            const status = (store.status in STATUS_CLASSES ? store.status : "draft") as keyof typeof STATUS_CLASSES;
            const productCount = (store.products as { count: number }[] | null)?.[0]?.count ?? 0;
            return (
              <li key={store.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="flex items-center gap-3 px-5 py-4" style={{ background: config.colors.background, color: config.colors.text }}>
                  <span aria-hidden className="h-8 w-8 rounded-lg" style={{ background: config.colors.primary }} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{store.name}</p>
                    <p className="truncate text-xs opacity-70">{config.content.tagline}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-4 border-t border-line p-5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status]}`}>{m.dashboard.status[status]}</span>
                    <span className="text-muted">{plural(productCount, t.products, t.products)}</span>
                  </div>
                  <a href={storeUrl(store.subdomain, baseDomain)} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-brand hover:underline">
                    {store.subdomain}.{baseDomain} ↗
                  </a>
                  <Link href={`/tableau-de-bord/boutiques/${store.id}`} className={buttonClasses.secondary}>{t.manage}</Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <h2 className="font-display text-2xl font-bold">{t.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">{t.emptyBody}</p>
          <Link href="/tableau-de-bord/nouvelle" className={`${buttonClasses.primary} mt-6`}>{t.start}</Link>
        </div>
      )}
    </div>
  );
}
