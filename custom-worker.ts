/**
 * Worker Cloudflare de la plateforme : l'application Next.js (générée par OpenNext dans .open-next/) et les tâches
 * planifiées. Chaque déclencheur (wrangler.jsonc > triggers.crons) appelle les routes /api/cron/* de l'application
 * elle-même, sans passer par le réseau, avec le secret CRON_SECRET.
 */

// Fichier produit par `opennextjs-cloudflare build` (absent avant la compilation, d'où @ts-ignore).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
  NEXT_PUBLIC_ROOT_DOMAIN?: string;
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Déclencheur → routes appelées, dans l'ordre. */
const JOBS: Record<string, string[]> = {
  // Toutes les 10 minutes : vérification des domaines personnalisés.
  "*/10 * * * *": ["/api/cron/domains"],
  // Toutes les 15 minutes : commandes CJ (transmission, nouveaux essais, suivi, courriels).
  "*/15 * * * *": ["/api/cron/orders"],
  // Toutes les heures : prix et stock (et notifications CJ), produits tendance, versements.
  "7 * * * *": ["/api/cron/sync-products", "/api/cron/trends", "/api/cron/payouts"],
};

async function runJobs(cron: string, env: Env, ctx: ExecutionContext) {
  const secret = env.CRON_SECRET;
  const domain = env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!secret || !domain) {
    console.error("Tâches planifiées : CRON_SECRET ou NEXT_PUBLIC_ROOT_DOMAIN manquant.");
    return;
  }
  for (const path of JOBS[cron] ?? []) {
    try {
      // L'en-tête host n'est pas déduit de l'adresse pour une requête construite ici : sans lui, le routage
      // multi-boutique (src/proxy.ts) ne reconnaît pas le domaine principal.
      const headers = { authorization: `Bearer ${secret}`, host: domain };
      const response: Response = await handler.fetch(new Request(`https://${domain}${path}`, { headers }), env, ctx);
      if (!response.ok) console.error(`Tâche ${path} : réponse ${response.status}`);
      const body = await response.text();
      console.log(`Tâche ${path} : ${response.status} ${body.slice(0, 500)}`);
    } catch (err) {
      console.error(`Tâche ${path} en échec :`, err);
    }
  }
}

const worker = {
  fetch: handler.fetch,
  async scheduled(event: { cron: string }, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runJobs(event.cron, env, ctx));
  },
};

export default worker;
