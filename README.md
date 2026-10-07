# [NOM DE TA PLATEFORME]

Plateforme SaaS où une IA crée gratuitement des boutiques de dropshipping.
Voir `CLAUDE.md` pour la vision complète, la stack et les phases.

## Démarrer en local

```bash
git clone https://github.com/alecipatato/alecipatato.git
cd alecipatato
git checkout claude/youthful-planck-e95nl9   # la branche qui contient le code
npm install
npm run dev
```

Ouvrez ensuite **l'adresse affichée par `npm run dev`** (normalement http://localhost:3000) :

- Plateforme : http://localhost:3000
- Boutique démo « minimal » : http://demo.localhost:3000 — ou http://localhost:3000/s/demo
- Boutique démo « bold » : http://demo2.localhost:3000 — ou http://localhost:3000/s/demo2

Sans Supabase configuré, seules les boutiques de démonstration existent
(le fichier `.env.local` est facultatif en phase 1).

### Ça ne marche pas ?

| Symptôme | Solution |
|---|---|
| Le dossier ne contient qu'un README | Vous êtes sur la branche `main` : faites `git checkout claude/youthful-planck-e95nl9` |
| `npm run dev` indique un autre port (3001…) | Utilisez ce port dans les adresses (`demo.localhost:3001`) |
| `demo.localhost` ne s'ouvre pas (Safari) | Utilisez l'adresse de secours `localhost:3000/s/demo` (en dev uniquement) |
| `npm` introuvable | Installez Node.js 20 ou plus récent : https://nodejs.org |

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
