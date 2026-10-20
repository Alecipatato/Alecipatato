import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEMO_STORES } from "@/lib/demo-stores";
import { MESSAGES } from "@/lib/i18n/messages";
import { storeAcceptsPayments } from "@/lib/payments/checkout";
import { getStoreBySite } from "@/lib/stores";
import { isStripeConfigured } from "@/lib/stripe";
import { CartView } from "@/storefront/cart";
import { getStoreBase } from "@/storefront/components";

export async function generateMetadata({ params }: PageProps<"/s/[site]/panier">): Promise<Metadata> {
  const { site } = await params;
  const data = await getStoreBySite(decodeURIComponent(site));
  const title = MESSAGES[data?.store.language ?? "en"].storefront.cart.metaTitle;
  return { title: { absolute: data ? `${title} | ${data.store.name}` : title } };
}

export default async function CartPage({ params }: PageProps<"/s/[site]/panier">) {
  const { site } = await params;
  const decoded = decodeURIComponent(site);
  const data = await getStoreBySite(decoded);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="sf-heading mb-8 text-3xl">{MESSAGES[data.store.language].storefront.cart.title}</h1>
      <CartView
        storeId={data.store.id}
        site={decoded}
        currency={data.store.currency}
        base={await getStoreBase(decoded)}
        checkoutEnabled={!DEMO_STORES[decoded] && isStripeConfigured() && (await storeAcceptsPayments(data.store.id))}
      />
    </div>
  );
}
