import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/styles";
import { requireUser } from "@/lib/auth";
import { refreshConnectStatus } from "@/lib/payments/connect";
import { getPlatformSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/store-config";
import { isStripeConfigured } from "@/lib/stripe";
import { createUserClient } from "@/lib/supabase/server";
import { openStripeDashboard, startPayoutOnboarding } from "../payments-actions";

export const metadata: Metadata = { title: "Paiements" };

const PAYOUT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Prévu", className: "bg-marigold-soft text-ink" },
  held: { label: "Retenu (litige)", className: "bg-danger-soft text-danger" },
  paid: { label: "Versé", className: "bg-brand-soft text-brand-strong" },
  reversed: { label: "Annulé (remboursement)", className: "bg-paper text-muted border border-line" },
  failed: { label: "Échec", className: "bg-danger-soft text-danger" },
};

const dateFormat = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" });

export default async function PaymentsPage({ searchParams }: PageProps<"/tableau-de-bord/paiements">) {
  const user = await requireUser();
  const sp = await searchParams;
  const configured = isStripeConfigured();
  const supabase = await createUserClient();

  // Au retour du formulaire Stripe, on relit l'état du compte.
  let status = { accountId: null as string | null, ready: false, detailsSubmitted: false };
  if (configured) {
    const { data: profile } = await supabase.from("profiles").select("stripe_account_id, stripe_onboarding_complete").eq("id", user.id).single();
    status = { accountId: profile?.stripe_account_id ?? null, ready: Boolean(profile?.stripe_onboarding_complete), detailsSubmitted: false };
    if (status.accountId && (sp.stripe === "retour" || !status.ready)) {
      try {
        status = await refreshConnectStatus(user.id);
      } catch (err) {
        console.error("État du compte Stripe :", err);
      }
    }
  }

  const [{ data: orders }, { data: payouts }, settings] = await Promise.all([
    supabase.from("orders").select("subtotal_cents, commission_cents, refunded_cents, status").in("status", ["paid", "sent_to_supplier", "shipped", "delivered", "partially_refunded", "refunded"]),
    supabase
      .from("payouts")
      .select("id, amount_cents, reversed_cents, status, available_at, paid_at, orders(order_number), stores(name)")
      .order("available_at", { ascending: false })
      .limit(50),
    getPlatformSettings(),
  ]);

  const sum = (rows: Record<string, unknown>[] | null, key: string) => (rows ?? []).reduce((n, r) => n + Number(r[key] ?? 0), 0);
  const paidOut = (payouts ?? []).filter((p) => p.status === "paid" || p.status === "reversed").reduce((n, p) => n + Number(p.amount_cents) - Number(p.reversed_cents), 0);
  const upcoming = (payouts ?? []).filter((p) => p.status === "pending" || p.status === "held").reduce((n, p) => n + Number(p.amount_cents), 0);
  const commissionPct = `${Math.round(Number(settings.commissionRate) * 100)} %`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Paiements</h1>
        <p className="mt-1 text-muted">
          Vos clients paient sur votre boutique ; vous recevez votre part {settings.payoutReserveDays} jours après chaque vente, directement sur votre compte bancaire.
        </p>
      </div>

      {sp.stripe === "erreur" && <Alert kind="error">Stripe n&apos;a pas pu être joint. Réessayez dans un instant.</Alert>}

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">Compte de versement</h2>
        {!configured ? (
          <p className="mt-2 text-sm text-muted">Les paiements ne sont pas encore activés sur la plateforme.</p>
        ) : status.ready ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm font-medium text-brand-strong">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand" /> Versements activés : vos ventes vous sont versées automatiquement.
            </p>
            <form action={openStripeDashboard}>
              <button type="submit" className={buttonClasses.secondary}>Ouvrir mon espace Stripe</button>
            </form>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted">
              {status.accountId
                ? "Votre inscription n'est pas terminée. Stripe a encore besoin de quelques informations avant de pouvoir vous verser vos ventes."
                : "Pour accepter des paiements et recevoir l'argent de vos ventes, créez votre compte de versement sécurisé avec Stripe (environ 5 minutes : identité et compte bancaire)."}
            </p>
            <form action={startPayoutOnboarding}>
              <button type="submit" className={buttonClasses.primary}>
                {status.accountId ? "Terminer mon inscription" : "Configurer mes versements"}
              </button>
            </form>
          </div>
        )}
        {configured && !status.ready && (
          <p className="mt-4 rounded-lg bg-marigold-soft px-3 py-2 text-xs">Tant que cette étape n&apos;est pas faite, le bouton « Passer à la caisse » de vos boutiques reste désactivé.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Ventes (hors taxes)", value: sum(orders, "subtotal_cents") },
          { label: "Remboursements", value: sum(orders, "refunded_cents") },
          { label: "Déjà versé", value: paidOut },
          { label: "À venir", value: upcoming },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatPrice(tile.value, "CAD")}</p>
          </div>
        ))}
      </section>
      <p className="-mt-4 text-xs text-muted">
        Commission de la plateforme : {commissionPct} de la marge brute (prix de vente − coût fournisseur − livraison), soit {formatPrice(sum(orders, "commission_cents"), "CAD")} au total avant remboursements. « Déjà versé » et « À venir » tiennent compte des remboursements.
      </p>

      <section className="rounded-2xl border border-line bg-white">
        <h2 className="px-6 pt-6 font-display text-xl font-bold">Versements</h2>
        {payouts && payouts.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-y border-line bg-paper text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Commande</th>
                  <th className="px-6 py-3 font-medium">Boutique</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Statut</th>
                  <th className="px-6 py-3 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payouts.map((p) => {
                  const st = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.pending;
                  const date = p.paid_at ?? p.available_at;
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-medium">n° {(p.orders as unknown as { order_number: string } | null)?.order_number}</td>
                      <td className="px-6 py-3 text-muted">{(p.stores as unknown as { name: string } | null)?.name}</td>
                      <td className="px-6 py-3 text-muted">{dateFormat.format(new Date(date))}</td>
                      <td className="px-6 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span></td>
                      <td className="px-6 py-3 text-right font-semibold tabular-nums">{formatPrice(Number(p.amount_cents) - Number(p.reversed_cents), "CAD")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 pb-6 pt-2 text-sm text-muted">Aucun versement pour l&apos;instant. Ils apparaîtront ici après vos premières ventes.</p>
        )}
      </section>
    </div>
  );
}
