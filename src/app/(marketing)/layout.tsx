import Link from "next/link";
import { Logo } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { getCurrentUser } from "@/lib/auth";
import { PLATFORM_NAME } from "@/lib/platform";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = getSupabasePublicEnv() ? await getCurrentUser() : null;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Logo />
          <nav aria-label="Navigation principale" className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
            <Link href="/#fonctionnement" className="hover:text-ink">Fonctionnement</Link>
            <Link href="/#demos" className="hover:text-ink">Exemples</Link>
            <Link href="/#tarif" className="hover:text-ink">Tarif</Link>
            <Link href="/#faq" className="hover:text-ink">Questions</Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/tableau-de-bord" className={`${buttonClasses.primary} py-2.5`}>Mon tableau de bord</Link>
            ) : (
              <>
                <Link href="/connexion" className="hidden px-3 py-2 text-sm font-semibold sm:inline">Connexion</Link>
                <Link href="/inscription" className={`${buttonClasses.primary} py-2.5`}>Créer ma boutique</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted">
              Des boutiques en ligne complètes, créées par l&apos;IA, pour les entrepreneurs du Québec et du Canada.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">Produit</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li><Link href="/#fonctionnement" className="hover:text-ink">Fonctionnement</Link></li>
              <li><Link href="/#tarif" className="hover:text-ink">Tarif</Link></li>
              <li><Link href="/#faq" className="hover:text-ink">Questions fréquentes</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold">Compte</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li><Link href="/inscription" className="hover:text-ink">Créer un compte</Link></li>
              <li><Link href="/connexion" className="hover:text-ink">Connexion</Link></li>
            </ul>
          </div>
        </div>
        <p className="border-t border-line px-4 py-5 text-center text-xs text-muted">© {new Date().getFullYear()} {PLATFORM_NAME}. Tous droits réservés.</p>
      </footer>
    </>
  );
}
