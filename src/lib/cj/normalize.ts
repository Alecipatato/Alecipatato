/**
 * Lecture des réponses de l'API CJ Dropshipping (v2.0).
 *
 * Les réponses sont lues de façon TOLÉRANTE : CJ a plusieurs variantes de noms de
 * champs selon les versions de l'API (ex. `productNameEn` / `nameEn`, prix en
 * nombre, en texte ou en fourchette « 3.49 -- 5.10 »). Tout ce qui sort d'ici est
 * normalisé et validé ; le reste du code ne voit jamais le JSON brut de CJ.
 * Fonctions pures, testées dans normalize.test.ts.
 */

export interface CjProductSummary {
  pid: string;
  name: string;
  image: string | null;
  priceUsdCents: number;
  category: string | null;
  /** Nombre de boutiques qui ont importé ce produit chez CJ (indicateur de demande ; 0 si absent). */
  listedCount: number;
}

export interface CjVariant {
  vid: string;
  name: string | null;
  sku: string | null;
  image: string | null;
  priceUsdCents: number;
}

export interface CjProductDetail {
  pid: string;
  name: string;
  description: string;
  category: string | null;
  images: string[];
  variants: CjVariant[];
}

export interface CjShippingOption {
  name: string;
  priceUsdCents: number;
  daysMin: number;
  daysMax: number;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const firstString = (o: Json, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};

/** 3.49 | "3.49" | "$3.49" | "3.49 -- 5.10" | "3.49-5.10" → 349 (le plus bas d'une fourchette). */
export function parseUsdCents(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  const numbers = value.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
  if (!numbers?.length) return null;
  const min = Math.min(...numbers.map(Number));
  return Number.isFinite(min) ? Math.round(min * 100) : null;
}

/** "7-15" | "7~15" | "7-15 days" | "12" | 12 → { min, max } en jours. */
export function parseAging(value: unknown): { min: number; max: number } | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  const numbers = text.match(/\d+/g)?.map(Number).filter((n) => n > 0 && n < 365);
  if (!numbers?.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

/** Tableau, tableau JSON en texte, liste séparée par des virgules ou URL seule → URL https uniquement. */
export function parseImages(value: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    } else list = text.split(",");
  }
  const urls = list
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .map((u) => (u.startsWith("//") ? `https:${u}` : u))
    .filter((u) => /^https:\/\/[^\s"'<>]+$/.test(u));
  return [...new Set(urls)];
}

/** Retire le HTML des descriptions CJ et limite la longueur. */
export function stripHtml(html: unknown, max = 3000): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max);
}

export function normalizeListItem(raw: unknown): CjProductSummary | null {
  if (!isObject(raw)) return null;
  const pid = firstString(raw, "pid", "id", "productId");
  const name = firstString(raw, "productNameEn", "nameEn", "productName", "name");
  const priceUsdCents = parseUsdCents(raw.sellPrice ?? raw.nowPrice ?? raw.productSellPrice ?? raw.price);
  if (!pid || !name || priceUsdCents === null) return null;
  const image = parseImages(raw.productImage ?? raw.bigImage ?? raw.image)[0] ?? null;
  const listed = Number(raw.listedNum ?? raw.listingCount ?? raw.listedCount ?? 0);
  return {
    pid,
    name: name.slice(0, 300),
    image,
    priceUsdCents,
    category: firstString(raw, "categoryName", "threeCategoryName", "category"),
    listedCount: Number.isFinite(listed) && listed > 0 ? Math.floor(listed) : 0,
  };
}

/** Accepte `data.list`, `data.content[].productList`, `data.content` ou un tableau direct. */
export function normalizeListResponse(data: unknown): CjProductSummary[] {
  let rows: unknown[] = [];
  if (Array.isArray(data)) rows = data;
  else if (isObject(data)) {
    if (Array.isArray(data.list)) rows = data.list;
    else if (Array.isArray(data.content)) {
      rows = data.content.flatMap((c) => (isObject(c) && Array.isArray(c.productList) ? c.productList : [c]));
    }
  }
  const seen = new Set<string>();
  return rows
    .map(normalizeListItem)
    .filter((p): p is CjProductSummary => p !== null && !seen.has(p.pid) && Boolean(seen.add(p.pid)));
}

export function normalizeProductDetail(data: unknown): CjProductDetail | null {
  if (!isObject(data)) return null;
  const pid = firstString(data, "pid", "id", "productId");
  const name = firstString(data, "productNameEn", "nameEn", "productName");
  if (!pid || !name) return null;

  const productPrice = parseUsdCents(data.sellPrice);
  const variants = (Array.isArray(data.variants) ? data.variants : [])
    .filter(isObject)
    .map((v): CjVariant | null => {
      const vid = firstString(v, "vid", "variantId", "id");
      const price = parseUsdCents(v.variantSellPrice ?? v.sellPrice ?? v.price) ?? productPrice;
      if (!vid || price === null) return null;
      return {
        vid,
        name: firstString(v, "variantNameEn", "variantName", "variantKey"),
        sku: firstString(v, "variantSku", "sku"),
        image: parseImages(v.variantImage)[0] ?? null,
        priceUsdCents: price,
      };
    })
    .filter((v): v is CjVariant => v !== null);

  const images = parseImages(data.productImageSet).length ? parseImages(data.productImageSet) : parseImages(data.productImage);
  return {
    pid,
    name: name.slice(0, 300),
    description: stripHtml(data.description ?? data.productDescription),
    category: firstString(data, "categoryName", "category"),
    images: images.slice(0, 8),
    variants,
  };
}

export function normalizeShippingOptions(data: unknown): CjShippingOption[] {
  const rows = Array.isArray(data) ? data : isObject(data) && Array.isArray(data.list) ? data.list : [];
  return rows
    .filter(isObject)
    .map((r): CjShippingOption | null => {
      const name = firstString(r, "logisticName", "name");
      const price = parseUsdCents(r.logisticPrice ?? r.price);
      const aging = parseAging(r.logisticAging ?? r.aging);
      if (!name || price === null || !aging) return null;
      return { name, priceUsdCents: price, daysMin: aging.min, daysMax: aging.max };
    })
    .filter((o): o is CjShippingOption => o !== null);
}

/** Option la moins chère dont le délai maximal respecte la limite (15 jours pour le Canada). */
export function bestShippingOption(options: CjShippingOption[], maxDays: number): CjShippingOption | null {
  return options.filter((o) => o.daysMax <= maxDays).sort((a, b) => a.priceUsdCents - b.priceUsdCents || a.daysMax - b.daysMax)[0] ?? null;
}

/** Stock total d'une variante (somme des entrepôts). null si la réponse est illisible. */
export function normalizeStock(data: unknown): number | null {
  const rows = Array.isArray(data) ? data : isObject(data) ? [data] : [];
  let total = 0;
  let found = false;
  for (const r of rows.filter(isObject)) {
    const n = Number(r.storageNum ?? r.totalInventoryNum ?? r.inventoryNum ?? r.inventory);
    if (Number.isFinite(n) && n >= 0) {
      total += Math.floor(n);
      found = true;
    }
  }
  return found ? total : null;
}

// ---------------------------------------------------------------------------
// Commandes (phase 6)
// ---------------------------------------------------------------------------

export interface CjCreatedOrder {
  orderId: string;
  /** Montant total facturé par CJ (produits + livraison), si renvoyé. */
  amountUsdCents: number | null;
}

export type CjOrderStage = "unpaid" | "processing" | "shipped" | "delivered" | "cancelled" | "unknown";

export interface CjOrderDetail {
  orderId: string;
  stage: CjOrderStage;
  rawStatus: string | null;
  trackingNumber: string | null;
  carrier: string | null;
}

/** Réponse de createOrderV2 : l'identifiant CJ de la commande. */
export function normalizeCreatedOrder(data: unknown): CjCreatedOrder | null {
  const d = isObject(data) ? data : typeof data === "string" ? { orderId: data } : null;
  if (!d) return null;
  const orderId = firstString(d, "orderId", "id", "cjOrderId", "orderNum");
  if (!orderId) return null;
  return { orderId, amountUsdCents: parseUsdCents(d.orderAmount ?? d.productAmount ?? d.totalAmount ?? null) };
}

/** Statuts CJ (CREATED, IN_CART, UNPAID, UNSHIPPED, SHIPPED, DELIVERED, CANCELLED…) → étape simplifiée. */
export function orderStage(status: string | null): CjOrderStage {
  const s = (status ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  if (!s) return "unknown";
  if (/CANCEL|CLOSE|REFUND/.test(s)) return "cancelled";
  if (/DELIVER|RECEIV|COMPLETE|FINISH/.test(s)) return "delivered";
  if (/SHIP|TRANSIT|DISPATCH/.test(s) && !/UNSHIP/.test(s)) return "shipped";
  if (/UNPAID|CREATED|IN_CART|WAIT_PAY/.test(s)) return "unpaid";
  if (/UNSHIP|PENDING|PROCESS|PAID|DISPATCHING/.test(s)) return "processing";
  return "unknown";
}

/** Réponse de getOrderDetail : statut et numéro de suivi. */
export function normalizeOrderDetail(data: unknown): CjOrderDetail | null {
  const d = isObject(data) ? data : null;
  if (!d) return null;
  const orderId = firstString(d, "orderId", "id");
  if (!orderId) return null;
  const rawStatus = firstString(d, "orderStatus", "status");
  const trackingNumber = firstString(d, "trackNumber", "trackingNumber", "logisticsNumber");
  let stage = orderStage(rawStatus);
  // Un numéro de suivi sans statut « expédié » explicite : le colis est parti.
  if (trackingNumber && (stage === "processing" || stage === "unknown")) stage = "shipped";
  return { orderId, stage, rawStatus, trackingNumber, carrier: firstString(d, "logisticName", "logisticsName", "shippingMethod") };
}

/** Lien public de suivi (multi-transporteurs). */
export function trackingUrl(trackingNumber: string): string {
  return `https://t.17track.net/en#nums=${encodeURIComponent(trackingNumber)}`;
}

/** Solde du portefeuille CJ (USD) → cents. null si la réponse est illisible. */
export function normalizeBalance(data: unknown): { availableUsdCents: number; frozenUsdCents: number } | null {
  const d = isObject(data) ? data : typeof data === "number" || typeof data === "string" ? { amount: data } : null;
  if (!d) return null;
  const available = parseUsdCents(d.amount ?? d.balance ?? d.availableAmount ?? d.availableBalance ?? null);
  if (available === null) return null;
  return { availableUsdCents: available, frozenUsdCents: parseUsdCents(d.freezeAmount ?? d.frozenAmount ?? null) ?? 0 };
}
