/**
 * Chiffrement des jetons d'accès publicitaires (Meta, TikTok) avant de les garder en base :
 * AES-256-GCM (Web Crypto, aussi disponible sur Cloudflare Workers), clé ADS_ENCRYPTION_KEY
 * (32 octets en base64, ex. `openssl rand -base64 32`). Fonctions pures, testées dans crypto.test.ts.
 */

const PREFIX = "v1";

function decodeKey(base64: string | undefined): Uint8Array | null {
  if (!base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64.trim()), (c) => c.charCodeAt(0));
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function importKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Vrai si la clé de chiffrement est configurée et valide. */
export function hasEncryptionKey(keyBase64 = process.env.ADS_ENCRYPTION_KEY): boolean {
  return decodeKey(keyBase64) !== null;
}

/** Chiffre un texte : « v1.<iv>.<données> » (base64). */
export async function encryptSecret(plain: string, keyBase64 = process.env.ADS_ENCRYPTION_KEY): Promise<string> {
  const raw = decodeKey(keyBase64);
  if (!raw) throw new Error("ADS_ENCRYPTION_KEY manquante ou invalide (32 octets en base64).");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(raw), new TextEncoder().encode(plain)));
  return `${PREFIX}.${toBase64(iv)}.${toBase64(data)}`;
}

/** Déchiffre un texte produit par encryptSecret ; null si la clé ne correspond pas ou si le texte est altéré. */
export async function decryptSecret(sealed: string, keyBase64 = process.env.ADS_ENCRYPTION_KEY): Promise<string | null> {
  const raw = decodeKey(keyBase64);
  const [prefix, iv, data] = sealed.split(".");
  if (!raw || prefix !== PREFIX || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) as BufferSource }, await importKey(raw), fromBase64(data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
