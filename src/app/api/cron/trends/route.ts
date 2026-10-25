import { NextResponse, type NextRequest } from "next/server";
import { isCjConfigured } from "@/lib/cj/client";
import { refreshTrends } from "@/lib/trends/refresh";

/**
 * Tâche planifiée (toutes les heures) : produits tendance du catalogue CJ.
 * Protégée par CRON_SECRET : « Authorization: Bearer <CRON_SECRET> ».
 * ?limit=N (1 à 30) : nombre de produits vérifiés pendant ce passage (8 par défaut), pour remplir plus vite au lancement.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!isCjConfigured()) return NextResponse.json({ error: "CJ non configuré" }, { status: 503 });
  const limit = Number(request.nextUrl.searchParams.get("limit"));
  return NextResponse.json(await refreshTrends(Number.isInteger(limit) && limit > 0 ? { checkLimit: Math.min(limit, 30) } : {}));
}
