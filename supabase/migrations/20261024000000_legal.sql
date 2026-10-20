-- Phase 8 : pages légales.

-- Informations légales de la boutique (affichées dans ses pages légales) :
-- { "legal_name", "address", "privacy_officer", "return_days" }
alter table public.stores add column legal_info jsonb not null default '{}'::jsonb;
grant select (legal_info) on public.stores to anon;

-- Identité de l'entreprise qui exploite la plateforme (conditions d'utilisation, confidentialité).
insert into public.platform_settings (key, value, description) values
  ('legal_identity',
   '{"legal_name": "", "address": "", "email": "", "privacy_officer": ""}',
   'Entreprise qui exploite la plateforme : nom légal, adresse, courriel, responsable de la protection des renseignements personnels (Loi 25).')
on conflict (key) do nothing;
