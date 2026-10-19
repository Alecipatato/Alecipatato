import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeOrderFinancials,
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
