/**
 * Produits tendance et données à jour : découverte des produits populaires chez CJ (zone TikTok comprise),
 * tri par l'IA, galerie, boutique créée à partir de produits choisis, notifications CJ signées (produit
 * retiré partout, prix relevé), stock revérifié au moment du paiement.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { APP, CJ_OPEN_ID } = require("../lib/config.cjs");
const { openBrowser, newPage, signUp, sql, sqlRow, storeUrl, mainText, mock, cron, waitFor } = require("../lib/helpers.cjs");

/** Notification CJ signée comme le fait CJ : en-tête « sign » = Base64(HMAC-SHA256(openId, corps brut)). */
async function cjNotify(message, openId = String(CJ_OPEN_ID)) {
  const body = JSON.stringify(message);
  const sign = crypto.createHmac("sha256", openId).update(body).digest("base64");
  const response = await fetch(`${APP}/api/cj/webhook`, { method: "POST", headers: { "content-type": "application/json", sign }, body });
  return response.status;
}

describe("Produits tendance et données toujours à jour", () => {
  let browser;
  let page;
  let storeId;
  let subdomain;
  let pid;
  before(async () => {
    browser = await openBrowser();
    page = await newPage(browser);
  });
  after(async () => browser?.close());

  it("découverte des produits tendance (tâche planifiée) et tri par l'IA", async () => {
    sql("update public.trend_sources set discovered_at = now() - interval '30 days'");
    // Plusieurs passages : une source (zone TikTok ou un thème) par passage, puis vérification par lots.
    for (let i = 0; i < 4; i++) await cron("trends", "?limit=100");
    const ready = Number(sql("select count(*) from public.trending_products where status = 'ready' and supplier_product_id like 'CJ-%'"));
    assert.ok(ready >= 10, `produits prêts : ${ready}`);
    assert.equal(sql("select count(*) from public.trending_products where status = 'ready' and theme is null"), "0", "chaque produit prêt a un thème");
    assert.notEqual(sql("select count(*) from public.trending_products where name_fr like 'FR %'"), "0", "noms français rédigés par l'IA");
  });

  it("galerie des produits gagnants : thèmes, gain estimé, avis sur les coûts retirés", async () => {
    await signUp(page, { name: "Tina Tendance" });
    await page.goto(`${APP}/tableau-de-bord/nouvelle?mode=produits`);
    assert.ok((await page.locator("li[data-trend]").count()) >= 10);
    assert.equal(await page.locator("[data-cost-notice]").count(), 1);
  });

  it("boutique créée à partir de 3 produits choisis : mis en vente sans validation", async () => {
    for (let i = 0; i < 3; i++) {
      await page.locator('li[data-trend]:not([data-selected]) button[aria-pressed="false"]:enabled').first().click();
    }
    assert.equal(await page.locator("li[data-trend][data-selected]").count(), 3);
    await page.click('form:has(input[name="mode"]) button[type="submit"]');
    await page.waitForURL(/\/boutiques\/[0-9a-f-]+\/produits/, { timeout: 60000 });
    storeId = /boutiques\/([0-9a-f-]+)/.exec(page.url())[1];
    await waitFor(() => sql(`select status from public.sourcing_jobs where store_id = '${storeId}' order by created_at desc limit 1`) === "done", { timeout: 120000, label: "fiches préparées" });
    assert.equal(sql(`select count(*) from public.products where store_id = '${storeId}' and status = 'active'`), "3");
    await page.reload();
    await page.click('button:has-text("Mettre ma boutique en ligne")');
    await waitFor(() => sql(`select status from public.stores where id = '${storeId}'`) === "active", { label: "en ligne" });
    subdomain = sql(`select subdomain from public.stores where id = '${storeId}'`);
    pid = sql(`select supplier_product_id from public.products where store_id = '${storeId}' order by price_cents limit 1`);
  });

  it("notification CJ : fausse signature refusée", async () => {
    assert.equal(await cjNotify({ messageId: `m-${Date.now()}`, type: "PRODUCT", messageType: "DELETE", params: { pid } }, "9999"), 401);
    assert.equal(sql(`select status from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`), "active");
  });

  it("notification CJ : prix du fournisseur en hausse → prix de vente relevé (marge minimale)", async () => {
    const before = Number(sql(`select price_cents from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`));
    await mock.post("cj", "/__set", { price: { [pid]: 3000 } }); // 30 $ US au lieu de ~5 $
    assert.equal(await cjNotify({ messageId: `m-${Date.now()}`, type: "PRODUCT", messageType: "UPDATE", params: { pid, productStatus: 3 } }), 200);
    await waitFor(() => Number(sql(`select price_cents from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`)) > before, { label: "prix relevé" });
    assert.equal(sql(`select sync_status from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`), "price_raised");
  });

  it("stock revérifié au paiement : variante épuisée chez CJ → paiement refusé", async () => {
    const vid = sql(`select supplier_variant_id from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`);
    await mock.post("cj", "/__set", { stock: { [vid]: 0 } });
    // Paiement possible seulement si le vendeur a configuré ses versements (compte Stripe prêt).
    sql(`update public.profiles set stripe_account_id = 'acct_e2e_trend${Date.now()}', stripe_onboarding_complete = true where id = (select owner_id from public.stores where id = '${storeId}')`);
    const buyer = await newPage(browser);
    // Produit dont la variante par défaut vient d'être épuisée chez CJ (la boutique ne le sait pas encore).
    const productId = sql(`select id from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`);
    await buyer.goto(storeUrl(subdomain, `/produit/${productId}`));
    await buyer.locator("aside button").filter({ hasText: "Ajouter au panier" }).click();
    await buyer.goto(storeUrl(subdomain, "/panier"));
    await buyer.locator("button").filter({ hasText: "Passer à la caisse" }).click();
    await buyer.waitForSelector("text=/stock/i");
    assert.match(buyer.url(), /\/panier/);
    await buyer.context().close();
    await mock.post("cj", "/__set", { stock: { [vid]: 500 } });
  });

  it("notification CJ : produit retiré par le fournisseur → retiré de la boutique et de la galerie", async () => {
    await mock.post("cj", "/__set", { removed: [pid] });
    assert.equal(await cjNotify({ messageId: `m-${Date.now()}`, type: "PRODUCT", messageType: "DELETE", params: { pid } }), 200);
    await waitFor(() => sql(`select status from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`) === "rejected", { label: "produit retiré" });
    assert.deepEqual(sqlRow(`select sync_status from public.products where store_id = '${storeId}' and supplier_product_id = '${pid}'`), ["unavailable"]);
    assert.notEqual(sql(`select coalesce(max(status), 'absent') from public.trending_products where supplier_product_id = '${pid}'`), "ready");
    await page.goto(storeUrl(subdomain));
    assert.equal(await page.locator("article").count(), 2);
  });

  it("notification reçue deux fois : traitée une seule fois", async () => {
    const message = { messageId: `m-double-${Date.now()}`, type: "STOCK", params: { x: [{ vid: "inconnu", countryCode: "CN", storageNum: 3 }] } };
    assert.equal(await cjNotify(message), 200);
    assert.equal(await cjNotify(message), 200);
    assert.equal(sql(`select count(*) from public.cj_webhook_events where message_id = '${message.messageId}'`), "1");
  });

  it("synchronisation horaire (prix et stock)", async () => {
    const report = await cron("sync-products");
    assert.ok(typeof report === "object");
    assert.match(await mainText(await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}/produits`).then(() => page)), /Produits/);
  });

  it("aucune erreur JavaScript", () => {
    assert.deepEqual(page.errors, []);
  });
});
