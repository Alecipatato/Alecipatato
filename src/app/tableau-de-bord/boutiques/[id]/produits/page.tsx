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
import { formatPrice } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { acceptAllProducts, acceptProduct, unpublishProduct } from "../../../products-actions";
import { setStoreOnline } from "../../../actions";
import { NewSearchForm, PriceForm, RejectForm, SourcingRunner } from "./client";

export const metadata: Metadata = { title: "Produits" };

const RESULTS: Record<string, { kind: "success" | "info" | "error"; text: string }> = {
  remplace: { kind: "success", text: "Produit remplacé : le nouveau produit vous attend dans « À valider »." },
  refuse: { kind: "info", text: "Produit refusé." },
  "plus-de-remplacant": { kind: "info", text: "Produit refusé. Plus de remplaçant disponible : lancez une nouvelle recherche en bas de page." },
  "echec-remplacement": { kind: "error", text: "Produit refusé, mais le fournisseur n'a pas répondu pour le remplacement. Réessayez plus tard." },
};

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
      .select("id, title, category, images, status, supplier, price_cents, supplier_cost_usd_cents, shipping_cost_usd_cents, delivery_days_min, delivery_days_max, stock, sync_status, sync_note")
      .eq("store_id", store.id)
      .order("position"),
    supabase.from("sourcing_jobs").select("id, status, target, error, keywords, picks, cursor").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getPlatformSettings(),
  ]);
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
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
            <div className="grid h-full place-items-center text-xs text-muted">Exemple</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{p.title}</p>
              <p className="text-xs text-muted">{p.category}{p.supplier === "sample" && " · produit d'exemple"}</p>
            </div>
            <p className="text-lg font-semibold tabular-nums">{formatPrice(Number(p.price_cents), "CAD")}</p>
          </div>
          {p.supplier === "cj" && (
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <div><dt className="inline">Coût total : </dt><dd className="inline tabular-nums text-ink">{formatPrice(costCad, "CAD")}</dd></div>
              <div><dt className="inline">Marge : </dt><dd className={`inline font-semibold tabular-nums ${margin >= minMarginPct ? "text-brand-strong" : "text-danger"}`}>{margin.toFixed(0)} %</dd></div>
              {p.delivery_days_max && <div><dt className="inline">Livraison : </dt><dd className="inline text-ink">{p.delivery_days_min}–{p.delivery_days_max} jours</dd></div>}
              {p.stock !== null && <div><dt className="inline">Stock : </dt><dd className="inline text-ink">{p.stock}</dd></div>}
            </dl>
          )}
          {p.sync_note && <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${p.sync_status === "unavailable" ? "bg-danger-soft text-danger" : "bg-marigold-soft"}`}>{p.sync_note}</p>}
          {!suspended && (
            <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
              {p.status === "proposed" && (
                <form action={acceptProduct}>
                  <input type="hidden" name="product_id" value={p.id} />
                  <button type="submit" className={`${buttonClasses.primary} px-3 py-1.5 text-xs`}>Accepter</button>
                </form>
              )}
              {p.status === "active" && (
                <form action={unpublishProduct}>
                  <input type="hidden" name="product_id" value={p.id} />
                  <button type="submit" className={`${buttonClasses.secondary} px-3 py-1.5 text-xs`}>Retirer de la vente</button>
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
            <h1 className="font-display text-4xl font-bold tracking-tight">Produits</h1>
            <p className="mt-1 max-w-2xl text-muted">
              L&apos;IA a sélectionné ces produits chez notre fournisseur. Acceptez ceux que vous voulez vendre, remplacez les autres.
              Les prix suggérés gardent au moins {minMarginPct} % de marge ; vous pouvez les modifier.
            </p>
          </div>
          {store.status === "draft" && active.length > 0 && !suspended && (
            <form action={setStoreOnline}>
              <input type="hidden" name="store_id" value={store.id} />
              <input type="hidden" name="online" value="1" />
              <button type="submit" className={buttonClasses.primary}>Mettre ma boutique en ligne</button>
            </form>
          )}
        </div>
      </div>

      {typeof sp.resultat === "string" && RESULTS[sp.resultat] && <Alert kind={RESULTS[sp.resultat].kind}>{RESULTS[sp.resultat].text}</Alert>}
      {sp.nouvelle && <Alert kind="success">Votre boutique est créée ! L&apos;IA cherche maintenant les produits chez notre fournisseur.</Alert>}
      {!isCjConfigured() && <Alert kind="info">Le fournisseur n&apos;est pas encore connecté : les produits affichés sont des exemples générés par l&apos;IA.</Alert>}
      {store.status === "draft" && !suspended && <Alert kind="info">Votre boutique est hors ligne. Acceptez des produits, puis mettez-la en ligne.</Alert>}

      {jobState && <SourcingRunner key={jobState.id} storeId={store.id} initial={jobState} />}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">À valider <span className="text-muted">({proposed.length})</span></h2>
          {proposed.length > 1 && !suspended && (
            <form action={acceptAllProducts}>
              <input type="hidden" name="store_id" value={store.id} />
              <button type="submit" className={buttonClasses.secondary}>Tout accepter</button>
            </form>
          )}
        </div>
        {proposed.length > 0 ? <ul className="grid gap-3">{proposed.map(card)}</ul> : <p className="text-sm text-muted">Aucun produit en attente.</p>}
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">En vente <span className="text-muted">({active.length})</span></h2>
        {active.length > 0 ? <ul className="grid gap-3">{active.map(card)}</ul> : <p className="text-sm text-muted">Aucun produit en vente pour l&apos;instant.</p>}
      </section>

      {rejected.length > 0 && (
        <details>
          <summary className="cursor-pointer font-display text-xl font-bold">Refusés ou retirés <span className="text-muted">({rejected.length})</span></summary>
          <ul className="mt-4 grid gap-3 opacity-70">{rejected.map(card)}</ul>
        </details>
      )}

      {isCjConfigured() && !suspended && (!job || job.status === "done" || job.status === "failed") && (
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl font-bold">Chercher d&apos;autres produits</h2>
          <div className="mt-4 max-w-xl">
            <NewSearchForm storeId={store.id} defaultKeywords={((job?.keywords as string[] | undefined) ?? []).join(", ")} />
          </div>
        </section>
      )}
    </div>
  );
}
