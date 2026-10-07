import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";
import { getRootDomain, resolveTenant } from "@/lib/tenant";

/**
 * S'exécute avant chaque requête : lit le hostname et redirige en interne
 * (« rewrite », invisible pour le visiteur) vers les pages de la bonne boutique.
 *
 *   zenyoga.mondomaine.com/              →  /s/zenyoga
 *   zenyoga.mondomaine.com/produit/123   →  /s/zenyoga/produit/123
 *   boutique-du-client.com/              →  /s/boutique-du-client.com
 *
 * Sur le domaine principal, il maintient la session de connexion à jour.
 */
export async function proxy(request: NextRequest) {
  const tenant = resolveTenant(request.headers.get("host"), getRootDomain());
  const { pathname, search } = request.nextUrl;

  if (tenant.kind === "platform") {
    // Les pages internes /s/... ne sont accessibles que via un hostname de boutique.
    // Exception en développement : localhost:3000/s/demo marche dans tous les
    // navigateurs (Safari ne reconnaît pas demo.localhost).
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && (pathname === "/s" || pathname.startsWith("/s/"))) {
      return new NextResponse("Page introuvable", { status: 404 });
    }
    return updateSession(request);
  }

  if (tenant.kind === "invalid") {
    return new NextResponse("Boutique introuvable", { status: 404 });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/s/${encodeURIComponent(tenant.site)}${pathname === "/" ? "" : pathname}`;
  url.search = search;

  // Indique aux pages que la boutique est servie sur son propre domaine :
  // les liens internes sont alors « /produit/… » et non « /s/<boutique>/produit/… ».
  const headers = new Headers(request.headers);
  headers.set("x-store-base", "");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Tout sauf les fichiers statiques de Next.js et les images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
