import { after } from "next/server";
import { NextResponse, type NextRequest } from "next/server";
import { getCjOpenId } from "@/lib/cj/client";
import { parseCjWebhook, verifyCjSignature } from "@/lib/cj/webhook-message";
import { handleCjMessage } from "@/lib/products/live-sync";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notifications de CJ (produit, variante, stock). Adresse à donner dans CJ_WEBHOOK_URL.
 * Signature vérifiée (en-tête « sign », clé = openId du compte) ; réponse en moins de 3 secondes
 * comme l'exige CJ : le traitement (retrait, resynchronisation) se fait après la réponse.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const openId = await getCjOpenId();
  if (!openId || !(await verifyCjSignature(body, request.headers.get("sign"), openId))) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  let message;
  try {
    message = parseCjWebhook(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!message) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  const { error } = await admin.from("cj_webhook_events").insert({ message_id: message.messageId, type: message.type, message_type: message.messageType });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true }); // déjà reçue
    throw new Error(`Journal des notifications CJ : ${error.message}`);
  }
  after(async () => {
    let result: string;
    try {
      result = await handleCjMessage(message);
    } catch (err) {
      console.warn(`Notification CJ ${message.messageId} :`, err);
      result = `error:${String(err).slice(0, 200)}`;
    }
    await admin.from("cj_webhook_events").update({ processed_at: new Date().toISOString(), result }).eq("message_id", message.messageId);
  });
  return NextResponse.json({ ok: true });
}
