import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { Divider, GoogleButton, SignInForm } from "../forms";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  lien: "Ce lien est invalide ou a expiré. Connectez-vous, ou demandez un nouveau lien.",
  google: "La connexion avec Google n'a pas pu démarrer. Réessayez, ou utilisez votre courriel.",
};

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const { suite, erreur } = await searchParams;
  const next = typeof suite === "string" ? suite : undefined;
  const error = typeof erreur === "string" ? ERRORS[erreur] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Bon retour !</h1>
        <p className="mt-2 text-sm text-muted">Connectez-vous pour gérer vos boutiques.</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <GoogleButton next={next} label="Continuer avec Google" />
      <Divider />
      <SignInForm next={next} />
      <p className="text-center text-sm text-muted">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-semibold text-brand hover:underline">Créer un compte gratuit</Link>
      </p>
    </div>
  );
}
