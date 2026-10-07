-- =============================================================================
-- Phase 1 — Schéma initial
--
-- Conventions :
--   * Montants en CENTS (bigint) + code devise ISO (CAD, USD). Jamais de float.
--   * Les commandes figent leurs calculs (taux de change, commission, etc.)
--     au moment de la vente : un changement de réglage n'altère pas le passé.
--   * Sécurité (RLS) : les clients LISENT leurs propres données directement ;
--     toutes les ÉCRITURES passent par le serveur (clé secrète Supabase), qui
--     applique les règles métier. Le public (anon) ne voit que les boutiques
--     actives et des colonnes sans données sensibles (pas de coûts fournisseur).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'admin');
create type public.store_status as enum ('draft', 'active', 'suspended');
create type public.product_status as enum ('proposed', 'active', 'rejected');
create type public.order_status as enum (
  'pending',            -- créée, paiement non confirmé
  'paid',               -- paiement confirmé
  'sent_to_supplier',   -- transmise à CJ
  'shipped',
  'delivered',
  'partially_refunded',
  'refunded',
  'cancelled',
  'failed'              -- échec (ex. commande CJ refusée)
);
create type public.payout_status as enum ('pending', 'paid', 'failed', 'reversed');
create type public.refund_type as enum ('refund', 'chargeback');
create type public.refund_status as enum (
  'pending',    -- remboursement en cours / litige ouvert
  'succeeded',  -- remboursement effectué
  'failed',
  'won',        -- litige gagné
  'lost'        -- litige perdu
);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles : complète auth.users (géré par Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  email                       text not null,
  full_name                   text,
  role                        public.user_role not null default 'client',
  plan                        text not null default 'free',
  stripe_account_id           text unique,
  stripe_onboarding_complete  boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crée automatiquement le profil à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vrai si l'utilisateur connecté est administrateur.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- stores : une ligne par boutique
-- ---------------------------------------------------------------------------
create table public.stores (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  -- Sous-domaine : lettres minuscules, chiffres, tirets (format DNS).
  subdomain           text not null unique
                        check (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  custom_domain       text unique
                        check (custom_domain is null or custom_domain = lower(custom_domain)),
  name                text not null,
  niche_description   text,
  theme               text not null default 'minimal',
  -- Données générées par l'IA : couleurs, polices, textes, sections.
  config              jsonb not null default '{}'::jsonb,
  status              public.store_status not null default 'draft',
  suspension_reason   text,
  suspended_at        timestamptz,
  contact_email       text,
  currency            char(3) not null default 'CAD',
  regeneration_count  integer not null default 0 check (regeneration_count >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index stores_owner_id_idx on public.stores (owner_id);

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- products : produits d'une boutique (importés de CJ)
-- ---------------------------------------------------------------------------
create table public.products (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.stores (id) on delete cascade,
  supplier                 text not null default 'cj',
  supplier_product_id      text not null,
  supplier_variant_id      text,
  title                    text not null,
  description              text,
  images                   jsonb not null default '[]'::jsonb,  -- URL du fournisseur uniquement
  price_cents              bigint not null check (price_cents >= 0),              -- prix de vente (devise de la boutique)
  supplier_cost_usd_cents  bigint not null default 0 check (supplier_cost_usd_cents >= 0),
  shipping_cost_usd_cents  bigint not null default 0 check (shipping_cost_usd_cents >= 0),
  stock                    integer check (stock is null or stock >= 0),
  status                   public.product_status not null default 'proposed',
  position                 integer not null default 0,
  last_synced_at           timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique nulls not distinct (store_id, supplier, supplier_product_id, supplier_variant_id)
);

create index products_store_status_idx on public.products (store_id, status, position);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders : commandes (avec photo figée des calculs financiers)
-- ---------------------------------------------------------------------------
create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  store_id                    uuid not null references public.stores (id) on delete restrict,
  order_number                text not null,
  customer_email              text not null,
  customer_name               text,
  shipping_address            jsonb,
  status                      public.order_status not null default 'pending',
  currency                    char(3) not null default 'CAD',

  -- Ce que l'acheteur paie
  subtotal_cents              bigint not null default 0,
  shipping_cents              bigint not null default 0,
  tax_cents                   bigint not null default 0,
  total_cents                 bigint not null default 0,

  -- Coûts fournisseur, convertis dans la devise de la commande
  supplier_cost_cents         bigint not null default 0,
  supplier_shipping_cents     bigint not null default 0,
  fx_rate_usd_cad             numeric(12, 6),   -- 1 USD = x CAD au moment de la vente

  -- Partage : marge brute = prix de vente − coût fournisseur − livraison
  gross_margin_cents          bigint not null default 0,
  commission_rate             numeric(5, 4) not null default 0.15,
  commission_cents            bigint not null default 0,
  store_payout_cents          bigint not null default 0,

  -- Références externes
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text unique,
  cj_order_id                 text,
  tracking_number             text,
  tracking_url                text,

  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (store_id, order_number)
);

create index orders_store_created_idx on public.orders (store_id, created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items : lignes d'une commande
-- ---------------------------------------------------------------------------
create table public.order_items (
  id                            uuid primary key default gen_random_uuid(),
  order_id                      uuid not null references public.orders (id) on delete cascade,
  product_id                    uuid references public.products (id) on delete set null,
  title                         text not null,   -- titre au moment de l'achat
  supplier_product_id           text,
  supplier_variant_id           text,
  quantity                      integer not null check (quantity > 0),
  unit_price_cents              bigint not null check (unit_price_cents >= 0),
  unit_supplier_cost_usd_cents  bigint not null default 0,
  created_at                    timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- payouts : transferts vers le compte Stripe Connect du client
-- ---------------------------------------------------------------------------
create table public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete restrict,
  order_id            uuid not null unique references public.orders (id) on delete restrict,
  amount_cents        bigint not null check (amount_cents >= 0),
  currency            char(3) not null default 'CAD',
  available_at        timestamptz not null,   -- paid_at + réserve (7 jours par défaut)
  status              public.payout_status not null default 'pending',
  stripe_transfer_id  text unique,
  failure_reason      text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payouts_store_id_idx on public.payouts (store_id);
create index payouts_due_idx on public.payouts (status, available_at);

create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- refunds : remboursements et rétrofacturations
-- ---------------------------------------------------------------------------
create table public.refunds (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete restrict,
  type                  public.refund_type not null,
  amount_cents          bigint not null check (amount_cents > 0),
  currency              char(3) not null default 'CAD',
  reason                text,
  status                public.refund_status not null default 'pending',
  -- Répartition appliquée (copie des règles de platform_settings au moment du traitement)
  commission_refunded   boolean not null default false,
  store_debit_cents     bigint not null default 0,
  platform_debit_cents  bigint not null default 0,
  stripe_refund_id      text unique,
  stripe_dispute_id     text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index refunds_order_id_idx on public.refunds (order_id);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- platform_settings : réglages modifiables sans toucher au code
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now()
);

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (key, value, description) values
  ('commission_rate', '0.15',
   'Part de la marge brute prélevée par la plateforme (0.15 = 15 %).'),
  ('payout_reserve_days', '7',
   'Nombre de jours entre le paiement et le transfert au client.'),
  ('min_margin_percent', '40',
   'Marge minimale visée pour le prix de vente suggéré.'),
  ('refund_rules',
   '{
      "refund":     { "store_share_percent": 100, "commission_refunded": true },
      "chargeback": { "store_share_percent": 100, "commission_refunded": false, "dispute_fee_paid_by": "store" }
    }',
   'Qui paie les remboursements / rétrofacturations (store_share_percent = part assumée par le client, le reste par la plateforme) et si la commission est rendue.'),
  ('free_plan_limits',
   '{ "max_stores": 1, "max_regenerations_per_store": 3 }',
   'Limites des comptes gratuits.'),
  ('ai_rate_limit',
   '{ "max_requests_per_hour": 10 }',
   'Nombre maximal d''appels à l''IA par utilisateur et par heure.');

-- =============================================================================
-- Sécurité : Row Level Security
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.stores            enable row level security;
alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.payouts           enable row level security;
alter table public.refunds           enable row level security;
alter table public.platform_settings enable row level security;

-- Aucune politique INSERT/UPDATE/DELETE : seules les requêtes serveur
-- (clé secrète, qui contourne RLS) peuvent écrire.

-- profiles
create policy "profiles: lecture de son profil"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- stores
create policy "stores: lecture publique des boutiques actives"
  on public.stores for select to anon
  using (status = 'active');

create policy "stores: lecture de ses boutiques"
  on public.stores for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

-- products
create policy "products: lecture publique des produits actifs"
  on public.products for select to anon
  using (
    status = 'active'
    and exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.status = 'active'
    )
  );

create policy "products: lecture des produits de ses boutiques"
  on public.products for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.owner_id = (select auth.uid())
    )
  );

-- orders
create policy "orders: lecture des commandes de ses boutiques"
  on public.orders for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.stores s
      where s.id = orders.store_id and s.owner_id = (select auth.uid())
    )
  );

-- order_items
create policy "order_items: lecture des lignes de ses commandes"
  on public.order_items for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      join public.stores s on s.id = o.store_id
      where o.id = order_items.order_id and s.owner_id = (select auth.uid())
    )
  );

-- payouts
create policy "payouts: lecture des versements de ses boutiques"
  on public.payouts for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.stores s
      where s.id = payouts.store_id and s.owner_id = (select auth.uid())
    )
  );

-- refunds
create policy "refunds: lecture des remboursements de ses commandes"
  on public.refunds for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      join public.stores s on s.id = o.store_id
      where o.id = refunds.order_id and s.owner_id = (select auth.uid())
    )
  );

-- platform_settings : administrateurs seulement
create policy "platform_settings: lecture admin"
  on public.platform_settings for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Le public (anon) ne voit que des colonnes non sensibles.
-- (Supabase accorde par défaut tous les droits ; on les restreint ici.)
-- ---------------------------------------------------------------------------
revoke all on public.stores from anon;
grant select (id, subdomain, custom_domain, name, theme, config, status, contact_email, currency)
  on public.stores to anon;

revoke all on public.products from anon;
grant select (id, store_id, title, description, images, price_cents, stock, status, position)
  on public.products to anon;

revoke all on public.profiles, public.orders, public.order_items,
              public.payouts, public.refunds, public.platform_settings
  from anon;
