-- Phase 11 : domaines personnalisés (Cloudflare for SaaS).
-- stores.custom_domain existe depuis la phase 1 ; la boutique n'y est servie que lorsque le domaine est « active ».

alter table public.stores
  add column domain_status      text check (domain_status in ('pending', 'active', 'failed')),
  add column domain_cf_id       text,          -- identifiant du « custom hostname » chez Cloudflare
  add column domain_records     jsonb not null default '[]'::jsonb,  -- enregistrements DNS à créer chez le client
  add column domain_error       text,
  add column domain_checked_at  timestamptz;

grant select (domain_status) on public.stores to anon;
