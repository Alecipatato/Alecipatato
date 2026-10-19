/**
 * Calculs d'argent de la plateforme. Fonctions pures, sans dépendance, testées
 * dans money.test.ts.
 *
 * Règles :
 *  - Tous les montants sont des ENTIERS en cents. Jamais de nombre à virgule.
 *  - Les taux (commission, change) sont convertis en entiers (points de base,
 *    millionièmes) avant tout calcul.
 *  - Arrondi au cent le plus proche (0,5 arrondi vers le haut).
 */

/** a × num / den arrondi au plus proche, en entiers (a, num, den ≥ 0). */
export function mulDivRound(a: number, num: number, den: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0) {
    throw new Error("mulDivRound : entiers attendus");
  }
  const sign = a < 0 !== num < 0 ? -1 : 1;
  const product = BigInt(Math.abs(a)) * BigInt(Math.abs(num));
  const d = BigInt(den);
  const two = BigInt(2);
  const rounded = (product * two + d) / (two * d); // arrondi « demi vers le haut »
  return sign * Number(rounded);
}

/** "0.15" → 1500 points de base (1 % = 100). Accepte nombre ou chaîne. */
export function rateToBasisPoints(rate: number | string): number {
  return decimalToScaledInt(rate, 4);
}

/** "1.3725" → 1372500 millionièmes. */
export function rateToMicros(rate: number | string): number {
  return decimalToScaledInt(rate, 6);
}

function decimalToScaledInt(value: number | string, decimals: number): number {
  const text = typeof value === "number" ? value.toFixed(decimals) : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Taux invalide : ${value}`);
  const fraction = (match[2] ?? "").padEnd(decimals + 1, "0");
  const scaled = Number(match[1]) * 10 ** decimals + Number(fraction.slice(0, decimals));
  return Number(fraction[decimals]) >= 5 ? scaled + 1 : scaled; // arrondi de la décimale suivante
}

export interface OrderLine {
  unitPriceCents: number;
  quantity: number;
  unitSupplierCostUsdCents: number;
}

export interface FinancialsInput {
  lines: OrderLine[];
  supplierShippingUsdCents: number;
  /** 1 USD = x CAD, ex. "1.3725" */
  fxRateUsdCad: string;
  /** ex. "0.15" */
  commissionRate: string;
  /** Frais Stripe du paiement (connus après le paiement), 0 sinon. */
  stripeFeeCents?: number;
  stripeFeesPaidBy?: "platform" | "store";
}

export interface OrderFinancials {
  subtotalCents: number;
  supplierCostCents: number;
  supplierShippingCents: number;
  grossMarginCents: number;
  commissionCents: number;
  storePayoutCents: number;
}

/**
 * Partage d'une vente :
 *   marge brute  = prix de vente − coût fournisseur − livraison (en CAD)
 *   commission   = 15 % de la marge brute (0 si la marge est négative)
 *   part client  = marge brute − commission (− frais Stripe s'ils sont à sa charge), jamais négative
 * Les taxes ne font pas partie de la marge : elles sont reversées aux gouvernements.
 */
export function computeOrderFinancials(input: FinancialsInput): OrderFinancials {
  const fx = rateToMicros(input.fxRateUsdCad);

  let subtotalCents = 0;
  let supplierUsdCents = 0;
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("Quantité invalide");
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) throw new Error("Prix invalide");
    if (!Number.isSafeInteger(line.unitSupplierCostUsdCents) || line.unitSupplierCostUsdCents < 0) throw new Error("Coût invalide");
    subtotalCents += line.unitPriceCents * line.quantity;
    supplierUsdCents += line.unitSupplierCostUsdCents * line.quantity;
  }

  const supplierCostCents = mulDivRound(supplierUsdCents, fx, 1_000_000);
  const supplierShippingCents = mulDivRound(input.supplierShippingUsdCents, fx, 1_000_000);
  const grossMarginCents = subtotalCents - supplierCostCents - supplierShippingCents;
  const { commissionCents, storePayoutCents } = splitMargin({
    grossMarginCents,
    commissionRate: input.commissionRate,
    stripeFeeCents: input.stripeFeeCents,
    stripeFeesPaidBy: input.stripeFeesPaidBy,
  });

  return { subtotalCents, supplierCostCents, supplierShippingCents, grossMarginCents, commissionCents, storePayoutCents };
}

/**
 * Partage une marge brute déjà connue entre la plateforme et le client :
 *   commission = taux × marge (0 si la marge est négative)
 *   part client = marge − commission (− frais Stripe s'ils sont à sa charge), jamais négative
 */
export function splitMargin(input: {
  grossMarginCents: number;
  commissionRate: string;
  stripeFeeCents?: number;
  stripeFeesPaidBy?: "platform" | "store";
}): { commissionCents: number; storePayoutCents: number } {
  const { grossMarginCents } = input;
  if (!Number.isSafeInteger(grossMarginCents)) throw new Error("Marge invalide");
  const commissionCents = grossMarginCents > 0 ? mulDivRound(grossMarginCents, rateToBasisPoints(input.commissionRate), 10_000) : 0;
  const storeFees = input.stripeFeesPaidBy === "store" ? (input.stripeFeeCents ?? 0) : 0;
  return { commissionCents, storePayoutCents: Math.max(grossMarginCents - commissionCents - storeFees, 0) };
}

export interface RefundRule {
  /** Part de la perte assumée par le client (0 à 100), le reste par la plateforme. */
  storeSharePercent: number;
  /** La plateforme rend-elle sa commission (au prorata du remboursement) ? */
  commissionRefunded: boolean;
  /** Pour les rétrofacturations : qui paie les frais de litige Stripe. */
  disputeFeePaidBy?: "store" | "platform";
}

export interface RefundRules {
  refund: RefundRule;
  chargeback: RefundRule;
}

export const DEFAULT_REFUND_RULES: RefundRules = {
  refund: { storeSharePercent: 100, commissionRefunded: true },
  chargeback: { storeSharePercent: 100, commissionRefunded: false, disputeFeePaidBy: "store" },
};

export interface RefundSplitInput {
  type: "refund" | "chargeback";
  amountCents: number;
  order: { totalCents: number; taxCents: number; commissionCents: number };
  rules: RefundRules;
  disputeFeeCents?: number;
}

export interface RefundSplit {
  /** Taxes comprises dans le remboursement (simplement non reversées : à la charge de la plateforme). */
  taxCents: number;
  /** Partie de la commission rendue par la plateforme. */
  commissionRefundCents: number;
  /** Total à reprendre au client (sur son versement à venir ou déjà versé). */
  storeDebitCents: number;
  /** Total supporté par la plateforme. */
  platformDebitCents: number;
  disputeFeeCents: number;
}

/**
 * Répartit le coût d'un remboursement ou d'une rétrofacturation selon les règles configurées.
 *   1. La part des taxes est à la charge de la plateforme (elle ne les reverse pas).
 *   2. Si la commission est rendue, la plateforme couvre sa part de commission au prorata.
 *   3. Le reste est partagé selon storeSharePercent.
 *   4. Les frais de litige vont à la partie désignée.
 * Garantie : storeDebit + platformDebit = montant remboursé + frais de litige.
 */
export function splitRefund(input: RefundSplitInput): RefundSplit {
  const { amountCents, order } = input;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Montant de remboursement invalide");
  if (order.totalCents <= 0) throw new Error("Commande sans montant");
  const amount = Math.min(amountCents, order.totalCents);
  const rule = input.rules[input.type];

  const taxCents = Math.min(mulDivRound(order.taxCents, amount, order.totalCents), amount);
  const net = amount - taxCents;
  const commissionRefundCents = rule.commissionRefunded
    ? Math.min(mulDivRound(order.commissionCents, amount, order.totalCents), net)
    : 0;
  const remaining = net - commissionRefundCents;
  const share = Math.min(Math.max(Math.round(rule.storeSharePercent), 0), 100);
  const storeShare = mulDivRound(remaining, share, 100);

  const disputeFeeCents = input.type === "chargeback" ? Math.max(input.disputeFeeCents ?? 0, 0) : 0;
  const feeToStore = rule.disputeFeePaidBy === "platform" ? 0 : disputeFeeCents;

  const storeDebitCents = storeShare + feeToStore;
  const platformDebitCents = taxCents + commissionRefundCents + (remaining - storeShare) + (disputeFeeCents - feeToStore);
  return { taxCents, commissionRefundCents, storeDebitCents, platformDebitCents, disputeFeeCents };
}

/** Lit les règles de remboursement stockées en base (format snake_case), avec repli par défaut. */
export function parseRefundRules(raw: unknown): RefundRules {
  const read = (value: unknown, fallback: RefundRule): RefundRule => {
    const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const pct = Number(v.store_share_percent);
    const rule: RefundRule = {
      storeSharePercent: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : fallback.storeSharePercent,
      commissionRefunded: typeof v.commission_refunded === "boolean" ? v.commission_refunded : fallback.commissionRefunded,
    };
    const feePayer = v.dispute_fee_paid_by === "platform" || v.dispute_fee_paid_by === "store" ? v.dispute_fee_paid_by : fallback.disputeFeePaidBy;
    if (feePayer) rule.disputeFeePaidBy = feePayer;
    return rule;
  };
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return { refund: read(r.refund, DEFAULT_REFUND_RULES.refund), chargeback: read(r.chargeback, DEFAULT_REFUND_RULES.chargeback) };
}

/** Convertit un montant USD (cents) en CAD (cents) au taux donné ("1.38"). */
export function usdToCadCents(usdCents: number, fxRateUsdCad: string): number {
  if (!Number.isSafeInteger(usdCents) || usdCents < 0) throw new Error("Montant USD invalide");
  return mulDivRound(usdCents, rateToMicros(fxRateUsdCad), 1_000_000);
}

/**
 * Prix minimal (cents) pour que la marge brute atteigne au moins `minMarginRate` du prix :
 *   (prix − coût) / prix ≥ marge  ⇔  prix ≥ coût / (1 − marge), arrondi au cent supérieur.
 */
export function minimumPriceCents(costCents: number, minMarginRate: string): number {
  if (!Number.isSafeInteger(costCents) || costCents < 0) throw new Error("Coût invalide");
  const bps = rateToBasisPoints(minMarginRate);
  if (bps >= 10_000) throw new Error("Marge minimale invalide");
  const keep = 10_000 - bps;
  return Math.floor((costCents * 10_000 + keep - 1) / keep); // division entière arrondie vers le haut
}

/** Prix de vente suggéré : au moins le prix minimal, arrondi à « x,99 $ ». */
export function suggestRetailPriceCents(costCents: number, minMarginRate: string): number {
  const min = Math.max(minimumPriceCents(costCents, minMarginRate), 99);
  const candidate = Math.floor(min / 100) * 100 + 99;
  return candidate >= min ? candidate : candidate + 100;
}

/** Marge brute en points de base (4000 = 40 %) pour un prix et un coût donnés. */
export function marginBasisPoints(priceCents: number, costCents: number): number {
  if (priceCents <= 0) return 0;
  return Math.floor(((priceCents - costCents) * 10_000) / priceCents);
}
