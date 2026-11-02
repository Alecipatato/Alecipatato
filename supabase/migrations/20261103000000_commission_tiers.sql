-- =============================================================================
-- Étape F1 : commission dégressive. Le taux dépend de la marge brute des 30 derniers jours
-- de chaque vendeur (toutes ses boutiques), calculée au moment du paiement et figée sur la commande.
-- Paliers choisis par le propriétaire le 2026-11-03 (« Généreux ») ; modifiables dans /admin/commission.
-- =============================================================================

insert into public.platform_settings (key, value, description) values
  ('commission_tiers',
   '[{"from_margin_cents": 0, "rate": "0.15"},
     {"from_margin_cents": 100000, "rate": "0.12"},
     {"from_margin_cents": 500000, "rate": "0.10"},
     {"from_margin_cents": 2000000, "rate": "0.08"}]',
   'Commission dégressive : à partir de cette marge brute des 30 derniers jours (en cents), ce taux s''applique.')
on conflict (key) do nothing;

-- Calcul rapide de la marge des 30 derniers jours d'un vendeur.
create index if not exists orders_paid_at_idx on public.orders (store_id, paid_at);
