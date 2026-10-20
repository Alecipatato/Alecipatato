import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiCostByKind, aiCostCents, flagReasons, platformRevenue, refundPlatformCostCents, type PlatformOrder } from "./admin-stats.ts";

const pricing = { "claude-opus-5-5": { inputCentsPerMTok: 400, outputCentsPerMTok: 2000 } };
const order = (o: Partial<PlatformOrder> = {}): PlatformOrder => ({ storeId: "s", subtotalCents: 10000, totalCents: 11498, commissionCents: 600, stripeFeeCents: 363, refundedCents: 0, disputed: false, ...o });

describe("coûts IA", () => {
  it("cents US selon les tarifs par million de jetons", () => {
    // 1 M jetons en entrée (4 $) + 0,5 M en sortie (10 $) = 14 $
    assert.equal(aiCostCents([{ kind: "create_store", model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 500_000 }], pricing), 1400);
    // Petits appels : la somme est exacte avant l'arrondi (2 × 0,6 ¢ = 1,2 ¢ → 1 ¢)
    const small = { kind: "marketing", model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 100 };
    assert.equal(aiCostCents([small, small], pricing), 1);
    assert.equal(aiCostCents([{ ...small, model: "inconnu" }], pricing), 0);
  });
  it("par type d'appel, du plus coûteux au moins coûteux", () => {
    const rows = aiCostByKind(
      [
        { kind: "create_store", model: "claude-opus-5-5", inputTokens: 800, outputTokens: 2000 },
        { kind: "marketing", model: "claude-opus-5-5", inputTokens: 900_000, outputTokens: 100_000 },
      ],
      pricing,
    );
    assert.deepEqual(rows.map((r) => [r.kind, r.calls, r.costCents]), [["marketing", 1, 560], ["create_store", 1, 4]]);
  });
});

describe("revenus de la plateforme", () => {
  it("commissions − remboursements à sa charge − frais Stripe", () => {
    const r = platformRevenue([order(), order({ commissionCents: 400, stripeFeeCents: 200 })], 150, "platform");
    assert.deepEqual(r, { gmvCents: 20000, orders: 2, commissionCents: 1000, refundCostCents: 150, stripeFeesCents: 563, netCents: 287 });
    assert.equal(platformRevenue([order()], 0, "store").netCents, 600);
  });
});

describe("boutiques signalées", () => {
  it("aucun motif", () => {
    assert.deepEqual(flagReasons({ orders: [order()], blockedProducts: 0, textFlag: null, cjFailures: 0, suspended: false }), []);
  });
  it("taux de remboursement à partir de 3 commandes", () => {
    const orders = [order({ refundedCents: 11498 }), order(), order()];
    assert.deepEqual(flagReasons({ orders, blockedProducts: 0, textFlag: null, cjFailures: 0, suspended: false }), [{ type: "refund_rate", bp: 3333 }]);
    assert.deepEqual(flagReasons({ orders: orders.slice(0, 2), blockedProducts: 0, textFlag: null, cjFailures: 0, suspended: false }), []);
  });
  it("produits bloqués, texte, litiges, échecs CJ, suspension", () => {
    const reasons = flagReasons({ orders: [order({ disputed: true })], blockedProducts: 2, textFlag: "brand:nike", cjFailures: 1, suspended: true });
    assert.deepEqual(reasons.map((r) => r.type), ["suspended", "blocked_products", "text_flag", "disputes", "cj_failures"]);
  });
});

describe("coût des remboursements pour la plateforme", () => {
  it("exclut les taxes remboursées (elles ne sont pas un revenu)", () => {
    // Remboursement total d'une commande de 114,98 $ (14,98 $ de taxes) : la plateforme rend les taxes + sa commission de 6 $.
    assert.equal(refundPlatformCostCents([{ platformDebitCents: 2098, amountCents: 11498, orderTaxCents: 1498, orderTotalCents: 11498 }]), 600);
    // Remboursement partiel de la moitié : taxes au prorata.
    assert.equal(refundPlatformCostCents([{ platformDebitCents: 1049, amountCents: 5749, orderTaxCents: 1498, orderTotalCents: 11498 }]), 300);
    assert.equal(refundPlatformCostCents([]), 0);
  });
});
