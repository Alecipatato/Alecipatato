-- =============================================================================
-- Produits tendance (« produits gagnants ») : catalogue partagé, rafraîchi par
-- la tâche planifiée /api/cron/trends à partir du catalogue CJ.
-- Sans clé CJ, la plateforme utilise des produits d'exemple (src/lib/trends/samples.ts).
-- =============================================================================

create table public.trending_products (
  id                       uuid primary key default gen_random_uuid(),
  theme                    text not null,                 -- id de TREND_THEMES (src/lib/trends/themes.ts)
  supplier_product_id      text not null unique,          -- pid CJ
  supplier_variant_id      text,                          -- variante la moins chère (après vérification)
  name                     text not null,                 -- nom du fournisseur (anglais)
  description              text,
  category                 text,
  images                   jsonb not null default '[]'::jsonb,
  supplier_cost_usd_cents  bigint not null check (supplier_cost_usd_cents >= 0),
  shipping_cost_usd_cents  bigint check (shipping_cost_usd_cents is null or shipping_cost_usd_cents >= 0),
  delivery_days_min        integer,
  delivery_days_max        integer,
  shipping_method          text,
  listed_count             integer not null default 0,    -- boutiques qui vendent le produit chez CJ (listedNum)
  sales_count              integer not null default 0,    -- unités vendues sur la plateforme (30 derniers jours)
  demand_score             integer not null default 0 check (demand_score between 0 and 100),
  -- pending : trouvé, pas encore vérifié ; ready : affiché ; rejected : livraison trop lente, retiré, modération…
  status                   text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  reject_reason            text,
  discovered_at            timestamptz not null default now(),
  checked_at               timestamptz,
  updated_at               timestamptz not null default now()
);

create index trending_products_ready_idx on public.trending_products (status, theme, demand_score desc);

create trigger trending_products_set_updated_at
  before update on public.trending_products
  for each row execute function public.set_updated_at();

alter table public.trending_products enable row level security;

-- Les clients connectés consultent les produits prêts (coûts fournisseur inclus : ils servent à choisir).
create policy "trending_products: lecture des produits prêts"
  on public.trending_products for select to authenticated
  using (status = 'ready' or public.is_admin());

revoke all on public.trending_products from anon;

-- Produits choisis par le client lui-même : ajoutés directement en vente (pas d'étape de validation).
alter table public.sourcing_jobs add column auto_accept boolean not null default false;
