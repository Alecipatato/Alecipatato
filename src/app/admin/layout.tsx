import Link from "next/link";
import { Logo } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { LanguageSwitcher } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/server";

/** Espace administrateur (rôle « admin » dans profiles). Les autres comptes obtiennent une page introuvable. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const m = await getMessages();
  const t = m.admin;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo className="[&>span]:bg-white [&>span]:text-ink" />
            <nav aria-label={t.title} className="flex gap-5 text-sm font-medium">
              <Link href="/admin" className="text-white/70 hover:text-white">{t.tabs.overview}</Link>
              <Link href="/admin/boutiques" className="text-white/70 hover:text-white">{t.tabs.stores}</Link>
              <Link href="/admin/moderation" className="text-white/70 hover:text-white">{t.tabs.moderation}</Link>
              <Link href="/admin/commandes" className="text-white/70 hover:text-white">{t.tabs.orders}</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <LanguageSwitcher className="[&_select]:text-white [&_option]:text-ink" />
            <Link href="/tableau-de-bord" className="text-white/70 hover:text-white">{m.dashboard.nav.stores}</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
