import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLocale, fmt, localeForRegion, localeFromAcceptLanguage, plural } from "./config.ts";

describe("détection de la langue", () => {
  it("anglais par défaut", () => {
    assert.equal(detectLocale({}), "en");
  });

  it("le choix du visiteur passe avant tout", () => {
    assert.equal(detectLocale({ cookie: "fr", country: "US", acceptLanguage: "en-US" }), "fr");
    assert.equal(detectLocale({ cookie: "en", country: "CA", region: "QC" }), "en");
    assert.equal(detectLocale({ cookie: "de", country: "CA", region: "QC" }), "fr"); // cookie invalide ignoré
  });

  it("selon la région : Québec et pays francophones en français, le reste en anglais", () => {
    assert.equal(localeForRegion("CA", "QC"), "fr");
    assert.equal(localeForRegion("CA", "ON"), "en");
    assert.equal(localeForRegion("CA"), "en");
    assert.equal(localeForRegion("FR"), "fr");
    assert.equal(localeForRegion("be"), "fr");
    assert.equal(localeForRegion("US"), "en");
    assert.equal(localeForRegion("XX"), null);
    assert.equal(localeForRegion(null), null);
    assert.equal(detectLocale({ country: "CA", region: "QC", acceptLanguage: "en-US" }), "fr");
  });

  it("sans région connue : langue du navigateur", () => {
    assert.equal(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8"), "fr");
    assert.equal(localeFromAcceptLanguage("de-DE,de;q=0.9,fr;q=0.5"), "fr");
    assert.equal(localeFromAcceptLanguage("es-ES,es;q=0.9"), null);
    assert.equal(localeFromAcceptLanguage("en;q=0.5,fr;q=0.9"), "fr");
    assert.equal(detectLocale({ acceptLanguage: "fr-FR" }), "fr");
    assert.equal(detectLocale({ acceptLanguage: "es-ES" }), "en");
  });
});

describe("textes", () => {
  it("insère les valeurs", () => {
    assert.equal(fmt("{count} produits sur {max}", { count: 3, max: 18 }), "3 produits sur 18");
    assert.equal(fmt("Bonjour {name}", {}), "Bonjour {name}");
  });

  it("singulier / pluriel", () => {
    assert.equal(plural(1, "{n} product", "{n} products"), "1 product");
    assert.equal(plural(0, "{n} produit", "{n} produits"), "0 produit");
    assert.equal(plural(4, "{n} product", "{n} products"), "4 products");
  });
});
