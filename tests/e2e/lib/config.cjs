/** Réglages communs des tests de bout en bout (adresses, ports, secrets de TEST uniquement). */
const APP_PORT = Number(process.env.E2E_PORT || 3100);

const PORTS = { anthropic: 4010, stripe: 4020, cj: 4030, resend: 4040 };

module.exports = {
  APP_PORT,
  /** Domaine principal de la plateforme pendant les tests (les boutiques : <nom>.localhost:3100). */
  ROOT_DOMAIN: `localhost:${APP_PORT}`,
  APP: `http://localhost:${APP_PORT}`,
  PORTS,
  MOCK: Object.fromEntries(Object.entries(PORTS).map(([k, v]) => [k, `http://127.0.0.1:${v}`])),
  MAILPIT: "http://127.0.0.1:54324",
  DB_CONTAINER: "supabase_db_dropshop-platform",
  CRON_SECRET: "cron_e2e",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_test",
  CJ_OPEN_ID: 4242,
  PASSWORD: "Bonjour2026!",
};
