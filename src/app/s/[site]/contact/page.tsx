import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MESSAGES } from "@/lib/i18n/messages";
import { getStoreBySite } from "@/lib/stores";
import { ContactForm } from "@/storefront/contact-form";

export async function generateMetadata({ params }: PageProps<"/s/[site]/contact">): Promise<Metadata> {
  const data = await getStoreBySite(decodeURIComponent((await params).site));
  const title = MESSAGES[data?.store.language ?? "en"].emails.contact.metaTitle;
  return { title: { absolute: data ? `${title} | ${data.store.name}` : title } };
}

/** Page « Nous joindre » : formulaire envoyé au propriétaire de la boutique. */
export default async function ContactPage({ params }: PageProps<"/s/[site]/contact">) {
  const site = decodeURIComponent((await params).site);
  const data = await getStoreBySite(site);
  if (!data) notFound();
  const t = MESSAGES[data.store.language].emails.contact;
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="sf-heading text-3xl">{t.title}</h1>
      <p className="mt-2 text-[var(--sf-muted)]">{t.intro}</p>
      {data.store.contactEmail && <p className="mt-2 text-sm"><a href={`mailto:${data.store.contactEmail}`} className="underline">{data.store.contactEmail}</a></p>}
      <div className="mt-8">
        <ContactForm site={site} />
      </div>
    </div>
  );
}
