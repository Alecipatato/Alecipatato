import { getStoreBySite } from "@/lib/stores";
import { publicStoreUrl } from "@/lib/tenant";

/** Généré à chaque demande (une réponse par boutique). */
export const dynamic = "force-dynamic";

/** robots.txt de la boutique : tout est indexable sauf le panier, la commande et le suivi. */
export async function GET(_request: Request, { params }: RouteContext<"/s/[site]/robots.txt">) {
  const data = await getStoreBySite(decodeURIComponent((await params).site));
  if (!data) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  const body = `User-agent: *\nAllow: /\nDisallow: /panier\nDisallow: /commande/\nDisallow: /suivi\n\nSitemap: ${publicStoreUrl(data.store)}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
