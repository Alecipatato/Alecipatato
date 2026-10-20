import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal-document";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { platformPolicyContext } from "@/lib/legal/platform-context";
import { LEGAL_TEMPLATES_DATE, platformPolicy } from "@/lib/legal/policies";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).legal.platform.conditions };
}

export default async function PlatformLegalPage() {
  const locale = await getLocale();
  const m = await getMessages(locale);
  const doc = platformPolicy("conditions", await platformPolicyContext(locale), locale);
  const updated = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${LEGAL_TEMPLATES_DATE}T12:00:00`));
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <LegalDocumentView doc={doc} updated={fmt(m.legal.updated, { date: updated })} headingClassName="font-display text-4xl" />
    </div>
  );
}
