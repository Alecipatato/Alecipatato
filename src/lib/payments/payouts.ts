import { alertAdmin } from "../email/resend";
import { getPlatformSettings } from "../settings";
import { createAdminClient } from "../supabase/admin";
import { getStripe } from "../stripe";

/**
 * Versements aux clients (part de chaque vente, après la réserve de 7 jours).
 * Un versement = un transfert Stripe vers le compte Connect du client,
 * rattaché au paiement d'origine (source_transaction).
 */

/**
 * Reprend `debitCents` au client suite à un remboursement ou une rétrofacturation :
 *  - versement pas encore parti (en attente ou retenu) : on réduit son montant ;
 *  - versement déjà parti : on annule une partie du transfert (transfer reversal).
 * Retourne ce qui a pu être récupéré ; le reste est à la charge de la plateforme.
 */
export async function recoverFromStore(orderId: string, debitCents: number, reference: string): Promise<{ recoveredCents: number }> {
  if (debitCents <= 0) return { recoveredCents: 0 };
  const admin = createAdminClient();
  const { data: payout } = await admin
    .from("payouts")
    .select("id, amount_cents, status, stripe_transfer_id, reversed_cents")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!payout) return { recoveredCents: 0 };

  const amount = Number(payout.amount_cents);
  if (payout.status === "pending" || payout.status === "held") {
    const newAmount = Math.max(amount - debitCents, 0);
    await admin
      .from("payouts")
      .update({ amount_cents: newAmount, ...(newAmount === 0 && { status: "reversed" }) })
      .eq("id", payout.id);
    return { recoveredCents: amount - newAmount };
  }

  if (payout.status === "paid" && payout.stripe_transfer_id) {
    const reversible = amount - Number(payout.reversed_cents);
    const toReverse = Math.min(debitCents, reversible);
    if (toReverse <= 0) return { recoveredCents: 0 };
    await getStripe().transfers.createReversal(
      payout.stripe_transfer_id,
      { amount: toReverse, metadata: { order_id: orderId, reference } },
      { idempotencyKey: `reversal-${reference}` },
    );
    const reversed = Number(payout.reversed_cents) + toReverse;
    await admin
      .from("payouts")
      .update({ reversed_cents: reversed, ...(reversed >= amount && { status: "reversed" }) })
      .eq("id", payout.id);
    return { recoveredCents: toReverse };
  }

  return { recoveredCents: 0 };
}

export interface ReleaseReport {
  paid: number;
  held: number;
  skipped: { payoutId: string; reason: string }[];
}

/**
 * Verse toutes les parts dont la réserve est écoulée. À appeler régulièrement
 * (tâche planifiée : /api/cron/payouts). Sans danger si appelé plusieurs fois :
 * chaque transfert a une clé d'idempotence.
 */
export async function releaseDuePayouts(now = new Date()): Promise<ReleaseReport> {
  const admin = createAdminClient();
  const report: ReleaseReport = { paid: 0, held: 0, skipped: [] };

  const { data: due, error } = await admin
    .from("payouts")
    .select("id, amount_cents, currency, order_id, store_id, approved_at, orders(order_number, disputed, stripe_charge_id), stores(name, owner_id, status)")
    .eq("status", "pending")
    .lte("available_at", now.toISOString())
    .limit(100);
  if (error) throw new Error(`Lecture des versements impossible : ${error.message}`);

  // Plafonds de sécurité : versements des dernières 24 h (approuvés compris) pour le plafond quotidien.
  const { payoutLimits } = await getPlatformSettings();
  const { data: recent } = await admin.from("payouts").select("amount_cents").eq("status", "paid").gte("paid_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  let paidLast24h = (recent ?? []).reduce((sum, p) => sum + Number(p.amount_cents), 0);
  const limited: string[] = [];

  for (const payout of due ?? []) {
    const order = payout.orders as unknown as { order_number: string; disputed: boolean; stripe_charge_id: string | null } | null;
    const store = payout.stores as unknown as { name: string; owner_id: string; status: string } | null;
    if (!order || !store) continue;

    // Boutique suspendue par l'administrateur : le versement attend (il repartira à la réactivation).
    if (store.status === "suspended") {
      report.skipped.push({ payoutId: payout.id, reason: "Boutique suspendue." });
      continue;
    }

    if (order.disputed) {
      await admin.from("payouts").update({ status: "held", hold_reason: "dispute" }).eq("id", payout.id);
      report.held++;
      continue;
    }

    const amount = Number(payout.amount_cents);
    // Versement trop gros ou plafond quotidien dépassé : retenu jusqu'à l'approbation d'un administrateur.
    if (!payout.approved_at && (amount > payoutLimits.maxSingleCents || paidLast24h + amount > payoutLimits.maxDailyCents)) {
      await admin.from("payouts").update({ status: "held", hold_reason: "limit" }).eq("id", payout.id);
      limited.push(`${store.name} — commande ${order.order_number} : ${(amount / 100).toFixed(2)} ${payout.currency}`);
      report.held++;
      continue;
    }
    if (amount === 0) {
      await admin.from("payouts").update({ status: "paid", paid_at: now.toISOString() }).eq("id", payout.id);
      continue;
    }

    const { data: owner } = await admin
      .from("profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("id", store.owner_id)
      .single();
    if (!owner?.stripe_account_id || !owner.stripe_onboarding_complete) {
      const reason = "Compte de versement Stripe non configuré.";
      await admin.from("payouts").update({ failure_reason: reason }).eq("id", payout.id);
      report.skipped.push({ payoutId: payout.id, reason });
      continue;
    }

    try {
      const transfer = await getStripe().transfers.create(
        {
          amount,
          currency: payout.currency.toLowerCase(),
          destination: owner.stripe_account_id,
          transfer_group: payout.order_id,
          ...(order.stripe_charge_id && { source_transaction: order.stripe_charge_id }),
          description: `${store.name} — commande ${order.order_number}`,
          metadata: { payout_id: payout.id, order_id: payout.order_id },
        },
        { idempotencyKey: `payout-${payout.id}` },
      );
      await admin
        .from("payouts")
        .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: now.toISOString(), failure_reason: null })
        .eq("id", payout.id);
      paidLast24h += amount;
      report.paid++;
    } catch (err) {
      // On laisse le versement « en attente » : il sera retenté au prochain passage.
      const reason = err instanceof Error ? err.message.slice(0, 300) : "Erreur inconnue";
      await admin.from("payouts").update({ failure_reason: reason }).eq("id", payout.id);
      report.skipped.push({ payoutId: payout.id, reason });
    }
  }
  if (limited.length) {
    await alertAdmin(
      `${limited.length} versement(s) retenu(s) : plafond de sécurité dépassé`,
      `Ces versements attendent votre approbation dans Administration > Sécurité :\n\n${limited.join("\n")}`,
    );
  }
  return report;
}
