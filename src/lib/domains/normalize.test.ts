import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApexDomain, normalizeCustomHostname, normalizeDomain, parseDnsRecords } from "./normalize.ts";

describe("saisie du domaine", () => {
  it("nettoie l'adresse", () => {
    assert.equal(normalizeDomain("https://www.Boutique.com/page?x=1", "kreo.app"), "www.boutique.com");
    assert.equal(normalizeDomain("  shop.ma-boutique.qc.ca.  ", "kreo.app"), "shop.ma-boutique.qc.ca");
    assert.equal(normalizeDomain("www.boutique.com:443", "kreo.app"), "www.boutique.com");
  });
  it("refuse ce qui n'est pas un domaine utilisable", () => {
    for (const bad of ["boutique", "192.168.0.1", "demo.localhost", "-a.com", "a_b.com", "boutique.c", "kreo.app", "x.kreo.app", "café.com", ""]) {
      assert.equal(normalizeDomain(bad, "kreo.app"), null, bad);
    }
  });
  it("domaine nu ou sous-domaine", () => {
    assert.equal(isApexDomain("boutique.com"), true);
    assert.equal(isApexDomain("boutique.qc.ca"), true);
    assert.equal(isApexDomain("www.boutique.com"), false);
    assert.equal(isApexDomain("shop.boutique.qc.ca"), false);
  });
});

describe("réponses Cloudflare", () => {
  const pending = {
    id: "ch_1",
    hostname: "www.boutique.com",
    status: "pending",
    ownership_verification: { type: "txt", name: "_cf-custom-hostname.www.boutique.com", value: "abc-123" },
    ssl: { status: "pending_validation", validation_records: [{ txt_name: "_acme-challenge.www.boutique.com", txt_value: "xyz" }] },
  };
  it("en attente : CNAME + TXT de propriété + TXT du certificat", () => {
    const h = normalizeCustomHostname(pending, "stores.kreo.app")!;
    assert.equal(h.state, "pending");
    assert.deepEqual(h.records.map((r) => [r.type, r.purpose]), [["CNAME", "traffic"], ["TXT", "ownership"], ["TXT", "ssl"]]);
    assert.equal(h.records[0].value, "stores.kreo.app");
  });
  it("actif seulement si le domaine ET le certificat sont actifs", () => {
    assert.equal(normalizeCustomHostname({ ...pending, status: "active", ssl: { status: "pending_validation" } }, "t")!.state, "pending");
    const active = normalizeCustomHostname({ ...pending, status: "active", ssl: { status: "active" } }, "t")!;
    assert.equal(active.state, "active");
    assert.deepEqual(active.records.map((r) => r.type), ["CNAME"]);
  });
  it("échec et erreurs", () => {
    const h = normalizeCustomHostname({ ...pending, status: "blocked", verification_errors: ["custom hostname does not CNAME to this zone"] }, "t")!;
    assert.equal(h.state, "failed");
    assert.deepEqual(h.errors, ["custom hostname does not CNAME to this zone"]);
    assert.equal(normalizeCustomHostname({}, "t"), null);
  });
  it("relecture des enregistrements stockés", () => {
    assert.deepEqual(parseDnsRecords([{ type: "TXT", name: "a", value: "b", purpose: "ssl" }, { type: "MX", name: "x", value: "y" }, null]), [{ type: "TXT", name: "a", value: "b", purpose: "ssl" }]);
  });
});
