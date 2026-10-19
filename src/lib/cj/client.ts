import { createAdminClient } from "../supabase/admin";

/**
 * Client HTTP de l'API CJ Dropshipping v2.0.
 *  - Jeton d'accès mémorisé en base (15 jours ; création limitée par CJ).
 *  - Au plus ~1 appel par seconde (limite des comptes CJ standards).
 *  - Nouvel essai automatique si CJ demande de ralentir.
 * CJ_API_BASE permet de viser un serveur simulé pour les tests locaux.
 */

const DEFAULT_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const MIN_INTERVAL_MS = 1100;
const RATE_LIMIT_CODES = new Set([1600200, 429]);

export class CjError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

export class CjNotConfiguredError extends CjError {
  constructor() {
    super("Le fournisseur CJ n'est pas encore configuré (clé CJ_API_KEY manquante).");
  }
}

export function isCjConfigured(): boolean {
  return Boolean(process.env.CJ_API_KEY);
}

const base = () => (process.env.CJ_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(nextSlot - now, 0);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

interface Envelope {
  code?: number;
  result?: boolean;
  success?: boolean;
  message?: string;
  data?: unknown;
}

async function rawCall(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | number>; body?: unknown; token?: string }) {
  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  await throttle();
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(opts.token && { "CJ-Access-Token": opts.token }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(20_000),
  });
  let json: Envelope = {};
  try {
    json = (await response.json()) as Envelope;
  } catch {
    // Réponse non JSON : traitée ci-dessous comme une erreur.
  }
  return { status: response.status, json };
}

const isSuccess = (status: number, json: Envelope) => status < 400 && (json.code === 200 || json.result === true || json.success === true);

// ---------------------------------------------------------------------------
// Jeton d'accès
// ---------------------------------------------------------------------------

interface TokenRow {
  access_token: string;
  access_expires_at: string;
  refresh_token: string | null;
  refresh_expires_at: string | null;
}

const parseDate = (value: unknown, fallbackMs: number) => {
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date(Date.now() + fallbackMs);
};

async function saveToken(data: unknown): Promise<string> {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof d.accessToken !== "string" || !d.accessToken) throw new CjError("CJ n'a pas renvoyé de jeton d'accès.");
  const row = {
    provider: "cj",
    access_token: d.accessToken,
    access_expires_at: parseDate(d.accessTokenExpiryDate, 14 * 86_400_000).toISOString(),
    refresh_token: typeof d.refreshToken === "string" ? d.refreshToken : null,
    refresh_expires_at: d.refreshToken ? parseDate(d.refreshTokenExpiryDate, 170 * 86_400_000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  await createAdminClient().from("integration_tokens").upsert(row);
  return row.access_token;
}

async function getAccessToken(forceNew = false): Promise<string> {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new CjNotConfiguredError();
  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_tokens")
    .select("access_token, access_expires_at, refresh_token, refresh_expires_at")
    .eq("provider", "cj")
    .maybeSingle<TokenRow>();

  const soon = Date.now() + 60 * 60 * 1000; // marge d'une heure
  if (data && !forceNew && new Date(data.access_expires_at).getTime() > soon) return data.access_token;

  if (data?.refresh_token && data.refresh_expires_at && new Date(data.refresh_expires_at).getTime() > soon) {
    const { status, json } = await rawCall("POST", "/authentication/refreshAccessToken", { body: { refreshToken: data.refresh_token } });
    if (isSuccess(status, json)) return saveToken(json.data);
  }

  const { status, json } = await rawCall("POST", "/authentication/getAccessToken", { body: { apiKey } });
  if (!isSuccess(status, json)) throw new CjError(`Authentification CJ refusée : ${json.message ?? `HTTP ${status}`}`, json.code);
  return saveToken(json.data);
}

/** Appel authentifié à l'API CJ. Retourne le champ `data` de la réponse. */
export async function cjRequest(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string | number>; body?: unknown } = {},
): Promise<unknown> {
  let token = await getAccessToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { status, json } = await rawCall(method, path, { ...opts, token });
    if (isSuccess(status, json)) return json.data;

    if (RATE_LIMIT_CODES.has(json.code ?? status) || status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (status === 401 && attempt === 0) {
      token = await getAccessToken(true); // jeton révoqué ou expiré : on en redemande un
      continue;
    }
    throw new CjError(`CJ ${path} : ${json.message ?? `HTTP ${status}`}`, json.code);
  }
  throw new CjError(`CJ ${path} : trop de requêtes, réessayez plus tard.`, 1600200);
}
