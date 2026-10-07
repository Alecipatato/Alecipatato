import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import type { StoreBrief } from "@/lib/ai/store-generator";
import { requireUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice, parseStoreConfig, parseTheme } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { baseDomainForHost, storeUrl } from "@/lib/tenant";
import { regenerateStore, setProductVisibility, setStoreOnline } from "../../actions";
import { BriefForm } from "../../brief-form";
import { DesignForm } from "./design-form";

export const metadata: Metadata = { title: "Gérer ma boutique" };

export default async function StoreAdminPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();

  // La sécurité (RLS) garantit qu'un client ne lit que ses propres boutiques.
  const [{ data: store }, { data: products }, settings] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, subdomain, status, theme, config, contact_email, regeneration_count, generation_brief, suspension_reason")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase.from("products").select("id, title, category, price_cents, status, supplier").eq("store_id", id).order("position"),
    getPlatformSettings(),
  ]);
  if (!store) notFound();

  const config = parseStoreConfig(store.config);
  const url = storeUrl(store.subdomain, baseDomainForHost((await headers()).get("host")));
  const regenerationsLeft = Math.max(settings.freePlan.maxRegenerationsPerStore - store.regeneration_count, 0);
  const suspended = store.status === "suspended";
  const online = store.status === "active";
  const hasSamples = (products ?? []).some((p) => p.supplier === "sample");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/tableau-de-bord" className="text-sm font-medium text-muted hover:text-ink">← Mes boutiques</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-bold tracking-tight">{store.name}</h1>
            <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm font-medium text-brand hover:underline">{url} ↗</a>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className={buttonClasses.primary}>Voir ma boutique</a>
            {!suspended && (
              <form action={setStoreOnline}>
                <input type="hidden" name="store_id" value={store.id} />
                <input type="hidden" name="online" value={online ? "0" : "1"} />
                <button type="submit" className={buttonClasses.secondary}>{online ? "Mettre hors ligne" : "Mettre en ligne"}</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {sp.nouvelle && <Alert kind="success">Votre boutique est prête et déjà en ligne ! Personnalisez-la ci-dessous ou visitez-la.</Alert>}
      {suspended && <Alert kind="error">Cette boutique est suspendue{store.suspension_reason ? ` : ${store.suspension_reason}` : "."} Contactez le support.</Alert>}
      {!online && !suspended && <Alert kind="info">Votre boutique est hors ligne : les visiteurs ne peuvent pas la voir.</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-2xl font-bold">Personnaliser</h2>
          <p className="mt-1 text-sm text-muted">Style, couleurs, polices et textes de votre vitrine.</p>
          <div className="mt-6">
            <DesignForm storeId={store.id} name={store.name} theme={parseTheme(store.theme)} config={config} contactEmail={store.contact_email} />
          </div>
        </section>

        <div className="flex flex-col gap-8">
          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">Produits</h2>
            {hasSamples && (
              <p className="mt-2 rounded-lg bg-marigold-soft px-3 py-2 text-xs text-ink">
                Produits d&apos;exemple proposés par l&apos;IA. Ils seront remplacés par de vrais produits du fournisseur, avec photos.
              </p>
            )}
            <ul className="mt-4 divide-y divide-line">
              {(products ?? []).map((p) => {
                const visible = p.status === "active";
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className={`min-w-0 flex-1 ${visible ? "" : "opacity-50"}`}>
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-muted">{p.category} · {formatPrice(Number(p.price_cents), "CAD")}</p>
                    </div>
                    {!suspended && (
                      <form action={setProductVisibility}>
                        <input type="hidden" name="store_id" value={store.id} />
                        <input type="hidden" name="product_id" value={p.id} />
                        <input type="hidden" name="visible" value={visible ? "0" : "1"} />
                        <button type="submit" className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:border-ink/30">
                          {visible ? "Masquer" : "Afficher"}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">Régénérer avec l&apos;IA</h2>
            <p className="mt-1 text-sm text-muted">
              L&apos;IA recrée l&apos;identité, les textes et les produits. Votre adresse ne change pas.{" "}
              <strong className="text-ink">{regenerationsLeft} régénération{regenerationsLeft > 1 ? "s" : ""} restante{regenerationsLeft > 1 ? "s" : ""}.</strong>
            </p>
            {regenerationsLeft > 0 && !suspended ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Modifier la description et régénérer</summary>
                <div className="mt-4">
                  <BriefForm
                    action={regenerateStore}
                    storeId={store.id}
                    defaults={(store.generation_brief as Partial<StoreBrief> | null) ?? { niche: "" }}
                    submitLabel="Régénérer la boutique"
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
