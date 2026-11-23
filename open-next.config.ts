// Configuration OpenNext pour Cloudflare Workers.
// Les pages sont rendues à la demande (cacheComponents désactivé, pas d'ISR) : aucun cache incrémental n'est
// nécessaire, donc pas de stockage R2 à créer.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
