/**
 * Statistiques du tableau de bord (fonctions pures, entiers uniquement, testées dans stats.test.ts).
 * Les jours sont des dates UTC « AAAA-MM-JJ », comme dans store_daily_stats.
 */

export interface StatsOrder {
  paidAt: string;
  subtotalCents: number;
  grossMarginCents: number;
  commissionCents: number;
  storePayoutCents: number;
  refundedCents: number;
  items: { title: string; quantity: number; unitPriceCents: number }[];
}

export interface StatsDay {
  day: string;
  visitors: number;
  pageViews: number;
}

export interface PeriodTotals {
  revenueCents: number;
  orders: number;
  averageOrderCents: number;
  grossMarginCents: number;
  commissionCents: number;
  earningsCents: number;
  refundsCents: number;
  visitors: number;
  pageViews: number;
  /** Commandes ÷ visiteurs, en points de base (1 % = 100). null sans visiteur. */
  conversionBp: number | null;
}

export interface DashboardStats {
  current: PeriodTotals;
  previous: PeriodTotals;
  daily: { day: string; revenueCents: number; orders: number; visitors: number }[];
  topProducts: { title: string; quantity: number; revenueCents: number }[];
}

const DAY_MS = 86_400_000;
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Les `days` derniers jours (aujourd'hui compris), du plus ancien au plus récent. */
export function lastDays(days: number, now: Date): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => dayKey(new Date(end - (days - 1 - i) * DAY_MS)));
}

function totals(orders: StatsOrder[], days: StatsDay[]): PeriodTotals {
  const sum = (f: (o: StatsOrder) => number) => orders.reduce((n, o) => n + f(o), 0);
  const revenueCents = sum((o) => o.subtotalCents);
  const visitors = days.reduce((n, d) => n + d.visitors, 0);
  return {
    revenueCents,
    orders: orders.length,
    averageOrderCents: orders.length ? Math.round(revenueCents / orders.length) : 0,
    grossMarginCents: sum((o) => o.grossMarginCents),
    commissionCents: sum((o) => o.commissionCents),
    earningsCents: sum((o) => o.storePayoutCents),
    refundsCents: sum((o) => o.refundedCents),
    visitors,
    pageViews: days.reduce((n, d) => n + d.pageViews, 0),
    conversionBp: visitors > 0 ? Math.round((orders.length * 10_000) / visitors) : null,
  };
}

/** Période en cours (`days` derniers jours) et période précédente de même durée, pour comparer. */
export function computeDashboardStats(orders: StatsOrder[], visits: StatsDay[], days: number, now: Date): DashboardStats {
  const current = lastDays(days, now);
  const previous = lastDays(days * 2, now).slice(0, days);
  const inRange = (range: string[]) => {
    const set = new Set(range);
    return {
      orders: orders.filter((o) => set.has(o.paidAt.slice(0, 10))),
      visits: visits.filter((v) => set.has(v.day)),
    };
  };
  const cur = inRange(current);
  const prev = inRange(previous);

  const daily = current.map((day) => {
    const dayOrders = cur.orders.filter((o) => o.paidAt.slice(0, 10) === day);
    return {
      day,
      revenueCents: dayOrders.reduce((n, o) => n + o.subtotalCents, 0),
      orders: dayOrders.length,
      visitors: cur.visits.filter((v) => v.day === day).reduce((n, v) => n + v.visitors, 0),
    };
  });

  const products = new Map<string, { title: string; quantity: number; revenueCents: number }>();
  for (const o of cur.orders) {
    for (const i of o.items) {
      const p = products.get(i.title) ?? { title: i.title, quantity: 0, revenueCents: 0 };
      p.quantity += i.quantity;
      p.revenueCents += i.quantity * i.unitPriceCents;
      products.set(i.title, p);
    }
  }
  const topProducts = [...products.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.quantity - a.quantity).slice(0, 5);

  return { current: totals(cur.orders, cur.visits), previous: totals(prev.orders, prev.visits), daily, topProducts };
}

/** Variation en points de base (+12,5 % = 1250). null si la période précédente est nulle. */
export function changeBp(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 10_000) / previous);
}
