import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Lien reçu par courriel (confirmation d'inscription, mot de passe oublié).
 * Les modèles de courriels (supabase/templates) pointent ici avec un token_hash :
 * cela fonctionne même si le lien est ouvert sur un autre appareil.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const destination = type === "email" || type === "signup" ? `${next}?bienvenue=1` : next;
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }
  return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
}
