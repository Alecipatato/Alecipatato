/**
 * Notifications (webhooks) de CJ : vérification de la signature et lecture des messages
 * produit / variante / stock (doc CJ « Webhook », vérifiée le 2026-11-01).
 * Fonctions pures (Web Crypto, aussi disponible sur Cloudflare Workers), testées dans webhook-message.test.ts.
 */

export interface CjWebhookMessage {
  messageId: string;
  type: string;
  messageType: string | null;
  /** Produit concerné (messages PRODUCT). */
  pid: string | null;
  /** Variantes concernées (messages VARIANT et STOCK). */
  vids: string[];
  /** Produit ou variante qui n'est plus en vente (DELETE, ou statut « hors vente »). */
  removed: boolean;
  /** Stock des entrepôts de Chine, par variante, quand le message en contient (messages STOCK). */
  stockByVid: Map<string, number>;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Signature attendue : Base64(HMAC-SHA256(clé = openId, message = corps brut de la requête)). */
export async function cjSignature(openId: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(openId), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Compare la signature reçue (en-tête `sign`) à celle attendue, en temps constant. */
export async function verifyCjSignature(body: string, sign: string | null, openId: string): Promise<boolean> {
  if (!sign) return false;
  const expected = await cjSignature(openId, body);
  if (expected.length !== sign.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sign.charCodeAt(i);
  return diff === 0;
}

/** Lit une notification produit, variante ou stock ; null pour les autres types (commandes, etc.). */
export function parseCjWebhook(data: unknown): CjWebhookMessage | null {
  if (!isObject(data)) return null;
  const messageId = text(data.messageId);
  const type = text(data.type)?.toUpperCase() ?? null;
  if (!messageId || !type || !["PRODUCT", "VARIANT", "STOCK"].includes(type)) return null;
  const messageType = text(data.messageType)?.toUpperCase() ?? null;
  const params = isObject(data.params) ? data.params : {};
  const message: CjWebhookMessage = { messageId, type, messageType, pid: null, vids: [], removed: false, stockByVid: new Map() };

  if (type === "PRODUCT") {
    message.pid = text(params.pid);
    // Statut produit : 2 = hors vente, 3 = en vente.
    message.removed = messageType === "DELETE" || Number(params.productStatus) === 2;
  } else if (type === "VARIANT") {
    const vid = text(params.vid);
    if (vid) message.vids = [vid];
    message.pid = text(params.pid);
    // Statut variante : 0 = hors vente, 1 = en vente.
    message.removed = messageType === "DELETE" || (params.variantStatus !== null && params.variantStatus !== undefined && Number(params.variantStatus) === 0);
  } else {
    // STOCK : { "<vid>": [{ vid, countryCode, storageNum }, …], … }
    for (const [key, rows] of Object.entries(params)) {
      const list = Array.isArray(rows) ? rows.filter(isObject) : [];
      const vid = text(list[0]?.vid) ?? key;
      message.vids.push(vid);
      const china = list.filter((r) => text(r.countryCode)?.toUpperCase() === "CN");
      if (china.length) message.stockByVid.set(vid, china.reduce((sum, r) => sum + Math.max(Math.floor(Number(r.storageNum ?? 0)) || 0, 0), 0));
    }
  }
  if (!message.pid && message.vids.length === 0) return null;
  return message;
}
