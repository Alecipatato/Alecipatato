"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { alertAdmin } from "@/lib/email/resend";
import { parseTierInputs, rateToBasisPoints, type TierInputError } from "@/lib/money";
import type { ModerationKind } from "@/lib/moderation/match";
import { rescanProducts } from "@/lib/moderation/rescan";
import { retryOrder } from "@/lib/orders/fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";

/** Toutes les actions de cette page exigent le rôle administrateur. */

export async function suspendStore(formData: FormData) {
  const user = await requireAdmin();
  const storeId = String(formData.get("store_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!reason) redirect("/admin/boutiques?resultat=motif-requis");
  // Hors ligne immédiatement ; le paiement (checkout) et les versements sont bloqués tant que dure la suspension.
  await createAdminClient()
    .from("stores")
    .update({ status: "suspended", suspension_reason: reason, suspended_at: new Date().toISOString() })
    .eq("id", storeId);
  await logAdminAction(user.id, "store.suspend", { type: "store", id: storeId }, { reason });
  revalidatePath("/admin/boutiques");
  redirect("/admin/boutiques?resultat=suspendue");
}

export async function reactivateStore(formData: FormData) {
  const user = await requireAdmin();
  const storeId = String(formData.get("store_id") ?? "");
  // La boutique repasse hors ligne : le propriétaire la remet en ligne lui-même.
  await createAdminClient()
    .from("stores")
    .update({ status: "draft", suspension_reason: null, suspended_at: null })
    .eq("id", storeId)
    .eq("status", "suspended");
  await logAdminAction(user.id, "store.reactivate", { type: "store", id: storeId });
  revalidatePath("/admin/boutiques");
  redirect("/admin/boutiques?resultat=reactivee");
}

const KINDS: ModerationKind[] = ["brand", "counterfeit", "prohibited", "category"];

export async function addModerationRule(formData: FormData) {
  const user = await requireAdmin();
  const kind = String(formData.get("kind") ?? "") as ModerationKind;
  const term = String(formData.get("term") ?? "").trim().replace(/\s+/g, " ");
  if (!KINDS.includes(kind) || term.length < 2 || term.length > 80) redirect("/admin/moderation?resultat=regle-invalide");
  const { error } = await createAdminClient().from("moderation_rules").insert({ kind, term });
  // 23505 = règle déjà présente (index unique sur le type et le terme).
  if (error) redirect(`/admin/moderation?resultat=${error.code === "23505" ? "regle-existe" : "regle-invalide"}`);
  await logAdminAction(user.id, "moderation.add", { type: "moderation_rule" }, { kind, term });
  revalidatePath("/admin/moderation");
  redirect("/admin/moderation?resultat=regle-ajoutee");
}

export async function deleteModerationRule(formData: FormData) {
  const user = await requireAdmin();
  const ruleId = String(formData.get("rule_id") ?? "");
  const { data: removed } = await createAdminClient().from("moderation_rules").delete().eq("id", ruleId).select("kind, term");
  await logAdminAction(user.id, "moderation.remove", { type: "moderation_rule", id: ruleId }, { ...(removed?.[0] ?? {}) });
  revalidatePath("/admin/moderation");
  redirect("/admin/moderation?resultat=regle-supprimee");
}

export async function runRescan() {
  const user = await requireAdmin();
  const { checked, blocked } = await rescanProducts();
  await logAdminAction(user.id, "moderation.rescan", {}, { checked, blocked });
  redirect(`/admin/moderation?verifies=${checked}&bloques=${blocked}`);
}

export async function retrySupplierOrder(formData: FormData) {
  const user = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const result = await retryOrder(orderId);
  await logAdminAction(user.id, "order.retry", { type: "order", id: orderId }, { result });
  revalidatePath("/admin/commandes");
  redirect(`/admin/commandes?relance=${result}`);
}

export type CommissionTiersState = { error?: TierInputError; saved?: boolean };

/** Paliers de la commission dégressive (ne changent que les ventes à venir : le taux est figé sur chaque commande). */
export async function updateCommissionTiers(_prev: CommissionTiersState, formData: FormData): Promise<CommissionTiersState> {
  const user = await requireAdmin();
  const froms = formData.getAll("from").map(String);
  const rates = formData.getAll("rate").map(String);
  const parsed = parseTierInputs(froms.map((from, i) => ({ from, rate: rates[i] ?? "" })));
  if ("error" in parsed) return { error: parsed.error };
  const admin = createAdminClient();
  const value = parsed.tiers.map((t) => ({ from_margin_cents: t.fromMarginCents, rate: t.rate }));
  const { error } = await admin.from("platform_settings").upsert(
    [
      { key: "commission_tiers", value, description: "Commission dégressive : à partir de cette marge brute des 30 derniers jours (en cents), ce taux s'applique." },
      { key: "commission_rate", value: parsed.tiers[0].rate, description: "Part de la marge brute prélevée par la plateforme (0.15 = 15 %)." },
    ],
    { onConflict: "key" },
  );
  if (error) return { error: "invalid" };
  await logAdminAction(user.id, "commission.tiers", { type: "platform_settings", id: "commission_tiers" }, { tiers: value });
  // Changement qui touche l'argent de tous les vendeurs : tous les administrateurs sont prévenus.
  await alertAdmin(
    "Paliers de commission modifiés",
    `Nouveaux paliers (marge brute des 30 derniers jours → taux) :\n${parsed.tiers.map((t) => `${(t.fromMarginCents / 100).toFixed(2)} $ → ${(rateToBasisPoints(t.rate) / 100).toFixed(2)} %`).join("\n")}\n\nModifié par : ${user.email ?? user.id}`,
  );
  revalidatePath("/admin/commission");
  return { saved: true };
}

/** Approuve un versement retenu par un plafond de sécurité : il partira au prochain passage de la tâche des versements. */
export async function approveHeldPayout(formData: FormData) {
  const user = await requireAdmin();
  const payoutId = String(formData.get("payout_id") ?? "");
  const { data } = await createAdminClient()
    .from("payouts")
    .update({ status: "pending", hold_reason: null, approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", payoutId)
    .eq("status", "held")
    .eq("hold_reason", "limit")
    .select("amount_cents, order_id");
  if (data?.length) await logAdminAction(user.id, "payout.approve", { type: "payout", id: payoutId }, { amount_cents: data[0].amount_cents, order_id: data[0].order_id });
  revalidatePath("/admin/securite");
  redirect("/admin/securite?approuve=1");
}
