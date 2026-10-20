import Link from "next/link";
import { Logo } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { getCurrentUser } from "@/lib/auth";
import { LanguageSwitcher } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { PLATFORM_NAME } from "@/lib/platform";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = getSupabasePublicEnv() ? await getCurrentUser() : null;
  const m = await getMessages();
  const { nav, footer } = m.common;
  const legal = m.legal;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Logo />
          <nav aria-label={nav.label} className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
            <Link href="/#fonctionnement" className="hover:text-ink">{nav.how}</Link>
            <Link href="/#demos" className="hover:text-ink">{nav.examples}</Link>
            <Link href="/#tarif" className="hover:text-ink">{nav.pricing}</Link>
            <Link href="/#faq" className="hover:text-ink">{nav.faq}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            {user ? (
              <Link href="/tableau-de-bord" className={`${buttonClasses.primary} py-2.5`}>{nav.dashboard}</Link>
            ) : (
              <>
                <Link href="/connexion" className="hidden px-3 py-2 text-sm font-semibold sm:inline">{nav.signIn}</Link>
                <Link href="/inscription" className={`${buttonClasses.primary} py-2.5`}>{nav.createStore}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted">{footer.tagline}</p>
            <LanguageSwitcher className="mt-4" />
          </div>
          <div className="text-sm">
            <p className="font-semibold">{footer.product}</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li><Link href="/#fonctionnement" className="hover:text-ink">{nav.how}</Link></li>
              <li><Link href="/#tarif" className="hover:text-ink">{nav.pricing}</Link></li>
              <li><Link href="/#faq" className="hover:text-ink">{footer.faq}</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold">{footer.account}</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li><Link href="/inscription" className="hover:text-ink">{footer.createAccount}</Link></li>
              <li><Link href="/connexion" className="hover:text-ink">{nav.signIn}</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold">{legal.footerHeading}</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li><Link href="/conditions" className="hover:text-ink">{legal.platform.conditions}</Link></li>
              <li><Link href="/confidentialite" className="hover:text-ink">{legal.platform.confidentialite}</Link></li>
            </ul>
          </div>
        </div>
        <p className="border-t border-line px-4 py-5 text-center text-xs text-muted">
          {fmt(footer.rights, { year: new Date().getFullYear(), platform: PLATFORM_NAME })}
        </p>
      </footer>
    </>
  );
}
