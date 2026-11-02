import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeParams, metaCampaignPayloads } from "./meta.ts";

const input = {
  adAccountId: "act_1",
  pageId: "PAGE",
  pixelId: "123456789012345",
  name: "Coussin — Kreo",
  dailyBudgetCents: 2500,
  primaryText: "Un coussin douillet.",
  headline: "Coussin rond",
  description: "Livraison au Canada",
  linkUrl: "https://boutique.kreo.ca/produit/abc",
  imageUrl: "https://cdn.example.com/a.jpg",
};

test("campagne « Ventes » en pause, sans catégorie spéciale", () => {
  const p = metaCampaignPayloads(input);
  assert.equal(p.campaign.objective, "OUTCOME_SALES");
  assert.equal(p.campaign.status, "PAUSED");
  assert.deepEqual(p.campaign.special_ad_categories, []);
});

test("ensemble : achats sur le site via le pixel, Canada, 18 ans et plus, budget en cents, en pause", () => {
  const a = metaCampaignPayloads(input).adset("C1");
  assert.equal(a.campaign_id, "C1");
  assert.equal(a.daily_budget, 2500);
  assert.equal(a.optimization_goal, "OFFSITE_CONVERSIONS");
  assert.deepEqual(a.promoted_object, { pixel_id: "123456789012345", custom_event_type: "PURCHASE" });
  assert.deepEqual(a.targeting, { geo_locations: { countries: ["CA"] }, age_min: 18 });
  assert.equal(a.status, "PAUSED");
});

test("visuel : page, lien vers la fiche, image, bouton « Acheter » ; publicité en pause", () => {
  const p = metaCampaignPayloads(input);
  assert.equal(p.creative.object_story_spec.page_id, "PAGE");
  assert.equal(p.creative.object_story_spec.link_data.link, input.linkUrl);
  assert.equal(p.creative.object_story_spec.link_data.picture, input.imageUrl);
  assert.equal(p.creative.object_story_spec.link_data.call_to_action.type, "SHOP_NOW");
  assert.deepEqual(p.ad("S1", "CR1"), { name: input.name, adset_id: "S1", creative: { creative_id: "CR1" }, status: "PAUSED" });
});

test("paramètres : objets en JSON, valeurs vides ignorées", () => {
  const body = encodeParams({ a: 1, b: { c: [1] }, d: undefined, e: false });
  assert.equal(body.get("a"), "1");
  assert.equal(body.get("b"), '{"c":[1]}');
  assert.equal(body.has("d"), false);
  assert.equal(body.get("e"), "false");
});
