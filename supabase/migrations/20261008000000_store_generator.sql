-- =============================================================================
-- Phase 2 — Générateur IA, vitrine « style Amazon »
-- =============================================================================

-- Produits : catégorie et points forts (liste à puces de la fiche produit).
alter table public.products
  add column category   text,
  add column highlights jsonb not null default '[]'::jsonb;

create index products_store_category_idx on public.products (store_id, category);

grant select (category, highlights) on public.products to anon;

-- Boutiques : le brief saisi par le client (niche, type de produits, style,
-- couleurs), réutilisé pour les régénérations.
alter table public.stores
  add column generation_brief jsonb;

-- ---------------------------------------------------------------------------
-- ai_generations : un enregistrement par appel à l'IA.
-- Sert au rate limiting (appels par heure) et au suivi des coûts (phase 12).
-- ---------------------------------------------------------------------------
create type public.ai_generation_kind as enum ('create_store', 'regenerate_store');
create type public.ai_generation_status as enum ('started', 'succeeded', 'failed');

create table public.ai_generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  store_id       uuid references public.stores (id) on delete set null,
  kind           public.ai_generation_kind not null,
  status         public.ai_generation_status not null default 'started',
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  error          text,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index ai_generations_user_created_idx on public.ai_generations (user_id, created_at desc);

alter table public.ai_generations enable row level security;

create policy "ai_generations: lecture de ses générations"
  on public.ai_generations for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.ai_generations from anon;
