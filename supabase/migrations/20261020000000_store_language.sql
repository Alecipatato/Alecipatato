-- Langue de la boutique : vitrine, fiches produits et courriels aux acheteurs.
-- Les boutiques existantes ont été rédigées en français ; les nouvelles sont en anglais par défaut.
alter table public.stores
  add column language text not null default 'fr' check (language in ('en', 'fr'));
alter table public.stores alter column language set default 'en';

-- La vitrine (rôle anon) a besoin de lire la langue.
grant select (language) on public.stores to anon;
