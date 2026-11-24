# Tests de bout en bout

Ces tests utilisent la plateforme **comme un vrai utilisateur**, dans un vrai navigateur (Chromium, sans fenêtre) :
inscription, création d'une boutique par l'IA, achat, versement au vendeur, administration…
Ils vérifient l'affichage ET ce qui est enregistré en base (montants, commission, statuts).

**Aucune vraie clé, aucun appel sur Internet** : l'IA, Stripe, CJ et Resend sont remplacés par de faux serveurs
(`mocks/servers.cjs`) qui répondent comme les vrais et gardent la trace de ce qu'ils reçoivent.

## Lancer les tests

Prérequis (une seule fois) : Docker, puis dans le dossier du projet :

```bash
npx supabase start                                   # base locale
npm install --no-save playwright && npx playwright install chromium   # navigateur des tests
```

Ensuite :

```bash
npm run test:e2e                         # tout (compilation comprise, ≈ 2 à 4 minutes)
npm run test:e2e -- paiements            # une suite (nom de fichier contenant « paiements »)
npm run test:e2e -- --no-build           # sans recompiler (si le code n'a pas changé)
npm run test:e2e -- --serve --no-build   # démarre seulement l'application de test (http://localhost:3100)
```

L'application de test tourne sur le port **3100** (le serveur de développement peut rester sur 3000).
Journaux en cas d'échec : `tests/e2e/.output/app.log` (application), `mocks.log`, `build.log`.

## Ce qui est vérifié (59 vérifications)

| Suite | Parcours |
|---|---|
| `01-vitrine` | accueil FR/EN, pages légales, boutiques démo sur sous-domaine, recherche et tri, fiche, panier, suivi, robots/sitemap, routage |
| `02-vendeur` | inscription + courriel, niche interdite refusée, boutique créée par l'IA avec produits CJ (marge ≥ 40 %, variantes, livraison ≤ 15 j), mise en ligne, personnalisation, marque refusée, infos légales, message client, contenus marketing |
| `03-paiements-commandes` | compte Stripe Express, achat avec taxes, **commission de 15 % sur la marge brute**, commande transmise et payée chez CJ, suivi + courriels, **versement après 7 jours**, remboursement partiel (reprise sur le vendeur), litige (versement retenu puis libéré), webhooks signés et en double, échec CJ + alerte |
| `04-administration` | accès refusé aux vendeurs, double authentification (configuration + code à la connexion), suspension/réactivation, règle de modération, **plafond de versement + approbation**, paliers de commission, journal |
| `05-produits-tendance` | découverte des produits tendance + tri IA, galerie, boutique à partir de produits choisis, notifications CJ signées (prix relevé, produit retiré partout), stock revérifié au paiement, doublons |

Pas encore couvert (faux serveurs à écrire) : campagnes Meta/TikTok, domaines personnalisés (Cloudflare),
connexion Google.

## Ajouter un test

- Une suite = un fichier `suites/NN-nom.test.cjs` (module `node:test`), exécuté dans l'ordre des numéros.
- Outils communs dans `lib/helpers.cjs` : `signUp`, `createStoreWithProducts`, `enrollAdmin`, `sql`, `cron`,
  `mock.emails`, `storeUrl`, `waitFor`…
- Les tests ne vident pas la base : chaque test crée ses propres comptes (adresses uniques).
