import { parseRefundRules, type RefundRules } from "./money";
import { createAdminClient } from "./supabase/admin";

/**
 * Réglages de la plateforme (table platform_settings), modifiables sans toucher
 * au code. Les valeurs par défaut s'appliquent si une clé est absente ou invalide.
 */
export interface PlatformSettings {
  freePlan: { maxStores: number; maxRegenerationsPerStore: number };
  aiRateLimit: { maxRequestsPerHour: number };
  /** Ex. "0.15" (chaîne, convertie en entier pour les calculs). */
  commissionRate: string;
  payoutReserveDays: number;
  refundRules: RefundRules;
  usdCadFallbackRate: string;
  stripeFeesPaidBy: "platform" | "store";
  disputeFeeCents: number;
}

const DEFAULTS: PlatformSettings = {
  freePlan: { maxStores: 1, maxRegenerationsPerStore: 3 },
  aiRateLimit: { maxRequestsPerHour: 10 },
  commissionRate: "0.15",
  payoutReserveDays: 7,
  refundRules: parseRefundRules(null),
  usdCadFallbackRate: "1.38",
  stripeFeesPaidBy: "platform",
  disputeFeeCents: 1500,
};

const KEYS = [
  "free_plan_limits",
  "ai_rate_limit",
  "commission_rate",
  "payout_reserve_days",
  "refund_rules",
  "usd_cad_fallback_rate",
  "stripe_fees_paid_by",
  "dispute_fee_cents",
];

const nonNegativeInt = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback);

/** Taux décimal positif sous forme de chaîne ("0.15"), dans [min, max]. */
function decimalString(v: unknown, fallback: string, min: number, max: number): string {
  const text = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d+(\.\d+)?$/.test(text) && Number(text) >= min && Number(text) <= max ? text : fallback;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await createAdminClient().from("platform_settings").select("key, value").in("key", KEYS);
  if (error) throw new Error(`Lecture des réglages impossible : ${error.message}`);

  const byKey = Object.fromEntries((data ?? []).map((row) => [row.key, row.value])) as Record<string, unknown>;
  const free = (byKey.free_plan_limits ?? {}) as Record<string, unknown>;
  const rate = (byKey.ai_rate_limit ?? {}) as Record<string, unknown>;

  return {
    freePlan: {
      maxStores: nonNegativeInt(free.max_stores, DEFAULTS.freePlan.maxStores),
      maxRegenerationsPerStore: nonNegativeInt(free.max_regenerations_per_store, DEFAULTS.freePlan.maxRegenerationsPerStore),
    },
    aiRateLimit: { maxRequestsPerHour: nonNegativeInt(rate.max_requests_per_hour, DEFAULTS.aiRateLimit.maxRequestsPerHour) },
    commissionRate: decimalString(byKey.commission_rate, DEFAULTS.commissionRate, 0, 1),
    payoutReserveDays: nonNegativeInt(byKey.payout_reserve_days, DEFAULTS.payoutReserveDays),
    refundRules: parseRefundRules(byKey.refund_rules),
    usdCadFallbackRate: decimalString(byKey.usd_cad_fallback_rate, DEFAULTS.usdCadFallbackRate, 0.5, 3),
    stripeFeesPaidBy: byKey.stripe_fees_paid_by === "store" ? "store" : "platform",
    disputeFeeCents: nonNegativeInt(byKey.dispute_fee_cents, DEFAULTS.disputeFeeCents),
  };
}
