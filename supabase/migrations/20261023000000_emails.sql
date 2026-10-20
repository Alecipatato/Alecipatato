-- Phase 7 : courriels aux acheteurs et service client.

-- Dates d'envoi : chaque courriel n'est envoyé qu'une fois (mise à jour conditionnelle).
alter table public.orders
  add column confirmation_email_at  timestamptz,
  add column shipped_email_at       timestamptz,
  add column delivered_email_at     timestamptz;

-- Messages envoyés par les acheteurs depuis la page « Nous joindre » d'une boutique.
create table public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 100),
  email         text not null check (char_length(email) between 3 and 200),
  order_number  text check (char_length(order_number) <= 20),
  message       text not null check (char_length(message) between 10 and 3000),
  created_at    timestamptz not null default now()
);
create index contact_messages_store_idx on public.contact_messages (store_id, created_at desc);

-- Le propriétaire lit les messages de ses boutiques ; les écritures passent par le serveur.
alter table public.contact_messages enable row level security;
create policy contact_messages_owner_read on public.contact_messages for select to authenticated
  using (exists (select 1 from public.stores s where s.id = store_id and (s.owner_id = (select auth.uid()) or public.is_admin())));
