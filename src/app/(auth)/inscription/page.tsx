import type { Metadata } from "next";
import Link from "next/link";
import { getMessages } from "@/lib/i18n/server";
import { Divider, GoogleButton, SignUpForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.signUp.metaTitle };
}

export default async function SignUpPage() {
  const t = (await getMessages()).auth;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t.signUp.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.signUp.subtitle}</p>
      </div>
      <GoogleButton label={t.google.signUp} />
      <Divider />
      <SignUpForm />
      <p className="text-center text-sm text-muted">
        {t.signUp.hasAccount}{" "}
        <Link href="/connexion" className="font-semibold text-brand hover:underline">{t.signUp.signIn}</Link>
      </p>
    </div>
  );
}
