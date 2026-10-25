import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demandLevel, demandScore, demandSignal, pickAutoTheme, validateSelection } from "./score.ts";

describe("demande des produits", () => {
  it("signal : boutiques + ventes pondérées", () => {
    assert.equal(demandSignal(100, 0), 100);
    assert.equal(demandSignal(100, 2), 140);
    assert.equal(demandSignal(-5, -1), 0);
  });

  it("score logarithmique de 0 à 100", () => {
    assert.equal(demandScore(5000, 5000), 100);
    assert.equal(demandScore(0, 5000), 0);
    assert.equal(demandScore(10, 0), 0);
    const mid = demandScore(500, 5000);
    assert.ok(mid > 30 && mid < 50, String(mid));
    // Entre 1 700 et 8 100 boutiques : de « forte » à « très forte », pas tous au maximum.
    assert.equal(demandLevel(demandScore(1720, 8120)), "high");
    assert.equal(demandLevel(demandScore(5000, 8120)), "very_high");
    assert.ok(demandScore(40, 6000) < 10);
    assert.ok(demandScore(50, 5000) < mid);
    assert.equal(demandScore(9000, 5000), 100);
  });

  it("niveaux", () => {
    assert.equal(demandLevel(95), "very_high");
    assert.equal(demandLevel(60), "high");
    assert.equal(demandLevel(40), "medium");
    assert.equal(demandLevel(10), "low");
  });
});

describe("thème choisi automatiquement", () => {
  const products = [
    ...[90, 85, 80].map((s) => ({ theme: "pets", demandScore: s })),
    ...[70, 65, 60].map((s) => ({ theme: "home", demandScore: s })),
    ...[50, 45, 40].map((s) => ({ theme: "tech", demandScore: s })),
    ...[99, 99].map((s) => ({ theme: "rare", demandScore: s })), // trop peu de produits
    ...[10, 10, 10].map((s) => ({ theme: "low", demandScore: s })),
  ];
  it("parmi les 3 thèmes les plus demandés", () => {
    assert.equal(pickAutoTheme(products, () => 0), "pets");
    assert.equal(pickAutoTheme(products, () => 0.5), "home");
    assert.equal(pickAutoTheme(products, () => 0.999), "tech");
    assert.equal(pickAutoTheme([], () => 0), null);
  });
});

describe("sélection du client", () => {
  const catalogue = ["a", "b", "c", "d"].map((id) => ({ id, theme: "pets" })).concat([{ id: "x", theme: "home" }]);
  it("accepte 3 produits d'un même thème (doublons ignorés)", () => {
    const r = validateSelection(["a", "b", "c", "c"], catalogue);
    assert.ok(r.ok && r.theme === "pets" && r.products.length === 3);
  });
  it("refuse les sélections invalides", () => {
    assert.deepEqual(validateSelection(["a", "b"], catalogue), { ok: false, error: "too_few" });
    assert.deepEqual(validateSelection(["a", "b", "zzz"], catalogue), { ok: false, error: "unknown_product" });
    assert.deepEqual(validateSelection(["a", "b", "x"], catalogue), { ok: false, error: "mixed_themes" });
    const many = Array.from({ length: 21 }, (_, i) => `p${i}`);
    assert.deepEqual(validateSelection(many, many.map((id) => ({ id, theme: "t" }))), { ok: false, error: "too_many" });
  });
});
