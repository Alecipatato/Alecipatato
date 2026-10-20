import type { MetadataRoute } from "next";
import { platformUrl } from "@/lib/tenant";

/** robots.txt de la plateforme (les boutiques ont le leur). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/tableau-de-bord", "/admin", "/api/", "/auth/"] },
    sitemap: `${platformUrl()}/sitemap.xml`,
  };
}
