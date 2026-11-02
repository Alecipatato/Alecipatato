import { type CommissionTier, commissionTierFor } from "./money";
import { getPlatformSettings } from "./settings";
import { createAdminClient } from "./supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fenêtre de calcul de la commission dégressive. */
export const COMMISSION_WINDOW_DAYS = 30;
/** Commandes qui comptent : payées et non annulées ni remboursées en totalité. */
const COUNTED_STATUSES = ["paid", "sent_to_supplier", "shipped", "delivered", "partially_refunded"];

export interface SellerCommission {
  /** Marge brute des 30 derniers jours, toutes boutiques du vendeur (cents). */
  marginCents: number;
  rate: string;
  tierIndex: number;
  tiers: CommissionTier[];
  next: CommissionTier | null;
}

/** Marge brute des 30 derniers jours d'un vendeur (somme des commandes payées de toutes ses boutiques). */
export async function sellerMarginCents(ownerId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: stores } = await admin.from("stores").select("id").eq("owner_id", ownerId);
  const ids = (stores ?? []).map((s) => s.id);
  if (ids.length === 0) return 0;
  const { data: orders } = await admin
    .from("orders")
    .select("gross_margin_cents")
    .in("store_id", ids)
    .in("status", COUNTED_STATUSES)
    .gte("paid_at", new Date(Date.now() - COMMISSION_WINDOW_DAYS * DAY_MS).toISOString())
    .limit(50_000);
  return (orders ?? []).reduce((sum, o) => sum + Math.max(Number(o.gross_margin_cents) || 0, 0), 0);
}

/** Taux de commission du vendeur aujourd'hui, selon les paliers et sa marge des 30 derniers jours. */
export async function getSellerCommission(ownerId: string): Promise<SellerCommission> {
  const [settings, marginCents] = await Promise.all([getPlatformSettings(), sellerMarginCents(ownerId)]);
  const { tier, index, next } = commissionTierFor(settings.commissionTiers, marginCents);
  return { marginCents, rate: tier.rate, tierIndex: index, tiers: settings.commissionTiers, next };
}

/** Marge brute des 30 derniers jours de chaque vendeur ayant vendu (administration : vendeurs par palier). */
export async function marginByOwner(): Promise<Map<string, number>> {
  const { data: orders } = await createAdminClient()
    .from("orders")
    .select("gross_margin_cents, stores!inner(owner_id)")
    .in("status", COUNTED_STATUSES)
    .gte("paid_at", new Date(Date.now() - COMMISSION_WINDOW_DAYS * DAY_MS).toISOString())
    .limit(50_000);
  const byOwner = new Map<string, number>();
  for (const o of orders ?? []) {
    const owner = (o.stores as unknown as { owner_id: string }).owner_id;
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + Math.max(Number(o.gross_margin_cents) || 0, 0));
  }
  return byOwner;
}
