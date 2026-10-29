-- =============================================================================
-- Étape C : des centaines de produits tendance, priorité aux produits populaires sur TikTok.
-- Sources CJ : zone TikTok (zonePlatform=tiktok), produits « tendance » (productFlag=0) et
-- produits les plus importés par thème. L'IA classe chaque produit (thème ou refus) et
-- donne un nom court en français et en anglais.
-- =============================================================================

alter table public.trending_products
  alter column theme drop not null,                              -- inconnu tant que l'IA ne l'a pas classé
  add column name_en       text,                                 -- nom court rédigé par l'IA
  add column name_fr       text,
  add column tiktok        boolean not null default false,       -- présent dans la zone TikTok de CJ
  add column trending      boolean not null default false,       -- marqué « tendance » par CJ (productFlag=0)
  add column classified_at timestamptz,                          -- thème confirmé (IA ou mot-clé)
  add constraint trending_products_ready_theme check (status <> 'ready' or theme is not null);

create index trending_products_discovered_idx on public.trending_products (theme, discovered_at desc);

-- Tri des produits tendance par l'IA : appel de la plateforme, sans client associé.
alter type public.ai_generation_kind add value if not exists 'classify_trends';
alter table public.ai_generations alter column user_id drop not null;

-- Dernière découverte de chaque source (un thème, ou « tiktok » = zone TikTok de CJ) :
-- la tâche planifiée en traite une par passage, la plus ancienne d'abord.
create table public.trend_sources (
  id             text primary key,
  discovered_at  timestamptz not null default now(),
  found          integer not null default 0
);

alter table public.trend_sources enable row level security; -- serveur uniquement (aucune politique)
revoke all on public.trend_sources from anon, authenticated;
