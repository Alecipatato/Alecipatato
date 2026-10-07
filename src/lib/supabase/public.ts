import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Client « visiteur anonyme » pour l'affichage des boutiques.
 * Pas de session : il ne voit que ce que la sécurité autorise au public
 * (boutiques actives, colonnes non sensibles).
 */
export function createPublicClient() {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  return createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
