import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { requireUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { parseStoreConfig } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { baseDomainForHost, storeUrl } from "@/lib/tenant";

export const metadata: Metadata = { title: "Mes boutiques" };

const STATUS = {
  active: { label: "En ligne", className: "bg-brand-soft text-brand-strong" },
  draft: { label: "Hors ligne", className: "bg-paper text-muted border border-line" },
  suspended: { label: "Suspendue", className: "bg-danger-soft text-danger" },
} as const;

export default async function DashboardPage({ searchParams }: PageProps<"/tableau-de-bord">) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createUserClient();
  const [{ data: stores }, settings] = await Promise.all([
    supabase.from("stores").select("id, name, subdomain, status, config, created_at, products(count)").eq("owner_id", user.id).order("created_at"),
    getPlatformSettings(),
  ]);
  const baseDomain = baseDomainForHost((await headers()).get("host"));
  const canCreate = (stores?.length ?? 0) < settings.freePlan.maxStores;
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      {sp.bienvenue && <Alert kind="success">Votre adresse est confirmée. Bienvenue ! Créez votre première boutique ci-dessous.</Alert>}
      {sp.message === "mot-de-passe-modifie" && <Alert kind="success">Votre mot de passe a été modifié.</Alert>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{firstName ? `Bonjour ${firstName}` : "Mes boutiques"}</h1>
          <p className="mt-1 text-muted">
            {stores?.length ?? 0} boutique{(stores?.length ?? 0) > 1 ? "s" : ""} sur {settings.freePlan.maxStores} incluse
            {settings.freePlan.maxStores > 1 ? "s" : ""} dans le compte gratuit.
          </p>
        </div>
        {canCreate && <Link href="/tableau-de-bord/nouvelle" className={buttonClasses.primary}>+ Créer une boutique</Link>}
      </div>

      {stores && stores.length > 0 ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {stores.map((store) => {
            const config = parseStoreConfig(store.config);
            const status = STATUS[store.status as keyof typeof STATUS] ?? STATUS.draft;
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
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
                    <span className="text-muted">{productCount} produits</span>
                  </div>
                  <a href={storeUrl(store.subdomain, baseDomain)} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-brand hover:underline">
                    {store.subdomain}.{baseDomain} ↗
                  </a>
                  <Link href={`/tableau-de-bord/boutiques/${store.id}`} className={buttonClasses.secondary}>Gérer et personnaliser</Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <h2 className="font-display text-2xl font-bold">Créez votre première boutique</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">Décrivez votre idée en quelques phrases : l&apos;IA s&apos;occupe du nom, du design, des textes et des produits.</p>
          <Link href="/tableau-de-bord/nouvelle" className={`${buttonClasses.primary} mt-6`}>Commencer</Link>
        </div>
      )}
    </div>
  );
}
