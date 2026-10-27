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
  `/product/query`, `/logistic/freightCalculate`, `/product/stock/queryByVid`). Comparé à la doc officielle
  le 2026-10-26 (developers.cjdropshipping.com) : recherche via `/product/listV2` (`keyWord`, `page`, `size`,
  `features=enable_category`, tri popularité `orderBy=1&sort=desc`), produit hors vente si `status ≠ "3"`, stock =
  `totalInventoryNum` des entrepôts CN, commande `createOrderV2` avec `payType: 3` + `isSandbox` (`CJ_SANDBOX`, vrai par
  défaut) puis paiement `payBalanceV2 {shipmentOrderId}`, reconnexion sur codes 1600001/1600002. Pistes pour plus tard
  (doc) : webhooks produit/stock/commande (`/webhook/set` + abonnement par produit, signature HMAC), filtres tendance
  `productFlag=0` / `zonePlatform=tiktok`, fiche riche (`productWeight`, `materialNameEnSet`, `variantKey`, dimensions,
  `inventories`).
  **Validé avec la vraie API en sandbox le 2026-10-27** (compte « Kreo », 50 000 points/jour, quota 1000 appels/jour
  par adresse, `qpsLimit` 100 ; `GET /setting/get`) : authentification, `listV2` (+ tri popularité, `listedNum` présent),
  `product/query` (produit absent → code 1602001 « Product not found » → `null`), `freightCalculate` (prix =
  `totalPostageFee`), `stock/queryByVid`, `getBalance`, et le cycle de commande. ⚠️ Avec `payType: 3`, la commande
  reste `CREATED` : `payCjOrder` appelle d'abord `PATCH /shopping/order/confirmOrder` (→ `UNPAID`), sinon le paiement
  répond « Order not found ». `createOrderV2` renvoie l'id `SD…` (accepté par getOrderDetail/confirm/pay ;
  `shipmentOrderId` null → `payBalance`), totaux null → montant = produits + livraison. getOrderDetail : `CREATED` →
  `UNPAID` → `UNSHIPPED` (sous-statut `PROCESSING`) → `SHIPPED` → `DELIVERED`. Outils sandbox CJ :
  `/shopping/sandbox/simulatePay`, `/updateStatus` (300→400→500→600→700), `/updateTrackNumber`. Pas encore testé
  avec la vraie clé : les tâches qui ont besoin de Supabase (`/api/cron/trends`, recherche de produits, synchro).
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
- **Admin** : `profiles.role = 'admin'` (`requireAdmin`, sinon 404). `/admin` = vue d'ensemble (phase 12) ;
  `/admin/boutiques` : liste, suspension avec motif (hors ligne, checkout refusé, versements en attente ; réactivation
  → `draft`) ; `/admin/moderation` ; `/admin/commandes`.
- **Tableau de bord admin** (phase 12) : `src/app/admin/page.tsx` + calculs purs testés `src/lib/admin-stats.ts` —
  revenu net estimé = commissions − part des remboursements/litiges payée par la plateforme **hors taxes**
  (`refundPlatformCostCents`) − frais Stripe à sa charge ; coûts IA = jetons de `ai_generations` × tarifs
  `platform_settings.ai_pricing` (cents US / million de jetons ; Claude Opus 5.5 : 400 / 2000) ; solde du portefeuille CJ
  (`getCjBalance`, `/shopping/pay/getBalance`, validé) ; boutiques à surveiller (`flagReasons` : suspendue, produits
  bloqués, texte, remboursements ≥ 10 % sur 3 commandes, litiges, commandes CJ en échec).
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
- **Pages légales** (phase 8) : modèles FR/EN dans `src/lib/legal/policies.ts` (⚠️ à faire valider par un juriste),
  remplis avec `stores.legal_info` (nom légal, adresse, responsable Loi 25, délai de retour — formulaire sur la page
  de la boutique) : `/legal/{conditions,retours,livraison,confidentialite}` sur chaque vitrine (pied de page, rappel
  dans le panier et sous le bouton Stripe). Plateforme : `/conditions` (CGU : commission, réserve, suspension) et
  `/confidentialite`, identité dans `platform_settings.legal_identity`. Seuls des témoins nécessaires sont utilisés :
  un bandeau de consentement sera requis avec les pixels publicitaires (phase 10).
- **Tableau de bord des ventes** (phase 9) : `/tableau-de-bord/statistiques` (période 7/30/90 jours, filtre boutique).
  Calculs purs et testés dans `src/lib/stats.ts` (période précédente pour comparer, conversion = commandes ÷
  visiteurs en points de base). Visites anonymes : `VisitTracker` (vitrine) → action `recordVisit` → fonction SQL
  `record_store_visit` → table `store_daily_stats` (visiteurs = sessions, pages vues ; robots et démos ignorés —
  les navigateurs « headless », dont ceux des tests, sont comptés comme robots). Histogramme maison
  `src/components/bar-chart.tsx` (une série, info-bulle, tableau des chiffres).
- **Marketing et SEO** (phase 10) : `stores.seo` / `stores.pixels` (`src/lib/marketing/settings.ts`), métadonnées
  (canonique, Open Graph) et données structurées Product dans `src/lib/marketing/seo.ts` ; `/sitemap.xml` et `/robots.txt`
  par boutique (`src/app/s/[site]/sitemap.xml|robots.txt/route.ts`, `force-dynamic`) et pour la plateforme.
  Pixels Meta/TikTok : `src/storefront/pixels.tsx` — chargés SEULEMENT après « Accepter » (choix mémorisé par boutique,
  lien « Gérer les témoins »), événements PageView, ViewContent, AddToCart, InitiateCheckout, Purchase (une fois par
  commande) ; la politique de confidentialité les mentionne automatiquement. Contenus IA (2 scripts TikTok, 3 publicités,
  suggestion SEO) : `src/lib/ai/marketing.ts` → table `marketing_assets` (journal `ai_generations.kind = 'marketing'`,
  limite horaire, modération). Écran `/tableau-de-bord/boutiques/[id]/marketing`.
- **Domaines personnalisés** (phase 11) : `src/lib/domains/` — `normalize.ts` (saisie + réponses Cloudflare, testé),
  `cloudflare.ts` (custom hostnames, certificat DV par TXT), `service.ts` (connecter / vérifier / retirer, tâche
  `/api/cron/domains`). Colonnes `stores.domain_*` ; la vitrine n'est servie sur `custom_domain` que si
  `domain_status = 'active'` (`getStoreBySite`) ; `publicStoreUrl()` (canonique, sitemap, courriels, liens) préfère le
  domaine actif. L'ancien sous-domaine reste accessible (canonique vers le domaine). Écran : section sur la page boutique.
- **Langues (EN/FR)** : `src/lib/i18n/`. Anglais par défaut. Plateforme : cookie `lang` (sélecteur) > région
  (`cf-ipcountry` + `cf-region-code` : Québec et pays francophones → fr) > navigateur > anglais. Textes dans
  `messages/*.ts` (anglais et français côte à côte, clés vérifiées par TypeScript) ; serveur : `getMessages()`,
  client : `useI18n()` ; valeurs `{x}` via `fmt`, gras/liens via `rich`. **Vitrine = langue de la boutique**
  (`stores.language`, en-tête interne `x-store-site` posé par le proxy). Les erreurs des modules (`StoreGenerationError`,
  `CheckoutError`, recherche CJ) sont des **codes** traduits à l'affichage. `formatPrice(cents, devise, langue)`.
  Courriels Supabase bilingues selon `user_metadata.locale`. Les adresses (/connexion, /tableau-de-bord…) restent en français.
- **Produits tendance** (« produits gagnants », demande du propriétaire) : `src/lib/trends/` — `themes.ts` (6 thèmes +
  mots-clés CJ), `score.ts` (pur, testé : score de demande 0-100 = boutiques CJ `listedNum` + ventes plateforme × 20,
  échelle log ; thème auto ; vérification de la sélection 3 à 20 produits d'un même thème), `catalog.ts`
  (`getTrendingProducts` : table `trending_products` avec CJ, sinon `samples.ts` = 36 exemples FR/EN, visuels
  `/api/trends/image/<id>.svg` — l'extension `.svg` évite le proxy, donc l'image s'affiche aussi sur les vitrines),
  `refresh.ts` + `/api/cron/trends` (découverte quotidienne, vérification par lots, score). Gain estimé :
  `estimateProductEconomics` (`money.ts`). Création (`/tableau-de-bord/nouvelle`) : choix de la méthode →
  `?mode=produits` (galerie `trend-picker.tsx` dans `BriefForm`, avis « prix du fournisseur et transport retirés
  automatiquement » en haut à droite) ou `?mode=ia` (description facultative : sans description, 15 produits d'un des
  3 thèmes les plus demandés). `StoreBrief.chosenProducts` → l'IA bâtit l'identité autour des produits ; elle suit
  description/style/couleurs/nom s'ils sont donnés, sinon s'adapte aux produits. Avec CJ : `sourcing_jobs` démarré à
  `processing` avec `auto_accept` (produits mis en vente sans validation) ; sans CJ : produits d'exemple insérés en
  vente au prix conseillé. ⚠️ `listedNum` à valider avec une vraie clé ; les noms CJ restent en anglais dans la galerie.
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
      prix ≥ 40 % de marge, écran de validation, synchro horaire (adaptateur CJ validé en sandbox le 2026-10-27)
- [x] Langues — anglais par défaut, français selon la région, sélecteur ; langue propre à chaque boutique
- [x] Phase 4 — modération (règles configurables, filtrage produits/textes, vérification, suspension admin)
- [x] Phase 6 — commandes CJ : transmission auto, paiement portefeuille, nouveaux essais, alertes admin,
      suivi de livraison, page publique de suivi (cycle de commande validé en sandbox le 2026-10-27)
- [x] Phase 7 — courriels acheteurs (confirmation, expédition, livraison), avis de vente, page « Nous joindre »
- [x] Phase 8 — pages légales par boutique (CGV, retours, livraison, confidentialité Loi 25) et de la plateforme
- [x] Phase 9 — tableau de bord : ventes, commandes, marge, commissions, versements, visites, conversion
- [x] Phase 10 — SEO (titres, descriptions, sitemap, données produit), pixels Meta/TikTok avec consentement, contenus IA
- [x] Phase 11 — domaines personnalisés via Cloudflare for SaaS (instructions DNS, vérification auto, HTTPS)
- [x] Phase 12 — tableau de bord admin : revenus plateforme, coûts IA, portefeuille CJ, versements dus, boutiques signalées
- [x] Produits tendance — galerie de produits gagnants (image, demande, prix fournisseur, livraison, prix conseillé,
      gain), choix des produits ou IA complète, boutique générée selon les critères ou adaptée aux produits
- [ ] Prochaine étape — mise en production (déploiement Cloudflare, vraies clés en mode test, validation CJ)

## Prochaines étapes (demandées par le propriétaire le 2026-10-26, NON commencées)

Ne pas commencer sans sa validation explicite ; proposer d'abord un ordre de réalisation.

1. **Des centaines de produits prêts à vendre**, branchés à un fournisseur : priorité aux produits qui
   marchent bien et sont **populaires sur TikTok**. Nécessite une vraie clé CJ (aujourd'hui : 72 produits
   découverts par la tâche `/api/cron/trends`, 36 exemples sans clé). Vérifier quelles sources de popularité
   TikTok sont accessibles légalement (indicateurs CJ, TikTok Creative Center…) sans rien inventer.
2. **Données toujours à jour** : demande, prix fournisseur et prix conseillé mis à jour en continu ; un produit
   que le fournisseur n'a plus est retiré **instantanément** de la galerie et de toutes les boutiques.
   Aujourd'hui : prix/stock toutes les heures, demande une fois par jour. Pistes : notifications CJ (webhooks)
   si elles existent, sinon relecture fréquente (limite CJ ~1 appel/s) ; revérifier le stock au paiement.
3. **Publicités** : laisser au vendeur le choix entre (a) guides/formation pas à pas dans le tableau de bord
   et (b) lancer ses campagnes Meta/TikTok depuis la plateforme (compte publicitaire relié, campagne créée par
   l'IA ; approbation Meta/TikTok requise). (c) Service « on s'en occupe pour vous » : idée pour plus tard,
   si la plateforme rapporte.
4. *(pas de point 4)*
5. **Fiche produit comme Amazon** : grande image + vignettes, zoom, titre, prix, points forts, description
   détaillée, caractéristiques, variantes, livraison, produits similaires. Le vendeur NE modifie PAS la fiche
   (ni textes, ni ordre des images). Pour ajouter des produits, il a le choix : les **choisir lui-même** dans la
   liste des produits, OU **laisser l'IA les choisir** pour lui ; dans les deux cas, l'IA crée la fiche complète
   (description, images, etc.). Jamais de faux avis.

**Ordre validé par le propriétaire** : A. brancher le vrai CJ (validation — adaptateur validé en sandbox le
2026-10-27 ; reste à tester les tâches avec Supabase) → B. fiches complètes + page
« comme Amazon » + ajout de produits (par le vendeur ou par l'IA) → C. centaines de produits populaires
(TikTok) → D. données toujours à jour → E. publicités (a. guides, b. campagnes Meta/TikTok) → F. sécurité +
commission dégressive. Sans clé CJ : B (avec produits d'exemple), E-a et F peuvent commencer avant A.
6. **Beaucoup d'informations par produit** : toutes les images, description, caractéristiques (dimensions,
   matériaux, poids, contenu), variantes — uniquement depuis les données du fournisseur (l'IA n'invente rien).
7. **Sécurité de l'argent** : aucun argent stocké sur le site (déjà le cas : Stripe garde l'argent et les
   cartes ; le site ne garde que des montants) ; renforcer (double authentification admin, alertes, limites).
   **Commission dégressive** : au-delà d'un certain profit, les 15 % pourraient baisser un peu, et peut-être
   d'autres avantages — à préciser par le propriétaire (paliers, montants, avantages).
