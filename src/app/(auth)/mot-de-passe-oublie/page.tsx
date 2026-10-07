import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Mot de passe oublié</h1>
        <p className="mt-2 text-sm text-muted">
          Entrez l&apos;adresse de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link href="/connexion" className="text-center text-sm font-semibold text-brand hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
