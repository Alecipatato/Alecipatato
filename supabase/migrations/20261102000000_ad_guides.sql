-- =============================================================================
-- Étape E-a : guides publicitaires. Étapes cochées par le vendeur, par boutique.
-- (Les étapes vérifiées automatiquement — pixels, produits, pages légales… — ne sont pas stockées.)
-- =============================================================================

create table public.ad_guide_progress (
  store_id  uuid not null references public.stores (id) on delete cascade,
  step_key  text not null check (step_key ~ '^[a-z]+\.[a-zA-Z]+$'),   -- « guide.étape », ex. « meta.campaign »
  done_at   timestamptz not null default now(),
  primary key (store_id, step_key)
);

alter table public.ad_guide_progress enable row level security;

-- Le vendeur lit la progression de ses boutiques ; les écritures passent par le serveur.
create policy "ad_guide_progress: lecture par le propriétaire"
  on public.ad_guide_progress for select to authenticated
  using (exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()));

revoke all on public.ad_guide_progress from anon;
