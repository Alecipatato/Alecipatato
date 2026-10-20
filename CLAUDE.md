# CLAUDE.md — Kreo (nom provisoire, `NEXT_PUBLIC_PLATFORM_NAME`)

> Document de référence du projet. À relire au début de chaque session.
> Le propriétaire n'est pas expert : expliquer brièvement chaque étape, en français.

## Concept

Plateforme SaaS où une IA crée **gratuitement** des boutiques de dropshipping pour des clients.

- Le client décrit sa niche → l'IA génère la boutique complète (nom, design, textes, produits importés d'un fournisseur).
- Les ventes passent par la plateforme, qui prélève automatiquement **15 % de la marge brute** de chaque vente.
- **Marge brute = prix de vente − coût fournisseur − livraison.**

## Architecture

- **Une seule application multi-tenant** : toutes les boutiques sont servies par la même app.
- La boutique affichée est déterminée par le **hostname** :
  - sous-domaine automatique : `nomboutique.[mondomaine].com` (DNS wildcard) ;
  - domaine personnalisé du client via **Cloudflare for SaaS** (phase 11).
- L'IA **ne génère pas de fichiers** : elle génère des **données JSON** stockées en base (nom, couleurs, polices, thème, textes, produits). Le rendu se fait à partir de ces données.
- **Thèmes** : plusieurs thèmes de base (commencer avec 2, viser 5-6) pour que les boutiques soient visuellement différentes.

## Stack

| Rôle | Outil |
|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind |
| Déploiement | Cloudflare via `@opennextjs/cloudflare` |
| Base de données + Auth | Supabase (Postgres + Auth) |
| IA | API Anthropic (Claude) |
| Paiements | Stripe Connect **Express**, mode **separate charges and transfers** |
| Taxes | Stripe Tax |
| Fournisseur | API CJ Dropshipping (catalogue, commandes, suivi) |
| Courriels | Resend |

## Flux d'argent (critique)

1. L'acheteur paie sur la boutique → l'argent arrive sur le **compte Stripe de la plateforme**.
2. La plateforme paie le fournisseur CJ depuis son **portefeuille CJ (USD)** → gérer la conversion **CAD/USD** (stocker le taux utilisé par commande).
3. La plateforme garde **15 % de la marge brute**.
4. Le reste est **transféré** au compte Stripe Connect du client après une **réserve de 7 jours**.
5. Remboursements / rétrofacturations : règles **configurables** (qui paie, la commission est-elle remboursée ?) et appliquées **automatiquement**.

Principes : montants stockés en **entiers (cents)** avec la devise ; ne jamais calculer l'argent en float.

## Règles de travail

- **Avancer par phases.** Ne jamais commencer une phase sans validation explicite du propriétaire.
- Clés API dans `.env.local`, **jamais dans le code**. Maintenir `.env.example` à jour.
- **Uniquement** les clés test Stripe et le sandbox CJ.
- **Un commit Git à la fin de chaque étape fonctionnelle.**
- **Demander avant** d'installer une dépendance importante ou de changer l'architecture.
- Expliquer brièvement ce qui est fait à chaque étape (propriétaire non expert).

## Phases

1. **Base du projet** : Next.js, Supabase, schéma BD (users, stores, products, orders, payouts, refunds), routage multi-tenant par hostname avec une boutique de démo codée à la main.
2. **Générateur IA** : formulaire « décris ta niche » → Claude → JSON de la boutique → base → boutique visible sur son sous-domaine. Limites configurables de boutiques et de régénérations par compte gratuit ; rate limiting des appels IA.
3. **Produits** : recherche catalogue CJ selon la niche, sélection IA de 15-20 produits cohérents (livrables au Canada en < 15 jours), réécriture des descriptions, prix suggéré avec **marge minimale de 40 %**, écran d'acceptation/remplacement de chaque produit. Images du fournisseur uniquement. Synchro quotidienne prix + stock.
4. **Modération** : filtrer marques connues, contrefaçons, catégories interdites par Stripe. Liste configurable de mots-clés/catégories bloqués. Suspension de boutique par l'admin.
5. **Paiements** : onboarding Stripe Connect Express, checkout, Stripe Tax, flux d'argent ci-dessus, réserve 7 jours, remboursements et rétrofacturations.
6. **Commandes** : transmission auto des commandes payées à CJ, suivi de livraison, page de suivi publique par boutique, alerte courriel à l'admin si une commande CJ échoue.
7. **Courriels et service client** : Resend (confirmation, expédition, suivi), adresse de contact par boutique.
8. **Pages légales** auto-générées par boutique : CGV, retours, livraison, confidentialité (**Loi 25 du Québec**). Pages légales de la plateforme : CGU clients (commission, responsabilités, motifs de suspension).
9. **Tableau de bord client** : ventes, commandes, marge, commissions, versements, visites, conversions.
10. **Marketing et SEO** : titres, méta-descriptions, sitemap par boutique ; pixels Meta et TikTok ; scripts vidéo TikTok et textes publicitaires générés par l'IA.
11. **Domaines personnalisés** via Cloudflare for SaaS, HTTPS automatique.
12. **Tableau de bord admin** : toutes les boutiques, revenus plateforme, coûts IA, solde portefeuille CJ, boutiques signalées.

## Notes techniques

- **Next.js 16** : le fichier `middleware.ts` s'appelle désormais `src/proxy.ts`. Consulter la doc
  embarquée dans `node_modules/next/dist/docs/` avant d'utiliser une API Next (voir `AGENTS.md`).
- `cacheComponents` est **désactivé** (`next.config.ts`) : rendu à la demande, plus simple pour le
  multi-tenant et compatible OpenNext Cloudflare. À réévaluer lors de l'optimisation.
- Les types `PageProps` / `LayoutProps` sont générés par `next build` (ou `next typegen`).
- **Routage** : `src/proxy.ts` + `src/lib/tenant.ts` → rewrite vers `/s/[site]` (`site` = sous-domaine
  ou domaine personnalisé complet). L'accès direct à `/s/...` sur le domaine principal renvoie 404.
- **Sous-domaines réservés** : `RESERVED_SUBDOMAINS` (`src/lib/tenant.ts`) + démos `demo`, `demo2`, `demo3`
  (`DEMO_SUBDOMAINS`, `src/lib/demo-stores.ts`). `allocateSubdomain` (`src/lib/subdomains.ts`) les refuse.
- **Données boutique** : `StoreConfig` (`src/lib/types.ts`), toujours lue via `parseStoreConfig`
  (`src/lib/store-config.ts`), qui remplace toute valeur invalide par un défaut. Polices limitées à
  `ALLOWED_FONTS`. Contraste texte/fond corrigé automatiquement (`ensureReadableColors`).
- **Vitrine « style Amazon »** (demande du propriétaire) : TOUTES les boutiques ont la même structure
  (`src/storefront/` + `src/app/s/[site]/` : catalogue avec recherche/catégories/tri, fiche produit,
  panier en localStorage). Le thème (`minimal`, `bold`, `elegant`) ne change que l'apparence via des
  variables CSS (`src/storefront/theme.ts`, classes `.sf*` dans `globals.css`).
- Liens internes de la vitrine : préfixe `getStoreBase()` (header `x-store-base` posé par le proxy).
- **Auth** (Supabase) : courriel + mot de passe avec confirmation, mot de passe oublié, Google OAuth.
  Actions : `src/app/(auth)/actions.ts` ; retours : `/auth/confirm` (token_hash, modèles de
  `supabase/templates/`) et `/auth/callback` (code PKCE, Google). Session rafraîchie et
  `/tableau-de-bord` protégé dans `src/lib/supabase/proxy-session.ts`.
- **Générateur IA** : `src/lib/ai/store-generator.ts` (modèle `claude-opus-5-5`, JSON strict via
  `output_config.format`, repli serveur `fallbacks: "default"`). Réponse toujours revalidée
  (`parseGeneratedStore`). Produits d'exemple `supplier = 'sample'` jusqu'à la phase 3.
  Rate limiting + journal des coûts : table `ai_generations`. Actions : `src/app/tableau-de-bord/actions.ts`.
- Classes CSS partagées dans `src/components/styles.ts` (PAS dans un fichier "use client" : une
  constante exportée d'un module client n'est pas lisible par un Server Component).
- **Tests locaux** : `npx supabase start` (Docker) + boîte courriel http://127.0.0.1:54324.
  Pour tester l'IA sans clé : un faux serveur via `ANTHROPIC_BASE_URL`.
- **Supabase** : schéma dans `supabase/migrations/`. RLS : les clients *lisent* leurs données ;
  **toutes les écritures passent par le serveur** (clé secrète). Le rôle `anon` ne voit que les
  boutiques/produits actifs et des colonnes non sensibles (jamais les coûts fournisseur).
  Clients : `src/lib/supabase/public.ts` (vitrine, anonyme) et `server.ts` (utilisateur connecté).
- Réglages modifiables sans code : table `platform_settings` (commission, réserve, règles de
  remboursement, limites du plan gratuit, rate limit IA, taux USD/CAD de secours, payeur des frais
  Stripe, frais de litige).
- **Argent** : `src/lib/money.ts` (fonctions pures, entiers uniquement, testées par `npm test`) —
  `computeOrderFinancials`, `splitMargin`, `splitRefund`. Ne jamais calculer l'argent ailleurs.
- **Paiements** (`src/lib/payments/`) : `connect.ts` (Express, capacité `transfers`), `checkout.ts`
  (commande + Checkout Session, prix relus en base, Stripe Tax, `transfer_group` = id commande),
  `events.ts` (webhook idempotent via `stripe_events` ; `finalizePaidSession` aussi appelée par la page
  /commande/merci), `payouts.ts` (transferts après réserve avec `source_transaction`, reprise via
  réduction du versement ou `transfers.createReversal`). Webhook : `/api/stripe/webhook` ;
  tâche planifiée : `/api/cron/payouts` (Bearer `CRON_SECRET`).
- Client Stripe : `src/lib/stripe.ts` (client fetch, compatible Workers ; refuse `sk_live_` sans
  `STRIPE_ALLOW_LIVE=true` ; `STRIPE_API_BASE` = simulateur local pour les tests).
- **Produits CJ** (phase 3) : adaptateur `src/lib/cj/` — `normalize.ts` (lecture TOLÉRANTE des réponses,
  testée ; seul endroit à corriger si un champ CJ diffère), `client.ts` (jeton en table
  `integration_tokens`, ~1 appel/s, nouvel essai sur code 1600200/429), `catalog.ts` (`/product/list`,
  `/product/query`, `/logistic/freightCalculate`, `/product/stock/queryByVid`). ⚠️ Écrit SANS accès à
  la doc CJ (domaine bloqué dans l'environnement) : à valider avec une vraie clé.
- **Recherche de produits** : `src/lib/products/sourcing.ts`, table `sourcing_jobs`, en petites étapes
  (searching → selecting → processing → done) appelées en boucle par l'écran Produits via
  `POST /api/sourcing/advance`. IA : `src/lib/ai/product-curator.ts` (sélection + rédaction FR, appels
  journalisés `select_products` / `rewrite_products`, hors limite horaire). Prix : `suggestRetailPriceCents`
  (≥ `min_margin_percent`, arrondi x,99). Livraison max 15 jours (`MAX_DELIVERY_DAYS`).
- **Synchro** : `src/lib/products/sync.ts` + `/api/cron/sync-products` (prix relevé si marge < min,
  rupture, produit retiré → `rejected` + `sync_status`).
- Boutique créée avec CJ : `draft` jusqu'à acceptation des produits ; sans `CJ_API_KEY` : produits
  d'exemple (`supplier = 'sample'`).
- **Modération** (phase 4) : règles en table `moderation_rules` (brand, counterfeit, prohibited, category ;
  modifiables dans `/admin/moderation`). Comparaison pure et testée : `src/lib/moderation/match.ts` (mots entiers,
  sans casse ni accents). Appliquée : niche + textes générés + personnalisation (`tableau-de-bord/actions.ts`),
  candidats CJ et fiches rédigées (`products/sourcing.ts`), produits d'exemple, nouvelle vérification
  (`moderation/rescan.ts` → `products.moderation_reason` = « kind:terme », produit refusé et non modifiable).
- **Admin** : `profiles.role = 'admin'` (`requireAdmin`, sinon 404). `/admin` : boutiques, suspension avec motif
  (hors ligne, checkout refusé, versements en attente ; réactivation → `draft`).
- **Commandes CJ** (phase 6) : `src/lib/orders/fulfillment.ts` + adaptateur `src/lib/cj/orders.ts`
  (`createOrderV2`, `payBalance`, `getOrderDetail` ; réponses lues par `normalize.ts`). Transmission juste après
  le paiement (`after()` dans `finalizePaidSession`) et par `/api/cron/orders` (nouveaux essais : 15 min, 1 h, 3 h,
  6 h ; `MAX_CJ_ATTEMPTS` = 5). Verrou `orders.cj_status = 'sending'`, `orderNumber` CJ = id de la commande.
  Activée seulement si `CJ_ORDERS_ENABLED=true` ; paiement portefeuille si `CJ_AUTO_PAY=true`. Produits
  d'exemple jamais transmis (`skipped`). Alertes admin : `src/lib/email/resend.ts` (`ADMIN_ALERT_EMAIL`). Suivi
  relu toutes les 4 h (expédiée/livrée, `tracking_url` 17track). Page publique `/suivi` (n° + courriel).
  Limites : une commande remboursée avant l'envoi n'est pas transmise ; un remboursement après l'envoi n'annule
  pas la commande chez CJ (à faire à la main). Téléphone demandé au paiement (`phone_number_collection`).
- **Courriels** (phase 7) : `src/lib/email/` — `resend.ts` (`sendEmail` : nom d'expéditeur = boutique, `reply_to` =
  contact de la boutique), `buyer-templates.ts` (confirmation / expédition / livraison, langue et couleur de la
  boutique), `order-emails.ts` (envoi unique grâce à `orders.*_email_at`, rattrapage dans `/api/cron/orders`,
  avis de vente au propriétaire). Déclenchés par `finalizePaidSession` (`after()`) et `syncTracking`.
  Page `/contact` par boutique → table `contact_messages` + courriel au propriétaire (5 messages/h/adresse,
  champ piège) ; lecture dans `/tableau-de-bord/boutiques/[id]/messages`.
- **Langues (EN/FR)** : `src/lib/i18n/`. Anglais par défaut. Plateforme : cookie `lang` (sélecteur) > région
  (`cf-ipcountry` + `cf-region-code` : Québec et pays francophones → fr) > navigateur > anglais. Textes dans
  `messages/*.ts` (anglais et français côte à côte, clés vérifiées par TypeScript) ; serveur : `getMessages()`,
  client : `useI18n()` ; valeurs `{x}` via `fmt`, gras/liens via `rich`. **Vitrine = langue de la boutique**
  (`stores.language`, en-tête interne `x-store-site` posé par le proxy). Les erreurs des modules (`StoreGenerationError`,
  `CheckoutError`, recherche CJ) sont des **codes** traduits à l'affichage. `formatPrice(cents, devise, langue)`.
  Courriels Supabase bilingues selon `user_metadata.locale`. Les adresses (/connexion, /tableau-de-bord…) restent en français.
- Écran avec formulaire qui disparaît après l'action (produit refusé, commande remboursée) : afficher
  la confirmation en haut de page via un paramètre d'URL, pas dans le formulaire.
- Le client Supabase admin désactive la mémorisation des GET de Next (signal par requête) : une relecture
  après écriture dans le même rendu doit voir la nouvelle valeur.

## État d'avancement

- [x] Phase 1 — base du projet, schéma BD, routage multi-tenant, 2 boutiques démo (2 thèmes)
- [x] Phase 2 — site vitrine, connexion (courriel + Google), générateur IA avec limites, personnalisation,
      vitrine style Amazon (3 styles, 3 boutiques démo)
- [x] Phase 5 — Stripe Connect Express, checkout + Stripe Tax, commission 15 %, réserve 7 jours,
      versements, remboursements et rétrofacturations selon règles configurables
- [x] Phase 3 — produits CJ : recherche, sélection et rédaction par l'IA, livraison ≤ 15 jours,
      prix ≥ 40 % de marge, écran de validation, synchro horaire (adaptateur CJ à valider avec une vraie clé)
- [x] Langues — anglais par défaut, français selon la région, sélecteur ; langue propre à chaque boutique
- [x] Phase 4 — modération (règles configurables, filtrage produits/textes, vérification, suspension admin)
- [x] Phase 6 — commandes CJ : transmission auto, paiement portefeuille, nouveaux essais, alertes admin,
      suivi de livraison, page publique de suivi (adaptateur CJ à valider avec une vraie clé)
- [x] Phase 7 — courriels acheteurs (confirmation, expédition, livraison), avis de vente, page « Nous joindre »
- [ ] Phases 8 (pages légales) et 9 (tableau de bord) — validées, en cours
