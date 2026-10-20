"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { ModerationKind } from "@/lib/moderation/match";
import { rescanProducts } from "@/lib/moderation/rescan";
import { retryOrder } from "@/lib/orders/fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";

/** Toutes les actions de cette page exigent le rôle administrateur. */

export async function suspendStore(formData: FormData) {
  await requireAdmin();
  const storeId = String(formData.get("store_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!reason) redirect("/admin/boutiques?resultat=motif-requis");
  // Hors ligne immédiatement ; le paiement (checkout) et les versements sont bloqués tant que dure la suspension.
  await createAdminClient()
    .from("stores")
    .update({ status: "suspended", suspension_reason: reason, suspended_at: new Date().toISOString() })
    .eq("id", storeId);
  revalidatePath("/admin/boutiques");
  redirect("/admin/boutiques?resultat=suspendue");
}

export async function reactivateStore(formData: FormData) {
  await requireAdmin();
  const storeId = String(formData.get("store_id") ?? "");
  // La boutique repasse hors ligne : le propriétaire la remet en ligne lui-même.
  await createAdminClient()
    .from("stores")
    .update({ status: "draft", suspension_reason: null, suspended_at: null })
    .eq("id", storeId)
    .eq("status", "suspended");
  revalidatePath("/admin/boutiques");
  redirect("/admin/boutiques?resultat=reactivee");
}

const KINDS: ModerationKind[] = ["brand", "counterfeit", "prohibited", "category"];

export async function addModerationRule(formData: FormData) {
  await requireAdmin();
  const kind = String(formData.get("kind") ?? "") as ModerationKind;
  const term = String(formData.get("term") ?? "").trim().replace(/\s+/g, " ");
  if (!KINDS.includes(kind) || term.length < 2 || term.length > 80) redirect("/admin/moderation?resultat=regle-invalide");
  const { error } = await createAdminClient().from("moderation_rules").insert({ kind, term });
  // 23505 = règle déjà présente (index unique sur le type et le terme).
  if (error) redirect(`/admin/moderation?resultat=${error.code === "23505" ? "regle-existe" : "regle-invalide"}`);
  revalidatePath("/admin/moderation");
  redirect("/admin/moderation?resultat=regle-ajoutee");
}

export async function deleteModerationRule(formData: FormData) {
  await requireAdmin();
  await createAdminClient().from("moderation_rules").delete().eq("id", String(formData.get("rule_id") ?? ""));
  revalidatePath("/admin/moderation");
  redirect("/admin/moderation?resultat=regle-supprimee");
}

export async function runRescan() {
  await requireAdmin();
  const { checked, blocked } = await rescanProducts();
  redirect(`/admin/moderation?verifies=${checked}&bloques=${blocked}`);
}

export async function retrySupplierOrder(formData: FormData) {
  await requireAdmin();
  const result = await retryOrder(String(formData.get("order_id") ?? ""));
  revalidatePath("/admin/commandes");
  redirect(`/admin/commandes?relance=${result}`);
}
