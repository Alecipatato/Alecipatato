import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { advanceSourcing } from "@/lib/products/sourcing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fait avancer d'une étape la recherche de produits d'une boutique.
 * Appelée en boucle par l'écran « Produits » jusqu'à la fin de la recherche.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Session expirée : reconnectez-vous." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { storeId?: unknown; jobId?: unknown };
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const jobId = typeof body.jobId === "string" ? body.jobId : "";

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id, status").eq("id", storeId).eq("owner_id", user.id).maybeSingle();
  if (!store || store.status === "suspended") return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  const { data: job } = await admin.from("sourcing_jobs").select("id").eq("id", jobId).eq("store_id", storeId).maybeSingle();
  if (!job) return NextResponse.json({ error: "Recherche introuvable." }, { status: 404 });

  try {
    return NextResponse.json(await advanceSourcing(jobId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "La recherche a échoué." }, { status: 500 });
  }
}
