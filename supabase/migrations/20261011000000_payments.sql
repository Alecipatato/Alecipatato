-- =============================================================================
-- Phase 5 — Paiements Stripe (Connect Express, separate charges and transfers)
-- =============================================================================

-- Versement retenu pendant un litige (rétrofacturation) en cours.
alter type public.payout_status add value if not exists 'held';

-- Commandes : références Stripe et suivi des remboursements.
alter table public.orders
  add column stripe_charge_id  text,
  add column stripe_fee_cents  bigint not null default 0,   -- frais Stripe sur le paiement
  add column refunded_cents    bigint not null default 0,   -- total remboursé à l'acheteur
  add column disputed          boolean not null default false;

-- Versements : montant déjà repris au client (transfer reversal) après un versement.
alter table public.payouts
  add column reversed_cents bigint not null default 0 check (reversed_cents >= 0);

-- Remboursements : part de la commission rendue et frais de litige.
alter table public.refunds
  add column commission_refund_cents bigint not null default 0,
  add column dispute_fee_cents       bigint not null default 0;

-- ---------------------------------------------------------------------------
-- stripe_events : chaque notification Stripe n'est traitée qu'une seule fois
-- (Stripe peut envoyer la même notification plusieurs fois).
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nouveaux réglages
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('usd_cad_fallback_rate', '1.38',
   'Taux USD→CAD utilisé si le taux de la Banque du Canada est indisponible.'),
  ('stripe_fees_paid_by', '"platform"',
   'Qui paie les frais de traitement Stripe : "platform" (déduits de la commission) ou "store" (déduits de la part du client).'),
  ('dispute_fee_cents', '1500',
   'Frais facturés par Stripe pour chaque rétrofacturation, en cents CAD.')
on conflict (key) do nothing;
