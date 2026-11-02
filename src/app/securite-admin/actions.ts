"use server";

import { redirect } from "next/navigation";
import { logAdminAction } from "@/lib/audit";
import { isAdmin, requireUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export type MfaState = { error?: string; factorId?: string; qr?: string; secret?: string };

async function adminSession() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) redirect("/tableau-de-bord");
  return { user, supabase: await createUserClient() };
}

/** Nouvelle application d'authentification (TOTP) : code QR et clé ; les essais inachevés sont effacés. */
export async function startTotpEnrollment(): Promise<MfaState> {
  const m = await getMessages();
  const { supabase } = await adminSession();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Admin ${new Date().toISOString().slice(0, 16)}` });
  if (error || !data) return { error: m.admin.mfa.failed };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Vérifie un code : active l'application (première fois) et passe la session au niveau « aal2 ». */
export async function verifyTotp(prev: MfaState, formData: FormData): Promise<MfaState> {
  const m = await getMessages();
  const { user, supabase } = await adminSession();
  const factorId = String(formData.get("factor_id") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ...prev, error: m.admin.mfa.invalid };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ...prev, error: m.admin.mfa.invalid };
  await logAdminAction(user.id, formData.get("mode") === "enroll" ? "mfa.enroll" : "mfa.verify");
  redirect("/admin");
}
