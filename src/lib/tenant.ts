/**
 * Détermine, à partir du hostname, quelle boutique (« tenant ») afficher.
 *
 *   mondomaine.com / www.mondomaine.com  → site de la plateforme
 *   zenyoga.mondomaine.com               → boutique « zenyoga » (sous-domaine)
 *   boutique-du-client.com               → boutique liée à ce domaine personnalisé
 */

export type Tenant =
  | { kind: "platform" }
  /** `site` = sous-domaine (sans point) ou domaine personnalisé complet (avec point). */
  | { kind: "store"; site: string }
  | { kind: "invalid" };

/** Sous-domaines qu'aucun client ne peut prendre. */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "dashboard",
  "mail",
  "static",
  "assets",
  "status",
  "help",
  "support",
]);

/** Format DNS valide, identique à la contrainte SQL sur stores.subdomain. */
export const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function getRootDomain(): string {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000").toLowerCase();
}

export function resolveTenant(hostHeader: string | null, rootDomain: string): Tenant {
  if (!hostHeader) return { kind: "invalid" };

  const host = hostHeader.trim().toLowerCase().replace(/\.$/, "");
  const root = rootDomain.toLowerCase();

  if (host === root || host === `www.${root}`) return { kind: "platform" };

  if (host.endsWith(`.${root}`)) {
    const subdomain = host.slice(0, -(root.length + 1));
    if (!SUBDOMAIN_PATTERN.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain)) {
      return { kind: "invalid" };
    }
    return { kind: "store", site: subdomain };
  }

  // Domaine personnalisé : on ignore le port éventuel.
  const hostname = host.split(":")[0];
  if (!hostname.includes(".")) return { kind: "invalid" };
  return { kind: "store", site: hostname };
}

/** URL publique d'une boutique sur son sous-domaine. */
export function storeUrl(subdomain: string, rootDomain = getRootDomain()): string {
  const protocol = rootDomain.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${subdomain}.${rootDomain}`;
}
