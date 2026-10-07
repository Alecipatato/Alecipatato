import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySite } from "@/lib/stores";
import { THEMES } from "@/themes";

/**
 * Page d'accueil d'une boutique. On n'y arrive jamais directement :
 * le proxy (src/proxy.ts) y redirige en interne selon le hostname.
 */

export async function generateMetadata({ params }: PageProps<"/s/[site]">): Promise<Metadata> {
  const { site } = await params;
  const data = await getStoreBySite(decodeURIComponent(site));
  if (!data) return { title: "Boutique introuvable" };
  return {
    title: data.store.name,
    description: data.store.config.content.tagline || data.store.config.content.hero.subtitle,
  };
}

export default async function StorePage({ params }: PageProps<"/s/[site]">) {
  const { site } = await params;
  const data = await getStoreBySite(decodeURIComponent(site));
  if (!data) notFound();

  const Theme = THEMES[data.store.theme];
  return <Theme {...data} />;
}
