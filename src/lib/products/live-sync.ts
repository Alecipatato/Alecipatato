import { CjError, cjRequest, isCjConfigured } from "../cj/client";
import type { CjWebhookMessage } from "../cj/webhook-message";
import { createAdminClient } from "../supabase/admin";
import { syncProductsByIds } from "./sync";

/**
 * Données toujours à jour (étape D) :
 *  - notifications CJ (webhooks) : un produit ou une variante qui n'est plus en vente est retiré tout de suite
 *    de la galerie et de toutes les boutiques ; un changement de stock ou de fiche relance la synchronisation
 *    des produits concernés ;
 *  - abonnements : CJ ne notifie que les produits abonnés (limite du compte, 1000 au niveau 1) — d'abord
 *    ceux en vente dans les boutiques, puis les produits tendance les plus demandés.
 * CJ ne renvoie pas une notification manquée et ne signale pas toujours les changements de prix :
 * la synchronisation planifiée (sync.ts, refresh.ts) reste en place.
 */

const SUBSCRIBE_BATCH = 100;
const MAX_VIDS = 50;
/** Date très ancienne : le produit tendance passe en tête de la prochaine vérification. */
const RECHECK_NOW = "1970-01-01T00:00:00Z";

/** Retire un produit CJ partout : galerie des produits tendance et toutes les boutiques. */
export async function removeSupplierProduct(pid: string): Promise<{ stores: number; trending: number }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: products }, { data: trends }] = await Promise.all([
    admin
      .from("products")
      .update({ status: "rejected", sync_status: "unavailable", sync_note: null, last_synced_at: now })
      .eq("supplier", "cj")
      .eq("supplier_product_id", pid)
      .in("status", ["proposed", "active"])
      .select("id"),
    admin
      .from("trending_products")
      .update({ status: "rejected", reject_reason: "unavailable", checked_at: now })
      .eq("supplier_product_id", pid)
      .neq("status", "rejected")
      .select("id"),
  ]);
  return { stores: products?.length ?? 0, trending: trends?.length ?? 0 };
}

/** Produits des boutiques (proposés ou en vente) qui contiennent une de ces variantes. */
async function productIdsForVariants(vids: string[]): Promise<string[]> {
  const admin = createAdminClient();
  const ids = new Set<string>();
  const list = vids.slice(0, MAX_VIDS);
  const { data: direct } = await admin.from("products").select("id").eq("supplier", "cj").in("status", ["proposed", "active"]).in("supplier_variant_id", list);
  for (const p of direct ?? []) ids.add(p.id);
  for (const vid of list) {
    const { data } = await admin.from("products").select("id").eq("supplier", "cj").in("status", ["proposed", "active"]).contains("variants", [{ vid }]);
    for (const p of data ?? []) ids.add(p.id);
  }
  return [...ids];
}

/** Traite une notification CJ déjà vérifiée ; retourne un court résumé (journal). */
export async function handleCjMessage(message: CjWebhookMessage): Promise<string> {
  const admin = createAdminClient();
  if (message.type === "PRODUCT" && message.pid) {
    if (message.removed) {
      const r = await removeSupplierProduct(message.pid);
      return `removed:${r.stores}+${r.trending}`;
    }
    // Fiche modifiée (prix, images, description…) : resynchronisation tout de suite.
    const { data } = await admin.from("products").select("id").eq("supplier", "cj").eq("supplier_product_id", message.pid).in("status", ["proposed", "active"]);
    await admin.from("trending_products").update({ checked_at: RECHECK_NOW }).eq("supplier_product_id", message.pid).eq("status", "ready");
    const report = await syncProductsByIds((data ?? []).map((p) => p.id));
    return `resynced:${report.checked}`;
  }
  // Variante retirée ou stock modifié : les fiches concernées sont resynchronisées (variante épuisée,
  // bascule de la variante par défaut, produit en rupture ou retiré).
  const ids = await productIdsForVariants(message.vids);
  await admin.from("trending_products").update({ checked_at: RECHECK_NOW }).in("supplier_variant_id", message.vids.slice(0, MAX_VIDS)).eq("status", "ready");
  const report = await syncProductsByIds(ids);
  return `resynced:${report.checked}`;
}

// ---------------------------------------------------------------------------
// Inscription chez CJ
// ---------------------------------------------------------------------------

const REGISTER_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Enregistre l'adresse de rappel chez CJ (notifications produit et stock). Refait chaque jour :
 * CJ ferme automatiquement une notification qui échoue trop souvent, et l'inscription la rouvre.
 */
export async function ensureCjWebhook(): Promise<"registered" | "unchanged" | "not_configured"> {
  const url = process.env.CJ_WEBHOOK_URL;
  if (!url || !isCjConfigured()) return "not_configured";
  const admin = createAdminClient();
  const { data: state } = await admin.from("cj_webhook_state").select("callback_url, registered_at").maybeSingle();
  if (state?.callback_url === url && Date.parse(state.registered_at) > Date.now() - REGISTER_EVERY_MS) return "unchanged";
  const on = { type: "ENABLE", callbackUrls: [url] };
  const off = { type: "CANCEL", callbackUrls: [url] };
  // Commandes et suivi : lus par la tâche planifiée /api/cron/orders (pas de notification pour l'instant).
  await cjRequest("POST", "/webhook/set", { body: { product: on, stock: on, order: off, logistics: off } });
  await admin.from("cj_webhook_state").upsert({ id: 1, callback_url: url, registered_at: new Date().toISOString() });
  return "registered";
}

function subscriptionLimit(): number {
  const n = Number(process.env.CJ_WEBHOOK_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 1000;
}

/** Abonne aux notifications les produits à surveiller et désabonne ceux qui ne servent plus. */
export async function syncCjSubscriptions(): Promise<{ subscribed: number; unsubscribed: number; stoppedBy?: string }> {
  const admin = createAdminClient();
  const [{ data: inStores }, { data: trends }, { data: current }] = await Promise.all([
    admin.from("products").select("supplier_product_id").eq("supplier", "cj").in("status", ["proposed", "active"]).limit(20_000),
    admin.from("trending_products").select("supplier_product_id").eq("status", "ready").order("demand_score", { ascending: false }).limit(5000),
    admin.from("cj_subscriptions").select("supplier_product_id").limit(20_000),
  ]);
  // Priorité : produits vendus dans les boutiques, puis produits tendance du plus au moins demandé.
  const wanted = [...new Set([...(inStores ?? []), ...(trends ?? [])].map((r) => r.supplier_product_id).filter(Boolean))].slice(0, subscriptionLimit());
  const wantedSet = new Set(wanted);
  const have = new Set((current ?? []).map((r) => r.supplier_product_id));
  const toRemove = [...have].filter((pid) => !wantedSet.has(pid));
  const toAdd = wanted.filter((pid) => !have.has(pid));
  let subscribed = 0;
  let unsubscribed = 0;

  // Désabonner d'abord : libère des places dans la limite du compte.
  for (let i = 0; i < toRemove.length; i += SUBSCRIBE_BATCH) {
    const batch = toRemove.slice(i, i + SUBSCRIBE_BATCH);
    await cjRequest("POST", "/webhook/product/unsubscribe", { body: { productIds: batch } });
    await admin.from("cj_subscriptions").delete().in("supplier_product_id", batch);
    unsubscribed += batch.length;
  }
  for (let i = 0; i < toAdd.length; i += SUBSCRIBE_BATCH) {
    const batch = toAdd.slice(i, i + SUBSCRIBE_BATCH);
    try {
      await cjRequest("POST", "/webhook/product/subscribe", { body: { productIds: batch, subscribeAll: false } });
    } catch (err) {
      // 1606010 : notifications produit non activées ; 1606011 : limite d'abonnements atteinte.
      if (err instanceof CjError && (err.code === 1606010 || err.code === 1606011)) return { subscribed, unsubscribed, stoppedBy: String(err.code) };
      throw err;
    }
    // Produits refusés (déjà abonnés, inexistants…) : notés aussi, pour ne pas les redemander à chaque passage.
    await admin.from("cj_subscriptions").upsert(batch.map((pid) => ({ supplier_product_id: pid })), { onConflict: "supplier_product_id" });
    subscribed += batch.length;
  }
  return { subscribed, unsubscribed };
}
