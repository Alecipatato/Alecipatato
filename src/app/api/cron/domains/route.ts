import { NextResponse, type NextRequest } from "next/server";
import { customDomainsConfigured } from "@/lib/domains/cloudflare";
import { refreshPendingDomains } from "@/lib/domains/service";

/**
 * Tâche planifiée (ex. toutes les 10 minutes) : vérifie chez Cloudflare les domaines personnalisés en attente.
 * Protégée par CRON_SECRET : en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!customDomainsConfigured()) return NextResponse.json({ checked: 0, activated: 0, configured: false });
  return NextResponse.json(await refreshPendingDomains());
}
