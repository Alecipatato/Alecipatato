/**
 * Plateforme et vitrine (sans compte) : pages publiques, langues, boutiques de démonstration,
 * catalogue (recherche, tri), fiche produit, panier, pages légales, SEO, suivi de commande.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { APP } = require("../lib/config.cjs");
const { openBrowser, newPage, storeUrl, storeFetch, mainText } = require("../lib/helpers.cjs");

describe("Vitrine et pages publiques", () => {
  let browser;
  let page;
  before(async () => {
    browser = await openBrowser();
    page = await newPage(browser);
  });
  after(async () => browser?.close());

  it("accueil de la plateforme en français (témoin lang)", async () => {
    const response = await page.goto(APP);
    assert.equal(response.status(), 200);
    assert.equal(await page.getAttribute("html", "lang"), "fr");
    assert.match(await page.textContent("body"), /Créer ma boutique/);
  });

  it("accueil en anglais par défaut (sans témoin ni région)", async () => {
    const en = await newPage(browser, { lang: "en" });
    await en.context().clearCookies();
    await en.goto(APP);
    assert.equal(await en.getAttribute("html", "lang"), "en");
    assert.match(await en.textContent("body"), /Create my store/);
    await en.context().close();
  });

  it("pages légales de la plateforme", async () => {
    for (const path of ["/conditions", "/confidentialite"]) {
      const response = await page.goto(`${APP}${path}`);
      assert.equal(response.status(), 200, path);
      assert.ok((await mainText(page)).length > 500, `${path} : texte trop court`);
    }
    assert.match(await mainText(await page.goto(`${APP}/conditions`).then(() => page)), /commission/i);
  });

  it("boutique de démonstration sur son sous-domaine", async () => {
    const response = await page.goto(storeUrl("demo"));
    assert.equal(response.status(), 200);
    assert.ok((await page.locator("article").count()) >= 6);
    assert.match(await page.title(), /Zen Atelier/);
  });

  it("recherche et tri par prix dans le catalogue", async () => {
    const all = await page.locator("article").count();
    await page.goto(storeUrl("demo", "/?tri=prix-croissant"));
    const prices = await page.locator("article").evaluateAll((items) =>
      items.map((a) => {
        const m = a.textContent.match(/\$\s?(\d+)[.,](\d{2})|(\d+)[.,](\d{2})\s?\$/);
        return m ? Number(`${m[1] ?? m[3]}.${m[2] ?? m[4]}`) : NaN;
      }),
    );
    assert.ok(prices.length > 1 && prices.every((p) => p > 0), `prix lus : ${prices}`);
    assert.deepEqual([...prices].sort((a, b) => a - b), prices, "prix croissants");
    await page.goto(storeUrl("demo", "/?q=zzzzintrouvable"));
    assert.equal(await page.locator("article").count(), 0);
    assert.ok(all > 0);
  });

  it("boutique en français (langue propre à la boutique)", async () => {
    await page.goto(storeUrl("demo2"));
    assert.equal(await page.getAttribute("html", "lang"), "fr");
  });

  it("fiche produit : prix, ajout au panier", async () => {
    await page.click("article >> nth=0 >> a >> nth=0");
    await page.waitForURL(/\/produit\//);
    assert.match(await page.textContent("[data-product-price]"), /\$/);
    await page.locator("aside button").filter({ hasText: "Ajouter au panier" }).click();
    await page.goto(storeUrl("demo2", "/panier"));
    assert.equal(await page.locator("[data-cart-line]").count(), 1);
    assert.match(await mainText(page), /conditions/i, "rappel des conditions de vente dans le panier");
  });

  it("boutique de démonstration : paiement désactivé", async () => {
    assert.ok(await page.locator("button").filter({ hasText: "Passer à la caisse" }).isDisabled());
  });

  it("pages légales et contact de la boutique", async () => {
    for (const path of ["/legal/conditions", "/legal/retours", "/legal/livraison", "/legal/confidentialite", "/contact", "/suivi"]) {
      const response = await page.goto(storeUrl("demo2", path));
      assert.equal(response.status(), 200, path);
    }
    await page.goto(storeUrl("demo2", "/legal/confidentialite"));
    assert.match(await mainText(page), /Loi 25/);
  });

  it("suivi de commande : numéro inconnu", async () => {
    await page.goto(storeUrl("demo2", "/suivi"));
    await page.fill('input[name="commande"]', "KR-000000");
    await page.fill('input[name="courriel"]', "personne@exemple.ca");
    await page.locator('main form button[type="submit"]').click();
    await page.waitForSelector("main [role=alert]");
  });

  it("robots.txt et sitemap.xml par boutique", async () => {
    const robots = (await storeFetch("demo", "/robots.txt")).text;
    assert.match(robots, /Sitemap: .*demo\.localhost/);
    const sitemap = (await storeFetch("demo", "/sitemap.xml")).text;
    assert.match(sitemap, /<urlset/);
    assert.match(sitemap, /\/produit\//);
  });

  it("routage : accès direct /s/… refusé, boutique inconnue introuvable", async () => {
    assert.equal((await fetch(`${APP}/s/demo`)).status, 404);
    assert.equal((await storeFetch("inexistante-e2e")).status, 404);
  });

  it("tableau de bord protégé sans session", async () => {
    await page.goto(`${APP}/tableau-de-bord`);
    await page.waitForURL(/connexion/);
  });

  it("aucune erreur JavaScript", () => {
    assert.deepEqual(page.errors, []);
  });
});
