import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const name = (user.user_metadata?.full_name as string | undefined) || user.email;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label="Tableau de bord" className="text-sm font-medium">
              <Link href="/tableau-de-bord" className="text-muted hover:text-ink">Mes boutiques</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden max-w-56 truncate text-muted sm:inline">{name}</span>
            <form action={signOut}>
              <button type="submit" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-paper hover:text-ink">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
