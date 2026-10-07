# [NOM DE TA PLATEFORME]

Plateforme SaaS où une IA crée gratuitement des boutiques de dropshipping.
Voir `CLAUDE.md` pour la vision complète, la stack et les phases.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs (facultatif en phase 1)
npm run dev
```

- Plateforme : http://localhost:3000
- Boutique démo « minimal » : http://demo.localhost:3000
- Boutique démo « bold » : http://demo2.localhost:3000

> Chrome, Edge et Firefox résolvent automatiquement `*.localhost`. Avec Safari,
> ajoutez `127.0.0.1 demo.localhost demo2.localhost` dans `/etc/hosts`.

Sans Supabase configuré, seules les boutiques de démonstration existent.

## Base de données (Supabase)

1. Créez un projet sur https://supabase.com.
2. Dans **SQL Editor**, exécutez le contenu de
   `supabase/migrations/20261007000000_initial_schema.sql`.
3. Copiez l'URL et les clés (**Project Settings > API**) dans `.env.local`.

Une boutique créée en base avec `status = 'active'` est alors visible sur
`http://<subdomain>.localhost:3000`.

## Comment ça marche

1. `src/proxy.ts` lit le hostname de chaque requête et redirige en interne
   vers `/s/<boutique>`.
2. `src/app/s/[site]/page.tsx` charge la boutique (`src/lib/stores.ts`) :
   démo codée à la main ou base Supabase.
3. Le thème choisi (`src/themes/`) affiche la boutique à partir de ses données JSON.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | compilation de production (vérifie aussi les types) |
| `npm run lint` | vérification du code |
