import { NextResponse, type NextRequest } from "next/server";
import { releaseDuePayouts } from "@/lib/payments/payouts";

/**
 * Tâche planifiée (ex. toutes les heures) : verse aux clients les parts dont
 * la réserve de 7 jours est écoulée.
 * Protégée par CRON_SECRET : en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const report = await releaseDuePayouts();
  return NextResponse.json(report);
}
