import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal-document";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { LEGAL_TEMPLATES_DATE, STORE_POLICY_PAGES, type StorePolicyPage, storePolicy } from "@/lib/legal/policies";
import { PLATFORM_NAME } from "@/lib/platform";
import { MAX_DELIVERY_DAYS } from "@/lib/products/sourcing";
import { getStoreBySite } from "@/lib/stores";
import type { StoreWithProducts } from "@/lib/types";

async function load(params: PageProps<"/s/[site]/legal/[page]">["params"]) {
  const { site, page } = await params;
  const data = await getStoreBySite(decodeURIComponent(site));
  if (!data || !STORE_POLICY_PAGES.includes(page as StorePolicyPage)) return null;
  return { data, page: page as StorePolicyPage };
}

/** Pages légales générées à partir des informations de la boutique. */
function policyFor({ store, products }: StoreWithProducts, page: StorePolicyPage) {
  const mins = products.map((p) => p.deliveryDaysMin).filter((d): d is number => d !== null);
  const maxs = products.map((p) => p.deliveryDaysMax).filter((d): d is number => d !== null);
  const legalName = store.legalInfo.legalName || store.name;
  return storePolicy(
    page,
    {
      storeName: store.name,
      legalName,
      address: store.legalInfo.address,
      email: store.contactEmail,
      privacyOfficer: store.legalInfo.privacyOfficer || legalName,
      returnDays: store.legalInfo.returnDays,
      deliveryMin: mins.length ? Math.min(...mins) : 5,
      deliveryMax: maxs.length ? Math.max(...maxs) : MAX_DELIVERY_DAYS,
      platformName: PLATFORM_NAME,
      currency: store.currency,
      adPixels: [...(store.pixels.meta ? ["Meta"] : []), ...(store.pixels.tiktok ? ["TikTok"] : [])],
    },
    store.language,
  );
}

export async function generateMetadata({ params }: PageProps<"/s/[site]/legal/[page]">): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded) return {};
  return { title: { absolute: `${policyFor(loaded.data, loaded.page).title} | ${loaded.data.store.name}` } };
}

export default async function StoreLegalPage({ params }: PageProps<"/s/[site]/legal/[page]">) {
  const loaded = await load(params);
  if (!loaded) notFound();
  const { store } = loaded.data;
  const updated = new Intl.DateTimeFormat(intlLocale(store.language), { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${LEGAL_TEMPLATES_DATE}T12:00:00`));
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <LegalDocumentView doc={policyFor(loaded.data, loaded.page)} updated={fmt(MESSAGES[store.language].legal.updated, { date: updated })} headingClassName="sf-heading" />
    </div>
  );
}
