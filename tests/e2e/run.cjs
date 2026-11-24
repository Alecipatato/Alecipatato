#!/usr/bin/env node
/**
 * Lance les tests de bout en bout : faux serveurs, compilation et démarrage de l'application
 * (port 3100, distinct du serveur de développement), puis les suites de tests/e2e/suites/.
 *
 *   npm run test:e2e                        toutes les suites
 *   npm run test:e2e -- paiements           seulement les suites dont le nom contient « paiements »
 *   npm run test:e2e -- --no-build          réutilise la dernière compilation (plus rapide)
 *   npm run test:e2e -- --serve --no-build  démarre seulement l'application et les faux serveurs (Ctrl+C pour arrêter)
 *
 * Prérequis : Docker + Supabase local (`npx supabase start`) et Playwright (Chromium).
 * Aucune vraie clé n'est utilisée : IA, Stripe, CJ et Resend sont simulés (tests/e2e/mocks/).
 */
const { spawn, execSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { APP, APP_PORT, ROOT_DOMAIN, MOCK, CRON_SECRET, STRIPE_WEBHOOK_SECRET } = require("./lib/config.cjs");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, ".output");
const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const filters = args.filter((a) => !a.startsWith("--"));
const children = [];

function supabaseKeys() {
  const cli = process.env.SUPABASE_CLI || "npx supabase";
  try {
    return JSON.parse(execSync(`${cli} status -o json`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());
  } catch {
    console.error("Supabase local ne répond pas. Lancez d'abord : npx supabase start (Docker doit être démarré).");
    process.exit(1);
  }
}

/** Variables de l'application pendant les tests : tout pointe vers les faux serveurs. */
function appEnv(keys) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_USE_ENV_PROXY: "", // jamais de proxy : tous les appels restent sur la machine
    NEXT_PUBLIC_ROOT_DOMAIN: ROOT_DOMAIN,
    NEXT_PUBLIC_PLATFORM_NAME: "Kreo",
    NEXT_PUBLIC_SUPABASE_URL: keys.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: keys.SECRET_KEY,
    CRON_SECRET,
    ANTHROPIC_API_KEY: "sk-ant-e2e-test",
    KREO_ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: MOCK.anthropic,
    STRIPE_SECRET_KEY: "sk_test_e2e",
    STRIPE_ALLOW_LIVE: "",
    STRIPE_API_BASE: MOCK.stripe,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_AUTOMATIC_TAX: "true",
    CJ_API_KEY: "cj-e2e-key",
    CJ_API_BASE: `${MOCK.cj}/api2.0/v1`,
    CJ_MIN_INTERVAL_MS: "100",
    CJ_SANDBOX: "true",
    CJ_ORDERS_ENABLED: "true",
    CJ_AUTO_PAY: "true",
    CJ_WEBHOOK_URL: "",
    RESEND_API_KEY: "re_e2e",
    RESEND_API_BASE: MOCK.resend,
    EMAIL_FROM: "Kreo <noreply@exemple.ca>",
    ADMIN_ALERT_EMAIL: "alertes@exemple.ca",
    ADS_ENCRYPTION_KEY: crypto.createHash("sha256").update("e2e").digest("base64"),
    // Désactivés pendant ces tests (pas de faux serveur) : publicité, domaines personnalisés.
    META_APP_ID: "", META_APP_SECRET: "", TIKTOK_APP_ID: "", TIKTOK_APP_SECRET: "",
    CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ZONE_ID: "", CLOUDFLARE_CNAME_TARGET: "",
  };
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) delete env[k];
  return env;
}

function start(name, command, commandArgs, env, logFile) {
  const out = fs.openSync(path.join(OUT, logFile), "w");
  const child = spawn(command, commandArgs, { cwd: ROOT, env, stdio: ["ignore", out, out], detached: true });
  child.on("exit", (code) => {
    if (code && !stopping) console.error(`${name} s'est arrêté (code ${code}) — voir tests/e2e/.output/${logFile}`);
  });
  children.push(child);
  return child;
}

async function waitHttp(url, label, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} ne répond pas (${url})`);
}

let stopping = false;
function stopAll() {
  stopping = true;
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      // déjà arrêté
    }
  }
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const keys = supabaseKeys();
  const env = appEnv(keys);

  console.log("1/4 Faux serveurs (IA, Stripe, CJ, courriels)…");
  start("Faux serveurs", process.execPath, [path.join(__dirname, "mocks", "servers.cjs")], env, "mocks.log");
  await waitHttp(`${MOCK.resend}/__log`, "Faux serveurs", 10000);

  if (!noBuild) {
    console.log("2/4 Compilation de l'application (next build, 1 à 3 minutes)…");
    try {
      execSync("npx next build", { cwd: ROOT, env, stdio: ["ignore", fs.openSync(path.join(OUT, "build.log"), "w"), fs.openSync(path.join(OUT, "build.log"), "a")] });
    } catch {
      console.error("La compilation a échoué — voir tests/e2e/.output/build.log");
      stopAll();
      process.exit(1);
    }
  } else {
    console.log("2/4 Compilation ignorée (--no-build).");
  }

  console.log(`3/4 Démarrage de l'application sur ${APP}…`);
  start("Application", "npx", ["next", "start", "-p", String(APP_PORT)], env, "app.log");
  await waitHttp(APP, "L'application");

  if (args.includes("--serve")) {
    console.log(`Application prête : ${APP} (boutiques : http://<nom>.localhost:${APP_PORT}). Ctrl+C pour arrêter.`);
    return;
  }

  const suitesDir = path.join(__dirname, "suites");
  const suites = fs.readdirSync(suitesDir).filter((f) => f.endsWith(".test.cjs")).sort()
    .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
    .map((f) => path.join(suitesDir, f));
  console.log(`4/4 Tests (${suites.length} suite${suites.length > 1 ? "s" : ""})…\n`);
  const test = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=spec", ...suites], { cwd: ROOT, env, stdio: "inherit" });
  const code = await new Promise((r) => test.on("exit", r));
  stopAll();
  console.log(code === 0 ? "\nTous les tests de bout en bout passent." : `\nDes tests échouent — journal de l'application : tests/e2e/.output/app.log`);
  process.exit(code ?? 1);
})().catch((err) => {
  console.error(err);
  stopAll();
  process.exit(1);
});
