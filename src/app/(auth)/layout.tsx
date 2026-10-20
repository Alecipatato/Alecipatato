import { Logo } from "@/components/ui";
import { LanguageSwitcher } from "@/lib/i18n/client";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/store-config";

/** Mise en page des pages de connexion : formulaire à gauche, rappel de la promesse à droite. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = (await getMessages(locale)).auth.aside;
  const price = (cents: number) => formatPrice(cents, "CAD", locale);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <LanguageSwitcher />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
      </div>
      <aside className="relative hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-marigold/30 blur-3xl" />
        <p className="relative font-display text-3xl font-semibold leading-tight">{t.pitch}</p>
        <div className="relative space-y-4">
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
            <p className="text-sm text-white/70">{t.example}</p>
            <dl className="mt-3 space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between"><dt>{t.cost}</dt><dd>− {price(2500)}</dd></div>
              <div className="flex justify-between"><dt>{t.margin}</dt><dd>{price(2500)}</dd></div>
              <div className="flex justify-between text-white/70"><dt>{t.commission}</dt><dd>− {price(375)}</dd></div>
              <div className="flex justify-between border-t border-white/20 pt-1.5 font-semibold"><dt>{t.forYou}</dt><dd>{price(2125)}</dd></div>
            </dl>
          </div>
          <p className="text-sm text-white/70">{t.noSubscription}</p>
        </div>
      </aside>
    </div>
  );
}
