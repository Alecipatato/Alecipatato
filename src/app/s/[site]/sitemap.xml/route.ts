import { STORE_POLICY_PAGES } from "@/lib/legal/policies";
import { getStoreBySite } from "@/lib/stores";
import { publicStoreUrl } from "@/lib/tenant";

/** Généré à chaque demande (une réponse par boutique). */
export const dynamic = "force-dynamic";

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Plan du site de la boutique (servi à /sitemap.xml sur son adresse) : accueil, produits, pages utiles. */
export async function GET(_request: Request, { params }: RouteContext<"/s/[site]/sitemap.xml">) {
  const data = await getStoreBySite(decodeURIComponent((await params).site));
  if (!data) return new Response("Not found", { status: 404 });
  const base = publicStoreUrl(data.store);
  const urls = [
    { loc: `${base}/`, priority: "1.0" },
    ...data.products.map((p) => ({ loc: `${base}/produit/${p.id}`, priority: "0.8" })),
    { loc: `${base}/contact`, priority: "0.3" },
    ...STORE_POLICY_PAGES.map((page) => ({ loc: `${base}/legal/${page}`, priority: "0.2" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc><priority>${u.priority}</priority></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
