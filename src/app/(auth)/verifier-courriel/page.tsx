import type { Metadata } from "next";
import Link from "next/link";
import { ResendConfirmationForm } from "../forms";

export const metadata: Metadata = { title: "Vérifiez vos courriels" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/verifier-courriel">) {
  const { courriel } = await searchParams;
  const email = typeof courriel === "string" ? courriel : "";

  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden className="grid h-14 w-14 place-items-center rounded-2xl bg-marigold-soft text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3.5 6.5 8.5 6.5 8.5-6.5" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold">Vérifiez vos courriels</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Nous avons envoyé un lien de confirmation{email && <> à <strong className="text-ink">{email}</strong></>}.
          Cliquez dessus pour activer votre compte, puis créez votre première boutique.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-white p-5 text-sm">
        <p className="font-medium">Rien reçu après quelques minutes ?</p>
        <p className="mt-1 text-muted">Regardez dans vos indésirables, ou renvoyez le courriel.</p>
        {email && (
          <div className="mt-4">
            <ResendConfirmationForm email={email} />
          </div>
        )}
      </div>
      <Link href="/connexion" className="text-center text-sm font-semibold text-brand hover:underline">
        J&apos;ai confirmé, me connecter
      </Link>
    </div>
  );
}
