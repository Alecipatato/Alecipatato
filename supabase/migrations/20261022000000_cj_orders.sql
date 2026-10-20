-- Phase 6 : transmission des commandes payées au fournisseur CJ et suivi de livraison.

alter table public.orders
  -- Téléphone demandé au paiement (exigé par les transporteurs).
  add column customer_phone        text,
  -- État de la transmission à CJ :
  --   null      : pas encore traitée
  --   sending   : en cours d'envoi (verrou contre les doubles envois)
  --   sent      : commande créée chez CJ (cj_order_id)
  --   failed    : échec, nouvel essai automatique (cj_attempts) puis alerte à l'admin
  --   skipped   : non transmise (produits d'exemple)
  add column cj_status             text check (cj_status in ('sending', 'sent', 'failed', 'skipped')),
  add column cj_error              text,
  add column cj_attempts           integer not null default 0,
  add column cj_last_attempt_at    timestamptz,
  add column cj_paid               boolean not null default false,
  add column cj_order_status       text,          -- statut brut renvoyé par CJ
  add column carrier               text,
  add column tracking_checked_at   timestamptz,
  add column shipped_at            timestamptz,
  add column delivered_at          timestamptz;

create index orders_cj_queue_idx on public.orders (status, cj_status);
