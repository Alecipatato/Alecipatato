-- =============================================================================
-- Étape D : données toujours à jour grâce aux notifications (webhooks) de CJ.
-- CJ prévient quand un produit ou une variante n'est plus en vente et quand un stock change
-- (environ 2 à 5 minutes après) ; le produit est alors retiré ou resynchronisé partout.
-- Les prix ne sont pas toujours notifiés : la synchronisation planifiée reste la référence.
-- =============================================================================

-- openId du compte CJ (renvoyé avec le jeton) : clé de la signature des notifications.
alter table public.integration_tokens add column open_id text;

-- Notifications reçues : une seule fois chacune (messageId), pour le suivi et l'idempotence.
create table public.cj_webhook_events (
  message_id    text primary key,
  type          text not null,
  message_type  text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  result        text
);

create index cj_webhook_events_received_idx on public.cj_webhook_events (received_at desc);

-- Produits CJ abonnés aux notifications (limite du compte : 1000 au niveau 1).
create table public.cj_subscriptions (
  supplier_product_id  text primary key,
  subscribed_at        timestamptz not null default now()
);

-- Adresse de rappel enregistrée chez CJ (une seule ligne).
create table public.cj_webhook_state (
  id             integer primary key default 1 check (id = 1),
  callback_url   text not null,
  registered_at  timestamptz not null default now()
);

alter table public.cj_webhook_events enable row level security; -- serveur uniquement (aucune politique)
alter table public.cj_subscriptions enable row level security;
alter table public.cj_webhook_state enable row level security;
revoke all on public.cj_webhook_events, public.cj_subscriptions, public.cj_webhook_state from anon, authenticated;

-- Recherche rapide des produits d'une notification (toutes les boutiques).
create index if not exists products_supplier_product_idx on public.products (supplier_product_id);
create index if not exists products_supplier_variant_idx on public.products (supplier_variant_id);
