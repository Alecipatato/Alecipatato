import { type CustomHostname, normalizeCustomHostname } from "./normalize";

/**
 * Cloudflare for SaaS : « custom hostnames » de la zone de la plateforme.
 * Le client fait pointer son domaine (CNAME) vers CLOUDFLARE_CNAME_TARGET ; Cloudflare émet
 * automatiquement le certificat HTTPS et envoie le trafic à l'application.
 */

export class DomainConfigError extends Error {}

export function customDomainsConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_CNAME_TARGET);
}

export function cnameTarget(): string {
  return process.env.CLOUDFLARE_CNAME_TARGET ?? "";
}

async function call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  if (!customDomainsConfigured()) throw new DomainConfigError("Domaines personnalisés non configurés (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CLOUDFLARE_CNAME_TARGET).");
  const base = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";
  const response = await fetch(`${base}/zones/${process.env.CLOUDFLARE_ZONE_ID}/custom_hostnames${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const json = (await response.json().catch(() => ({}))) as { success?: boolean; result?: unknown; errors?: { code?: number; message?: string }[] };
  if (!response.ok || json.success === false) {
    const message = json.errors?.map((e) => e.message).filter(Boolean).join(" ; ") || `HTTP ${response.status}`;
    throw new Error(`Cloudflare : ${message}`);
  }
  return json.result;
}

function read(result: unknown): CustomHostname {
  const hostname = normalizeCustomHostname(result, cnameTarget());
  if (!hostname) throw new Error("Cloudflare : réponse illisible.");
  return hostname;
}

/** Déclare le domaine du client chez Cloudflare (certificat HTTPS validé par enregistrement TXT). */
export async function createCustomHostname(hostname: string): Promise<CustomHostname> {
  return read(await call("POST", "", { hostname, ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } } }));
}

export async function getCustomHostname(id: string): Promise<CustomHostname> {
  return read(await call("GET", `/${encodeURIComponent(id)}`));
}

export async function deleteCustomHostname(id: string): Promise<void> {
  await call("DELETE", `/${encodeURIComponent(id)}`);
}
