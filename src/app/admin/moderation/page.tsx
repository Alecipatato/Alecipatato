import type { Metadata } from "next";
import { Alert, SubmitButton } from "@/components/ui";
import { inputClasses } from "@/components/styles";
import { fmt } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import type { ModerationKind } from "@/lib/moderation/match";
import { createAdminClient } from "@/lib/supabase/admin";
import { addModerationRule, deleteModerationRule, runRescan } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.tabs.moderation };
}

const KINDS: ModerationKind[] = ["brand", "counterfeit", "prohibited", "category"];

/** Liste configurable des mots-clés, marques et catégories bloqués. */
export default async function ModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  const sp = await searchParams;
  const m = await getMessages();
  const t = m.admin;
  const { data: rules } = await createAdminClient().from("moderation_rules").select("id, kind, term").order("term");
  const result = typeof sp.resultat === "string" && sp.resultat in t.results ? (sp.resultat as keyof typeof t.results) : null;
  const errorResult = result === "regle-existe" || result === "regle-invalide";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">{t.tabs.moderation}</h1>

      {result && <Alert kind={errorResult ? "error" : "success"}>{t.results[result]}</Alert>}
      {typeof sp.verifies === "string" && (
        <Alert kind="success">{fmt(t.rescanDone, { checked: Number(sp.verifies) || 0, blocked: Number(sp.bloques) || 0 })}</Alert>
      )}

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.rescan.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t.rescan.body}</p>
        <form action={runRescan} className="mt-4">
          <SubmitButton variant="secondary" pendingLabel={t.rescan.pending}>{t.rescan.button}</SubmitButton>
        </form>
      </section>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.rules.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t.rules.intro}</p>
        <form action={addModerationRule} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.rules.kind}
            <select name="kind" className={`${inputClasses} py-2`}>
              {KINDS.map((k) => <option key={k} value={k}>{m.moderation.kinds[k]}</option>)}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
            {t.rules.term}
            <input name="term" required minLength={2} maxLength={80} className={`${inputClasses} py-2`} />
          </label>
          <SubmitButton className="py-2">{t.rules.add}</SubmitButton>
        </form>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {KINDS.map((kind) => {
            const list = (rules ?? []).filter((r) => r.kind === kind);
            return (
              <div key={kind}>
                <h3 className="font-semibold">{m.moderation.kinds[kind]} <span className="text-muted">({list.length})</span></h3>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t.rules.empty}</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {list.map((rule) => (
                      <li key={rule.id}>
                        <form action={deleteModerationRule} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper py-1 pl-3 pr-1 text-sm">
                          <input type="hidden" name="rule_id" value={rule.id} />
                          {rule.term}
                          <button type="submit" aria-label={`${t.rules.remove} « ${rule.term} »`} className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                            ×
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
