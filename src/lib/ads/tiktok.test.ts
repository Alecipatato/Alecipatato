import assert from "node:assert/strict";
import { test } from "node:test";
import { centsToUnits, TIKTOK_CANADA_LOCATION_ID, tiktokCampaignPayloads, tiktokTime } from "./tiktok.ts";

const input = {
  advertiserId: "ADV1",
  identityId: "ID1",
  pixelId: "C4ABCDEF1234567890",
  name: "Coussin — Kreo",
  dailyBudgetCents: 2505,
  adText: "Le coussin préféré des chats.",
  linkUrl: "https://boutique.kreo.ca/produit/abc",
  tiktokItemId: "7300000000000000001",
  requestId: "123456789",
  startTime: "2026-11-03 14:00:00",
};

test("montants : cents → unités, sans erreur d'arrondi", () => {
  assert.equal(centsToUnits(2500), 25);
  assert.equal(centsToUnits(2505), 25.05);
  assert.equal(centsToUnits(10), 0.1);
  assert.equal(tiktokTime(new Date("2026-11-03T14:05:09.123Z")), "2026-11-03 14:05:09");
});

test("campagne Smart+ : ventes sur le site, budget quotidien de campagne, désactivée", () => {
  const c = tiktokCampaignPayloads(input).campaign;
  assert.equal(c.objective_type, "WEB_CONVERSIONS");
  assert.equal(c.sales_destination, "WEBSITE");
  assert.equal(c.budget_mode, "BUDGET_MODE_DYNAMIC_DAILY_BUDGET");
  assert.equal(c.budget, 25.05);
  assert.equal(c.operation_status, "DISABLE");
  assert.equal(c.request_id, "123456789");
});

test("groupe : achats mesurés par le pixel, Canada 18+, ciblage automatique, désactivé", () => {
  const g = tiktokCampaignPayloads(input).adgroup("CAMP1");
  assert.equal(g.campaign_id, "CAMP1");
  assert.equal(g.promotion_type, "WEBSITE");
  assert.equal(g.optimization_goal, "CONVERT");
  assert.equal(g.pixel_id, input.pixelId);
  assert.equal(g.optimization_event, "SHOPPING");
  assert.deepEqual(g.targeting_spec, { location_ids: [TIKTOK_CANADA_LOCATION_ID], spc_audience_age: "OVER_EIGHTEEN" });
  assert.equal(g.targeting_optimization_mode, "AUTOMATIC");
  assert.equal(g.operation_status, "DISABLE");
  assert.notEqual(g.request_id, input.requestId);
});

test("annonce : Spark Ad (vidéo du compte TikTok), texte, lien vers la fiche, bouton dynamique, désactivée", () => {
  const a = tiktokCampaignPayloads(input).ad("GRP1", "CTA1");
  assert.deepEqual(a.creative_list[0].creative_info, { ad_format: "SINGLE_VIDEO", tiktok_item_id: input.tiktokItemId, identity_type: "TT_USER", identity_id: "ID1" });
  assert.deepEqual(a.ad_text_list, [{ ad_text: input.adText }]);
  assert.deepEqual(a.landing_page_url_list, [{ landing_page_url: input.linkUrl }]);
  assert.equal(a.call_to_action_id, "CTA1");
  assert.equal(a.operation_status, "DISABLE");
});
