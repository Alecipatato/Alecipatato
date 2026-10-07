import { headers } from "next/headers";
import { DEMO_STORES } from "@/lib/demo-stores";
import { getRootDomain, isLocalHostname, storeUrl } from "@/lib/tenant";

/** Page d'accueil de la plateforme (domaine principal). */
export default async function Home() {
  // En local, on reprend le port réellement utilisé (3000, 3001…) pour les liens.
  const host = (await headers()).get("host") ?? getRootDomain();
  const [hostname, port] = host.split(":");
  const isLocal = isLocalHostname(hostname);
  const baseDomain = isLocal ? `localhost${port ? `:${port}` : ""}` : getRootDomain();
  const isDev = process.env.NODE_ENV === "development";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-20">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">[NOM DE TA PLATEFORME]</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Votre boutique en ligne, créée par l&apos;IA. Gratuitement.</h1>
        <p className="mt-4 text-lg opacity-75">
          Décrivez votre niche : l&apos;IA génère le nom, le design, les textes et sélectionne les produits.
          Vous ne payez qu&apos;une commission sur vos ventes.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-60">Boutiques de démonstration</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.values(DEMO_STORES).map(({ store }) => (
            <li key={store.subdomain} className="rounded-xl border border-black/10 p-5 dark:border-white/15">
              <a href={storeUrl(store.subdomain, baseDomain)} className="block hover:underline">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="h-3 w-3 rounded-full" style={{ background: store.config.colors.primary }} />
                  {store.name}
                </span>
                <span className="mt-1 block text-sm opacity-60">
                  Thème « {store.theme} » · {store.subdomain}.{baseDomain}
                </span>
              </a>
              {isDev && (
                <a href={`/s/${store.subdomain}`} className="mt-3 block text-xs underline opacity-60">
                  Le lien ne s&apos;ouvre pas (Safari) ? Ouvrir via /s/{store.subdomain}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
