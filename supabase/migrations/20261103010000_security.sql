-- =============================================================================
-- Étape F2 : sécurité de l'argent.
--  * Journal des actions des administrateurs (qui a fait quoi, quand).
--  * Plafonds de versements : un versement trop gros, ou au-delà du plafond quotidien, est RETENU
--    jusqu'à l'approbation d'un administrateur (alerte courriel).
-- Rappel : aucun argent n'est stocké sur le site ; Stripe garde l'argent et les cartes, le site ne garde que des montants.
-- =============================================================================

create table public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles (id) on delete set null,
  action       text not null,              -- ex. « store.suspend », « commission.tiers », « payout.approve »
  target_type  text,
  target_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security; -- serveur uniquement
revoke all on public.admin_audit_log from anon, authenticated;

-- Versements retenus : « dispute » (litige) ou « limit » (plafond dépassé, approbation requise).
alter table public.payouts
  add column hold_reason  text check (hold_reason is null or hold_reason in ('dispute', 'limit')),
  add column approved_by  uuid references public.profiles (id) on delete set null,
  add column approved_at  timestamptz;

update public.payouts set hold_reason = 'dispute' where status = 'held' and hold_reason is null;

insert into public.platform_settings (key, value, description) values
  ('payout_limits', '{"max_single_cents": 200000, "max_daily_cents": 1000000}',
   'Plafonds de versements : au-delà (par versement ou au total sur 24 h), le versement attend l''approbation d''un administrateur.')
on conflict (key) do nothing;
