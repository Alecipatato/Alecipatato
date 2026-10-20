import type { Metadata } from "next";
import { Alert, SubmitButton } from "@/components/ui";
import { cjAutoPayEnabled, cjOrdersEnabled } from "@/lib/cj/orders";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { MAX_CJ_ATTEMPTS } from "@/lib/orders/fulfillment";
import { formatPrice } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrySupplierOrder } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.orders.title };
}

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  paid_at: string | null;
  total_cents: number;
  currency: string;
  cj_status: string | null;
  cj_error: string | null;
  cj_attempts: number;
  cj_order_id: string | null;
  cj_paid: boolean;
  tracking_number: string | null;
  stores: { name: string } | null;
};

const COLUMNS = "id, order_number, status, paid_at, total_cents, currency, cj_status, cj_error, cj_attempts, cj_order_id, cj_paid, tracking_number, stores(name)";

/** Commandes à transmettre ou en échec chez CJ, et commandes transmises récemment. */
export default async function SupplierOrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (await getMessages(locale)).admin.orders;
  const admin = createAdminClient();
  const [{ data: queue }, { data: recent }] = await Promise.all([
    admin.from("orders").select(COLUMNS).eq("status", "paid").or("cj_status.is.null,cj_status.in.(sending,failed)").order("paid_at").limit(100),
    admin.from("orders").select(COLUMNS).eq("cj_status", "sent").order("paid_at", { ascending: false }).limit(30),
  ]);
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const retried = typeof sp.relance === "string" && sp.relance in t.retried ? (sp.relance as keyof typeof t.retried) : null;

  const row = (o: OrderRow, canRetry: boolean) => {
    const label = o.cj_status === "failed" ? t.status.failed : o.cj_status === "sending" ? t.status.sending : o.cj_status === "sent" ? t.status.sent : t.status.waiting;
    return (
      <li key={o.id} className="rounded-2xl border border-line bg-white p-5" data-order={o.order_number}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {o.order_number} · {o.stores?.name}{" "}
              <span className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.cj_status === "failed" ? "bg-danger-soft text-danger" : "bg-paper text-muted border border-line"}`}>{label}</span>
              {o.cj_status === "sent" && !o.cj_paid && <span className="ml-1 rounded-full bg-marigold-soft px-2.5 py-0.5 text-xs font-semibold">{t.status.unpaid}</span>}
            </p>
            <p className="mt-1 text-sm text-muted">
              {o.paid_at && dateFormat.format(new Date(o.paid_at))} · {formatPrice(Number(o.total_cents), o.currency, locale)}
              {o.cj_order_id && <> · {fmt(t.cjOrder, { id: o.cj_order_id })}</>}
              {o.tracking_number && <> · {o.tracking_number}</>}
            </p>
            {o.cj_attempts > 0 && o.cj_status !== "sent" && <p className="mt-1 text-xs text-muted">{fmt(t.attempts, { n: o.cj_attempts, max: MAX_CJ_ATTEMPTS })}</p>}
            {o.cj_error && <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{o.cj_error}</p>}
          </div>
          {canRetry && (
            <form action={retrySupplierOrder}>
              <input type="hidden" name="order_id" value={o.id} />
              <SubmitButton variant="secondary" pendingLabel={t.retrying}>{t.retry}</SubmitButton>
            </form>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-muted">{fmt(t.intro, { max: MAX_CJ_ATTEMPTS, email: process.env.ADMIN_ALERT_EMAIL || t.noEmail })}</p>
      </div>
      {retried && <Alert kind={retried === "sent" ? "success" : retried === "failed" ? "error" : "info"}>{t.retried[retried]}</Alert>}
      {!cjOrdersEnabled() && <Alert kind="info">{t.disabled}</Alert>}
      {cjOrdersEnabled() && !cjAutoPayEnabled() && <Alert kind="info">{t.autoPayOff}</Alert>}

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">{t.needsAttention} <span className="text-muted">({queue?.length ?? 0})</span></h2>
        {queue && queue.length > 0 ? (
          <ul className="grid gap-3">{(queue as unknown as OrderRow[]).map((o) => row(o, cjOrdersEnabled()))}</ul>
        ) : (
          <p className="text-sm text-muted">{t.none}</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">{t.recent}</h2>
        {recent && recent.length > 0 ? <ul className="grid gap-3">{(recent as unknown as OrderRow[]).map((o) => row(o, false))}</ul> : <p className="text-sm text-muted">{t.none}</p>}
      </section>
    </div>
  );
}
