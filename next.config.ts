import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendu à la demande (modèle classique) : plus simple pour le multi-tenant
  // et compatible avec @opennextjs/cloudflare. À réévaluer plus tard.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
