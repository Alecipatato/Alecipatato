import assert from "node:assert/strict";
import { test } from "node:test";
import { cjSignature, parseCjWebhook, verifyCjSignature } from "./webhook-message.ts";

const DOC_BODY = '{"messageId":"123111","messageType":"INSERT","params":"123","type":"PRODUCT"}';

test("signature : exemple de la doc CJ (openId 123)", async () => {
  assert.equal(await cjSignature("123", DOC_BODY), "AHxoGFMoS/4mZfJ5vFes5//Pz2QibFQhh3GlrTtnWpk=");
  assert.equal(await verifyCjSignature(DOC_BODY, "AHxoGFMoS/4mZfJ5vFes5//Pz2QibFQhh3GlrTtnWpk=", "123"), true);
});

test("signature : refusée si absente, fausse ou corps modifié", async () => {
  const sign = await cjSignature("123", DOC_BODY);
  assert.equal(await verifyCjSignature(DOC_BODY, null, "123"), false);
  assert.equal(await verifyCjSignature(DOC_BODY, sign, "124"), false);
  assert.equal(await verifyCjSignature(DOC_BODY.replace("123111", "123112"), sign, "123"), false);
  assert.equal(await verifyCjSignature(DOC_BODY, sign.slice(1), "123"), false);
});

test("produit retiré : DELETE ou statut 2 (hors vente)", () => {
  const del = parseCjWebhook({ messageId: "m1", type: "PRODUCT", messageType: "DELETE", params: { pid: "P1" } });
  assert.equal(del?.pid, "P1");
  assert.equal(del?.removed, true);
  const off = parseCjWebhook({ messageId: "m2", type: "PRODUCT", messageType: "UPDATE", params: { pid: "P1", productStatus: 2, fields: ["productStatus"] } });
  assert.equal(off?.removed, true);
  const upd = parseCjWebhook({ messageId: "m3", type: "PRODUCT", messageType: "UPDATE", params: { pid: "P1", productStatus: null, fields: ["productDescription"] } });
  assert.equal(upd?.removed, false);
});

test("variante : hors vente (statut 0 ou DELETE)", () => {
  const v = parseCjWebhook({ messageId: "m4", type: "VARIANT", messageType: "UPDATE", params: { vid: "V1", variantStatus: 0 } });
  assert.deepEqual(v?.vids, ["V1"]);
  assert.equal(v?.removed, true);
  assert.equal(parseCjWebhook({ messageId: "m5", type: "VARIANT", messageType: "UPDATE", params: { vid: "V1", variantStatus: 1 } })?.removed, false);
});

test("stock : seuls les entrepôts de Chine comptent", () => {
  const s = parseCjWebhook({
    messageId: "m6",
    type: "STOCK",
    messageType: "UPDATE",
    params: {
      V1: [{ vid: "V1", countryCode: "CN", storageNum: 0 }, { vid: "V1", countryCode: "US", storageNum: 12 }],
      V2: [{ vid: "V2", countryCode: "US", storageNum: 3 }],
      V3: [{ vid: "V3", countryCode: "cn", storageNum: "7" }, { vid: "V3", countryCode: "CN", storageNum: 2 }],
    },
  });
  assert.deepEqual(s?.vids, ["V1", "V2", "V3"]);
  assert.equal(s?.stockByVid.get("V1"), 0);
  assert.equal(s?.stockByVid.has("V2"), false); // pas d'entrepôt chinois : stock inconnu
  assert.equal(s?.stockByVid.get("V3"), 9);
});

test("messages ignorés : autres types, sans identifiant", () => {
  assert.equal(parseCjWebhook({ messageId: "m7", type: "ORDER", params: { cjOrderId: "1" } }), null);
  assert.equal(parseCjWebhook({ type: "PRODUCT", params: { pid: "P1" } }), null);
  assert.equal(parseCjWebhook({ messageId: "m8", type: "PRODUCT", params: {} }), null);
  assert.equal(parseCjWebhook("nope"), null);
});
