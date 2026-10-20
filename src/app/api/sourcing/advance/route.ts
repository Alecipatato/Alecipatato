import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { advanceSourcing } from "@/lib/products/sourcing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fait avancer d'une étape la recherche de produits d'une boutique.
 * Appelée en boucle par l'écran « Produits » jusqu'à la fin de la recherche.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const t = (await getMessages()).sales.products;
  if (!user) return NextResponse.json({ error: t.api.sessionExpired }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { storeId?: unknown; jobId?: unknown };
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const jobId = typeof body.jobId === "string" ? body.jobId : "";

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, status").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store || store.status === "suspended") return NextResponse.json({ error: t.actions.storeNotFound }, { status: 404 });
  const { data: job } = await admin.from("sourcing_jobs").select("id").eq("id", jobId).eq("store_id", storeId).maybeSingle();
  if (!job) return NextResponse.json({ error: t.api.jobNotFound }, { status: 404 });

  try {
    return NextResponse.json(await advanceSourcing(jobId));
  } catch (err) {
    console.error("Recherche de produits :", err);
    return NextResponse.json({ error: fmt(t.sourcingErrors.generic, { detail: err instanceof Error ? err.message : "?" }) }, { status: 500 });
  }
}
