import { createAdminClient } from "./supabase/admin";

/**
 * Réglages de la plateforme (table platform_settings), modifiables sans toucher
 * au code. Les valeurs par défaut s'appliquent si une clé est absente ou invalide.
 */
export interface PlatformSettings {
  freePlan: { maxStores: number; maxRegenerationsPerStore: number };
  aiRateLimit: { maxRequestsPerHour: number };
}

const DEFAULTS: PlatformSettings = {
  freePlan: { maxStores: 1, maxRegenerationsPerStore: 3 },
  aiRateLimit: { maxRequestsPerHour: 10 },
};

const positiveInt = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback);

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .select("key, value")
    .in("key", ["free_plan_limits", "ai_rate_limit"]);
  if (error) throw new Error(`Lecture des réglages impossible : ${error.message}`);

  const byKey = Object.fromEntries((data ?? []).map((row) => [row.key, row.value])) as Record<string, Record<string, unknown> | undefined>;
  const free = byKey.free_plan_limits ?? {};
  const rate = byKey.ai_rate_limit ?? {};
  return {
    freePlan: {
      maxStores: positiveInt(free.max_stores, DEFAULTS.freePlan.maxStores),
      maxRegenerationsPerStore: positiveInt(free.max_regenerations_per_store, DEFAULTS.freePlan.maxRegenerationsPerStore),
    },
    aiRateLimit: { maxRequestsPerHour: positiveInt(rate.max_requests_per_hour, DEFAULTS.aiRateLimit.maxRequestsPerHour) },
  };
}
