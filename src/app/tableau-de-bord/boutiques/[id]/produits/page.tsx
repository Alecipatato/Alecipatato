import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses } from "@/components/styles";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isCjConfigured } from "@/lib/cj/client";
import { getUsdCadRate } from "@/lib/fx";
import { marginBasisPoints, usdToCadCents } from "@/lib/money";
import type { SourcingState } from "@/lib/products/sourcing";
import { getPlatformSettings } from "@/lib/settings";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { describeViolation } from "@/lib/moderation/rules";
import { formatPrice } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { acceptAllProducts, acceptProduct, unpublishProduct } from "../../../products-actions";
import { setStoreOnline } from "../../../actions";
import { NewSearchForm, PriceForm, RejectForm, SourcingRunner } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).sales.products.metaTitle };
}

const RESULT_KINDS = { remplace: "success", refuse: "info", "plus-de-remplacant": "info", "echec-remplacement": "error" } as const;
type ResultKey = keyof typeof RESULT_KINDS;

type ProductRow = {
  id: string;
  title: string;
  category: string | null;
  images: unknown;
  status: string;
  supplier: string;
  price_cents: number;
  supplier_cost_usd_cents: number;
  shipping_cost_usd_cents: number;
  delivery_days_min: number | null;
  delivery_days_max: number | null;
  stock: number | null;
  sync_status: string;
  sync_note: string | null;
  moderation_reason: string | null;
};

export default async function ProductsPage({ params, searchParams }: PageProps<"/tableau-de-bord/boutiques/[id]/produits">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createUserClient();

  const { data: store } = await supabase.from("stores").select("id, name, status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store) notFound();

  const [{ data: products }, { data: job }, settings] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, category, images, status, supplier, price_cents, supplier_cost_usd_cents, shipping_cost_usd_cents, delivery_days_min, delivery_days_max, stock, sync_status, sync_note, moderation_reason")
      .eq("store_id", store.id)
      .order("position"),
    supabase.from("sourcing_jobs").select("id, status, target, error, keywords, picks, cursor, auto_accept").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getPlatformSettings(),
  ]);
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.sales.products;
  const price = (cents: number) => formatPrice(cents, "CAD", locale);
  const result = typeof sp.resultat === "string" && sp.resultat in RESULT_KINDS ? (sp.resultat as ResultKey) : null;
  const rows = (products ?? []) as ProductRow[];
  const proposed = rows.filter((p) => p.status === "proposed");
  const active = rows.filter((p) => p.status === "active");
  const rejected = rows.filter((p) => p.status === "rejected");
  const supplierCount = rows.filter((p) => p.supplier === "cj" && p.status !== "rejected").length;
  const hasReplacements = Boolean(job && (job.picks as string[]).length > job.cursor);
  const suspended = store.status === "suspended";
  const minMarginPct = Math.round(Number(settings.minMarginRate) * 100);

  const jobState: SourcingState | null = job
    ? { id: job.id, status: job.status, proposed: supplierCount, target: job.target, error: job.error }
    : null;

  const card = (p: ProductRow) => {
    const image = Array.isArray(p.images) ? (p.images.find((i) => typeof i === "string") as string | undefined) : undefined;
    const costCad = usdToCadCents(Number(p.supplier_cost_usd_cents) + Number(p.shipping_cost_usd_cents), fx.rate);
    const margin = marginBasisPoints(Number(p.price_cents), costCad) / 100;
    return (
      <li key={p.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 sm:flex-row">
        <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-paper sm:w-32">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- image du fournisseur
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted">{t.sample}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{p.title}</p>
              <p className="text-xs text-muted">{p.category}{p.supplier === "sample" && t.sampleProduct}</p>
            </div>
            <p className="text-lg font-semibold tabular-nums">{price(Number(p.price_cents))}</p>
          </div>
          {p.supplier === "cj" && (
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <div><dt className="inline">{t.totalCost}</dt><dd className="inline tabular-nums text-ink">{price(costCad)}</dd></div>
              <div><dt className="inline">{t.margin}</dt><dd className={`inline font-semibold tabular-nums ${margin >= minMarginPct ? "text-brand-strong" : "text-danger"}`}>{margin.toFixed(0)} %</dd></div>
              {p.delivery_days_max && <div><dt className="inline">{t.delivery}</dt><dd className="inline text-ink">{fmt(t.days, { min: p.delivery_days_min ?? p.delivery_days_max, max: p.delivery_days_max })}</dd></div>}
              {p.stock !== null && <div><dt className="inline">{t.stock}</dt><dd className="inline text-ink">{p.stock}</dd></div>}
            </dl>
          )}
          {p.moderation_reason && (
            <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
              {fmt(t.moderated, { reason: describeViolation(p.moderation_reason, m) })}
            </p>
          )}
          {p.sync_status !== "ok" && p.sync_status in t.syncNotes && (
            <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${p.sync_status === "unavailable" ? "bg-danger-soft text-danger" : "bg-marigold-soft"}`}>
              {fmt(t.syncNotes[p.sync_status as keyof typeof t.syncNotes], { old: price(Number(p.sync_note) || 0), new: price(Number(p.price_cents)) })}
            </p>
          )}
          {!suspended && !p.moderation_reason && (
            <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
              {p.status === "proposed" && (
                <form action={acceptProduct}>
                  <input type="hidden" name="product_id" value={p.id} />
                  <button type="submit" className={`${buttonClasses.primary} px-3 py-1.5 text-xs`}>{t.accept}</button>
                </form>
              )}
              {p.status === "active" && (
                <form action={unpublishProduct}>
                  <input type="hidden" name="product_id" value={p.id} />
                  <button type="submit" className={`${buttonClasses.secondary} px-3 py-1.5 text-xs`}>{t.unpublish}</button>
                </form>
              )}
              {p.status !== "rejected" && <RejectForm productId={p.id} canReplace={p.supplier === "cj" && hasReplacements} />}
              {p.supplier === "cj" && p.status !== "rejected" && <PriceForm productId={p.id} priceCents={Number(p.price_cents)} />}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/tableau-de-bord/boutiques/${store.id}`} className="text-sm font-medium text-muted hover:text-ink">← {store.name}</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight">{t.title}</h1>
            <p className="mt-1 max-w-2xl text-muted">{fmt(t.intro, { pct: minMarginPct })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!suspended && (
              <Link href={`/tableau-de-bord/boutiques/${store.id}/produits/ajouter`} className={buttonClasses.secondary}>{m.trends.add.button}</Link>
            )}
            {store.status === "draft" && active.length > 0 && !suspended && (
              <form action={setStoreOnline}>
                <input type="hidden" name="store_id" value={store.id} />
                <input type="hidden" name="online" value="1" />
                <button type="submit" className={buttonClasses.primary}>{t.goOnline}</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {result && <Alert kind={RESULT_KINDS[result]}>{t.results[result]}</Alert>}
      {/* Produits choisis par le client dans les produits tendance : mis en vente sans validation. */}
      {sp.nouvelle && <Alert kind="success">{job?.auto_accept ? t.createdChosen : t.created}</Alert>}
      {/* Ajout de produits : directement en vente (produits d'exemple) ou fiches en préparation (CJ). */}
      {typeof sp.ajoutes === "string" && Number(sp.ajoutes) > 0 && (
        <Alert kind="success">{Number(sp.ajoutes) === 1 ? m.trends.add.addedOne : fmt(m.trends.add.added, { n: Number(sp.ajoutes) })}</Alert>
      )}
      {sp.ajout && <Alert kind="success">{m.trends.add.preparing}</Alert>}
      {!isCjConfigured() && <Alert kind="info">{t.noSupplier}</Alert>}
      {store.status === "draft" && !suspended && <Alert kind="info">{job?.auto_accept ? t.draftChosen : t.draft}</Alert>}

      {jobState && <SourcingRunner key={jobState.id} storeId={store.id} initial={jobState} />}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">{t.toReview} <span className="text-muted">({proposed.length})</span></h2>
          {proposed.length > 1 && !suspended && (
            <form action={acceptAllProducts}>
              <input type="hidden" name="store_id" value={store.id} />
              <button type="submit" className={buttonClasses.secondary}>{t.acceptAll}</button>
            </form>
          )}
        </div>
        {proposed.length > 0 ? <ul className="grid gap-3">{proposed.map(card)}</ul> : <p className="text-sm text-muted">{t.noneWaiting}</p>}
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">{t.forSale} <span className="text-muted">({active.length})</span></h2>
        {active.length > 0 ? <ul className="grid gap-3">{active.map(card)}</ul> : <p className="text-sm text-muted">{t.noneForSale}</p>}
      </section>

      {rejected.length > 0 && (
        <details>
          <summary className="cursor-pointer font-display text-xl font-bold">{t.rejected} <span className="text-muted">({rejected.length})</span></summary>
          <ul className="mt-4 grid gap-3 opacity-70">{rejected.map(card)}</ul>
        </details>
      )}

      {isCjConfigured() && !suspended && (!job || job.status === "done" || job.status === "failed") && (
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl font-bold">{t.searchMore}</h2>
          <div className="mt-4 max-w-xl">
            <NewSearchForm storeId={store.id} defaultKeywords={((job?.keywords as string[] | undefined) ?? []).join(", ")} />
          </div>
        </section>
      )}
    </div>
  );
}
