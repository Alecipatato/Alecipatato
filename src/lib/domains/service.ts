import { createAdminClient } from "../supabase/admin";
import { getRootDomain } from "../tenant";
import { createCustomHostname, deleteCustomHostname, getCustomHostname } from "./cloudflare";
import { normalizeDomain } from "./normalize";

/** Connexion, vérification et retrait du domaine personnalisé d'une boutique. */

export type ConnectResult = "connected" | "invalid" | "taken" | "failed";

export async function connectDomain(storeId: string, input: string): Promise<ConnectResult> {
  const domain = normalizeDomain(input, getRootDomain());
  if (!domain) return "invalid";
  const admin = createAdminClient();
  const { data: other } = await admin.from("stores").select("id").eq("custom_domain", domain).neq("id", storeId).maybeSingle();
  if (other) return "taken";

  const { data: store } = await admin.from("stores").select("domain_cf_id").eq("id", storeId).single();
  let hostname;
  try {
    hostname = await createCustomHostname(domain);
  } catch (err) {
    console.error("Domaine personnalisé :", err);
    return "failed";
  }
  // L'ancien domaine (s'il y en avait un) est retiré chez Cloudflare.
  if (store?.domain_cf_id) await deleteCustomHostname(store.domain_cf_id).catch((err) => console.warn("Ancien domaine :", err));
  const { error } = await admin
    .from("stores")
    .update({
      custom_domain: domain,
      domain_cf_id: hostname.id,
      domain_status: hostname.state,
      domain_records: hostname.records,
      domain_error: hostname.errors.join(" ; ") || null,
      domain_checked_at: new Date().toISOString(),
    })
    .eq("id", storeId);
  if (error) {
    await deleteCustomHostname(hostname.id).catch(() => {});
    return error.code === "23505" ? "taken" : "failed";
  }
  return "connected";
}

/** Relit l'état chez Cloudflare. Retourne le nouvel état, ou null si aucun domaine. */
export async function refreshDomain(storeId: string): Promise<"pending" | "active" | "failed" | null> {
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("domain_cf_id").eq("id", storeId).single();
  if (!store?.domain_cf_id) return null;
  const hostname = await getCustomHostname(store.domain_cf_id);
  await admin
    .from("stores")
    .update({
      domain_status: hostname.state,
      domain_records: hostname.records,
      domain_error: hostname.errors.join(" ; ") || null,
      domain_checked_at: new Date().toISOString(),
    })
    .eq("id", storeId);
  return hostname.state;
}

export async function removeDomain(storeId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("domain_cf_id").eq("id", storeId).single();
  if (store?.domain_cf_id) await deleteCustomHostname(store.domain_cf_id).catch((err) => console.warn("Retrait du domaine :", err));
  await admin
    .from("stores")
    .update({ custom_domain: null, domain_cf_id: null, domain_status: null, domain_records: [], domain_error: null, domain_checked_at: null })
    .eq("id", storeId);
}

/** Tâche planifiée : vérifie les domaines en attente (toutes les 10 minutes au plus par domaine). */
export async function refreshPendingDomains(): Promise<{ checked: number; activated: number }> {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await createAdminClient()
    .from("stores")
    .select("id")
    .eq("domain_status", "pending")
    .or(`domain_checked_at.is.null,domain_checked_at.lt.${since}`)
    .limit(50);
  let activated = 0;
  for (const s of data ?? []) {
    try {
      if ((await refreshDomain(s.id)) === "active") activated++;
    } catch (err) {
      console.warn(`Vérification du domaine (boutique ${s.id}) :`, err);
    }
  }
  return { checked: data?.length ?? 0, activated };
}
