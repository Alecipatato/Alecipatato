import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import { createStore } from "../actions";
import { BriefForm } from "../brief-form";

export const metadata: Metadata = { title: "Nouvelle boutique" };

export default async function NewStorePage() {
  const user = await requireUser();
  const supabase = await createUserClient();
  const [{ count }, settings] = await Promise.all([
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    getPlatformSettings(),
  ]);
  const limitReached = (count ?? 0) >= settings.freePlan.maxStores;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/tableau-de-bord" className="text-sm font-medium text-muted hover:text-ink">← Mes boutiques</Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Décrivez votre boutique</h1>
      <p className="mt-2 text-muted">L&apos;IA crée le nom, le design, les textes et le catalogue. Vous pourrez tout modifier ensuite.</p>

      <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        {limitReached ? (
          <Alert kind="info">
            Le compte gratuit est limité à {settings.freePlan.maxStores} boutique{settings.freePlan.maxStores > 1 ? "s" : ""}. Vous pouvez
            régénérer ou personnaliser votre boutique existante depuis{" "}
            <Link href="/tableau-de-bord" className="font-semibold underline">votre tableau de bord</Link>.
          </Alert>
        ) : (
          <BriefForm action={createStore} submitLabel="Créer ma boutique" />
        )}
      </div>
    </div>
  );
}
