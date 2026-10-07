import { NextResponse, type NextRequest } from "next/server";
import { getRootDomain, resolveTenant } from "@/lib/tenant";

/**
 * S'exécute avant chaque requête : lit le hostname et redirige en interne
 * (« rewrite », invisible pour le visiteur) vers les pages de la bonne boutique.
 *
 *   zenyoga.mondomaine.com/            →  /s/zenyoga
 *   boutique-du-client.com/produits    →  /s/boutique-du-client.com/produits
 */
export function proxy(request: NextRequest) {
  const tenant = resolveTenant(request.headers.get("host"), getRootDomain());
  const { pathname, search } = request.nextUrl;

  if (tenant.kind === "platform") {
    // Les pages internes /s/... ne sont accessibles que via un hostname de boutique.
    if (pathname === "/s" || pathname.startsWith("/s/")) {
      return new NextResponse("Page introuvable", { status: 404 });
    }
    return NextResponse.next();
  }

  if (tenant.kind === "invalid") {
    return new NextResponse("Boutique introuvable", { status: 404 });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/s/${encodeURIComponent(tenant.site)}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Tout sauf les fichiers statiques de Next.js et les images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
