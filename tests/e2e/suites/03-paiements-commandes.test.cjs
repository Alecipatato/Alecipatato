/**
 * Flux d'argent et commandes : compte de versement Stripe Express, achat sur la vitrine (Stripe Checkout simulé,
 * taxes), commission sur la marge brute, transmission et paiement de la commande chez CJ, suivi de livraison,
 * courriels, versement après la réserve, remboursement (reprise sur le vendeur) et litige.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { APP } = require("../lib/config.cjs");
const { openBrowser, newPage, sql, sqlRow, storeUrl, storeFetch, mainText, mock, cron, waitFor, createStoreWithProducts } = require("../lib/helpers.cjs");

/** Achat complet sur la vitrine : ajout au panier, page de paiement simulée, retour sur « merci ». */
async function buy(browser, subdomain, { variant = null, email = "acheteur@exemple.ca" } = {}) {
  const buyer = await newPage(browser);
  await buyer.goto(storeUrl(subdomain));
  await buyer.click("article >> nth=0 >> a >> nth=0");
  await buyer.waitForURL(/\/produit\//);
  if (variant) {
    await buyer.locator("[data-variants] [data-variant]").filter({ hasText: variant }).click();
    await buyer.waitForURL(/[?&]v=/);
  }
  await buyer.locator("aside button").filter({ hasText: "Ajouter au panier" }).click();
  await buyer.goto(storeUrl(subdomain, "/panier"));
  await buyer.locator("button").filter({ hasText: "Passer à la caisse" }).click();
  await buyer.waitForURL(/127\.0\.0\.1:4020\/pay\//);
  const payPage = { amount: await buyer.textContent("[data-amount]"), terms: await buyer.textContent("[data-terms]"), lines: await buyer.locator("[data-line]").allTextContents() };
  await buyer.fill("#email", email);
  await buyer.click("#pay");
  await buyer.waitForURL(/\/commande\/merci/);
  const thanks = await mainText(buyer);
  await buyer.context().close();
  const orderId = sql(`select id from public.orders where stripe_checkout_session_id is not null and customer_email = '${email}' order by created_at desc limit 1`);
  return { payPage, thanks, orderId };
}

describe("Paiements, commission, commandes CJ, versements", () => {
  let browser;
  let page;
  let seller;
  let storeId;
  let subdomain;
  let orderId;
  before(async () => {
    browser = await openBrowser();
    page = await newPage(browser);
    ({ seller, storeId, subdomain } = await createStoreWithProducts(page, { name: "Paul Paiements" }));
  });
  after(async () => browser?.close());

  it("compte de versement Stripe Express (inscription simulée)", async () => {
    await page.goto(`${APP}/tableau-de-bord/paiements`);
    await page.click('form button[type="submit"]:has-text("Configurer")');
    await page.waitForURL(/tableau-de-bord\/paiements\?stripe=retour/);
    await waitFor(() => sql(`select stripe_onboarding_complete from public.profiles where id = '${seller.id}'`) === "t", { label: "compte prêt (webhook account.updated)" });
    assert.match(sql(`select stripe_account_id from public.profiles where id = '${seller.id}'`), /^acct_/);
  });

  it("achat sur la vitrine : paiement Stripe avec taxes et conditions de vente", async () => {
    await mock.clear("resend");
    await mock.clear("cj");
    const result = await buy(browser, subdomain, { variant: "Couleur Blue" });
    orderId = result.orderId;
    assert.ok(orderId, "commande créée");
    assert.match(result.payPage.lines[0], /Couleur Blue/);
    assert.match(result.payPage.terms, /legal\/conditions/);
    assert.match(result.thanks, /merci/i);
  });

  it("commande payée : montants, taxes, frais et commission de 15 % sur la marge brute", async () => {
    await waitFor(() => sql(`select status from public.orders where id = '${orderId}'`) !== "pending", { label: "commande confirmée" });
    const [subtotal, tax, total, cost, shipping, margin, rate, commission, payout, fee, fx] = sqlRow(
      `select subtotal_cents, tax_cents, total_cents, supplier_cost_cents, supplier_shipping_cents, gross_margin_cents, commission_rate,
              commission_cents, store_payout_cents, stripe_fee_cents, fx_rate_usd_cad from public.orders where id = '${orderId}'`,
    ).map(Number);
    assert.equal(tax, Math.round(subtotal * 0.14975), "TPS + TVQ calculées par Stripe Tax (simulé)");
    assert.equal(total, subtotal + tax);
    assert.equal(margin, subtotal - cost - shipping, "marge brute = prix − coût fournisseur − livraison");
    assert.equal(rate, 0.15, "premier palier de commission");
    assert.equal(commission, Math.round(margin * 0.15));
    assert.equal(payout, margin - commission, "frais Stripe à la charge de la plateforme (réglage par défaut)");
    assert.equal(fee, Math.round(total * 0.029) + 30);
    assert.ok(fx > 1 && fx < 2, "taux USD/CAD mémorisé");
    const [variantLabel] = sqlRow(`select variant_label from public.order_items where order_id = '${orderId}'`);
    assert.equal(variantLabel, "Couleur Blue");
    const [status, amount, available] = sqlRow(`select status, amount_cents, available_at > now() + interval '6 days' from public.payouts where order_id = '${orderId}'`);
    assert.deepEqual([status, Number(amount), available], ["pending", payout, "t"], "versement prévu après 7 jours de réserve");
  });

  it("commande transmise et payée chez CJ (sandbox)", async () => {
    await waitFor(() => sql(`select cj_status from public.orders where id = '${orderId}'`) === "sent", { label: "commande transmise à CJ" });
    const orders = await mock.get("cj", "/__orders");
    const cjOrder = Object.values(orders).find((o) => o.orderNumber === orderId);
    assert.ok(cjOrder, "commande reçue par CJ");
    assert.equal(cjOrder.orderStatus, "UNSHIPPED", "confirmée puis payée avec le portefeuille");
    assert.equal(cjOrder.request.isSandbox, 1);
    assert.equal(cjOrder.request.logisticName, "CJPacket Sensitive", "transporteur sous 15 jours");
    assert.match(cjOrder.request.products[0].vid, /-V2$/, "variante choisie");
    assert.equal(cjOrder.request.shippingZip, "H2X 1Y4");
    assert.equal(sql(`select status from public.orders where id = '${orderId}'`), "sent_to_supplier");
  });

  it("courriels : confirmation à l'acheteur et avis de vente au vendeur", async () => {
    const [confirmation] = await waitFor(() => mock.emails("acheteur@exemple.ca").then((l) => l.length && l), { label: "confirmation" });
    assert.match(confirmation.from, /Atelier/);
    assert.equal(confirmation.reply_to, seller.email);
    await waitFor(() => mock.emails(seller.email).then((l) => l.length), { label: "avis de vente" });
  });

  it("suivi : expédition relue chez CJ, courriel et page publique de suivi", async () => {
    const cjId = sql(`select cj_order_id from public.orders where id = '${orderId}'`);
    await mock.post("cj", "/__ship", { orderId: cjId, status: "SHIPPED", trackNumber: "YT2611110001" });
    sql(`update public.orders set tracking_checked_at = null where id = '${orderId}'`);
    const report = await cron("orders");
    assert.ok(report.shipped >= 1, JSON.stringify(report));
    const [status, tracking] = sqlRow(`select status, tracking_number from public.orders where id = '${orderId}'`);
    assert.deepEqual([status, tracking], ["shipped", "YT2611110001"]);
    const mails = await mock.emails("acheteur@exemple.ca");
    assert.ok(mails.some((m) => m.text.includes("YT2611110001")), "courriel d'expédition avec le numéro de suivi");
    const number = sql(`select order_number from public.orders where id = '${orderId}'`);
    const tracker = await newPage(browser);
    await tracker.goto(storeUrl(subdomain, `/suivi?commande=${number}&courriel=acheteur@exemple.ca`));
    assert.match(await tracker.textContent("[data-tracking]"), /YT2611110001/);
    await tracker.context().close();
  });

  it("versement : rien avant la réserve, puis transfert Stripe vers le vendeur", async () => {
    await cron("payouts");
    assert.equal(sql(`select status from public.payouts where order_id = '${orderId}'`), "pending");
    sql(`update public.payouts set available_at = now() - interval '1 minute' where order_id = '${orderId}'`);
    await cron("payouts");
    const [status, transferId, amount] = sqlRow(`select status, stripe_transfer_id, amount_cents from public.payouts where order_id = '${orderId}'`);
    assert.equal(status, "paid");
    const state = await mock.get("stripe", "/__state");
    const transfer = state.transfers[transferId];
    assert.equal(transfer.amount, Number(amount));
    assert.equal(transfer.destination, sql(`select stripe_account_id from public.profiles where id = '${seller.id}'`));
    assert.equal(transfer.source_transaction, sql(`select stripe_charge_id from public.orders where id = '${orderId}'`));
    assert.equal(transfer.transfer_group, orderId);
  });

  it("remboursement partiel depuis le tableau de bord : règles appliquées, reprise sur le versement", async () => {
    await page.goto(`${APP}/tableau-de-bord/boutiques/${storeId}/commandes`);
    await page.locator(`details:has(input[value="${orderId}"]) summary`).click();
    await page.fill(`form:has(input[value="${orderId}"]) input[name="amount"]`, "10,00");
    await page.click(`form:has(input[value="${orderId}"]) button[type="submit"]`);
    await page.waitForURL(/rembourse=/);
    const [refunded, status] = sqlRow(`select refunded_cents, status from public.orders where id = '${orderId}'`);
    assert.deepEqual([Number(refunded), status], [1000, "partially_refunded"]);
    const [amount, storeDebit, platformDebit] = sqlRow(`select amount_cents, store_debit_cents, platform_debit_cents from public.refunds where order_id = '${orderId}'`).map(Number);
    assert.equal(amount, 1000);
    assert.ok(storeDebit + platformDebit > 0, "perte répartie entre le vendeur et la plateforme");
    if (storeDebit > 0) {
      const transfer = (await mock.get("stripe", "/__state")).transfers[sql(`select stripe_transfer_id from public.payouts where order_id = '${orderId}'`)];
      assert.equal(transfer.amount_reversed, storeDebit, "part du vendeur reprise sur le transfert déjà versé");
    }
    // Stripe renvoie aussi l'événement refund.created : il ne doit rien enregistrer en double.
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(sql(`select count(*) from public.refunds where order_id = '${orderId}'`), "1");
  });

  it("litige : versement retenu, puis libéré quand le litige est gagné", async () => {
    const { orderId: second } = await buy(browser, subdomain, { email: "litige@exemple.ca" });
    await waitFor(() => sql(`select status from public.orders where id = '${second}'`) !== "pending", { label: "2e commande payée" });
    const [pi, charge, total] = sqlRow(`select stripe_payment_intent_id, stripe_charge_id, total_cents from public.orders where id = '${second}'`);
    const dispute = { id: `dp_e2e${Date.now()}`, object: "dispute", amount: Number(total), currency: "cad", charge, payment_intent: pi, reason: "fraudulent", status: "needs_response" };
    assert.equal((await mock.post("stripe", "/__event", { type: "charge.dispute.created", object: dispute })).status, 200);
    assert.deepEqual(sqlRow(`select status, hold_reason from public.payouts where order_id = '${second}'`), ["held", "dispute"]);
    assert.equal(sql(`select disputed from public.orders where id = '${second}'`), "t");
    await mock.post("stripe", "/__event", { type: "charge.dispute.closed", object: { ...dispute, status: "won" } });
    assert.deepEqual(sqlRow(`select status, coalesce(hold_reason, '') from public.payouts where order_id = '${second}'`), ["pending", ""]);
    assert.equal(sql(`select status from public.refunds where stripe_dispute_id = '${dispute.id}'`), "won");
  });

  it("webhook Stripe : signature invalide refusée, événement en double ignoré", async () => {
    const bad = await mock.post("stripe", "/__event", { type: "account.updated", object: { id: "acct_x" }, secret: "whsec_faux" });
    assert.equal(bad.status, 400);
    const id = `evt_e2e_double${Date.now()}`;
    const first = await mock.post("stripe", "/__event", { id, type: "account.updated", object: { id: "acct_x", details_submitted: true, capabilities: {} } });
    const second = await mock.post("stripe", "/__event", { id, type: "account.updated", object: { id: "acct_x", details_submitted: true, capabilities: {} } });
    assert.equal(JSON.parse(first.body).duplicate, false);
    assert.equal(JSON.parse(second.body).duplicate, true);
  });

  it("échec chez CJ : nouvel essai planifié puis alerte à l'administrateur", async () => {
    await mock.post("cj", "/__set", { failCreate: 10 });
    await mock.clear("resend");
    const { orderId: third } = await buy(browser, subdomain, { email: "echec@exemple.ca" });
    await waitFor(() => sql(`select cj_status from public.orders where id = '${third}'`) === "failed", { label: "envoi en échec" });
    assert.match(sql(`select cj_error from public.orders where id = '${third}'`), /Simulated CJ failure/);
    // Après plusieurs essais, l'administrateur est prévenu par courriel.
    for (let i = 0; i < 5; i++) {
      sql(`update public.orders set cj_last_attempt_at = now() - interval '1 day' where id = '${third}'`);
      await cron("orders");
    }
    await mock.post("cj", "/__set", { failCreate: 0 });
    const alerts = await mock.emails("alertes@exemple.ca");
    assert.ok(alerts.some((m) => m.subject.startsWith("[Alerte]")), "alerte envoyée");
  });

  it("tâches planifiées protégées par le secret", async () => {
    assert.equal((await fetch(`${APP}/api/cron/payouts`)).status, 401);
    assert.equal((await storeFetch(subdomain, "/api/cron/payouts")).status, 404, "pas accessibles sur une boutique");
  });
});
