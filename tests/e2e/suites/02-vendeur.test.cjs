/**
 * Parcours du vendeur : inscription, création d'une boutique par l'IA avec de vrais produits du fournisseur
 * (CJ simulé), validation des produits, mise en ligne, vitrine, personnalisation, pages légales,
 * message d'un client, contenus marketing et refus d'une niche interdite.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { APP } = require("../lib/config.cjs");
const { openBrowser, newPage, signUp, sql, sqlRow, storeUrl, mainText, mock, waitFor } = require("../lib/helpers.cjs");

describe("Vendeur : de l'inscription à la boutique en ligne", () => {
  let browser;
  let page;
  let seller;
  let storeId;
  let subdomain;
  before(async () => {
    browser = await openBrowser();
    page = await newPage(browser);
  });
  after(async () => browser?.close());

  it("inscription avec confirmation du courriel", async () => {
    seller = await signUp(page, { name: "Vera Vendeuse" });
    assert.ok(seller.id, "profil créé");
    assert.match(await mainText(page), /boutique/i);
  });

  it("niche interdite refusée par l'IA", async () => {
    await page.goto(`${APP}/tableau-de-bord/nouvelle?mode=ia`);
    await page.fill("#niche", "Vente d'armes et de fusils de chasse");
    await page.click('form button[type="submit"]:has-text("Créer ma boutique")');
    await page.waitForSelector("main [role=alert]");
    assert.match(await page.textContent("main [role=alert]"), /armes/i);
    assert.equal(sql(`select count(*) from public.stores where owner_id = '${seller.id}'`), "0");
  });

  it("création par l'IA : recherche des produits chez le fournisseur", async () => {
    await page.goto(`${APP}/tableau-de-bord/nouvelle?mode=ia`);
    await page.fill("#niche", "Yoga et méditation à la maison pour débutants");
    await page.selectOption("#language", "fr");
    await page.click('form button[type="submit"]:has-text("Créer ma boutique")');
    await page.waitForURL(/\/boutiques\/[0-9a-f-]+\/produits\?nouvelle=1/, { timeout: 60000 });
    storeId = /boutiques\/([0-9a-f-]+)/.exec(page.url())[1];
    // L'écran avance la recherche étape par étape jusqu'à la fin.
    await waitFor(() => sql(`select status from public.sourcing_jobs where store_id = '${storeId}' order by created_at desc limit 1`) === "done", { timeout: 120000, label: "recherche terminée" });
    await page.waitForSelector("[data-sourcing-progress]", { state: "detached", timeout: 30000 });
    const [status, name] = sqlRow(`select status, name from public.stores where id = '${storeId}'`);
    assert.equal(status, "draft", "hors ligne tant que les produits ne sont pas acceptés");
    assert.equal(name, "Atelier Yoga");
    const proposed = Number(sql(`select count(*) from public.products where store_id = '${storeId}' and status = 'proposed' and supplier = 'cj'`));
    assert.ok(proposed >= 10, `produits proposés : ${proposed}`);
  });

  it("fiches complètes et prix avec au moins 40 % de marge", async () => {
    const rows = sql(`select price_cents, supplier_cost_usd_cents, shipping_cost_usd_cents, jsonb_array_length(variants), long_description <> '', delivery_days_max
      from public.products where store_id = '${storeId}' and supplier = 'cj'`).split("\n").map((r) => r.split("|"));
    // Taux de secours (1,38) quand la Banque du Canada ne répond pas ; tolérance si le vrai taux est utilisé.
    const fx = 1.38;
    for (const [price, cost, shipping, variants, hasLong, days] of rows) {
      const costCad = (Number(cost) + Number(shipping)) * fx;
      assert.ok((Number(price) - costCad) / Number(price) >= 0.37, `marge trop faible : ${price} pour ${costCad}`);
      assert.equal(variants, "2", "deux variantes");
      assert.equal(hasLong, "t", "description détaillée");
      assert.ok(Number(days) <= 15, "livraison en 15 jours au plus");
    }
  });

  it("accepter tous les produits et mettre la boutique en ligne", async () => {
    await page.click('button:has-text("Tout accepter")');
    await page.waitForSelector('button:has-text("Mettre ma boutique en ligne")');
    await page.click('button:has-text("Mettre ma boutique en ligne")');
    await waitFor(() => sql(`select status from public.stores where id = '${storeId}'`) === "active", { label: "boutique en ligne" });
    subdomain = sql(`select subdomain from public.stores where id = '${storeId}'`);
    assert.match(subdomain, /^atelier-yoga/);
  });

  it("vitrine : produits en vente, fiche avec variantes", async () => {
    await page.goto(storeUrl(subdomain));
    assert.match(await page.title(), /Atelier Yoga/);
    assert.ok((await page.locator("article").count()) >= 10);
    await page.click("article >> nth=0 >> a >> nth=0");
    await page.waitForURL(/\/produit\//);
    assert.equal(await page.locator("[data-variants]").count(), 1);
    assert.match(await mainText(page), /Couleur Black/);
    assert.match(await mainText(page), /Premier paragraphe/);
  });

  it("personnalisation : nom et texte d'accueil", async () => {
    await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}`);
    await page.fill("#name", "Zen Maison");
    await page.fill("#hero_title", "Respirez, vous êtes chez vous");
    await page.click('form:has(#hero_title) button[type="submit"]');
    await waitFor(() => sql(`select name from public.stores where id = '${storeId}'`) === "Zen Maison", { label: "nom enregistré" });
    await page.goto(storeUrl(subdomain));
    assert.match(await page.textContent("body"), /Respirez, vous êtes chez vous/);
  });

  it("personnalisation : une marque connue est refusée", async () => {
    await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}`);
    await page.fill("#name", "Nike Yoga");
    await page.click('form:has(#hero_title) button[type="submit"]');
    await page.waitForSelector("form:has(#hero_title) [role=alert]");
    assert.equal(sql(`select name from public.stores where id = '${storeId}'`), "Zen Maison");
  });

  it("informations légales reprises dans les pages légales", async () => {
    await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}`);
    await page.fill("#legal_name", "Zen Maison inc.");
    await page.fill("#address", "10 rue du Lac, Québec QC G1R 1A1");
    await page.fill("#privacy_officer", "Vera Vendeuse");
    await page.click('form:has(#legal_name) button[type="submit"]');
    await waitFor(() => sql(`select legal_info->>'legal_name' from public.stores where id = '${storeId}'`) === "Zen Maison inc.", { label: "infos légales" });
    await page.goto(storeUrl(subdomain, "/legal/confidentialite"));
    assert.match(await mainText(page), /Vera Vendeuse/);
    await page.goto(storeUrl(subdomain, "/legal/conditions"));
    assert.match(await mainText(page), /Zen Maison inc\./);
  });

  it("message d'un client : enregistré et transmis au vendeur", async () => {
    await mock.clear("resend");
    const buyer = await newPage(browser);
    await buyer.goto(storeUrl(subdomain, "/contact"));
    await buyer.fill('input[name="name"]', "Camille Cliente");
    await buyer.fill('input[name="email"]', "camille@exemple.ca");
    await buyer.fill('textarea[name="message"]', "Bonjour, livrez-vous à Gaspé ? Merci !");
    await buyer.click('main form button[type="submit"]');
    await buyer.waitForSelector("text=Merci ! Votre message a été envoyé");
    await buyer.context().close();
    const [mail] = await waitFor(() => mock.emails(seller.email).then((l) => l.length && l), { label: "courriel au vendeur" });
    assert.match(mail.text, /Gaspé/);
    assert.equal(mail.reply_to, "camille@exemple.ca");
    await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}/messages`);
    assert.match(await mainText(page), /Camille Cliente/);
  });

  it("contenus marketing générés par l'IA", async () => {
    await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}/marketing`);
    await page.click('form:has(select[name="product_id"]) button[type="submit"]');
    await page.waitForSelector("form:has(select[name=product_id]) [role=status], form:has(select[name=product_id]) .text-danger, main [role=alert]");
    await waitFor(() => Number(sql(`select count(*) from public.marketing_assets where store_id = '${storeId}'`)) > 0, { label: "contenus enregistrés" });
    await page.reload();
    assert.match(await mainText(page), /Script 1/);
  });

  it("aucune erreur JavaScript", () => {
    assert.deepEqual(page.errors, []);
  });
});
