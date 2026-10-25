import { SAMPLE_TRENDS } from "@/lib/trends/samples";

/**
 * Visuel des produits tendance d'EXEMPLE (sans clé CJ) : l'icône du produit sur un dégradé.
 * Adresse en « .svg » : le proxy ignore les images, elle est donc servie telle quelle sur les vitrines aussi.
 */
const COLORS: Record<string, [string, string]> = {
  kitchen: ["#f6ead9", "#e3c9a6"],
  fitness: ["#e2f0ea", "#b9dccb"],
  pets: ["#fbe9e2", "#f2c6b4"],
  home: ["#efe8f6", "#d3c4e8"],
  tech: ["#e3ecf7", "#bcd0ea"],
  outdoor: ["#e8efdf", "#c6d8ad"],
};

export async function GET(_request: Request, { params }: RouteContext<"/api/trends/image/[file]">) {
  const { file } = await params;
  const sample = SAMPLE_TRENDS.find((s) => `${s.id}.svg` === file);
  if (!sample) return new Response("Introuvable", { status: 404 });
  const [from, to] = COLORS[sample.theme] ?? ["#eeeeee", "#cccccc"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="600" height="600" fill="url(#g)"/>
<ellipse cx="300" cy="455" rx="150" ry="22" fill="#000" opacity="0.07"/>
<text x="300" y="330" font-size="240" text-anchor="middle" dominant-baseline="middle">${sample.emoji}</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
