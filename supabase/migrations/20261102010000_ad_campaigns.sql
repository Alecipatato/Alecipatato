-- =============================================================================
-- Étape E-b : campagnes publicitaires lancées depuis la plateforme (Meta d'abord).
-- Le vendeur relie SON compte publicitaire : les dépenses sont facturées par Meta directement à lui.
-- Les jetons d'accès sont chiffrés (AES-GCM, clé ADS_ENCRYPTION_KEY) et jamais lisibles par les clients.
-- =============================================================================

create table public.ad_connections (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  platform          text not null check (platform in ('meta', 'tiktok')),
  access_token_enc  text not null,                    -- chiffré (src/lib/ads/crypto.ts)
  token_expires_at  timestamptz,
  ad_account_id     text,                             -- ex. « act_123 » (Meta)
  ad_account_name   text,
  ad_account_currency text,
  page_id           text,                             -- page Facebook qui publie les publicités
  page_name         text,
  connected_at      timestamptz not null default now(),
  unique (store_id, platform)
);

create table public.ad_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  platform            text not null check (platform in ('meta', 'tiktok')),
  product_id          uuid references public.products (id) on delete set null,
  -- draft : préparée ; paused : créée chez Meta en pause ; active : lancée ; failed : refusée par Meta
  status              text not null default 'draft' check (status in ('draft', 'paused', 'active', 'failed')),
  name                text not null,
  daily_budget_cents  bigint not null check (daily_budget_cents > 0),
  currency            text not null default 'CAD',
  primary_text        text not null,
  headline            text not null,
  description         text not null default '',
  link_url            text not null,
  image_url           text not null,
  external_campaign_id text,
  external_adset_id   text,
  external_creative_id text,
  external_ad_id      text,
  error               text,
  created_at          timestamptz not null default now(),
  launched_at         timestamptz,
  updated_at          timestamptz not null default now()
);

create index ad_campaigns_store_idx on public.ad_campaigns (store_id, created_at desc);

create trigger ad_campaigns_set_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

alter table public.ad_connections enable row level security; -- serveur uniquement (jetons)
alter table public.ad_campaigns enable row level security;

create policy "ad_campaigns: lecture par le propriétaire"
  on public.ad_campaigns for select to authenticated
  using (exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()));

revoke all on public.ad_connections from anon, authenticated;
revoke all on public.ad_campaigns from anon;
