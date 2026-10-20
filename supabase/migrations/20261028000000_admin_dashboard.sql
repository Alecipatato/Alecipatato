-- Phase 12 : tableau de bord admin.
-- Tarifs de l'IA (en cents US par million de jetons), pour estimer les coûts journalisés dans ai_generations.
insert into public.platform_settings (key, value, description) values
  ('ai_pricing',
   '{"claude-opus-5-5": {"input_cents_per_mtok": 400, "output_cents_per_mtok": 2000}}',
   'Tarifs Anthropic par modèle, en cents US par million de jetons (entrée / sortie). Claude Opus 5.5 : 4 $ / 20 $.')
on conflict (key) do nothing;
