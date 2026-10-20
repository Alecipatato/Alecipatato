import type { Metadata } from "next";
import Link from "next/link";
import { getMessages } from "@/lib/i18n/server";
import { ForgotPasswordForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.forgot.metaTitle };
}

export default async function ForgotPasswordPage() {
  const t = (await getMessages()).auth.forgot;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.subtitle}</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/connexion" className="text-center text-sm font-semibold text-brand hover:underline">
        {t.back}
      </Link>
    </div>
  );
}
