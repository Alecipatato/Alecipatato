import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

/**
 * Client lié à l'utilisateur connecté (lit sa session dans les cookies).
 * Servira au tableau de bord client à partir de la phase 2.
 */
export async function createUserClient() {
  const env = getSupabasePublicEnv();
  if (!env) throw new Error("Supabase n'est pas configuré (voir .env.example).");
  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : ignoré, la session est rafraîchie ailleurs.
        }
      },
    },
  });
}
