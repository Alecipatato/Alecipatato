/**
 * Administration : accès réservé (404 pour les autres), double authentification obligatoire (configuration
 * puis code à chaque connexion), vue d'ensemble, suspension et réactivation d'une boutique, règles de
 * modération, plafonds de versement avec approbation, paliers de commission, journal des actions.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { APP } = require("../lib/config.cjs");
const { openBrowser, newPage, signUp, signIn, enrollAdmin, sql, sqlRow, storeFetch, mainText, mock, cron, totp, sleep, waitFor, createStoreWithProducts } = require("../lib/helpers.cjs");

describe("Administration de la plateforme", () => {
  let browser;
  let sellerPage;
  let adminPage;
  let store;
  let admin;
  let secret;
  before(async () => {
    browser = await openBrowser();
    sellerPage = await newPage(browser);
    store = await createStoreWithProducts(sellerPage, { name: "Sam Surveillé", niche: "Décoration de jardin et pots de fleurs" });
    adminPage = await newPage(browser);
    admin = await signUp(adminPage, { name: "Ada Admin" });
  });
  after(async () => browser?.close());

  it("un vendeur n'a pas accès à l'administration (404)", async () => {
    const response = await sellerPage.goto(`${APP}/admin`);
    assert.equal(response.status(), 404);
  });

  it("administrateur : double authentification exigée puis configurée", async () => {
    secret = await enrollAdmin(adminPage, admin.email);
    assert.match(await mainText(adminPage), /boutiques/i);
    assert.equal(sql(`select count(*) from public.admin_audit_log where admin_id = '${admin.id}' and action like 'mfa%'`) !== "0", true);
  });

  it("nouvelle connexion : code demandé avant d'entrer", async () => {
    const fresh = await newPage(browser);
    await signIn(fresh, admin.email);
    await fresh.goto(`${APP}/admin`);
    await fresh.waitForURL(/securite-admin/);
    // Un code ne sert qu'une fois : on attend la période suivante de 30 secondes.
    await sleep(30000 - (Date.now() % 30000) + 500);
    await fresh.fill("#code", totp(secret));
    await fresh.click('[data-mfa-verify] button[type="submit"]');
    await fresh.waitForURL(/\/admin$/);
    await fresh.context().close();
  });

  it("vue d'ensemble : boutiques, revenus, coûts IA, portefeuille CJ", async () => {
    await adminPage.goto(`${APP}/admin`);
    const text = await mainText(adminPage);
    assert.match(text, /IA/);
    assert.match(text, /CJ/);
    assert.match(text, /500/, "solde du portefeuille CJ (simulé : 500 $ US)");
  });

  it("suspension d'une boutique : hors ligne, motif visible, journal", async () => {
    await adminPage.goto(`${APP}/admin/boutiques?q=${encodeURIComponent(store.subdomain)}`);
    const form = adminPage.locator(`form:has(input[name="store_id"][value="${store.storeId}"]):has(input[name="reason"])`);
    await form.locator('input[name="reason"]').fill("Produits contrefaits signalés");
    await form.locator('button[type="submit"]').click();
    await waitFor(() => sql(`select status from public.stores where id = '${store.storeId}'`) === "suspended", { label: "boutique suspendue" });
    assert.equal((await storeFetch(store.subdomain, "/")).status, 404);
    assert.equal(sql(`select suspension_reason from public.stores where id = '${store.storeId}'`), "Produits contrefaits signalés");
    assert.notEqual(sql(`select count(*) from public.admin_audit_log where admin_id = '${admin.id}' and target_id = '${store.storeId}'`), "0");
    await sellerPage.goto(`${APP}/tableau-de-bord/boutiques/${store.storeId}`);
    assert.match(await mainText(sellerPage), /Produits contrefaits signalés/, "le vendeur voit le motif");
  });

  it("réactivation : la boutique revient hors ligne (brouillon), le vendeur la remet en ligne", async () => {
    await adminPage.goto(`${APP}/admin/boutiques?q=${encodeURIComponent(store.subdomain)}`);
    await adminPage.locator(`form:has(input[name="store_id"][value="${store.storeId}"]) button[type="submit"]`).first().click();
    await waitFor(() => sql(`select status from public.stores where id = '${store.storeId}'`) === "draft", { label: "boutique réactivée" });
    sql(`update public.stores set status = 'active' where id = '${store.storeId}'`);
    assert.equal((await storeFetch(store.subdomain, "/")).status, 200);
  });

  it("règle de modération ajoutée : appliquée aux textes du vendeur, puis retirée", async () => {
    const term = `motinterdit${Date.now() % 100000}`;
    await adminPage.goto(`${APP}/admin/moderation`);
    await adminPage.selectOption('select[name="kind"]', "prohibited");
    await adminPage.fill('input[name="term"]', term);
    await adminPage.click('form:has(input[name="term"]) button[type="submit"]');
    await waitFor(() => sql(`select count(*) from public.moderation_rules where term = '${term}'`) === "1", { label: "règle ajoutée" });

    await sellerPage.goto(`${APP}/tableau-de-bord/boutiques/${store.storeId}`);
    await sellerPage.fill("#hero_title", `Le meilleur ${term} du Québec`);
    await sellerPage.click('form:has(#hero_title) button[type="submit"]');
    await sellerPage.waitForSelector("form:has(#hero_title) [role=alert]");

    await adminPage.goto(`${APP}/admin/moderation`);
    await adminPage.click(`button[aria-label*="${term}"]`);
    await waitFor(() => sql(`select count(*) from public.moderation_rules where term = '${term}'`) === "0", { label: "règle retirée" });
  });

  it("plafond de sécurité : gros versement retenu, alerte, puis approuvé et versé", async () => {
    // Commande payée fictive de 2 500 $ (au-dessus du plafond de 2 000 $ par versement), réserve écoulée.
    const owner = sqlRow(`select owner_id from public.stores where id = '${store.storeId}'`)[0];
    sql(`update public.profiles set stripe_account_id = 'acct_e2e_admin${Date.now()}', stripe_onboarding_complete = true where id = '${owner}'`);
    const orderId = sql(`insert into public.orders (store_id, order_number, status, currency, subtotal_cents, total_cents, supplier_cost_cents, supplier_shipping_cents, gross_margin_cents, commission_rate, commission_cents, store_payout_cents, paid_at)
      values ('${store.storeId}', 'KR-E2E${Date.now() % 1000000}', 'paid', 'CAD', 400000, 400000, 50000, 10000, 340000, 0.15, 51000, 250000, now()) returning id`).split("\n")[0];
    sql(`insert into public.payouts (store_id, order_id, amount_cents, currency, available_at, status) values ('${store.storeId}', '${orderId}', 250000, 'CAD', now() - interval '1 hour', 'pending')`);
    await mock.clear("resend");
    await cron("payouts");
    assert.deepEqual(sqlRow(`select status, hold_reason from public.payouts where order_id = '${orderId}'`), ["held", "limit"]);
    const alerts = await mock.emails("alertes@exemple.ca");
    assert.ok(alerts.some((m) => /plafond/.test(m.subject)), "alerte « plafond » envoyée");

    await adminPage.goto(`${APP}/admin/securite`);
    await adminPage.click(`form:has(input[name="payout_id"]) button[type="submit"]`);
    await waitFor(() => sql(`select approved_by from public.payouts where order_id = '${orderId}'`) === admin.id, { label: "approbation" });
    await cron("payouts");
    assert.equal(sql(`select status from public.payouts where order_id = '${orderId}'`), "paid");
  });

  it("paliers de commission affichés et vendeurs par palier", async () => {
    await adminPage.goto(`${APP}/admin/commission`);
    const text = await mainText(adminPage);
    for (const pct of ["15", "12", "10", "8"]) assert.match(text, new RegExp(`${pct}\\s?%`));
  });

  it("journal des actions sensibles", async () => {
    await adminPage.goto(`${APP}/admin/securite`);
    const text = await mainText(adminPage);
    assert.match(text, /Double authentification configurée/);
    assert.match(text, /suspendu|Suspension/i);
  });

  it("aucune erreur JavaScript", () => {
    assert.deepEqual([...adminPage.errors, ...sellerPage.errors], []);
  });
});
