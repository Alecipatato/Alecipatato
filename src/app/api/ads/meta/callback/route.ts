import { NextResponse, type NextRequest } from "next/server";
import { metaRedirectUri, saveAdConnection } from "@/lib/ads/connections";
import { exchangeMetaCode } from "@/lib/ads/meta";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Retour de la connexion Facebook : vérifie le jeton anti-falsification, garde le jeton d'accès chiffré. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const [state, storeId] = (request.cookies.get("meta_oauth")?.value ?? "").split(".");
  const page = (result: string) => {
    const target = storeId ? `/tableau-de-bord/boutiques/${storeId}/publicite/campagne?meta=${result}` : "/tableau-de-bord";
    const response = NextResponse.redirect(new URL(target, request.url));
    response.cookies.delete({ name: "meta_oauth", path: "/api/ads/meta" });
    return response;
  };
  const params = request.nextUrl.searchParams;
  if (!state || params.get("state") !== state) return page("invalide");
  if (params.get("error") || !params.get("code")) return page("refuse");
  const { data: store } = await createAdminClient().from("stores").select("id").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store) return page("invalide");
  try {
    const { accessToken, expiresAt } = await exchangeMetaCode(params.get("code")!, metaRedirectUri());
    await saveAdConnection(store.id, "meta", accessToken, expiresAt);
  } catch (err) {
    console.warn("Connexion Meta :", err);
    return page("echec");
  }
  return page("connecte");
}
