import { Logo } from "@/components/ui";

/** Mise en page des pages de connexion : formulaire à gauche, rappel de la promesse à droite. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
      </div>
      <aside className="relative hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-marigold/30 blur-3xl" />
        <p className="relative font-display text-3xl font-semibold leading-tight">
          Décrivez votre idée en deux phrases. L&apos;IA construit votre boutique en moins d&apos;une minute.
        </p>
        <div className="relative space-y-4">
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
            <p className="text-sm text-white/70">Exemple de vente à 50,00 $</p>
            <dl className="mt-3 space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between"><dt>Coût fournisseur + livraison</dt><dd>− 25,00 $</dd></div>
              <div className="flex justify-between"><dt>Marge brute</dt><dd>25,00 $</dd></div>
              <div className="flex justify-between text-white/70"><dt>Commission (15 % de la marge)</dt><dd>− 3,75 $</dd></div>
              <div className="flex justify-between border-t border-white/20 pt-1.5 font-semibold"><dt>Pour vous</dt><dd>21,25 $</dd></div>
            </dl>
          </div>
          <p className="text-sm text-white/70">Aucun abonnement. Vous payez seulement quand vous vendez.</p>
        </div>
      </aside>
    </div>
  );
}
