/**
 * Calculs du tableau de bord admin (fonctions pures, entiers uniquement, testées dans admin-stats.test.ts).
 */

export interface AiCall {
  kind: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type AiPricing = Record<string, { inputCentsPerMTok: number; outputCentsPerMTok: number }>;

/** Coût estimé, en cents US (arrondi), d'un ensemble d'appels selon les tarifs par million de jetons. */
export function aiCostCents(calls: AiCall[], pricing: AiPricing): number {
  // Somme exacte en « cents × jetons », divisée une seule fois à la fin.
  let total = 0;
  for (const c of calls) {
    const p = pricing[c.model];
    if (!p) continue;
    total += c.inputTokens * p.inputCentsPerMTok + c.outputTokens * p.outputCentsPerMTok;
  }
  return Math.round(total / 1_000_000);
}

/** Appels, jetons et coût par type d'appel (création, régénération, sélection, rédaction, marketing). */
export function aiCostByKind(calls: AiCall[], pricing: AiPricing): { kind: string; calls: number; tokens: number; costCents: number }[] {
  const kinds = [...new Set(calls.map((c) => c.kind))];
  return kinds
    .map((kind) => {
      const list = calls.filter((c) => c.kind === kind);
      return { kind, calls: list.length, tokens: list.reduce((n, c) => n + c.inputTokens + c.outputTokens, 0), costCents: aiCostCents(list, pricing) };
    })
    .sort((a, b) => b.costCents - a.costCents);
}

export interface PlatformOrder {
  storeId: string;
  subtotalCents: number;
  totalCents: number;
  commissionCents: number;
  stripeFeeCents: number;
  refundedCents: number;
  disputed: boolean;
}

/** Revenus de la plateforme : commissions − part des remboursements/litiges payée par la plateforme − frais Stripe à sa charge. */
export function platformRevenue(orders: PlatformOrder[], platformRefundDebitCents: number, stripeFeesPaidBy: "platform" | "store") {
  const gmvCents = orders.reduce((n, o) => n + o.subtotalCents, 0);
  const commissionCents = orders.reduce((n, o) => n + o.commissionCents, 0);
  const stripeFeesCents = stripeFeesPaidBy === "platform" ? orders.reduce((n, o) => n + o.stripeFeeCents, 0) : 0;
  return {
    gmvCents,
    orders: orders.length,
    commissionCents,
    refundCostCents: platformRefundDebitCents,
    stripeFeesCents,
    netCents: commissionCents - platformRefundDebitCents - stripeFeesCents,
  };
}

export type FlagReason =
  | { type: "blocked_products"; count: number }
  | { type: "text_flag"; detail: string }
  | { type: "refund_rate"; bp: number }
  | { type: "disputes"; count: number }
  | { type: "cj_failures"; count: number }
  | { type: "suspended" };

/** Seuils : taux de remboursement ≥ 10 % sur au moins 3 commandes, au moins un litige, une commande CJ en échec. */
export const REFUND_RATE_ALERT_BP = 1000;

export function flagReasons(input: {
  orders: PlatformOrder[];
  blockedProducts: number;
  textFlag: string | null;
  cjFailures: number;
  suspended: boolean;
}): FlagReason[] {
  const reasons: FlagReason[] = [];
  if (input.suspended) reasons.push({ type: "suspended" });
  if (input.blockedProducts > 0) reasons.push({ type: "blocked_products", count: input.blockedProducts });
  if (input.textFlag) reasons.push({ type: "text_flag", detail: input.textFlag });
  const total = input.orders.reduce((n, o) => n + o.totalCents, 0);
  const refunded = input.orders.reduce((n, o) => n + o.refundedCents, 0);
  if (input.orders.length >= 3 && total > 0) {
    const bp = Math.round((refunded * 10_000) / total);
    if (bp >= REFUND_RATE_ALERT_BP) reasons.push({ type: "refund_rate", bp });
  }
  const disputes = input.orders.filter((o) => o.disputed).length;
  if (disputes > 0) reasons.push({ type: "disputes", count: disputes });
  if (input.cjFailures > 0) reasons.push({ type: "cj_failures", count: input.cjFailures });
  return reasons;
}

export interface PlatformRefund {
  platformDebitCents: number;
  amountCents: number;
  orderTaxCents: number;
  orderTotalCents: number;
}

/**
 * Coût réel des remboursements/litiges pour la plateforme : sa part (platform_debit) MOINS les taxes
 * remboursées, qui ne sont pas un revenu (perçues pour être reversées) — même calcul que splitRefund.
 */
export function refundPlatformCostCents(refunds: PlatformRefund[]): number {
  return refunds.reduce((n, r) => {
    const amount = Math.min(r.amountCents, r.orderTotalCents);
    const tax = r.orderTotalCents > 0 ? Math.min(Math.round((r.orderTaxCents * amount) / r.orderTotalCents), amount) : 0;
    return n + Math.max(r.platformDebitCents - tax, 0);
  }, 0);
}
