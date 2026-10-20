import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { getMessages } from "@/lib/i18n/server";
import { Divider, GoogleButton, SignInForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.signIn.metaTitle };
}

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const { suite, erreur } = await searchParams;
  const t = (await getMessages()).auth;
  const next = typeof suite === "string" ? suite : undefined;
  const error = erreur === "lien" || erreur === "google" ? t.signIn.errors[erreur] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t.signIn.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.signIn.subtitle}</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <GoogleButton next={next} label={t.google.continue} />
      <Divider />
      <SignInForm next={next} />
      <p className="text-center text-sm text-muted">
        {t.signIn.noAccount}{" "}
        <Link href="/inscription" className="font-semibold text-brand hover:underline">{t.signIn.createFree}</Link>
      </p>
    </div>
  );
}
