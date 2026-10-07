# Kreo (nom provisoire)

Plateforme SaaS où une IA crée gratuitement des boutiques de dropshipping.
Voir `CLAUDE.md` pour la vision complète, la stack et les phases.

## Démarrer en local

```bash
# Dans un dossier de travail (pas directement dans C:\Users\<vous>)
git clone -b claude/youthful-planck-e95nl9 https://github.com/alecipatato/alecipatato.git ma-plateforme
cd ma-plateforme
npm install
cp .env.example .env.local   # puis remplir les valeurs (voir plus bas)
npm run dev
```

Ouvrez ensuite **l'adresse affichée par `npm run dev`** (normalement http://localhost:3000) :

- Plateforme : http://localhost:3000
- Boutiques démo : http://demo.localhost:3000, http://demo2.localhost:3000, http://demo3.localhost:3000
  (ou http://localhost:3000/s/demo, `/s/demo2`, `/s/demo3`)

Sans Supabase, seules la page d'accueil et les boutiques de démonstration fonctionnent.

### Ça ne marche pas ?

| Symptôme | Solution |
|---|---|
| Le dossier ne contient qu'un README | Vous êtes sur la branche `main` : faites `git checkout claude/youthful-planck-e95nl9` |
| `npm run dev` indique un autre port (3001…) | Utilisez ce port dans les adresses (`demo.localhost:3001`) |
| `demo.localhost` ne s'ouvre pas (Safari) | Utilisez l'adresse de secours `localhost:3000/s/demo` (en dev uniquement) |
| `npm` introuvable | Installez Node.js 20 ou plus récent : https://nodejs.org |

## Base de données et connexion (Supabase)

### Option A — projet en ligne (recommandé)

1. Créez un projet sur https://supabase.com.
2. **SQL Editor** : exécutez, dans l'ordre, les fichiers de `supabase/migrations/`.
3. **Project Settings > API** : copiez l'URL, la clé publique et la clé secrète dans `.env.local`.
4. **Authentication > URL Configuration** :
   - *Site URL* : `http://localhost:3000` (puis votre vrai domaine en production)
   - *Redirect URLs* : `http://localhost:3000/**` (et `https://votre-domaine.com/**`)
5. **Authentication > Email Templates** : remplacez les modèles *Confirm signup* et *Reset password*
   par le contenu de `supabase/templates/confirmation.html` et `recovery.html` (courriels en français,
   liens qui fonctionnent même ouverts sur un autre appareil).
6. **Authentication > Sign In / Providers > Email** : laissez *Confirm email* activé.

> Le service de courriel intégré de Supabase est limité à quelques envois par heure. Avant
> d'ouvrir aux clients, branchez Resend comme serveur SMTP (Authentication > SMTP Settings).

### Option B — tout en local (Docker requis)

```bash
npx supabase start          # base, connexion et boîte courriel de test
```

Copiez l'URL et les clés affichées dans `.env.local`. Les courriels envoyés (confirmation,
mot de passe oublié) s'affichent sur http://127.0.0.1:54324.

## Connexion avec Google

1. https://console.cloud.google.com > **API et services > Identifiants > Créer des identifiants >
   ID client OAuth** (type « Application Web »).
2. *URI de redirection autorisés* : `https://<votre-projet>.supabase.co/auth/v1/callback`
   (en local : `http://127.0.0.1:54321/auth/v1/callback`).
3. Dans Supabase : **Authentication > Sign In / Providers > Google** : activez et collez l'ID client
   et le code secret. (En local : remplissez `supabase/.env` et mettez `enabled = true` dans
   `supabase/config.toml`, section `[auth.external.google]`.)

## Générateur IA (Claude)

Ajoutez votre clé dans `.env.local` : `ANTHROPIC_API_KEY=...` (https://platform.claude.com).
Limites du compte gratuit et nombre d'appels par heure : table `platform_settings`
(`free_plan_limits`, `ai_rate_limit`), modifiables sans toucher au code.

## Comment ça marche

1. `src/proxy.ts` lit le hostname : sur le domaine principal il gère la session de connexion,
   sur une boutique il redirige en interne vers `/s/<boutique>`.
2. `src/app/s/[site]/` : la vitrine « style Amazon » (catalogue, recherche, catégories, fiche produit,
   panier), alimentée par le JSON de la boutique.
3. `src/app/tableau-de-bord/` : création par l'IA, personnalisation, régénération.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | compilation de production (vérifie aussi les types) |
| `npm run lint` | vérification du code |
