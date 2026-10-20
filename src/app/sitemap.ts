import type { MetadataRoute } from "next";
import { platformUrl } from "@/lib/tenant";

/** Plan du site de la plateforme. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = platformUrl();
  return ["", "/inscription", "/connexion", "/conditions", "/confidentialite"].map((path) => ({ url: `${base}${path || "/"}` }));
}
