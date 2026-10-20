import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui";
import { isAdmin, requireUser } from "@/lib/auth";
import { LanguageSwitcher } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const name = (user.user_metadata?.full_name as string | undefined) || user.email;
  const m = await getMessages();
  const t = m.dashboard.nav;
  const admin = await isAdmin(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label={t.label} className="flex gap-5 text-sm font-medium">
              <Link href="/tableau-de-bord" className="text-muted hover:text-ink">{t.stores}</Link>
              <Link href="/tableau-de-bord/statistiques" className="text-muted hover:text-ink">{m.stats.nav}</Link>
              <Link href="/tableau-de-bord/paiements" className="text-muted hover:text-ink">{t.payments}</Link>
              {admin && <Link href="/admin" className="text-muted hover:text-ink">{t.admin}</Link>}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <LanguageSwitcher />
            <span className="hidden max-w-56 truncate text-muted sm:inline">{name}</span>
            <form action={signOut}>
              <button type="submit" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-paper hover:text-ink">
                {t.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
