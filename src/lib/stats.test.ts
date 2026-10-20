import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeBp, computeDashboardStats, lastDays, type StatsOrder } from "./stats.ts";

const now = new Date("2026-10-20T15:00:00Z");
const order = (paidAt: string, subtotal: number, items = [{ title: "Tasse", quantity: 1, unitPriceCents: subtotal }]): StatsOrder => ({
  paidAt,
  subtotalCents: subtotal,
  grossMarginCents: Math.round(subtotal / 2),
  commissionCents: Math.round(subtotal * 0.075),
  storePayoutCents: subtotal / 2 - Math.round(subtotal * 0.075),
  refundedCents: 0,
  items,
});

describe("statistiques", () => {
  it("liste des jours, du plus ancien au plus récent", () => {
    assert.deepEqual(lastDays(3, now), ["2026-10-18", "2026-10-19", "2026-10-20"]);
  });

  it("totaux de la période, panier moyen, conversion", () => {
    const orders = [order("2026-10-20T10:00:00Z", 4000), order("2026-10-19T10:00:00Z", 2000), order("2026-10-01T10:00:00Z", 9900)];
    const s = computeDashboardStats(orders, [{ day: "2026-10-20", visitors: 150, pageViews: 400 }, { day: "2026-10-19", visitors: 50, pageViews: 90 }], 7, now);
    assert.equal(s.current.orders, 2);
    assert.equal(s.current.revenueCents, 6000);
    assert.equal(s.current.averageOrderCents, 3000);
    assert.equal(s.current.visitors, 200);
    assert.equal(s.current.pageViews, 490);
    assert.equal(s.current.conversionBp, 100); // 2 / 200 = 1 %
    assert.equal(s.daily.length, 7);
    assert.deepEqual(s.daily.at(-1), { day: "2026-10-20", revenueCents: 4000, orders: 1, visitors: 150 });
  });

  it("période précédente de même durée", () => {
    const s = computeDashboardStats([order("2026-10-10T10:00:00Z", 1000), order("2026-10-20T01:00:00Z", 3000)], [], 7, now);
    assert.equal(s.current.revenueCents, 3000);
    assert.equal(s.previous.revenueCents, 1000);
    assert.equal(s.current.conversionBp, null);
  });

  it("meilleurs produits par chiffre d'affaires", () => {
    const s = computeDashboardStats(
      [order("2026-10-20T10:00:00Z", 5000, [{ title: "Moulin", quantity: 1, unitPriceCents: 4000 }, { title: "Tasse", quantity: 2, unitPriceCents: 500 }]), order("2026-10-19T10:00:00Z", 500)],
      [],
      7,
      now,
    );
    assert.deepEqual(s.topProducts.map((p) => [p.title, p.quantity, p.revenueCents]), [["Moulin", 1, 4000], ["Tasse", 3, 1500]]);
  });

  it("variation en points de base", () => {
    assert.equal(changeBp(1125, 1000), 1250);
    assert.equal(changeBp(500, 1000), -5000);
    assert.equal(changeBp(10, 0), null);
  });
});
