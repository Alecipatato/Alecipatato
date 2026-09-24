# RappelPro

Un business d'abonnement mensuel pour les commerces locaux : **texto automatique à chaque appel manqué** et **demandes d'avis Google automatiques**.

**Tarif : 89,99 $/mois, premier mois à 44,99 $ (-50 %).**

**Objectif : 10 000 $/mois, soit environ 112 clients**, avec moins de 500 $ de départ.

## Contenu

| Fichier | À quoi il sert |
|---|---|
| [`docs/plan-affaires.md`](docs/plan-affaires.md) | L'offre, le tarif, les chiffres, le plan des 90 premiers jours, les risques |
| [`docs/prospection.md`](docs/prospection.md) | Scripts prêts à l'emploi : courriels, messages, appels, démo, objections |
| [`site/index.html`](site/index.html) | Page de vente à publier (Netlify ou GitHub Pages, gratuit) |
| [`app/`](app/) | Le produit : serveur Node.js + Twilio, testé, prêt à déployer ([guide](app/README.md)) |

## Par où commencer cette semaine

1. Lis le plan d'affaires et choisis **une seule niche** (plombiers, électriciens ou cliniques dentaires recommandés).
2. Déploie `app/` avec un numéro Twilio et teste-le sur ton propre téléphone.
3. Publie la page de vente.
4. Fais le test de l'appel manqué sur 20 commerces et contacte ceux qui n'ont pas répondu.

> Aucun business ne garantit un revenu. Le chemin vers 10 000 $/mois dépend surtout d'une chose : contacter environ 120 commerces par semaine, ou mettre en place l'inscription en libre-service (voir le plan).
