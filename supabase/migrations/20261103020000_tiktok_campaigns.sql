-- =============================================================================
-- Campagnes TikTok lancées depuis la plateforme (API « Upgraded Smart+ », Spark Ads).
-- ad_connections (platform = 'tiktok') : ad_account_* = compte annonceur, page_* = compte TikTok (identité TT_USER)
-- qui publie les vidéos. ad_campaigns : external_adset_id = groupe d'annonces, external_creative_id = bouton
-- d'action dynamique (portefeuille CTA), tiktok_item_id = vidéo mise en avant.
-- =============================================================================

alter table public.ad_campaigns add column tiktok_item_id text;
