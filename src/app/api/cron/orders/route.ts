import { NextResponse, type NextRequest } from "next/server";
import { runFulfillment } from "@/lib/orders/fulfillment";

/**
 * Tâche planifiée (ex. toutes les 15 minutes) : transmet à CJ les commandes payées
 * (et relance les échecs), puis met à jour le suivi de livraison.
 * Protégée par CRON_SECRET : en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json(await runFulfillment());
}
