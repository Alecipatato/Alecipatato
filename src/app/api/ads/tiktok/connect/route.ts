import { NextResponse, type NextRequest } from "next/server";
import { tiktokCampaignsAvailable, tiktokRedirectUri } from "@/lib/ads/connections";
import { tiktokAuthUrl } from "@/lib/ads/tiktok";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Départ de l'autorisation TikTok : vérifie la boutique, mémorise un jeton anti-falsification, redirige vers TikTok. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const storeId = request.nextUrl.searchParams.get("store") ?? "";
  const { data: store } = await createAdminClient().from("stores").select("id, status").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store || store.status === "suspended" || !tiktokCampaignsAvailable()) return NextResponse.redirect(new URL("/tableau-de-bord", request.url));
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(tiktokAuthUrl(state, tiktokRedirectUri()));
  response.cookies.set("tiktok_oauth", `${state}.${store.id}`, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 600, path: "/api/ads/tiktok" });
  return response;
}
