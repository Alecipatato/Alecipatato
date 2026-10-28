-- =============================================================================
-- Étape B : fiches produits complètes (« comme Amazon ») et variantes à la vente.
-- =============================================================================

alter table public.products
  -- Fiche rédigée par l'IA à partir des seules données du fournisseur (langue de la boutique).
  add column long_description   text,
  add column specs              jsonb not null default '[]'::jsonb,   -- [{ "label": "Matériau", "value": "Tissu" }]
  add column description_images jsonb not null default '[]'::jsonb,   -- photos de la description du fournisseur
  -- Variantes proposées (publiques) : [{ vid, label, priceCents, image, inStock }].
  add column variants           jsonb not null default '[]'::jsonb,
  -- Coûts par variante (PRIVÉS) : { "<vid>": { costUsdCents, shippingUsdCents, shippingMethod, daysMin, daysMax, stock } }.
  add column variant_costs      jsonb not null default '{}'::jsonb;

-- La vitrine (rôle anon) lit la fiche et les variantes, jamais les coûts.
grant select (long_description, specs, description_images, variants) on public.products to anon;

-- Libellé de la variante achetée (ex. « Vert olive · 40 cm »), conservé avec la commande.
alter table public.order_items add column variant_label text;
