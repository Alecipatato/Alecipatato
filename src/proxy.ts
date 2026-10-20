import { NextResponse, type NextRequest } from "next/server";
import { STORE_SITE_HEADER } from "@/lib/i18n/config";
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

  // En-têtes internes : jamais acceptés venant du navigateur.
  request.headers.delete(STORE_SITE_HEADER);
  request.headers.delete("x-store-base");

  if (tenant.kind === "platform") {
    // Les pages internes /s/... ne sont accessibles que via un hostname de boutique.
    // Exception en développement : localhost:3000/s/demo marche dans tous les
    // navigateurs (Safari ne reconnaît pas demo.localhost).
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && (pathname === "/s" || pathname.startsWith("/s/"))) {
      return new NextResponse("Page introuvable", { status: 404 });
    }
    // Vitrine en développement (localhost:3000/s/demo) : indique la boutique (sa langue).
    const devSite = /^\/s\/([^/]+)/.exec(pathname)?.[1];
    if (devSite) request.headers.set(STORE_SITE_HEADER, safeDecode(devSite));
    // Routes techniques (webhook Stripe, tâches planifiées) : pas de session utilisateur.
    if (pathname.startsWith("/api/")) return NextResponse.next({ request });
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
  headers.set(STORE_SITE_HEADER, tenant.site);
  return NextResponse.rewrite(url, { request: { headers } });
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export const config = {
  // Tout sauf les fichiers statiques de Next.js et les images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
