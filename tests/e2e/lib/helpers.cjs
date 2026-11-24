/**
 * Outils partagés par les suites de tests : navigateur, comptes, base de données locale, faux serveurs.
 */
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const { APP, APP_PORT, MAILPIT, MOCK, DB_CONTAINER, CRON_SECRET, PASSWORD } = require("./config.cjs");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    try {
      return require(`${execFileSync("npm", ["root", "-g"]).toString().trim()}/playwright`);
    } catch {
      throw new Error("Playwright introuvable : npm install --no-save playwright && npx playwright install chromium");
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attend qu'une condition (éventuellement asynchrone) soit vraie ; renvoie sa valeur. */
async function waitFor(fn, { timeout = 20000, interval = 300, label = "condition" } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await sleep(interval);
  }
  throw new Error(`Délai dépassé : ${label}${last instanceof Error ? ` (${last.message})` : ""}`);
}

/** Requête SQL dans la base locale (conteneur Docker de Supabase). Renvoie le texte brut. */
function sql(query) {
  return execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-F", "|", "-c", query]).toString().trim();
}
/** Première ligne d'un résultat SQL, découpée en colonnes. */
const sqlRow = (query) => (sql(query).split("\n")[0] || "").split("|");
const esc = (v) => String(v).replace(/'/g, "''");

/** Code à 6 chiffres d'une application d'authentification (TOTP, RFC 6238). */
function totp(secret, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

// --- Faux serveurs ---------------------------------------------------------

const mock = {
  async log(name) {
    return (await fetch(`${MOCK[name]}/__log`)).json();
  },
  async clear(name) {
    await fetch(`${MOCK[name]}/__clear`);
  },
  async post(name, path, body = {}) {
    const response = await fetch(`${MOCK[name]}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return response.json();
  },
  async get(name, path) {
    return (await fetch(`${MOCK[name]}${path}`)).json();
  },
  /** Courriels « envoyés » (faux Resend), filtrés par destinataire. */
  async emails(to) {
    const log = await mock.log("resend");
    return log.filter((r) => r.path === "/emails" && (!to || r.body.to.includes(to))).map((r) => r.body);
  },
};

// --- Application -------------------------------------------------------------

/** Appelle une tâche planifiée comme le ferait Cloudflare. */
async function cron(path, query = "") {
  const response = await fetch(`${APP}/api/cron/${path}${query}`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tâche ${path} : HTTP ${response.status} ${text}`);
  return JSON.parse(text);
}

/** Adresse d'une boutique (sous-domaine). */
const storeUrl = (subdomain, path = "") => `http://${subdomain}.localhost:${APP_PORT}${path}`;

/**
 * Requête HTTP vers une boutique sans navigateur : Node ne résout pas *.localhost et fetch() ignore
 * l'en-tête host, d'où node:http. Renvoie { status, headers, text }.
 */
function storeFetch(subdomain, path = "/", { method = "GET", headers = {}, body } = {}) {
  const http = require("node:http");
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: APP_PORT, path, method, headers: { ...headers, host: `${subdomain}.localhost:${APP_PORT}` } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const uniqueEmail = (prefix) => `${prefix}.${Date.now()}${Math.floor(Math.random() * 1000)}@exemple.ca`;

/** Lien du courriel de confirmation (boîte locale de Supabase), ramené sur l'adresse des tests. */
async function confirmationLink(to) {
  const msg = await waitFor(async () => {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    return list.messages?.[0];
  }, { label: `courriel de confirmation pour ${to}` });
  const html = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()).HTML;
  const link = new URL(html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&"));
  return `${APP}${link.pathname}${link.search}`;
}

/** Ouvre un navigateur (les sous-domaines *.localhost pointent vers la machine). */
async function openBrowser() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
  return browser;
}

/** Nouvel onglet en français ; les erreurs JavaScript de la page sont collectées dans page.errors. */
async function newPage(browser, { lang = "fr" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: lang === "fr" ? "fr-CA" : "en-CA" });
  await context.addCookies([{ name: "lang", value: lang, url: APP }]);
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.setDefaultTimeout(20000);
  return page;
}

/** Crée un compte vendeur par l'écran d'inscription, confirme le courriel et ouvre la session. */
async function signUp(page, { name = "Vendeur Test", email = uniqueEmail("vendeur") } = {}) {
  await page.goto(`${APP}/inscription`);
  await page.fill("#full_name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.check('input[name="terms"]');
  await page.click('form button[type="submit"]:has-text("Créer mon compte")');
  await page.waitForURL(/verifier-courriel/);
  await page.goto(await confirmationLink(email));
  await page.waitForURL(/tableau-de-bord/);
  return { email, id: sqlRow(`select id from public.profiles where email = '${esc(email)}'`)[0] };
}

/** Ouvre la session d'un compte existant. */
async function signIn(page, email) {
  await page.goto(`${APP}/connexion`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('form button[type="submit"]:has-text("Se connecter")');
  await page.waitForURL(/tableau-de-bord|admin|securite-admin/);
}

/** Configure la double authentification d'un administrateur (écran /securite-admin) et renvoie la clé TOTP. */
async function enrollAdmin(page, email) {
  sql(`update public.profiles set role = 'admin' where email = '${esc(email)}'`);
  await page.goto(`${APP}/admin`);
  await page.waitForURL(/securite-admin/);
  await page.click('button:has-text("Afficher le code QR")');
  const secret = (await page.textContent("[data-mfa-secret]")).trim();
  await page.fill("#code", totp(secret));
  await page.click('[data-mfa-verify] button[type="submit"]');
  await page.waitForURL(/\/admin$/);
  return secret;
}

/**
 * Vendeur avec une boutique en ligne et des produits du fournisseur (CJ simulé), créée par l'IA
 * en passant par les écrans. Renvoie { seller, storeId, subdomain }.
 */
async function createStoreWithProducts(page, { niche = "Accessoires de cuisine pour amateurs de café", name = "Vendeur Test" } = {}) {
  const seller = await signUp(page, { name });
  await page.goto(`${APP}/tableau-de-bord/nouvelle?mode=ia`);
  await page.fill("#niche", niche);
  await page.selectOption("#language", "fr");
  await page.click('form button[type="submit"]:has-text("Créer ma boutique")');
  await page.waitForURL(/\/boutiques\/[0-9a-f-]+\/produits/, { timeout: 60000 });
  const storeId = /boutiques\/([0-9a-f-]+)/.exec(page.url())[1];
  await waitFor(() => sql(`select status from public.sourcing_jobs where store_id = '${storeId}' order by created_at desc limit 1`) === "done", { timeout: 120000, label: "recherche de produits" });
  await page.reload();
  await page.click('button:has-text("Tout accepter")');
  await page.click('button:has-text("Mettre ma boutique en ligne")');
  await waitFor(() => sql(`select status from public.stores where id = '${storeId}'`) === "active", { label: "boutique en ligne" });
  return { seller, storeId, subdomain: sql(`select subdomain from public.stores where id = '${storeId}'`) };
}

/** Texte visible de la zone principale. */
const mainText = async (page) => (await page.textContent("main")) ?? "";

module.exports = {
  loadPlaywright, sleep, waitFor, sql, sqlRow, esc, totp, mock, cron, storeUrl, storeFetch, uniqueEmail,
  confirmationLink, openBrowser, newPage, signUp, signIn, enrollAdmin, createStoreWithProducts, mainText,
};
