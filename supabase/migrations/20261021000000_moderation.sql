-- Phase 4 : modération.
-- Règles modifiables depuis l'espace admin : mots-clés, marques et catégories interdits.
-- Elles s'appliquent à la description de niche, aux textes de la boutique et aux produits.

create type public.moderation_kind as enum ('brand', 'counterfeit', 'prohibited', 'category');

create table public.moderation_rules (
  id          uuid primary key default gen_random_uuid(),
  kind        public.moderation_kind not null,
  -- Mot ou expression (insensible à la casse et aux accents, mots entiers).
  -- Pour « category » : comparé au nom de catégorie du fournisseur.
  term        text not null check (char_length(trim(term)) between 2 and 80),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index moderation_rules_term_idx on public.moderation_rules (kind, lower(term));

-- Aucune lecture côté client : seul le serveur (clé secrète) y accède.
alter table public.moderation_rules enable row level security;

-- Produits bloqués par la modération : refusés et impossibles à remettre en vente.
alter table public.products add column moderation_reason text;

-- Règles de départ (à compléter dans l'espace admin).
insert into public.moderation_rules (kind, term) values
  -- Marques souvent contrefaites ou sous licence
  ('brand', 'nike'), ('brand', 'adidas'), ('brand', 'yeezy'), ('brand', 'jordan 1'), ('brand', 'supreme'),
  ('brand', 'gucci'), ('brand', 'louis vuitton'), ('brand', 'chanel'), ('brand', 'hermes'), ('brand', 'prada'),
  ('brand', 'dior'), ('brand', 'balenciaga'), ('brand', 'versace'), ('brand', 'burberry'), ('brand', 'fendi'),
  ('brand', 'rolex'), ('brand', 'cartier'), ('brand', 'omega watch'), ('brand', 'ray-ban'), ('brand', 'oakley'),
  ('brand', 'the north face'), ('brand', 'lululemon'), ('brand', 'canada goose'),
  ('brand', 'beats by dre'), ('brand', 'dyson'), ('brand', 'stanley cup'),
  ('brand', 'disney'), ('brand', 'marvel'), ('brand', 'pokemon'), ('brand', 'hello kitty'), ('brand', 'sanrio'),
  ('brand', 'lego'), ('brand', 'nintendo'), ('brand', 'playstation'), ('brand', 'barbie'), ('brand', 'star wars'),
  ('brand', 'harry potter'), ('brand', 'nfl'), ('brand', 'nba'), ('brand', 'nhl'),
  -- Contrefaçons
  ('counterfeit', 'replica'), ('counterfeit', 'counterfeit'), ('counterfeit', 'knockoff'), ('counterfeit', 'fake designer'),
  ('counterfeit', '1:1'), ('counterfeit', 'aaa quality'), ('counterfeit', 'designer inspired'), ('counterfeit', 'dupe'),
  ('counterfeit', 'contrefaçon'), ('counterfeit', 'réplique'),
  -- Catégories interdites par Stripe et par la loi
  ('prohibited', 'firearm'), ('prohibited', 'ammunition'), ('prohibited', 'ammo'),
  ('prohibited', 'silencer'), ('prohibited', 'switchblade'), ('prohibited', 'butterfly knife'), ('prohibited', 'brass knuckles'),
  ('prohibited', 'stun gun'), ('prohibited', 'taser'), ('prohibited', 'pepper spray'), ('prohibited', 'crossbow'),
  ('prohibited', 'explosive'), ('prohibited', 'fireworks'), ('prohibited', 'arme à feu'), ('prohibited', 'munitions'),
  ('prohibited', 'cannabis'), ('prohibited', 'marijuana'), ('prohibited', 'thc'), ('prohibited', 'cbd'), ('prohibited', 'kratom'),
  ('prohibited', 'vape'), ('prohibited', 'e-cigarette'), ('prohibited', 'nicotine'), ('prohibited', 'tobacco'), ('prohibited', 'hookah'),
  ('prohibited', 'tabac'), ('prohibited', 'cigarette électronique'),
  ('prohibited', 'sex toy'), ('prohibited', 'vibrator'), ('prohibited', 'dildo'), ('prohibited', 'erotic'), ('prohibited', 'adult toy'),
  ('prohibited', 'jouet sexuel'), ('prohibited', 'érotique'),
  ('prohibited', 'prescription'), ('prohibited', 'viagra'), ('prohibited', 'steroid'), ('prohibited', 'sarms'),
  ('prohibited', 'diet pill'), ('prohibited', 'weight loss pill'), ('prohibited', 'médicament'),
  ('prohibited', 'casino'), ('prohibited', 'lottery'), ('prohibited', 'gambling'),
  ('prohibited', 'spy camera'), ('prohibited', 'hidden camera'), ('prohibited', 'caméra espion'),
  ('prohibited', 'lock pick'), ('prohibited', 'fake id'), ('prohibited', 'radar jammer'), ('prohibited', 'gps jammer'),
  -- Catégories du catalogue fournisseur
  ('category', 'adult'), ('category', 'sexual wellness'), ('category', 'weapons'), ('category', 'e-cigarettes'),
  ('category', 'smoking'), ('category', 'medical');
