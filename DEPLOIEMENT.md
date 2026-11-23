# Mise en ligne (Cloudflare Workers) — mode TEST

Ce guide met la plateforme en ligne sur **votre domaine**, avec **les clés de test** : Stripe en mode test, CJ en
sandbox, commandes CJ désactivées. Personne ne paie réellement tant que vous ne changez pas ces réglages.

Comptez 2 à 3 heures la première fois. Les étapes sont dans l'ordre : chacune a besoin des précédentes.

> 🔐 Les clés ne vont **jamais** dans le code ni dans Git. Elles sont enregistrées dans Cloudflare avec
> `npx wrangler secret put NOM` (la commande demande la valeur, qui n'apparaît pas à l'écran).

Dans ce guide, remplacez `mondomaine.com` par votre domaine.

---

## 1. Comptes à créer

| Service | À quoi il sert | Coût au départ |
|---|---|---|
| **Cloudflare** (cloudflare.com) | héberge le site, le domaine, les tâches planifiées | Workers payant (≈ 5 $ US/mois) recommandé : la version gratuite limite le temps de calcul par requête |
| **Un domaine** (acheté chez Cloudflare ou ailleurs) | `mondomaine.com` et toutes les boutiques `xxx.mondomaine.com` | ≈ 10-20 $/an |
| **Supabase** (supabase.com) | base de données et comptes | gratuit pour commencer |
| **Stripe** (dashboard.stripe.com) | paiements (mode test) | gratuit |
| **Resend** (resend.com) | courriels | gratuit jusqu'à 3 000/mois |
| **Anthropic** (platform.claude.com) | l'IA | à l'usage |
| **CJ Dropshipping** | fournisseur | gratuit |

Facultatif : application Meta et application TikTok (campagnes publicitaires), Google Cloud (connexion Google).

## 2. Le domaine dans Cloudflare

1. Cloudflare → **Add a domain** → `mondomaine.com`. Si le domaine a été acheté ailleurs, remplacez ses
   « serveurs de noms » par ceux que Cloudflare indique (chez le vendeur du domaine). Attendez « Active ».
2. **DNS → Records**, ajoutez (proxy **orange activé**) :
   - `AAAA` nom `*` valeur `100::` → toutes les boutiques (`zenyoga.mondomaine.com`) ;
   - `AAAA` nom `stores` valeur `100::` → cible des domaines personnalisés (étape 9).
   (`100::` est une adresse fictive habituelle : c'est le Worker qui répond, pas un serveur.)

## 3. Base de données Supabase (en ligne)

1. Supabase → **New project** (région : Canada ou US Est). Gardez le mot de passe de la base en lieu sûr.
2. Sur votre ordinateur, dans le dossier du projet :
   ```bash
   npx supabase login
   npx supabase link --project-ref <identifiant du projet>   # visible dans l'adresse du tableau de bord
   npx supabase db push                                      # crée toutes les tables (dossier supabase/migrations)
   ```
3. **Authentication → URL Configuration** :
   - Site URL : `https://mondomaine.com`
   - Redirect URLs : `https://mondomaine.com/**`
4. **Authentication → Emails → Templates** : copiez le contenu de `supabase/templates/confirmation.html`
   (« Confirm signup ») et `recovery.html` (« Reset password »). Sans cela, les liens de confirmation ne marchent pas.
5. **Authentication → Emails → SMTP Settings** : branchez Resend (hôte `smtp.resend.com`, port 465,
   utilisateur `resend`, mot de passe = clé Resend) — l'envoi intégré de Supabase est limité à quelques courriels/heure.
6. **Authentication → Multi-Factor** : vérifiez que **TOTP** est activé (obligatoire pour l'administration).
7. Facultatif, **Google** : Authentication → Providers → Google (identifiants de Google Cloud, adresse de retour
   indiquée par Supabase).
8. **Project Settings → API Keys** : notez la clé publique (`sb_publishable_…`), la clé secrète (`sb_secret_…`)
   et l'URL du projet.

## 4. Les valeurs « publiques » (compilées dans le site)

Les variables `NEXT_PUBLIC_*` sont intégrées au site au moment de la compilation. Créez sur votre ordinateur
un fichier **`.env.production.local`** (jamais envoyé sur Git) :

```bash
NEXT_PUBLIC_ROOT_DOMAIN=mondomaine.com
NEXT_PUBLIC_PLATFORM_NAME=Kreo
NEXT_PUBLIC_SUPABASE_URL=https://<identifiant>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Dans `wrangler.jsonc`, décommentez aussi `NEXT_PUBLIC_ROOT_DOMAIN` (les tâches planifiées en ont besoin).

## 5. Les secrets

Dans le dossier du projet : `npx wrangler login`, puis une commande par secret (elle demande la valeur) :

```bash
npx wrangler secret put SUPABASE_SECRET_KEY        # sb_secret_...
npx wrangler secret put CRON_SECRET                # longue chaîne au hasard : openssl rand -hex 32
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY          # sk_test_... UNIQUEMENT (sk_live_ est refusée)
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # étape 7
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM                 # ex. Kreo <noreply@mondomaine.com>
npx wrangler secret put ADMIN_ALERT_EMAIL          # votre adresse pour les alertes
npx wrangler secret put CJ_API_KEY
npx wrangler secret put ADS_ENCRYPTION_KEY         # openssl rand -base64 32 — ne plus jamais la changer
```

Plus tard, selon les besoins : `CJ_WEBHOOK_URL` (étape 8), `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` /
`CLOUDFLARE_CNAME_TARGET` (étape 9), `META_APP_ID` / `META_APP_SECRET`, `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET`,
`STRIPE_AUTOMATIC_TAX=false` tant que Stripe Tax n'est pas configuré.
La liste complète et le rôle de chaque valeur : `.env.example`.

Les réglages de sécurité restent dans `wrangler.jsonc` : `CJ_SANDBOX=true`, `CJ_ORDERS_ENABLED=false`,
`CJ_AUTO_PAY=false`. Ne les changez qu'après validation des commandes CJ.

## 6. Publier

1. Dans `wrangler.jsonc`, décommentez le bloc `routes` en remplaçant `mondomaine.com`.
2. ```bash
   npm run cf:deploy
   ```
   (compile avec OpenNext, applique `scripts/patch-open-next.cjs`, envoie sur Cloudflare.)
3. Ouvrez `https://mondomaine.com` et `https://demo.mondomaine.com` (boutique de démonstration).

Pour une mise à jour : la même commande. Pour revenir en arrière : Cloudflare → Workers → kreo → **Deployments**.

## 7. Stripe (mode test)

1. Suivez la section « Paiements » du `README.md` (Connect Express, Stripe Tax).
2. **Webhooks** : endpoint `https://mondomaine.com/api/stripe/webhook` avec les événements listés dans le README,
   plus un second endpoint (même adresse, « comptes connectés ») avec `account.updated`.
   Mettez les deux secrets `whsec_…` dans `STRIPE_WEBHOOK_SECRET`, séparés par une virgule, puis redéployez.
3. Test : carte `4242 4242 4242 4242`.

## 8. CJ

1. Mettez `CJ_API_KEY` (étape 5). La tâche horaire remplit la galerie de produits tendance (≈ 400 produits en
   quelques jours, une source par heure).
2. Notifications : `npx wrangler secret put CJ_WEBHOOK_URL` → `https://mondomaine.com/api/cj/webhook`.
   L'inscription chez CJ se fait toute seule à la prochaine synchronisation.

## 9. Domaines personnalisés des clients (facultatif)

1. Cloudflare → **SSL/TLS → Custom Hostnames** : activez Cloudflare for SaaS, fallback origin = `stores.mondomaine.com`.
2. Jeton API (My Profile → API Tokens) avec « SSL and Certificates: Edit » sur la zone.
3. Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` (page Overview du domaine), `CLOUDFLARE_CNAME_TARGET`
   = `stores.mondomaine.com`. La route `*/*` (étape 6) envoie ces domaines au Worker.

## 10. Devenir administrateur

1. Créez votre compte sur `https://mondomaine.com/inscription`.
2. Supabase → **SQL Editor** :
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'votre@adresse');
   ```
3. Ouvrez `/admin` : configurez la double authentification (application Google Authenticator, 1Password…).

## 11. Vérifications après la mise en ligne

- [ ] Accueil, inscription, courriel de confirmation reçu, connexion.
- [ ] Création d'une boutique ; elle s'affiche sur `nom.mondomaine.com`.
- [ ] Achat test (4242…) → courriel de confirmation, commande visible dans le tableau de bord et `/admin/commandes`.
- [ ] Stripe → Webhooks : les envois répondent 200.
- [ ] Cloudflare → Workers → kreo → **Logs** : des lignes « Tâche /api/cron/orders : 200 » toutes les 15 minutes.
- [ ] `/admin` : double authentification demandée.

## Tâches planifiées

Déclarées dans `wrangler.jsonc` (`triggers.crons`, heure UTC) et exécutées par `custom-worker.ts`, qui appelle
les routes `/api/cron/*` avec `CRON_SECRET` :

| Fréquence | Tâches |
|---|---|
| toutes les 10 min | domaines personnalisés |
| toutes les 15 min | commandes CJ (envoi, nouveaux essais, suivi, courriels) |
| toutes les heures (h:07) | prix et stock CJ, produits tendance, versements aux vendeurs |

## Vérifier la version Cloudflare sur son ordinateur

```bash
npx supabase start                       # base locale (Docker)
# .dev.vars : SUPABASE_SECRET_KEY, CRON_SECRET, NEXT_PUBLIC_ROOT_DOMAIN=localhost:8787
# .env.local : NEXT_PUBLIC_ROOT_DOMAIN=localhost:8787 + clés Supabase locales
npm run cf:build
npx opennextjs-cloudflare preview -c wrangler.local.jsonc > preview.log   # wrangler.jsonc sans global_fetch_strictly_public
CF_PREVIEW_LOG=preview.log node scripts/smoke-cloudflare.cjs
```

`wrangler.local.jsonc` est une copie locale (non versionnée) de `wrangler.jsonc` sans l'option
`global_fetch_strictly_public`, qui empêcherait d'appeler la base locale `127.0.0.1`.

## Points connus

- OpenNext affiche « Node.js middleware support is experimental » : `src/proxy.ts` tourne en mode Node ; validé
  par `scripts/smoke-cloudflare.cjs` (routage des boutiques, session, double authentification).
- `scripts/patch-open-next.cjs` corrige un bogue d'OpenNext (module `cookie`) qui faisait planter toute page
  visitée avec un témoin. Il ne fait rien si une future version corrige le bogue.
- Sur Cloudflare, la langue de la plateforme suit le pays du visiteur (`cf-ipcountry`) avant celle du navigateur.
