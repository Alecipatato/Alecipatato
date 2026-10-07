import { notFound } from "next/navigation";
import { getStoreBySite } from "@/lib/stores";
import { getStoreBase, StoreShell } from "@/storefront/components";

/**
 * Enveloppe commune à toutes les pages d'une boutique (en-tête, recherche,
 * catégories, panier, pied de page). On n'y arrive jamais directement :
 * le proxy (src/proxy.ts) y redirige en interne selon le hostname.
 */
export default async function StoreLayout({ params, children }: LayoutProps<"/s/[site]">) {
  const { site } = await params;
  const decoded = decodeURIComponent(site);
  const data = await getStoreBySite(decoded);
  if (!data) notFound();

  return (
    <StoreShell store={data.store} products={data.products} base={await getStoreBase(decoded)}>
      {children}
    </StoreShell>
  );
}
