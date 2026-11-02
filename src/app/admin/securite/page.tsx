import type { Metadata } from "next";
import { approveHeldPayout } from "@/app/admin/actions";
import { buttonClasses } from "@/components/styles";
import { Alert } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.security.metaTitle };
}

/** Sécurité : plafonds de versements, versements retenus à approuver, journal des administrateurs. */
export default async function SecurityPage({ searchParams }: PageProps<"/admin/securite">) {
  await requireAdmin();
  const sp = await searchParams;
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.admin.security;
  const admin = createAdminClient();
  const [settings, { data: held }, { data: log }] = await Promise.all([
    getPlatformSettings(),
    admin.from("payouts").select("id, amount_cents, currency, updated_at, orders(order_number), stores(name)").eq("status", "held").eq("hold_reason", "limit").order("updated_at").limit(100),
    admin.from("admin_audit_log").select("id, action, target_type, target_id, details, created_at, profiles(email, full_name)").order("created_at", { ascending: false }).limit(100),
  ]);
  const price = (cents: number) => formatPrice(cents, "CAD", locale);
  const date = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" });
  const actionLabel = (action: string) => (t.actions as Record<string, string>)[action] ?? action;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.intro}</p>
      </div>
      {sp.approuve && <Alert kind="success">{t.approved}</Alert>}
      <ul className="grid gap-3 sm:grid-cols-2">
        <li className="rounded-xl border border-line bg-white p-4 text-sm">🔐 {t.mfa}</li>
        <li className="rounded-xl border border-line bg-white p-4 text-sm" data-payout-limits>
          🛑 {fmt(t.limits, { single: price(settings.payoutLimits.maxSingleCents), daily: price(settings.payoutLimits.maxDailyCents) })}
        </li>
      </ul>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.held}</h2>
        {(held ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.heldEmpty}</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-2">{t.columns.store}</th><th>{t.columns.order}</th><th className="text-right">{t.columns.amount}</th><th>{t.columns.since}</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(held ?? []).map((p) => (
                <tr key={p.id} data-held-payout={p.id}>
                  <td className="py-3">{(p.stores as unknown as { name: string } | null)?.name}</td>
                  <td>#{(p.orders as unknown as { order_number: string } | null)?.order_number}</td>
                  <td className="text-right font-semibold tabular-nums">{price(Number(p.amount_cents))}</td>
                  <td className="text-muted">{date.format(new Date(p.updated_at))}</td>
                  <td className="text-right">
                    <form action={approveHeldPayout}>
                      <input type="hidden" name="payout_id" value={p.id} />
                      <button type="submit" className={buttonClasses.secondary}>{t.approve}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.log}</h2>
        {(log ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.logEmpty}</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-2">{t.logColumns.date}</th><th>{t.logColumns.admin}</th><th>{t.logColumns.action}</th><th>{t.logColumns.details}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(log ?? []).map((row) => {
                const who = row.profiles as unknown as { email: string | null; full_name: string | null } | null;
                return (
                  <tr key={row.id} data-audit={row.action}>
                    <td className="whitespace-nowrap py-2 pr-3 text-muted">{date.format(new Date(row.created_at))}</td>
                    <td className="pr-3">{who?.full_name || who?.email || "—"}</td>
                    <td className="pr-3 font-medium">{actionLabel(row.action)}</td>
                    <td className="max-w-md truncate font-mono text-xs text-muted" title={JSON.stringify(row.details)}>
                      {row.target_id ? `${row.target_type}:${row.target_id} ` : ""}{Object.keys(row.details ?? {}).length ? JSON.stringify(row.details) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
