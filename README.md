# RappelPro

Un business d'abonnement mensuel pour les commerces locaux : **texto automatique à chaque appel manqué** et **demandes d'avis Google automatiques**.

**Tarif : 89,99 $/mois, premier mois à 44,99 $ (-50 %).**

**Objectif : 10 000 $/mois, soit environ 112 clients**, avec moins de 500 $ de départ.

## Contenu

| Fichier | À quoi il sert |
|---|---|
| [`docs/plan-affaires.md`](docs/plan-affaires.md) | L'offre, le tarif, les chiffres, le plan des 90 premiers jours, les risques |
| [`docs/prospection.md`](docs/prospection.md) | Scripts prêts à l'emploi : courriels, messages, appels, démo, objections |
| [`site/`](site/) | Page de vente avec formulaire d'inscription, et page de bienvenue (publiées par le serveur) |
| [`app/`](app/) | Le produit : serveur Node.js + Twilio + Stripe, inscription et installation automatiques ([guide](app/README.md)) |

## Par où commencer cette semaine

1. Lis le plan d'affaires et choisis **une seule niche** (plombiers, électriciens ou cliniques dentaires recommandés).
2. Déploie le serveur, configure Twilio et Stripe ([guide](app/README.md)), puis inscris-toi toi-même en mode test.
3. Fais le test de l'appel manqué sur 20 commerces et contacte ceux qui n'ont pas répondu.

> Aucun business ne garantit un revenu. Le chemin vers 10 000 $/mois dépend surtout d'une chose : le nombre de commerces que tu diriges chaque semaine vers le formulaire d'inscription (objectif : ~120 contacts par semaine, voir le plan).
