import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adBudgetPlan,
  commissionTierFor,
  parseCommissionTiers,
  parseTierInputs,
  computeOrderFinancials,
  estimateProductEconomics,
  repriceForCost,
  DEFAULT_REFUND_RULES,
  mulDivRound,
  parseRefundRules,
  rateToBasisPoints,
  rateToMicros,
  marginBasisPoints,
  minimumPriceCents,
  splitMargin,
  splitRefund,
  suggestRetailPriceCents,
  usdToCadCents,
} from "./money.ts";

describe("conversions de taux", () => {
  it("convertit les taux en entiers sans erreur de virgule", () => {
    assert.equal(rateToBasisPoints("0.15"), 1500);
    assert.equal(rateToBasisPoints(0.15), 1500);
    assert.equal(rateToBasisPoints("0.075"), 750);
    assert.equal(rateToMicros("1.3725"), 1_372_500);
    assert.equal(rateToMicros("1.38"), 1_380_000);
    assert.equal(rateToMicros("1.3725004"), 1_372_500);
    assert.equal(rateToMicros("1.3725005"), 1_372_501);
  });

  it("refuse un taux invalide", () => {
    assert.throws(() => rateToBasisPoints("abc"));
    assert.throws(() => rateToBasisPoints("-0.1"));
  });

  it("arrondit au cent le plus proche", () => {
    assert.equal(mulDivRound(2500, 1500, 10_000), 375);
    assert.equal(mulDivRound(1, 1, 2), 1); // 0,5 → 1
    assert.equal(mulDivRound(3, 1, 4), 1); // 0,75 → 1
    assert.equal(mulDivRound(1, 1, 4), 0); // 0,25 → 0
  });
});

describe("partage d'une vente", () => {
  it("exemple de la page Tarif : 50 $, coût 18 $, livraison 7 $", () => {
    const f = computeOrderFinancials({
      lines: [{ unitPriceCents: 5000, quantity: 1, unitSupplierCostUsdCents: 1800 }],
      supplierShippingUsdCents: 700,
      fxRateUsdCad: "1",
      commissionRate: "0.15",
    });
    assert.deepEqual(f, {
      subtotalCents: 5000,
      supplierCostCents: 1800,
      supplierShippingCents: 700,
      grossMarginCents: 2500,
      commissionCents: 375,
      storePayoutCents: 2125,
    });
  });

  it("convertit les coûts USD en CAD au taux du jour", () => {
    const f = computeOrderFinancials({
      lines: [
        { unitPriceCents: 3999, quantity: 2, unitSupplierCostUsdCents: 1050 },
        { unitPriceCents: 1500, quantity: 1, unitSupplierCostUsdCents: 333 },
      ],
      supplierShippingUsdCents: 499,
      fxRateUsdCad: "1.3725",
      commissionRate: "0.15",
    });
    assert.equal(f.subtotalCents, 9498);
    assert.equal(f.supplierCostCents, 3339); // (2100 + 333) × 1,3725 = 3339,29
    assert.equal(f.supplierShippingCents, 685); // 499 × 1,3725 = 684,88
    assert.equal(f.grossMarginCents, 5474);
    assert.equal(f.commissionCents, 821); // 821,1
    assert.equal(f.storePayoutCents, 4653);
    assert.equal(f.commissionCents + f.storePayoutCents, f.grossMarginCents);
  });

  it("pas de commission ni de versement négatif si la marge est négative", () => {
    const f = computeOrderFinancials({
      lines: [{ unitPriceCents: 1000, quantity: 1, unitSupplierCostUsdCents: 1500 }],
      supplierShippingUsdCents: 0,
      fxRateUsdCad: "1.38",
      commissionRate: "0.15",
    });
    assert.ok(f.grossMarginCents < 0);
    assert.equal(f.commissionCents, 0);
    assert.equal(f.storePayoutCents, 0);
  });

  it("frais Stripe : déduits de la part du client seulement si configuré ainsi", () => {
    const base = {
      lines: [{ unitPriceCents: 5000, quantity: 1, unitSupplierCostUsdCents: 1800 }],
      supplierShippingUsdCents: 700,
      fxRateUsdCad: "1",
      commissionRate: "0.15",
      stripeFeeCents: 175,
    };
    assert.equal(computeOrderFinancials({ ...base, stripeFeesPaidBy: "platform" }).storePayoutCents, 2125);
    assert.equal(computeOrderFinancials({ ...base, stripeFeesPaidBy: "store" }).storePayoutCents, 1950);
  });

  it("refuse les quantités et prix invalides", () => {
    const ok = { supplierShippingUsdCents: 0, fxRateUsdCad: "1", commissionRate: "0.15" };
    assert.throws(() => computeOrderFinancials({ ...ok, lines: [{ unitPriceCents: 100, quantity: 0, unitSupplierCostUsdCents: 0 }] }));
    assert.throws(() => computeOrderFinancials({ ...ok, lines: [{ unitPriceCents: 10.5, quantity: 1, unitSupplierCostUsdCents: 0 }] }));
  });
});

describe("partage d'une marge connue", () => {
  it("donne le même résultat que le calcul complet", () => {
    assert.deepEqual(splitMargin({ grossMarginCents: 2500, commissionRate: "0.15" }), { commissionCents: 375, storePayoutCents: 2125 });
    assert.deepEqual(splitMargin({ grossMarginCents: -100, commissionRate: "0.15" }), { commissionCents: 0, storePayoutCents: 0 });
    assert.deepEqual(splitMargin({ grossMarginCents: 2500, commissionRate: "0.15", stripeFeeCents: 175, stripeFeesPaidBy: "store" }), { commissionCents: 375, storePayoutCents: 1950 });
  });
});

describe("remboursements et rétrofacturations", () => {
  // Commande : 50 $ + 7,49 $ de taxes = 57,49 $ ; commission 3,75 $.
  const order = { totalCents: 5749, taxCents: 749, commissionCents: 375 };

  it("remboursement total, règles par défaut : commission rendue, le client paie le reste", () => {
    const s = splitRefund({ type: "refund", amountCents: 5749, order, rules: DEFAULT_REFUND_RULES });
    assert.deepEqual(s, { taxCents: 749, commissionRefundCents: 375, storeDebitCents: 4625, platformDebitCents: 1124, disputeFeeCents: 0 });
    assert.equal(s.storeDebitCents + s.platformDebitCents, 5749);
  });

  it("remboursement partiel : tout est calculé au prorata", () => {
    const s = splitRefund({ type: "refund", amountCents: 2000, order, rules: DEFAULT_REFUND_RULES });
    assert.equal(s.taxCents, 261); // 749 × 2000 / 5749
    assert.equal(s.commissionRefundCents, 130); // 375 × 2000 / 5749
    assert.equal(s.storeDebitCents + s.platformDebitCents, 2000);
  });

  it("rétrofacturation, règles par défaut : commission gardée, le client paie aussi les frais de litige", () => {
    const s = splitRefund({ type: "chargeback", amountCents: 5749, order, rules: DEFAULT_REFUND_RULES, disputeFeeCents: 1500 });
    assert.equal(s.commissionRefundCents, 0);
    assert.equal(s.storeDebitCents, 5000 + 1500);
    assert.equal(s.platformDebitCents, 749);
    assert.equal(s.storeDebitCents + s.platformDebitCents, 5749 + 1500);
  });

  it("règle configurée : partage 50/50 et frais de litige à la plateforme", () => {
    const rules = parseRefundRules({
      refund: { store_share_percent: 100, commission_refunded: true },
      chargeback: { store_share_percent: 50, commission_refunded: false, dispute_fee_paid_by: "platform" },
    });
    const s = splitRefund({ type: "chargeback", amountCents: 5749, order, rules, disputeFeeCents: 1500 });
    assert.equal(s.storeDebitCents, 2500);
    assert.equal(s.platformDebitCents, 749 + 2500 + 1500);
  });

  it("un remboursement ne dépasse jamais le total de la commande", () => {
    const s = splitRefund({ type: "refund", amountCents: 99999, order, rules: DEFAULT_REFUND_RULES });
    assert.equal(s.storeDebitCents + s.platformDebitCents, 5749);
  });

  it("règles en base invalides → valeurs par défaut", () => {
    assert.deepEqual(parseRefundRules({ refund: { store_share_percent: 250 } }), DEFAULT_REFUND_RULES);
    assert.deepEqual(parseRefundRules(null), DEFAULT_REFUND_RULES);
  });
});

describe("prix des produits (marge minimale)", () => {
  it("prix minimal pour 40 % de marge", () => {
    assert.equal(minimumPriceCents(1200, "0.40"), 2000); // 12 $ de coût → 20 $
    assert.equal(minimumPriceCents(1000, "0.40"), 1667); // 16,666… → arrondi au cent supérieur
    assert.ok(marginBasisPoints(minimumPriceCents(1000, "0.40"), 1000) >= 4000);
  });

  it("prix suggéré arrondi à x,99 $ sans jamais passer sous la marge minimale", () => {
    assert.equal(suggestRetailPriceCents(1200, "0.40"), 2099);
    assert.equal(suggestRetailPriceCents(1000, "0.40"), 1699);
    assert.equal(suggestRetailPriceCents(1194, "0.40"), 1999); // minimum 19,90 $ → 19,99 $
    assert.equal(suggestRetailPriceCents(0, "0.40"), 99);
    for (const cost of [1, 99, 517, 2345, 9999, 45678]) {
      const price = suggestRetailPriceCents(cost, "0.40");
      assert.equal(price % 100, 99);
      assert.ok(marginBasisPoints(price, cost) >= 4000, `coût ${cost} → prix ${price}`);
    }
  });

  it("conversion USD → CAD", () => {
    assert.equal(usdToCadCents(1000, "1.38"), 1380);
    assert.equal(usdToCadCents(333, "1.3725"), 457);
  });
});

describe("estimation pour un produit tendance", () => {
  it("prix conseillé, commission de 15 % et gain du vendeur", () => {
    // 10,00 $ US + 4,10 $ US de livraison au taux 1,38 → 19,46 $ CA de coût total.
    const e = estimateProductEconomics({ supplierCostUsdCents: 1000, shippingUsdCents: 410, fxRateUsdCad: "1.38", minMarginRate: "0.40", commissionRate: "0.15" });
    assert.equal(e.costCadCents, 1946);
    assert.equal(e.supplierCadCents, 1380);
    assert.equal(e.shippingCadCents, 566);
    assert.equal(e.priceCents, 3299); // ≥ 1946 / 0,6 = 32,44 $ → 32,99 $
    assert.equal(e.grossMarginCents, 1353);
    assert.equal(e.commissionCents, 203);
    assert.equal(e.ownerProfitCents, 1150);
    assert.equal(e.commissionCents + e.ownerProfitCents, e.grossMarginCents);
    assert.ok(e.marginBp >= 4000);
  });

  it("prix imposé sous le coût : aucune commission, gain nul", () => {
    const e = estimateProductEconomics({ supplierCostUsdCents: 1000, shippingUsdCents: 0, fxRateUsdCad: "1.38", minMarginRate: "0.40", commissionRate: "0.15", priceCents: 1000 });
    assert.equal(e.grossMarginCents, -380);
    assert.equal(e.commissionCents, 0);
    assert.equal(e.ownerProfitCents, 0);
  });
});

describe("synchro du prix d'une variante", () => {
  const base = { shippingUsdCents: 410, fxRateUsdCad: "1.38", minMarginRate: "0.40" };
  it("garde le prix si la marge reste suffisante", () => {
    const r = repriceForCost({ ...base, currentPriceCents: 3299, supplierCostUsdCents: 1000 });
    assert.deepEqual(r, { suggestedCents: 3299, priceCents: 3299, raised: false });
  });
  it("relève le prix si le coût augmente", () => {
    const r = repriceForCost({ ...base, currentPriceCents: 3299, supplierCostUsdCents: 1500 });
    assert.equal(r.raised, true);
    assert.equal(r.priceCents, r.suggestedCents);
    assert.ok(r.priceCents > 3299);
  });
});

describe("adBudgetPlan (repères de budget publicitaire)", () => {
  it("gain moyen, seuil, objectif à 60 %, budget = 2 × objectif arrondi aux 5 $", () => {
    const plan = adBudgetPlan([1500, 2500]); // gain moyen 20 $
    assert.deepEqual(plan, {
      avgProfitCents: 2000,
      breakEvenCpaCents: 2000,
      targetCpaCents: 1200,
      dailyBudgetCents: 2500, // 2 × 12 $ = 24 $ → 25 $
      testDays: 5,
      testBudgetCents: 12500,
    });
  });
  it("jamais moins de 20 $ par jour", () => {
    assert.equal(adBudgetPlan([600])?.dailyBudgetCents, 2000);
  });
  it("ignore les produits sans gain ; null s'il n'en reste aucun", () => {
    assert.equal(adBudgetPlan([0, -100, 1000])?.avgProfitCents, 1000);
    assert.equal(adBudgetPlan([]), null);
    assert.equal(adBudgetPlan([0, -5]), null);
  });
  it("entiers seulement (moyenne arrondie vers le bas)", () => {
    assert.equal(adBudgetPlan([1000, 1001])?.avgProfitCents, 1000);
  });
});

describe("commission dégressive", () => {
  const generous = [
    { from_margin_cents: 0, rate: "0.15" },
    { from_margin_cents: 100000, rate: "0.12" },
    { from_margin_cents: 500000, rate: "0.10" },
    { from_margin_cents: 2000000, rate: "0.08" },
  ];
  it("lit les paliers (triés)", () => {
    const tiers = parseCommissionTiers([...generous].reverse(), "0.15");
    assert.deepEqual(tiers.map((t) => [t.fromMarginCents, t.rate]), [[0, "0.15"], [100000, "0.12"], [500000, "0.10"], [2000000, "0.08"]]);
  });
  it("valeur invalide : commission fixe au taux de base", () => {
    for (const bad of [null, [], [{ from_margin_cents: 100, rate: "0.1" }], [{ from_margin_cents: 0, rate: "abc" }], [{ from_margin_cents: 0, rate: "0.2" }, { from_margin_cents: 0, rate: "0.1" }], [{ from_margin_cents: -1, rate: "0.1" }], [{ from_margin_cents: 0, rate: "1.5" }]]) {
      assert.deepEqual(parseCommissionTiers(bad, "0.15"), [{ fromMarginCents: 0, rate: "0.15" }], JSON.stringify(bad));
    }
  });
  it("palier atteint et suivant, bornes comprises", () => {
    const tiers = parseCommissionTiers(generous, "0.15");
    assert.equal(commissionTierFor(tiers, 0).tier.rate, "0.15");
    assert.equal(commissionTierFor(tiers, 99999).tier.rate, "0.15");
    assert.equal(commissionTierFor(tiers, 99999).next?.fromMarginCents, 100000);
    assert.equal(commissionTierFor(tiers, 100000).tier.rate, "0.12");
    assert.equal(commissionTierFor(tiers, 500000).tier.rate, "0.10");
    const top = commissionTierFor(tiers, 9_000_000);
    assert.equal(top.tier.rate, "0.08");
    assert.equal(top.next, null);
    assert.equal(top.index, 3);
  });
  it("le taux du palier sert au partage de la marge", () => {
    const { tier } = commissionTierFor(parseCommissionTiers(generous, "0.15"), 600000);
    assert.deepEqual(splitMargin({ grossMarginCents: 10000, commissionRate: tier.rate }), { commissionCents: 1000, storePayoutCents: 9000 });
  });
});

describe("parseTierInputs (paliers saisis par l'admin)", () => {
  it("dollars et pourcentages → cents et taux", () => {
    assert.deepEqual(parseTierInputs([{ from: "0", rate: "15" }, { from: "1 000", rate: "12,5" }, { from: "", rate: "" }, { from: "20000$", rate: "8 %" }]), {
      tiers: [{ fromMarginCents: 0, rate: "0.15" }, { fromMarginCents: 100000, rate: "0.125" }, { fromMarginCents: 2000000, rate: "0.08" }],
    });
  });
  it("les paliers relus donnent les mêmes valeurs", () => {
    const r = parseTierInputs([{ from: "0", rate: "15" }, { from: "5000", rate: "10" }]);
    assert.ok("tiers" in r);
    assert.deepEqual(parseCommissionTiers(r.tiers.map((t) => ({ from_margin_cents: t.fromMarginCents, rate: t.rate })), "0.15"), r.tiers);
  });
  it("erreurs", () => {
    assert.deepEqual(parseTierInputs([{ from: "100", rate: "15" }]), { error: "first" });
    assert.deepEqual(parseTierInputs([{ from: "0", rate: "15" }, { from: "0", rate: "12" }]), { error: "duplicate" });
    assert.deepEqual(parseTierInputs([{ from: "0", rate: "10" }, { from: "1000", rate: "12" }]), { error: "increasing" });
    assert.deepEqual(parseTierInputs([{ from: "abc", rate: "15" }]), { error: "invalid" });
    assert.deepEqual(parseTierInputs([{ from: "0", rate: "150" }]), { error: "invalid" });
    assert.deepEqual(parseTierInputs([]), { error: "invalid" });
  });
});
