"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { customDomainsConfigured } from "@/lib/domains/cloudflare";
import { connectDomain, refreshDomain, removeDomain } from "@/lib/domains/service";
import { createAdminClient } from "@/lib/supabase/admin";

/** Résultat affiché en haut de la page de la boutique (?domaine=…). */
const back = (storeId: string, result: string) => {
  revalidatePath(`/tableau-de-bord/boutiques/${storeId}`);
  redirect(`/tableau-de-bord/boutiques/${storeId}?domaine=${result}#domaine`);
};

async function ownedStoreId(formData: FormData, userId: string): Promise<string | null> {
  const id = String(formData.get("store_id") ?? "");
  const { data } = await createAdminClient().from("stores").select("id, status").eq("id", id).eq("owner_id", userId).maybeSingle();
  return data && data.status !== "suspended" ? data.id : null;
}

export async function connectStoreDomain(formData: FormData) {
  const user = await requireUser();
  const storeId = await ownedStoreId(formData, user.id);
  if (!storeId || !customDomainsConfigured()) return;
  back(storeId, await connectDomain(storeId, String(formData.get("domain") ?? "")));
}

export async function refreshStoreDomain(formData: FormData) {
  const user = await requireUser();
  const storeId = await ownedStoreId(formData, user.id);
  if (!storeId || !customDomainsConfigured()) return;
  let state: string | null = null;
  try {
    state = await refreshDomain(storeId);
  } catch (err) {
    console.error("Vérification du domaine :", err);
  }
  back(storeId, state === "active" ? "active" : "pending");
}

export async function removeStoreDomain(formData: FormData) {
  const user = await requireUser();
  const storeId = await ownedStoreId(formData, user.id);
  if (!storeId) return;
  await removeDomain(storeId);
  back(storeId, "removed");
}
