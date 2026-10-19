-- =============================================================================
-- Phase 3 — Produits du fournisseur CJ Dropshipping
-- =============================================================================

-- ---------------------------------------------------------------------------
-- integration_tokens : jetons d'accès aux API externes (CJ). Le jeton CJ dure
-- 15 jours et sa création est limitée : il faut le mémoriser.
-- ---------------------------------------------------------------------------
create table public.integration_tokens (
  provider            text primary key,
  access_token        text not null,
  access_expires_at   timestamptz not null,
  refresh_token       text,
  refresh_expires_at  timestamptz,
  updated_at          timestamptz not null default now()
);

alter table public.integration_tokens enable row level security;
revoke all on public.integration_tokens from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Produits : livraison, prix suggéré et état de la synchronisation quotidienne.
-- ---------------------------------------------------------------------------
alter table public.products
  add column delivery_days_min     integer check (delivery_days_min is null or delivery_days_min >= 0),
  add column delivery_days_max     integer check (delivery_days_max is null or delivery_days_max >= 0),
  add column shipping_method       text,
  add column suggested_price_cents bigint check (suggested_price_cents is null or suggested_price_cents >= 0),
  add column sync_status           text not null default 'ok'
                                     check (sync_status in ('ok', 'price_raised', 'out_of_stock', 'unavailable')),
  add column sync_note             text;

grant select (delivery_days_min, delivery_days_max) on public.products to anon;

-- ---------------------------------------------------------------------------
-- sourcing_jobs : recherche de produits pour une boutique, découpée en petites
-- étapes (recherche dans le catalogue → sélection par l'IA → traitement par lots)
-- pour que chaque requête reste courte.
-- ---------------------------------------------------------------------------
create type public.sourcing_status as enum ('searching', 'selecting', 'processing', 'done', 'failed');

create table public.sourcing_jobs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  status      public.sourcing_status not null default 'searching',
  keywords    jsonb not null default '[]'::jsonb,   -- mots-clés de recherche (anglais : catalogue CJ)
  candidates  jsonb not null default '[]'::jsonb,   -- produits trouvés dans le catalogue
  picks       jsonb not null default '[]'::jsonb,   -- choix de l'IA, dans l'ordre (les suivants servent de remplaçants)
  cursor      integer not null default 0,           -- prochain choix à traiter
  target      integer not null default 18,          -- nombre de produits à proposer
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index sourcing_jobs_store_idx on public.sourcing_jobs (store_id, created_at desc);

create trigger sourcing_jobs_set_updated_at
  before update on public.sourcing_jobs
  for each row execute function public.set_updated_at();

alter table public.sourcing_jobs enable row level security;

create policy "sourcing_jobs: lecture de ses recherches"
  on public.sourcing_jobs for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.stores s where s.id = sourcing_jobs.store_id and s.owner_id = (select auth.uid()))
  );

revoke all on public.sourcing_jobs from anon;

-- Journal des appels IA : sélection et rédaction des produits (suivi des coûts).
alter type public.ai_generation_kind add value if not exists 'select_products';
alter type public.ai_generation_kind add value if not exists 'rewrite_products';
