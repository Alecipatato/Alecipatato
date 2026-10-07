# CLAUDE.md — [NOM DE TA PLATEFORME]

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
- **Sous-domaines réservés** : `RESERVED_SUBDOMAINS` (`src/lib/tenant.ts`) + démos `demo`, `demo2`
  (`src/lib/demo-stores.ts`). Le générateur (phase 2) devra refuser les deux listes.
- **Données boutique** : `StoreConfig` (`src/lib/types.ts`), toujours lue via `parseStoreConfig`
  (`src/lib/store-config.ts`), qui remplace toute valeur invalide par un défaut. Polices limitées à
  `ALLOWED_FONTS`. Thèmes : `src/themes/` + registre `src/themes/index.ts` + `THEME_IDS`.
- **Supabase** : schéma dans `supabase/migrations/`. RLS : les clients *lisent* leurs données ;
  **toutes les écritures passent par le serveur** (clé secrète). Le rôle `anon` ne voit que les
  boutiques/produits actifs et des colonnes non sensibles (jamais les coûts fournisseur).
  Clients : `src/lib/supabase/public.ts` (vitrine, anonyme) et `server.ts` (utilisateur connecté).
- Réglages modifiables sans code : table `platform_settings` (commission, réserve, règles de
  remboursement, limites du plan gratuit, rate limit IA).

## État d'avancement

- [x] Phase 1 — base du projet, schéma BD, routage multi-tenant, 2 boutiques démo (2 thèmes)
- [ ] Phase 2 — en attente de validation
