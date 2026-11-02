import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { currentAssuranceLevel, isAdmin, requireUser } from "@/lib/auth";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { PLATFORM_NAME } from "@/lib/platform";
import { createUserClient } from "@/lib/supabase/server";
import { EnrollTotp, VerifyTotp } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.mfa.metaTitle };
}

/** Double authentification des administrateurs : configuration (première fois) ou code à chaque connexion. */
export default async function AdminMfaPage() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) notFound();
  if ((await currentAssuranceLevel()) === "aal2") redirect("/admin");
  const t = (await getMessages()).admin.mfa;
  const { data } = await (await createUserClient()).auth.mfa.listFactors();
  const factor = (data?.totp ?? []).find((f) => f.status === "verified");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-12">
      <Logo />
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{factor ? t.verifyTitle : t.title}</h1>
        <p className="mt-2 text-sm text-muted">{factor ? fmt(t.verifyIntro, { platform: PLATFORM_NAME }) : t.intro}</p>
      </div>
      <section className="rounded-2xl border border-line bg-white p-6">
        {factor ? <VerifyTotp factorId={factor.id} /> : (
          <>
            <h2 className="mb-4 font-display text-lg font-bold">{t.setupTitle}</h2>
            <EnrollTotp />
          </>
        )}
      </section>
    </main>
  );
}
