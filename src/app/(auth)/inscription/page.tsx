import type { Metadata } from "next";
import Link from "next/link";
import { Divider, GoogleButton, SignUpForm } from "../forms";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Créez votre compte</h1>
        <p className="mt-2 text-sm text-muted">Gratuit, sans carte de crédit. Votre boutique est prête en quelques minutes.</p>
      </div>
      <GoogleButton label="S'inscrire avec Google" />
      <Divider />
      <SignUpForm />
      <p className="text-center text-sm text-muted">
        Déjà un compte ?{" "}
        <Link href="/connexion" className="font-semibold text-brand hover:underline">Se connecter</Link>
      </p>
    </div>
  );
}
