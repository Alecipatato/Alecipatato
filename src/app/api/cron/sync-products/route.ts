import { NextResponse, type NextRequest } from "next/server";
import { isCjConfigured } from "@/lib/cj/client";
import { syncSupplierProducts } from "@/lib/products/sync";

/**
 * Tâche planifiée (toutes les heures) : met à jour le prix et le stock des
 * produits CJ. Protégée par CRON_SECRET : « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!isCjConfigured()) return NextResponse.json({ error: "CJ non configuré" }, { status: 503 });
  return NextResponse.json(await syncSupplierProducts());
}
