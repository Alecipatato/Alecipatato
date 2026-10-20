import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findViolation, type ModerationRule } from "./match.ts";

const rules: ModerationRule[] = [
  { kind: "brand", term: "nike" },
  { kind: "brand", term: "louis vuitton" },
  { kind: "counterfeit", term: "1:1" },
  { kind: "prohibited", term: "e-cigarette" },
  { kind: "prohibited", term: "thc" },
  { kind: "counterfeit", term: "réplique" },
  { kind: "category", term: "adult" },
];

describe("modération", () => {
  it("bloque une marque, sans tenir compte de la casse", () => {
    assert.deepEqual(findViolation(rules, ["NIKE Air running shoes"]), { kind: "brand", term: "nike" });
  });

  it("mots entiers seulement", () => {
    assert.equal(findViolation(rules, ["Nikeland-style bag"]), null);
    assert.equal(findViolation(rules, ["Methcathinone free"]), null); // « thc » au milieu d'un mot
    assert.equal(findViolation(rules, ["Anthc"]), null);
  });

  it("expressions : espaces et tirets interchangeables", () => {
    assert.equal(findViolation(rules, ["Sac Louis-Vuitton"])?.term, "louis vuitton");
    assert.equal(findViolation(rules, ["Disposable e cigarette"])?.term, "e-cigarette");
  });

  it("accents ignorés", () => {
    assert.equal(findViolation(rules, ["Replique de montre"])?.term, "réplique");
    assert.equal(findViolation(rules, ["Une réplique parfaite"])?.term, "réplique");
  });

  it("ponctuation dans le terme", () => {
    assert.equal(findViolation(rules, ["Montre qualité 1:1"])?.kind, "counterfeit");
  });

  it("les catégories ne visent que le nom de catégorie", () => {
    assert.equal(findViolation(rules, ["Adult size yoga mat"], ["Sports"]), null);
    assert.equal(findViolation(rules, ["Massager"], ["Adult Products"])?.kind, "category");
  });

  it("textes vides ou absents", () => {
    assert.equal(findViolation(rules, [null, undefined, ""]), null);
    assert.equal(findViolation([], ["nike"]), null);
  });
});
