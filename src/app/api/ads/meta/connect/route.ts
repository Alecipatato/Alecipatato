import { NextResponse, type NextRequest } from "next/server";
import { metaCampaignsAvailable, metaRedirectUri } from "@/lib/ads/connections";
import { metaAuthUrl } from "@/lib/ads/meta";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Départ de la connexion Facebook : vérifie la boutique, mémorise un jeton anti-falsification, redirige vers Meta. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const storeId = request.nextUrl.searchParams.get("store") ?? "";
  const { data: store } = await createAdminClient().from("stores").select("id, status").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store || store.status === "suspended" || !metaCampaignsAvailable()) return NextResponse.redirect(new URL("/tableau-de-bord", request.url));
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(metaAuthUrl(state, metaRedirectUri()));
  response.cookies.set("meta_oauth", `${state}.${store.id}`, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 600, path: "/api/ads/meta" });
  return response;
}
