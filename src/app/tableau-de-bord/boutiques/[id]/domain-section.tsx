import { SubmitButton } from "@/components/ui";
import { inputClasses } from "@/components/styles";
import { customDomainsConfigured } from "@/lib/domains/cloudflare";
import { type DnsRecord, isApexDomain } from "@/lib/domains/normalize";
import { fmt, intlLocale, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { connectStoreDomain, refreshStoreDomain, removeStoreDomain } from "../../domain-actions";

const STATUS_CLASSES = { pending: "bg-marigold-soft text-ink", active: "bg-brand-soft text-brand-strong", failed: "bg-danger-soft text-danger" } as const;

/** Domaine personnalisé : saisie, enregistrements DNS à créer, état de la vérification. */
export function DomainSection(props: {
  storeId: string;
  defaultAddress: string;
  domain: string | null;
  status: "pending" | "active" | "failed" | null;
  records: DnsRecord[];
  error: string | null;
  checkedAt: string | null;
  disabled: boolean;
  m: Messages;
  locale: Locale;
}) {
  const t = props.m.domains;
  const hidden = <input type="hidden" name="store_id" value={props.storeId} />;
  return (
    <section className="rounded-2xl border border-line bg-white p-6" id="domaine">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">{t.title}</h2>
        {props.status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[props.status]}`} data-domain-status={props.status}>{t.status[props.status]}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">{fmt(t.intro, { address: props.defaultAddress })}</p>

      {!customDomainsConfigured() ? (
        <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-sm text-muted">{t.notConfigured}</p>
      ) : !props.domain ? (
        !props.disabled && (
          <form action={connectStoreDomain} className="mt-4 flex flex-col gap-2">
            {hidden}
            <label htmlFor="domain" className="text-sm font-medium">{t.domain}</label>
            <div className="flex flex-wrap gap-2">
              <input id="domain" name="domain" required placeholder={t.placeholder} autoComplete="off" className={`${inputClasses} min-w-0 flex-1`} />
              <SubmitButton variant="secondary" pendingLabel={t.connecting}>{t.connect}</SubmitButton>
            </div>
            <p className="text-xs text-muted">{t.hint}</p>
          </form>
        )
      ) : (
        <div className="mt-4 flex flex-col gap-4 text-sm">
          <p className="font-semibold break-all">{props.domain}</p>
          {props.status === "active" ? (
            <p>{fmt(t.activeIntro, { url: `https://${props.domain}` })}</p>
          ) : (
            <>
              {props.status === "failed" && props.error && <p className="text-danger">{fmt(t.failedIntro, { error: props.error })}</p>}
              <p className="text-muted">{t.pendingIntro}</p>
              {isApexDomain(props.domain) && <p className="rounded-lg bg-marigold-soft px-3 py-2 text-xs">{fmt(t.apexWarning, { domain: props.domain })}</p>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs" data-dns-records>
                  <thead className="text-muted">
                    <tr><th className="py-1.5 pr-3 font-medium">{t.columns.type}</th><th className="py-1.5 pr-3 font-medium">{t.columns.name}</th><th className="py-1.5 font-medium">{t.columns.value}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {props.records.map((r) => (
                      <tr key={`${r.type}${r.name}${r.value}`}>
                        <td className="py-2 pr-3 align-top font-semibold">{r.type}</td>
                        <td className="py-2 pr-3 align-top font-mono break-all">{r.name}</td>
                        <td className="py-2 align-top"><span className="font-mono break-all">{r.value}</span><span className="mt-0.5 block text-muted">{t.purposes[r.purpose]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {props.checkedAt && (
            <p className="text-xs text-muted">
              {fmt(t.lastCheck, { date: new Intl.DateTimeFormat(intlLocale(props.locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(props.checkedAt)) })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {props.status !== "active" && !props.disabled && (
              <form action={refreshStoreDomain}>{hidden}<SubmitButton variant="secondary" className="py-2 text-xs">{t.refresh}</SubmitButton></form>
            )}
            <form action={removeStoreDomain}>{hidden}<SubmitButton variant="secondary" className="py-2 text-xs text-danger">{t.remove}</SubmitButton></form>
          </div>
        </div>
      )}
    </section>
  );
}
