import type { Metadata } from "next";
import Link from "next/link";
import { rich } from "@/lib/i18n/rich";
import { getMessages } from "@/lib/i18n/server";
import { ResendConfirmationForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.checkEmail.metaTitle };
}

export default async function CheckEmailPage({ searchParams }: PageProps<"/verifier-courriel">) {
  const { courriel } = await searchParams;
  const email = typeof courriel === "string" ? courriel : "";
  const t = (await getMessages()).auth.checkEmail;

  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden className="grid h-14 w-14 place-items-center rounded-2xl bg-marigold-soft text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3.5 6.5 8.5 6.5 8.5-6.5" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold">{t.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {t.sent}
          {email && rich(t.sentTo, { b: (s) => <strong className="text-ink">{s}</strong> }, { email })}. {t.next}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-white p-5 text-sm">
        <p className="font-medium">{t.nothing}</p>
        <p className="mt-1 text-muted">{t.spam}</p>
        {email && (
          <div className="mt-4">
            <ResendConfirmationForm email={email} />
          </div>
        )}
      </div>
      <Link href="/connexion" className="text-center text-sm font-semibold text-brand hover:underline">
        {t.confirmed}
      </Link>
    </div>
  );
}
