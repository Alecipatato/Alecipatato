-- Phase 9 : statistiques de visites par boutique (agrégées par jour, sans identifier les visiteurs).

create table public.store_daily_stats (
  store_id    uuid not null references public.stores (id) on delete cascade,
  day         date not null,
  visitors    integer not null default 0,   -- sessions de navigation (premier affichage de la session)
  page_views  integer not null default 0,
  primary key (store_id, day)
);

alter table public.store_daily_stats enable row level security;
create policy store_daily_stats_owner_read on public.store_daily_stats for select to authenticated
  using (exists (select 1 from public.stores s where s.id = store_id and (s.owner_id = (select auth.uid()) or public.is_admin())));

-- Compteur atomique, appelé uniquement par le serveur (clé secrète).
create or replace function public.record_store_visit(p_store_id uuid, p_new_visitor boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.store_daily_stats (store_id, day, visitors, page_views)
  values (p_store_id, (now() at time zone 'utc')::date, case when p_new_visitor then 1 else 0 end, 1)
  on conflict (store_id, day) do update
    set visitors = public.store_daily_stats.visitors + excluded.visitors,
        page_views = public.store_daily_stats.page_views + 1;
$$;
revoke execute on function public.record_store_visit(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_store_visit(uuid, boolean) to service_role;
