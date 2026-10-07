import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySite } from "@/lib/stores";
import { CartView } from "@/storefront/cart";
import { getStoreBase } from "@/storefront/components";

export async function generateMetadata({ params }: PageProps<"/s/[site]/panier">): Promise<Metadata> {
  const { site } = await params;
  const data = await getStoreBySite(decodeURIComponent(site));
  return { title: { absolute: data ? `Panier | ${data.store.name}` : "Panier" } };
}

export default async function CartPage({ params }: PageProps<"/s/[site]/panier">) {
  const { site } = await params;
  const decoded = decodeURIComponent(site);
  const data = await getStoreBySite(decoded);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="sf-heading mb-8 text-3xl">Votre panier</h1>
      <CartView storeId={data.store.id} currency={data.store.currency} base={await getStoreBase(decoded)} />
    </div>
  );
}
