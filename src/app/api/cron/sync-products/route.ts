import { NextResponse, type NextRequest } from "next/server";
import { isCjConfigured } from "@/lib/cj/client";
import { ensureCjWebhook, syncCjSubscriptions } from "@/lib/products/live-sync";
import { syncSupplierProducts } from "@/lib/products/sync";

/**
 * Tâche planifiée (toutes les heures) : met à jour le prix et le stock des produits CJ,
 * puis (si CJ_WEBHOOK_URL est défini) l'inscription aux notifications CJ et la liste des produits abonnés.
 * Protégée par CRON_SECRET : « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!isCjConfigured()) return NextResponse.json({ error: "CJ non configuré" }, { status: 503 });
  const sync = await syncSupplierProducts();
  let webhook: unknown = null;
  try {
    const registration = await ensureCjWebhook();
    webhook = registration === "not_configured" ? registration : { registration, ...(await syncCjSubscriptions()) };
  } catch (err) {
    console.warn("Notifications CJ :", err);
    webhook = { error: String(err).slice(0, 200) };
  }
  return NextResponse.json({ ...sync, webhook });
}
