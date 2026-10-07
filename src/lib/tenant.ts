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

/** Retire le port : « demo.localhost:3001 » → « demo.localhost ». */
function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname);
}

export function resolveTenant(hostHeader: string | null, rootDomain: string): Tenant {
  if (!hostHeader) return { kind: "invalid" };

  // Le port est ignoré : le serveur de dev peut tourner sur 3000, 3001…
  const hostname = stripPort(hostHeader.trim().toLowerCase()).replace(/\.$/, "");
  const root = stripPort(rootDomain.toLowerCase());

  if (hostname === root || hostname === `www.${root}`) return { kind: "platform" };
  // En local, 127.0.0.1 est équivalent à localhost.
  if (isLocalHostname(root) && isLocalHostname(hostname)) return { kind: "platform" };

  if (hostname.endsWith(`.${root}`)) {
    const subdomain = hostname.slice(0, -(root.length + 1));
    if (!SUBDOMAIN_PATTERN.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain)) {
      return { kind: "invalid" };
    }
    return { kind: "store", site: subdomain };
  }

  // Domaine personnalisé.
  if (!hostname.includes(".")) return { kind: "invalid" };
  return { kind: "store", site: hostname };
}

/** URL publique d'une boutique sur son sous-domaine (`baseDomain` peut inclure un port). */
export function storeUrl(subdomain: string, baseDomain = getRootDomain()): string {
  const protocol = isLocalHostname(stripPort(baseDomain)) ? "http" : "https";
  return `${protocol}://${subdomain}.${baseDomain}`;
}
