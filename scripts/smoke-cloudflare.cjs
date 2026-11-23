// Vérification rapide de la version Cloudflare (moteur workerd), lancée avec `npm run cf:preview` en local.
// Usage : node scripts/smoke-cloudflare.cjs [http://localhost:8787]
// Optionnel : CF_PREVIEW_LOG=<fichier du journal de l'aperçu> pour vérifier aussi le résultat de la tâche planifiée.
// Parcourt les points sensibles au moteur Cloudflare : routage par sous-domaine (proxy), vitrine et panier,
// inscription (courriel local Supabase), tableau de bord, actions serveur, double authentification admin,
// routes et tâches planifiées. Prérequis : Supabase local (`npx supabase start`) et Playwright.
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const APP = process.argv[2] || "http://localhost:8787";
const PORT = new URL(APP).port || "80";
const MAILPIT = "http://127.0.0.1:54324";
const sql = (q) => execFileSync("docker", ["exec", "supabase_db_dropshop-platform", "psql", "-U", "postgres", "-At", "-c", q]).toString().trim();
let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

async function confirmLink(to) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = list.messages.find((m) => m.To.some((t) => t.Address === to));
    if (msg) {
      const html = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()).HTML;
      // Les modèles de courriel visent l'adresse du site configurée dans Supabase : on garde le chemin.
      const link = new URL(html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&"));
      return `${APP}${link.pathname}${link.search}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("courriel de confirmation introuvable");
}

(async () => {
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-CA" });
  // Langue forcée : sur Cloudflare, le pays du visiteur (en-tête cf-ipcountry) passe avant la langue du navigateur.
  await context.addCookies([{ name: "lang", value: "fr", url: APP }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log("\n== Plateforme et vitrine");
  const home = await page.goto(APP);
  check("accueil de la plateforme", home.status() === 200 && (await page.textContent("body")).length > 200);
  const store = await page.goto(`http://demo.localhost:${PORT}/`);
  check("vitrine d'une boutique démo (sous-domaine, proxy)", store.status() === 200 && (await page.locator("article").count()) > 0);
  await page.click("article >> nth=0 >> a >> nth=0");
  await page.waitForURL(/\/produit\//);
  check("fiche produit", (await page.textContent("main")).length > 100);
  await page.locator("aside button").filter({ hasText: /Ajouter au panier|Add to cart/ }).click();
  await page.goto(`http://demo.localhost:${PORT}/panier`);
  check("panier", (await page.locator("[data-cart-line]").count()) === 1);
  check("accès direct /s/… refusé sur le domaine principal", (await page.goto(`${APP}/s/demo`)).status() === 404);
  check("robots.txt de la boutique", (await (await fetch(`http://127.0.0.1:${PORT}/robots.txt`, { headers: { host: `demo.localhost:${PORT}` } })).text()).includes("Sitemap"));

  console.log("\n== Compte vendeur");
  const email = `cf${Date.now()}@exemple.ca`;
  await page.goto(`${APP}/inscription`);
  await page.fill("#full_name", "Cleo Cloudflare");
  await page.fill("#email", email);
  await page.fill("#password", "Bonjour2026");
  await page.check('input[name="terms"]');
  await page.click('button:has-text("Créer mon compte")');
  await page.waitForURL(/verifier-courriel/, { timeout: 20000 });
  check("inscription (action serveur, courriel envoyé)", true);
  await page.goto(await confirmLink(email));
  await page.waitForURL(/tableau-de-bord/, { timeout: 20000 });
  check("confirmation et session (témoins)", true);
  await page.goto(`${APP}/tableau-de-bord/nouvelle?mode=produits`);
  check("galerie des produits gagnants", (await page.locator("li[data-trend]").count()) > 0);
  await page.goto(`${APP}/tableau-de-bord/paiements`);
  check("écran Paiements (commission dégressive)", (await page.locator("[data-commission]").count()) === 1);

  console.log("\n== Administration (double authentification)");
  sql(`update public.profiles set role = 'admin' where email = '${email}'`);
  await page.goto(`${APP}/admin`);
  await page.waitForURL(/securite-admin/);
  await page.click('button:has-text("Afficher le code QR")');
  await page.waitForSelector("[data-mfa-secret]");
  await page.fill("#code", totp((await page.textContent("[data-mfa-secret]")).trim()));
  await page.click('[data-mfa-verify] button[type="submit"]');
  await page.waitForURL(/\/admin$/, { timeout: 20000 });
  check("code TOTP accepté, administration ouverte", (await page.textContent("main")).length > 100);
  await page.goto(`${APP}/admin/securite`);
  check("journal : double authentification configurée", (await page.textContent("main")).includes("Double authentification configurée"));

  console.log("\n== Tâches planifiées");
  const unauth = await fetch(`${APP}/api/cron/payouts`);
  check("route protégée sans secret (401)", unauth.status === 401);
  const payouts = await fetch(`${APP}/api/cron/payouts`, { headers: { authorization: "Bearer cron_test" } });
  check("route des versements avec le secret", payouts.status === 200, await payouts.text());
  const scheduled = await fetch(`${APP}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("*/15 * * * *")}`);
  check("déclencheur planifié (worker personnalisé)", scheduled.status === 200, await scheduled.text());
  if (process.env.CF_PREVIEW_LOG) {
    const fs = require("fs");
    let line = "";
    for (let i = 0; i < 30 && !line; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      line = fs.readFileSync(process.env.CF_PREVIEW_LOG, "utf8").split("\n").reverse().find((l) => l.startsWith("Tâche /api/cron/orders")) ?? "";
    }
    check("tâche des commandes exécutée par le déclencheur", / : 200 /.test(line), line.slice(0, 120));
  }

  check("aucune erreur JavaScript dans le navigateur", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} échec(s)` : "\nTout est bon.");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
