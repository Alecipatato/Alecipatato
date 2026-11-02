"use server";

import { revalidatePath } from "next/cache";
import { isManualStep } from "@/lib/ads/guides";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Coche ou décoche une étape d'un guide publicitaire (étapes manuelles seulement). */
export async function setGuideStep(storeId: string, stepKey: string, done: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!isManualStep(stepKey)) return { ok: false };
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store) return { ok: false };
  const { error } = done
    ? await admin.from("ad_guide_progress").upsert({ store_id: store.id, step_key: stepKey }, { onConflict: "store_id,step_key" })
    : await admin.from("ad_guide_progress").delete().eq("store_id", store.id).eq("step_key", stepKey);
  if (error) return { ok: false };
  revalidatePath(`/tableau-de-bord/boutiques/${store.id}/publicite`);
  return { ok: true };
}
