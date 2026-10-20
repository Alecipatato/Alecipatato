-- Phase 10 : marketing et SEO.

-- Référencement : { "title", "description" } (vides = valeurs automatiques).
-- Pixels publicitaires : { "meta", "tiktok" } (identifiants publics, chargés seulement avec le consentement du visiteur).
alter table public.stores
  add column seo    jsonb not null default '{}'::jsonb,
  add column pixels jsonb not null default '{}'::jsonb;
grant select (seo, pixels) on public.stores to anon;

-- Textes marketing générés par l'IA (scripts TikTok, publicités, suggestion SEO).
create table public.marketing_assets (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  content     jsonb not null,
  created_at  timestamptz not null default now()
);
create index marketing_assets_store_idx on public.marketing_assets (store_id, created_at desc);
alter table public.marketing_assets enable row level security;
create policy marketing_assets_owner_read on public.marketing_assets for select to authenticated
  using (exists (select 1 from public.stores s where s.id = store_id and (s.owner_id = (select auth.uid()) or public.is_admin())));

alter type public.ai_generation_kind add value if not exists 'marketing';
