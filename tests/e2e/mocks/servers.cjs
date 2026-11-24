/**
 * Faux serveurs pour les tests de bout en bout : ils imitent les API externes (IA, Stripe, CJ, Resend)
 * sans jamais rien envoyer sur Internet. Chaque serveur garde en mémoire ce qu'il a reçu
 * (consultable par les tests sur /__log) et accepte quelques commandes de test (/__set, /__reset…).
 *
 * Lancement : node tests/e2e/mocks/servers.cjs  (ports : voir PORTS dans ../lib/config.cjs)
 */
const http = require("node:http");
const crypto = require("node:crypto");
const { PORTS, APP, STRIPE_WEBHOOK_SECRET, CJ_OPEN_ID } = require("../lib/config.cjs");

// ---------------------------------------------------------------------------
// Petit cadre HTTP commun
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/** Corps « a[b][0][c]=1 » (format de Stripe) → objet imbriqué. */
function parseForm(text) {
  const out = {};
  for (const [rawKey, value] of new URLSearchParams(text)) {
    const keys = rawKey.replace(/\]/g, "").split("[");
    let node = out;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(keys[i + 1]);
      if (last) node[k] = value;
      else node = node[k] ??= nextIsIndex ? [] : {};
    });
  }
  return out;
}

function createServer(name, port, handler) {
  const log = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const raw = await readBody(req);
    const type = req.headers["content-type"] ?? "";
    let body = raw;
    if (type.includes("application/json") && raw) body = JSON.parse(raw);
    else if (type.includes("x-www-form-urlencoded")) body = parseForm(raw);
    const send = (status, data, headers = {}) => {
      const isText = typeof data === "string";
      res.writeHead(status, { "content-type": isText ? "text/html; charset=utf-8" : "application/json", ...headers });
      res.end(isText ? data : JSON.stringify(data));
    };
    if (url.pathname === "/__log") return send(200, log);
    if (url.pathname === "/__clear") {
      log.length = 0;
      return send(200, { ok: true });
    }
    log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, at: Date.now() });
    try {
      await handler({ req, url, body, raw, send, res });
    } catch (err) {
      console.error(`[${name}]`, err);
      send(500, { error: String(err) });
    }
  });
  server.listen(port, "127.0.0.1", () => console.log(`[mock] ${name} : http://127.0.0.1:${port}`));
  return server;
}

let counter = 1000;
// Préfixe propre à chaque lancement : les identifiants ne se répètent jamais d'un lancement à l'autre (la base les garde).
const RUN = Date.now().toString(36);
const nextId = (prefix) => `${prefix}_e2e${RUN}${++counter}`;

// ---------------------------------------------------------------------------
// IA (API Anthropic) : réponses JSON valides selon la demande
// ---------------------------------------------------------------------------

const aiState = { fail: null, refuse: false };

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function storeJson(user) {
  const fr = user.includes("Store language: French");
  const niche = /Niche and target customers \(from the owner, follow it\): (.*)/.exec(user)?.[1] ?? "";
  const requested = /use it exactly\): (.*)/.exec(user)?.[1];
  const chosen = user.includes("The owner already chose the products");
  if (/\b(armes?|weapons?|fusils?|guns?)\b/i.test(niche)) {
    return { refusal_reason: fr ? "Les armes sont interdites." : "Weapons are not allowed.", name: "", subdomain: "", tagline: "", theme: "minimal", colors: { primary: "#000000", accent: "#000000", background: "#ffffff", text: "#111111" }, fonts: { heading: "Inter", body: "Inter" }, hero: { title: "", subtitle: "", cta_label: "" }, features: [], about: { title: "", body: "" }, footer_text: "", search_keywords: [], products: [] };
  }
  const word = (niche.split(/[\s,]+/).find((w) => w.length > 3) ?? "nature").toLowerCase();
  const name = requested ?? `${fr ? "Atelier" : "Studio"} ${titleCase(word)}`;
  const theme = /Style: "(\w+)"/.exec(user)?.[1] ?? "minimal";
  const categories = fr ? ["Essentiels", "Accessoires", "Cadeaux"] : ["Essentials", "Accessories", "Gifts"];
  return {
    refusal_reason: null,
    name,
    subdomain: slug(name),
    tagline: fr ? `Le meilleur pour ${word}` : `The best for ${word}`,
    theme,
    colors: { primary: "#1f6f5c", accent: "#e0a526", background: "#fbfaf7", text: "#1b1b1b" },
    fonts: { heading: "Inter", body: "Inter" },
    hero: { title: fr ? `Tout pour ${word}` : `Everything for ${word}`, subtitle: fr ? "Livraison au Canada avec suivi." : "Shipping in Canada with tracking.", cta_label: fr ? "Magasiner" : "Shop now" },
    features: [1, 2, 3].map((i) => ({ title: fr ? `Avantage ${i}` : `Benefit ${i}`, description: fr ? "Une promesse simple." : "A simple promise." })),
    about: { title: fr ? "Notre histoire" : "Our story", body: fr ? "Une petite boutique passionnée." : "A small passionate store." },
    footer_text: fr ? "Fait avec soin" : "Made with care",
    search_keywords: chosen ? [] : [`${word} mat`, `${word} accessories`],
    products: chosen
      ? []
      : Array.from({ length: 12 }, (_, i) => ({
          title: `${fr ? "Produit" : "Product"} ${titleCase(word)} ${i + 1}`,
          category: categories[i % 3],
          description: fr ? "Un produit utile au quotidien." : "A useful everyday product.",
          highlights: fr ? ["Matière durable", "Format compact", "Facile à entretenir"] : ["Durable material", "Compact size", "Easy care"],
          price_cents: 1999 + i * 500,
        })),
  };
}

function aiAnswer(system, user) {
  if (system.startsWith("You design complete dropshipping storefronts")) return storeJson(user);
  if (system.startsWith("You curate products")) {
    const count = Number(/Pick up to (\d+)/.exec(user)?.[1] ?? 20);
    const pids = [...user.matchAll(/^(\S+) \| /gm)].map((m) => m[1]);
    return { pids: pids.slice(0, count) };
  }
  if (system.startsWith("You write product pages")) {
    const fr = system.includes("Québec French");
    const products = JSON.parse(user.slice(user.indexOf("Products:\n") + "Products:\n".length));
    return {
      products: products.map((p) => ({
        pid: p.pid,
        title: `${fr ? "Fiche" : "Item"} ${p.name}`.slice(0, 70),
        description: fr ? "Description rédigée d'après le fournisseur." : "Description written from the supplier data.",
        highlights: fr ? ["Matière : coton", "Livré avec suivi"] : ["Material: cotton", "Shipped with tracking"],
        category: fr ? "Essentiels" : "Essentials",
        long_description: fr ? "Premier paragraphe.\n\nDeuxième paragraphe." : "First paragraph.\n\nSecond paragraph.",
        specs: [{ label: fr ? "Matière" : "Material", value: fr ? "Coton" : "Cotton" }],
        variant_labels: (p.variant_options ?? []).map((k) => ({ key: k, label: fr ? `Couleur ${k}` : `Colour ${k}` })),
      })),
    };
  }
  if (system.startsWith("You sort trending products")) {
    const themes = /Theme ids: (.*)/.exec(user)[1].split(", ");
    return {
      products: [...user.matchAll(/^(\S+) \| ([^|\n]*)\|[^\n]*?(?:\| hint: (\w+))?$/gm)].map((m) => {
        const reject = /therapy|laser|acne/i.test(m[2]);
        return {
          pid: m[1],
          theme: reject ? "reject" : themes.includes(m[3]) ? m[3] : themes[0],
          reject_reason: reject ? "health claim" : "",
          name_en: m[2].trim().slice(0, 40),
          name_fr: `FR ${m[2].trim()}`.slice(0, 40),
        };
      }),
    };
  }
  if (system.startsWith("You write marketing content")) {
    const script = (i) => ({ title: `Script ${i}`, hook: "Regardez ça", scenes: [{ visual: "Gros plan", voiceover: "Voici le produit" }], on_screen_text: ["Livraison gratuite"], caption: "À découvrir", hashtags: ["#boutique", "#cadeau"] });
    return {
      tiktok_scripts: [script(1), script(2)],
      ad_copies: ["meta", "meta", "tiktok"].map((platform, i) => ({ platform, primary_text: `Texte publicitaire ${i + 1}`, headline: "Découvrez-le", description: "Livraison gratuite" })),
      seo: { title: "Boutique en ligne", description: "Des produits choisis avec soin, livrés au Canada." },
    };
  }
  throw new Error(`Demande IA inconnue : ${system.slice(0, 60)}`);
}

function startAnthropic() {
  return createServer("ia", PORTS.anthropic, ({ url, body, send }) => {
    if (url.pathname === "/__set") {
      Object.assign(aiState, body);
      return send(200, aiState);
    }
    if (url.pathname !== "/v1/messages") return send(404, { type: "error", error: { type: "not_found_error", message: url.pathname } });
    if (aiState.fail === "overloaded") return send(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    const system = typeof body.system === "string" ? body.system : body.system.map((b) => b.text).join("\n");
    const user = typeof body.messages[0].content === "string" ? body.messages[0].content : body.messages[0].content.map((b) => b.text).join("\n");
    send(200, {
      id: nextId("msg"),
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: JSON.stringify(aiAnswer(system, user)) }],
      stop_reason: aiState.refuse ? "refusal" : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 800 },
    });
  });
}

// ---------------------------------------------------------------------------
// Stripe : comptes Connect, Checkout, paiements, transferts, remboursements, webhooks signés
// ---------------------------------------------------------------------------

const stripe = { accounts: {}, sessions: {}, intents: {}, transfers: {}, refunds: [], byIdempotency: {} };

async function sendStripeEvent(type, object, id = nextId("evt"), signWith = STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id, object: "event", type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", signWith).update(`${t}.${payload}`).digest("hex");
  const response = await fetch(`${APP}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` }, body: payload });
  return { status: response.status, body: await response.text() };
}

const stripeError = (send, status, message) => send(status, { error: { type: "invalid_request_error", message } });

function payPage(session) {
  const total = (session.amount_total / 100).toFixed(2);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Paiement test</title></head><body>
<h1>Paiement simulé (Stripe de test)</h1>
<p data-amount>${total} ${session.currency.toUpperCase()}</p>
<ul>${session.line_items.map((l) => `<li data-line>${l.quantity} × ${l.price_data.product_data.name} — ${(Number(l.price_data.unit_amount) / 100).toFixed(2)}</li>`).join("")}</ul>
<p data-terms>${session.custom_text?.submit?.message ?? ""}</p>
<form method="post"><label>Courriel <input name="email" id="email" value="acheteur@exemple.ca"></label>
<button type="submit" id="pay">Payer</button></form>
<a href="${session.cancel_url}" id="cancel">Annuler</a></body></html>`;
}

function startStripe() {
  return createServer("stripe", PORTS.stripe, async ({ req, url, body, send, res }) => {
    const p = url.pathname;
    const idem = req.headers["idempotency-key"];
    if (idem && req.method === "POST" && stripe.byIdempotency[idem]) return send(200, stripe.byIdempotency[idem]);
    const remember = (obj) => {
      if (idem) stripe.byIdempotency[idem] = obj;
      return send(200, obj);
    };

    // --- Commandes de test ---
    if (p === "/__state") return send(200, stripe);
    if (p === "/__event") return send(200, await sendStripeEvent(body.type, body.object, body.id, body.secret));

    // --- Connect ---
    if (p === "/v1/accounts" && req.method === "POST") {
      const account = { id: nextId("acct"), object: "account", type: "express", email: body.email ?? null, details_submitted: false, charges_enabled: false, payouts_enabled: false, capabilities: { transfers: "inactive" }, metadata: body.metadata ?? {} };
      stripe.accounts[account.id] = account;
      return remember(account);
    }
    let m = /^\/v1\/accounts\/(acct_\w+)$/.exec(p);
    if (m) return stripe.accounts[m[1]] ? send(200, stripe.accounts[m[1]]) : stripeError(send, 404, "No such account");
    m = /^\/v1\/accounts\/(acct_\w+)\/login_links$/.exec(p);
    if (m) return send(200, { object: "login_link", url: `http://127.0.0.1:${PORTS.stripe}/connect/dashboard/${m[1]}` });
    if (p === "/v1/account_links") {
      const target = `http://127.0.0.1:${PORTS.stripe}/connect/onboard/${body.account}?return=${encodeURIComponent(body.return_url)}`;
      return send(200, { object: "account_link", url: target, expires_at: Math.floor(Date.now() / 1000) + 300 });
    }
    m = /^\/connect\/onboard\/(acct_\w+)$/.exec(p);
    if (m) {
      // Formulaire Stripe Express « rempli » : compte prêt, Stripe prévient la plateforme.
      const account = stripe.accounts[m[1]];
      Object.assign(account, { details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" } });
      await sendStripeEvent("account.updated", account);
      res.writeHead(302, { location: url.searchParams.get("return") });
      return res.end();
    }
    if (p.startsWith("/connect/dashboard/")) return send(200, "<h1>Espace Stripe Express (simulé)</h1>");

    // --- Checkout ---
    if (p === "/v1/checkout/sessions" && req.method === "POST") {
      const lines = body.line_items ?? [];
      const subtotal = lines.reduce((s, l) => s + Number(l.price_data.unit_amount) * Number(l.quantity), 0);
      const tax = body.automatic_tax?.enabled === "true" ? Math.round(subtotal * 0.14975) : 0;
      const id = nextId("cs_test");
      const session = {
        id, object: "checkout.session", status: "open", payment_status: "unpaid", mode: "payment",
        currency: lines[0]?.price_data.currency ?? "cad", client_reference_id: body.client_reference_id, metadata: body.metadata ?? {},
        amount_subtotal: subtotal, amount_total: subtotal + tax, total_details: { amount_shipping: 0, amount_tax: tax, amount_discount: 0 },
        line_items: lines, custom_text: body.custom_text, success_url: body.success_url, cancel_url: body.cancel_url,
        payment_intent_data: body.payment_intent_data, payment_intent: null, customer_details: null, collected_information: null,
        url: `http://127.0.0.1:${PORTS.stripe}/pay/${id}`,
      };
      stripe.sessions[id] = session;
      return remember(session);
    }
    m = /^\/v1\/checkout\/sessions\/(cs_test_\w+)$/.exec(p);
    if (m) return stripe.sessions[m[1]] ? send(200, stripe.sessions[m[1]]) : stripeError(send, 404, "No such checkout session");
    m = /^\/pay\/(cs_test_\w+)$/.exec(p);
    if (m) {
      const session = stripe.sessions[m[1]];
      if (!session) return send(404, "Session inconnue");
      if (req.method === "GET") return send(200, payPage(session));
      // Paiement accepté (carte 4242…) : intention, charge, frais Stripe (2,9 % + 0,30 $).
      const chargeId = nextId("ch");
      const fee = Math.round(session.amount_total * 0.029) + 30;
      const intent = {
        id: nextId("pi"), object: "payment_intent", amount: session.amount_total, currency: session.currency, status: "succeeded",
        transfer_group: session.payment_intent_data?.transfer_group, metadata: session.payment_intent_data?.metadata ?? {},
        latest_charge: { id: chargeId, object: "charge", amount: session.amount_total, balance_transaction: { id: nextId("txn"), object: "balance_transaction", fee, amount: session.amount_total, net: session.amount_total - fee } },
      };
      stripe.intents[intent.id] = intent;
      Object.assign(session, {
        status: "complete", payment_status: "paid", payment_intent: intent.id,
        customer_details: { email: body.email || "acheteur@exemple.ca", name: "Alex Acheteur", phone: "+15145550199" },
        collected_information: { shipping_details: { name: "Alex Acheteur", address: { line1: "123 rue Principale", line2: null, city: "Montréal", state: "QC", postal_code: "H2X 1Y4", country: "CA" } } },
      });
      if (!url.searchParams.has("sans-webhook")) await sendStripeEvent("checkout.session.completed", session);
      res.writeHead(303, { location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id) });
      return res.end();
    }
    m = /^\/v1\/payment_intents\/(pi_\w+)$/.exec(p);
    if (m) return stripe.intents[m[1]] ? send(200, stripe.intents[m[1]]) : stripeError(send, 404, "No such payment_intent");

    // --- Transferts (versements aux vendeurs) ---
    if (p === "/v1/transfers" && req.method === "POST") {
      const transfer = { id: nextId("tr"), object: "transfer", amount: Number(body.amount), currency: body.currency, destination: body.destination, source_transaction: body.source_transaction ?? null, transfer_group: body.transfer_group ?? null, metadata: body.metadata ?? {}, amount_reversed: 0, reversals: [] };
      stripe.transfers[transfer.id] = transfer;
      return remember(transfer);
    }
    m = /^\/v1\/transfers\/(tr_\w+)\/reversals$/.exec(p);
    if (m) {
      const transfer = stripe.transfers[m[1]];
      if (!transfer) return stripeError(send, 404, "No such transfer");
      const amount = Number(body.amount ?? transfer.amount - transfer.amount_reversed);
      transfer.amount_reversed += amount;
      const reversal = { id: nextId("trr"), object: "transfer_reversal", amount, transfer: transfer.id, metadata: body.metadata ?? {} };
      transfer.reversals.push(reversal);
      return remember(reversal);
    }

    // --- Remboursements ---
    if (p === "/v1/refunds" && req.method === "POST") {
      const intent = stripe.intents[body.payment_intent];
      if (!intent) return stripeError(send, 404, "No such payment_intent");
      const refund = { id: nextId("re"), object: "refund", amount: Number(body.amount ?? intent.amount), currency: intent.currency, payment_intent: intent.id, charge: intent.latest_charge.id, status: "succeeded", reason: body.reason ?? null, metadata: body.metadata ?? {} };
      stripe.refunds.push(refund);
      // Stripe envoie aussi l'événement : il doit être ignoré (déjà enregistré).
      setTimeout(() => sendStripeEvent("refund.created", refund).catch(() => {}), 300);
      return remember(refund);
    }

    stripeError(send, 404, `Unrecognized request URL (${req.method}: ${p})`);
  });
}

// ---------------------------------------------------------------------------
// CJ Dropshipping : catalogue, stock, livraison, commandes, notifications
// ---------------------------------------------------------------------------

const cj = {
  removed: new Set(), offSale: new Set(), price: {}, stock: {}, failCreate: 0,
  orders: {}, orderCount: 0, balance: 500,
};
const IMG = (pid, i) => `https://cf.cjdropshipping.com/e2e/${pid}-${i}.jpg`;
const cjOk = (send, data) => send(200, { code: 200, result: true, success: true, message: "Success", data, requestId: nextId("req") });
const cjFail = (send, code, message) => send(200, { code, result: false, success: false, message, data: null });

/** Produit du catalogue simulé : identifiant « CJ-<mot-clé>-<n> », prix et ventes croissants/décroissants. */
function catalogueItem(keyword, i, flags = {}) {
  const pid = `CJ-${slug(keyword)}-${i}`;
  return {
    id: pid, pid, nameEn: `${titleCase(keyword)} model ${i}`, productNameEn: `${titleCase(keyword)} model ${i}`,
    bigImage: IMG(pid, 1), nowPrice: (cj.price[pid] ?? 500 + i * 50) / 100, sellPrice: String((cj.price[pid] ?? 500 + i * 50) / 100),
    categoryName: `Home & Garden / ${titleCase(keyword)}`, listedNum: 2000 - i * 37, ...flags,
  };
}

function productDetail(pid) {
  const keyword = pid.replace(/^CJ-/, "").replace(/-\d+$/, "").replace(/-/g, " ");
  const i = Number(/-(\d+)$/.exec(pid)?.[1] ?? 1);
  const cost = cj.price[pid] ?? 500 + i * 50;
  const variant = (n, color, extra) => ({
    vid: `${pid}-V${n}`, variantKey: color, variantNameEn: `${titleCase(keyword)} ${color}`, variantSellPrice: (cost + extra) / 100,
    variantImage: IMG(pid, 10 + n), variantWeight: 300, variantLength: 200, variantWidth: 100, variantHeight: 50,
    inventories: [{ countryCode: "CN", totalInventory: cj.stock[`${pid}-V${n}`] ?? 500 }],
  });
  return {
    pid, productNameEn: `${titleCase(keyword)} model ${i}`, productImageSet: [1, 2, 3].map((n) => IMG(pid, n)),
    description: `<p>${titleCase(keyword)} made of cotton.</p><img src="${IMG(pid, 9)}">`, sellPrice: String(cost / 100),
    status: cj.offSale.has(pid) ? "2" : "3", categoryName: `Home & Garden / ${titleCase(keyword)}`, listedNum: 2000 - i * 37,
    materialNameEnSet: ["Cotton"], packingNameEn: '["Box"]', productWeight: "300", productKeyEn: "Color",
    variants: [variant(1, "Black", 0), variant(2, "Blue", 40)],
  };
}

function startCj() {
  return createServer("cj", PORTS.cj, ({ req, url, body, send }) => {
    const p = url.pathname.replace(/^\/api2\.0\/v1/, "");
    const q = url.searchParams;

    // --- Commandes de test ---
    if (p === "/__set") {
      for (const pid of body.removed ?? []) cj.removed.add(pid);
      for (const pid of body.offSale ?? []) cj.offSale.add(pid);
      Object.assign(cj.price, body.price ?? {});
      Object.assign(cj.stock, body.stock ?? {});
      if (body.failCreate !== undefined) cj.failCreate = body.failCreate;
      return send(200, { ok: true });
    }
    if (p === "/__orders") return send(200, cj.orders);
    if (p === "/__ship") {
      Object.assign(cj.orders[body.orderId], { orderStatus: body.status ?? "SHIPPED", trackNumber: body.trackNumber ?? "YT2600000001" });
      return send(200, cj.orders[body.orderId]);
    }

    if (p === "/authentication/getAccessToken" || p === "/authentication/refreshAccessToken") {
      if (p.endsWith("getAccessToken") && !body.apiKey) return cjFail(send, 1600001, "apiKey required");
      const in15d = new Date(Date.now() + 15 * 86_400_000).toISOString();
      return cjOk(send, { accessToken: "cj-token-e2e", accessTokenExpiryDate: in15d, refreshToken: "cj-refresh-e2e", refreshTokenExpiryDate: in15d, openId: CJ_OPEN_ID });
    }
    if (req.headers["cj-access-token"] !== "cj-token-e2e") return cjFail(send, 1600001, "Invalid access token");

    if (p === "/product/listV2") {
      const page = Number(q.get("page") ?? 1);
      const size = Number(q.get("size") ?? 20);
      const tiktok = q.get("zonePlatform") === "tiktok";
      const keyword = q.get("keyWord") ?? (tiktok ? "pet toy" : "gadget");
      const flags = { ...(tiktok && { tiktok: true }), ...(q.get("productFlag") === "0" && { productFlag: 0 }) };
      const list = Array.from({ length: Math.min(size, 12) }, (_, k) => catalogueItem(keyword, (page - 1) * size + k + 1, flags))
        .filter((item) => !cj.removed.has(item.pid));
      return cjOk(send, { pageNumber: page, pageSize: size, totalRecords: page > 2 ? 0 : 36, content: page > 2 ? [] : [{ productList: list }] });
    }
    if (p === "/product/query") {
      const pid = q.get("pid");
      if (cj.removed.has(pid)) return cjFail(send, 1600100, "Product does not exist");
      return cjOk(send, productDetail(pid));
    }
    if (p === "/product/stock/getInventoryByPid") {
      const d = productDetail(q.get("pid"));
      return cjOk(send, { inventories: [], variantInventories: d.variants.map((v) => ({ vid: v.vid, inventory: v.inventories })) });
    }
    if (p === "/product/stock/queryByVid") return cjOk(send, [{ countryCode: "CN", totalInventoryNum: cj.stock[q.get("vid")] ?? 500 }]);
    if (p === "/logistic/freightCalculate") {
      return cjOk(send, [
        { logisticName: "CJPacket Ordinary", logisticPrice: 2.1, logisticAging: "15-25" },
        { logisticName: "CJPacket Sensitive", logisticPrice: 3.5, logisticAging: "8-12" },
      ]);
    }

    if (p === "/shopping/order/createOrderV2") {
      if (cj.failCreate > 0) {
        cj.failCreate--;
        return cjFail(send, 1600300, "Simulated CJ failure");
      }
      const orderId = `SD${RUN.toUpperCase()}${String(++cj.orderCount).padStart(4, "0")}`;
      const productAmount = body.products.reduce((s, x) => s + 5 * x.quantity, 0);
      cj.orders[orderId] = { orderId, orderNumber: body.orderNumber, orderStatus: "CREATED", trackNumber: null, logisticName: body.logisticName, request: body };
      return cjOk(send, { orderId, shipmentOrderId: null, productAmount, postageAmount: 3.5, actualPayment: null, orderAmount: null, orderStatus: "CREATED" });
    }
    if (p === "/shopping/order/confirmOrder") {
      const order = cj.orders[body.orderId];
      if (!order) return cjFail(send, 1600100, "Order does not exist");
      order.orderStatus = "UNPAID";
      return cjOk(send, true);
    }
    if (p === "/shopping/pay/payBalance" || p === "/shopping/pay/payBalanceV2") {
      const order = cj.orders[body.orderId] ?? Object.values(cj.orders).find((o) => o.shipmentOrderId === body.shipmentOrderId);
      if (!order || order.orderStatus !== "UNPAID") return cjFail(send, 1600100, "Order cannot be paid");
      order.orderStatus = "UNSHIPPED";
      return cjOk(send, true);
    }
    if (p === "/shopping/order/getOrderDetail") {
      const order = cj.orders[q.get("orderId")];
      return order ? cjOk(send, { orderId: order.orderId, orderStatus: order.orderStatus, trackNumber: order.trackNumber, logisticName: order.logisticName }) : cjFail(send, 1600100, "Order does not exist");
    }
    if (p === "/shopping/pay/getBalance") return cjOk(send, { amount: cj.balance, freezeAmount: 0 });
    if (p === "/webhook/set" || p === "/webhook/product/subscribe" || p === "/webhook/product/unsubscribe") return cjOk(send, true);

    cjFail(send, 1600404, `Unknown path ${p}`);
  });
}

// ---------------------------------------------------------------------------
// Resend (courriels) : tout est gardé, rien n'est envoyé
// ---------------------------------------------------------------------------

function startResend() {
  return createServer("courriels", PORTS.resend, ({ url, send }) => {
    if (url.pathname === "/emails") return send(200, { id: nextId("email") });
    send(404, { message: "Not found" });
  });
}

const servers = [startAnthropic(), startStripe(), startCj(), startResend()];
process.on("SIGTERM", () => {
  for (const s of servers) s.close();
  process.exit(0);
});
