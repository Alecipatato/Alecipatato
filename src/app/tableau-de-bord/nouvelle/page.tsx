import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { plural } from "@/lib/i18n/config";
import { rich } from "@/lib/i18n/rich";
import { getMessages } from "@/lib/i18n/server";
import { getPlatformSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import { createStore } from "../actions";
import { BriefForm } from "../brief-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.create.metaTitle };
}

export default async function NewStorePage() {
  const user = await requireUser();
  const supabase = await createUserClient();
  const [{ count }, settings, m] = await Promise.all([
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    getPlatformSettings(),
    getMessages(),
  ]);
  const t = m.dashboard.create;
  const max = settings.freePlan.maxStores;
  const limitReached = (count ?? 0) >= max;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/tableau-de-bord" className="text-sm font-medium text-muted hover:text-ink">{m.dashboard.backToStores}</Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-2 text-muted">{t.subtitle}</p>

      <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
        {limitReached ? (
          <Alert kind="info">
            {rich(
              plural(max, t.limitOne, t.limitOther),
              { link: (s) => <Link href="/tableau-de-bord" className="font-semibold underline">{s}</Link> },
              { max },
            )}
          </Alert>
        ) : (
          <BriefForm action={createStore} submitLabel={t.submit} />
        )}
      </div>
    </div>
  );
}
