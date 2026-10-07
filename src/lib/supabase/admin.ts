import { createClient } from "@supabase/supabase-js";

/**
 * Client « serveur » avec la clé secrète : il contourne la sécurité RLS.
 * À utiliser UNIQUEMENT côté serveur (Server Actions, routes API), après avoir
 * vérifié soi-même les droits de l'utilisateur. Ne jamais l'importer dans un
 * composant client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase n'est pas configuré : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
