import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPasswordPage() {
  // On arrive ici via le lien du courriel, qui a ouvert une session temporaire.
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Choisissez un nouveau mot de passe</h1>
        {user?.email && <p className="mt-2 text-sm text-muted">Compte : {user.email}</p>}
      </div>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <>
          <Alert kind="error">Ce lien a expiré ou a déjà été utilisé.</Alert>
          <Link href="/mot-de-passe-oublie" className="text-center text-sm font-semibold text-brand hover:underline">
            Demander un nouveau lien
          </Link>
        </>
      )}
    </div>
  );
}
