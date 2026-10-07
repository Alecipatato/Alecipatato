import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendu à la demande (modèle classique) : plus simple pour le multi-tenant
  // et compatible avec @opennextjs/cloudflare. À réévaluer plus tard.
  cacheComponents: false,
  // Autorise le rechargement à chaud quand on ouvre http://127.0.0.1:3000 en dev.
  allowedDevOrigins: ["127.0.0.1"],
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
