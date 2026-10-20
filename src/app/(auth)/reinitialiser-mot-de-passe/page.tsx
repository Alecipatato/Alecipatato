import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { ResetPasswordForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.reset.metaTitle };
}

export default async function ResetPasswordPage() {
  // On arrive ici via le lien du courriel, qui a ouvert une session temporaire.
  const user = await getCurrentUser();
  const t = (await getMessages()).auth.reset;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t.title}</h1>
        {user?.email && <p className="mt-2 text-sm text-muted">{fmt(t.account, { email: user.email })}</p>}
      </div>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <>
          <Alert kind="error">{t.expired}</Alert>
          <Link href="/mot-de-passe-oublie" className="text-center text-sm font-semibold text-brand hover:underline">
            {t.requestNew}
          </Link>
        </>
      )}
    </div>
  );
}
