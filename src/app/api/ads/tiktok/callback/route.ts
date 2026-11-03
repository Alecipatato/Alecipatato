import { NextResponse, type NextRequest } from "next/server";
import { saveAdConnection } from "@/lib/ads/connections";
import { exchangeTiktokCode } from "@/lib/ads/tiktok";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Retour de l'autorisation TikTok : vérifie le jeton anti-falsification, garde le jeton d'accès chiffré. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const [state, storeId] = (request.cookies.get("tiktok_oauth")?.value ?? "").split(".");
  const page = (result: string) => {
    const target = storeId ? `/tableau-de-bord/boutiques/${storeId}/publicite/tiktok?tiktok=${result}` : "/tableau-de-bord";
    const response = NextResponse.redirect(new URL(target, request.url));
    response.cookies.delete({ name: "tiktok_oauth", path: "/api/ads/tiktok" });
    return response;
  };
  const params = request.nextUrl.searchParams;
  // TikTok renvoie le code d'autorisation dans « auth_code » (et parfois « code »).
  const code = params.get("auth_code") ?? params.get("code");
  if (!state || params.get("state") !== state) return page("invalide");
  if (!code) return page("refuse");
  const { data: store } = await createAdminClient().from("stores").select("id").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store) return page("invalide");
  try {
    const { accessToken } = await exchangeTiktokCode(code);
    // Jeton TikTok longue durée : il reste valable tant que le vendeur ne retire pas l'autorisation.
    await saveAdConnection(store.id, "tiktok", accessToken, null);
  } catch (err) {
    console.warn("Connexion TikTok :", err);
    return page("echec");
  }
  return page("connecte");
}
