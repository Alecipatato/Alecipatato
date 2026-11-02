import { createAdminClient } from "./supabase/admin";

/**
 * Journal des actions des administrateurs (table admin_audit_log, lisible dans /admin/securite).
 * Ne bloque jamais l'action : une erreur d'écriture est seulement signalée dans les journaux du serveur.
 */
export async function logAdminAction(adminId: string, action: string, target: { type?: string; id?: string } = {}, details: Record<string, unknown> = {}) {
  const { error } = await createAdminClient()
    .from("admin_audit_log")
    .insert({ admin_id: adminId, action, target_type: target.type ?? null, target_id: target.id ?? null, details });
  if (error) console.warn("Journal admin :", error.message);
}
