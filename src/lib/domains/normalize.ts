/**
 * Domaines personnalisés : validation de la saisie et lecture des réponses Cloudflare
 * (fonctions pures, testées dans normalize.test.ts).
 */

export interface DnsRecord {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  /** À quoi sert l'enregistrement : diriger le trafic, prouver la propriété, certificat HTTPS. */
  purpose: "traffic" | "ownership" | "ssl";
}

export interface CustomHostname {
  id: string;
  hostname: string;
  /** Statut global : actif quand le domaine pointe vers nous ET que le certificat HTTPS est émis. */
  state: "pending" | "active" | "failed";
  status: string;
  sslStatus: string;
  records: DnsRecord[];
  errors: string[];
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * « https://www.Boutique.com/page » → « www.boutique.com ». null si ce n'est pas un domaine utilisable :
 * pas de point, adresse IP, localhost, caractères non ASCII, ou domaine de la plateforme.
 */
export function normalizeDomain(input: string, rootDomain: string): string | null {
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host || host.length > 253 || !host.includes(".")) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || host.endsWith("localhost")) return null;
  const labels = host.split(".");
  if (!labels.every((l) => LABEL.test(l)) || !/^[a-z]{2,63}$/.test(labels.at(-1)!)) return null;
  const root = rootDomain.toLowerCase().replace(/:\d+$/, "");
  if (host === root || host.endsWith(`.${root}`)) return null;
  return host;
}

/** Un domaine « nu » (boutique.com) ne peut pas recevoir de CNAME chez la plupart des registraires. */
export function isApexDomain(host: string): boolean {
  const labels = host.split(".");
  // Approximation : 2 libellés (boutique.com) ou 3 avec un suffixe à deux niveaux (boutique.qc.ca, boutique.co.uk).
  if (labels.length === 2) return true;
  return labels.length === 3 && /^(qc|on|bc|ab|co|com|org|net|gc)$/.test(labels[1]) && labels[2].length === 2;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Réponse Cloudflare « custom hostname » → état simplifié + enregistrements DNS à créer. */
export function normalizeCustomHostname(raw: unknown, cnameTarget: string): CustomHostname | null {
  const r = obj(raw);
  const id = str(r.id);
  const hostname = str(r.hostname);
  if (!id || !hostname) return null;
  const ssl = obj(r.ssl);
  const status = str(r.status) || "pending";
  const sslStatus = str(ssl.status) || "initializing";

  const records: DnsRecord[] = [{ type: "CNAME", name: hostname, value: cnameTarget, purpose: "traffic" }];
  const ownership = obj(r.ownership_verification);
  if (status !== "active" && str(ownership.name) && str(ownership.value)) {
    records.push({ type: "TXT", name: str(ownership.name), value: str(ownership.value), purpose: "ownership" });
  }
  const validation = Array.isArray(ssl.validation_records) ? ssl.validation_records.map(obj) : [];
  if (sslStatus !== "active") {
    for (const v of validation) {
      if (str(v.txt_name) && str(v.txt_value)) records.push({ type: "TXT", name: str(v.txt_name), value: str(v.txt_value), purpose: "ssl" });
    }
    if (str(ssl.txt_name) && str(ssl.txt_value)) records.push({ type: "TXT", name: str(ssl.txt_name), value: str(ssl.txt_value), purpose: "ssl" });
  }

  const errors = [
    ...(Array.isArray(r.verification_errors) ? r.verification_errors.map(str) : []),
    ...(Array.isArray(ssl.validation_errors) ? ssl.validation_errors.map((e) => str(obj(e).message)) : []),
  ].filter(Boolean);

  const failed = /blocked|moved|deleted|failed/.test(status) || /expired|deleted|failed/.test(sslStatus);
  const state = status === "active" && sslStatus === "active" ? "active" : failed ? "failed" : "pending";
  return { id, hostname, state, status, sslStatus, records: dedupe(records), errors };
}

function dedupe(records: DnsRecord[]): DnsRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.type}|${r.name}|${r.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Enregistrements DNS stockés en base (colonne domain_records) → liste validée. */
export function parseDnsRecords(raw: unknown): DnsRecord[] {
  return (Array.isArray(raw) ? raw : [])
    .map(obj)
    .filter((r) => (r.type === "CNAME" || r.type === "TXT") && str(r.name) && str(r.value))
    .map((r) => ({ type: r.type as DnsRecord["type"], name: str(r.name), value: str(r.value), purpose: (["traffic", "ownership", "ssl"].includes(str(r.purpose)) ? r.purpose : "traffic") as DnsRecord["purpose"] }));
}
