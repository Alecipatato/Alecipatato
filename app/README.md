# RappelPro : le produit

Serveur Node.js sans dépendance. Il publie aussi le site (`../site`), donc un seul déploiement suffit.

1. **Inscription en libre-service** : le formulaire du site mène au paiement Stripe (89,99 $/mois, premier mois à -50 %). Dès que le paiement passe, le serveur achète un numéro Twilio dans l'indicatif du commerce et texte au propriétaire son numéro et le code d'activation.
2. **Appel manqué → texto** : l'appelant reçoit un SMS en quelques secondes et le propriétaire est averti.
3. **Réponses transférées** : quand l'appelant répond au texto, sa réponse arrive chez le propriétaire.
4. **Demandes d'avis Google** : le propriétaire texte `AVIS 514-555-1234 Julie` à son numéro RappelPro, et le client reçoit le lien d'avis.
5. **Gestion de l'abonnement** : le propriétaire texte `COMPTE` et reçoit un lien vers le portail Stripe pour changer de carte, voir ses factures ou annuler. L'annulation prend effet à la fin du mois payé ; le numéro Twilio est alors libéré (il ne te coûte plus rien) et le service s'arrête.
6. **Bilan mensuel** : le 1er de chaque mois vers 10 h (heure de Montréal), chaque abonné reçoit par texto les chiffres du mois précédent : appels récupérés, réponses, demandes d'avis. C'est ce qui le convainc de rester.
7. **Pages légales** : conditions d'utilisation et politique de confidentialité (Loi 25), avec une case à cocher obligatoire à l'inscription.

## Comment ça marche chez le client

Le commerce **garde son numéro**. Il active un **transfert d'appel sur non-réponse ou occupé** vers son numéro RappelPro. Sur la plupart des cellulaires au Canada, c'est `**004*+1XXXXXXXXXX#`. La page `bienvenue.html` explique aussi le cas des lignes fixes. Tout appel qui arrive chez RappelPro est donc un appel manqué.

## Installation (environ 30 minutes, une seule fois)

1. **Stripe** : crée un compte sur stripe.com. Dans *Développeurs → Clés API*, copie la **clé secrète de test** (elle commence par `sk_test_`). Ne la colle jamais dans un courriel ou un chat : seulement dans Render.
2. **Twilio** : crée un compte sur twilio.com et ajoute du crédit (20 $ suffisent pour commencer). Copie l'*Account SID* et l'*Auth Token* de la page d'accueil de la console. Chaque abonné coûte environ 1,15 $/mois pour son numéro, plus ~0,01 $ par texto.
3. **Mettre en ligne sur Render** : crée un compte sur render.com, relie ton GitHub, puis *New → Blueprint* et choisis ce dépôt. Le fichier `render.yaml` configure tout (serveur, disque persistant pour la liste des abonnés, clé API). Render te demande :

   | Variable | Quoi mettre |
   |---|---|
   | `STRIPE_SECRET_KEY` | La clé `sk_test_…` de l'étape 1 |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Les valeurs de l'étape 2 |
   | `CONTACT_EMAIL` | Ton courriel de contact, affiché sur le site, les pages légales et dans les textos |
   | `LEGAL_NAME` | Ton nom ou celui de ton entreprise enregistrée |
   | `LEGAL_ADDRESS` | Ton adresse d'affaires |

   Coût : environ 7 $/mois (plan Starter, nécessaire pour le disque persistant).

4. **Stripe se configure tout seul** : au premier démarrage, le serveur crée dans ton compte Stripe le produit, le prix de 89,99 $/mois, le coupon -50 % du premier mois, le portail d'annulation et le webhook. Dans les journaux Render, tu dois voir `Stripe est configuré.` puis `paiement activé`. Si tu vois `ATTENTION : Stripe n'a pas pu être configuré`, le message qui suit explique pourquoi (souvent une clé mal copiée).
5. **Test complet** : ouvre ton site, remplis le formulaire avec ton propre cellulaire et paie avec la carte de test `4242 4242 4242 4242` (date future, n'importe quel code CVC). Tu dois recevoir le texto de bienvenue avec ton numéro RappelPro. Compose le code d'activation, puis fais-toi appeler sans répondre. Textez `COMPTE` pour tester l'annulation.
6. **Passer en mode réel** : dans Stripe, active ton compte (infos d'entreprise et compte bancaire), puis remplace dans Render `STRIPE_SECRET_KEY` par ta clé `sk_live_…`. Au redémarrage, le serveur crée la configuration du mode réel. Tes vrais clients paient alors pour de vrai.
7. **Pages légales** : `site/conditions.html` et `site/confidentialite.html` sont des modèles de départ. **Fais-les relire par un juriste** avant d'accepter de vrais clients. Tant qu'une variable `CONTACT_EMAIL`, `LEGAL_NAME` ou `LEGAL_ADDRESS` manque, le site affiche « [à configurer : …] » à sa place.

### Autres hébergeurs

Tout hébergeur Node.js avec un disque persistant convient. Commande de démarrage : `node app/server.js`. Variables à définir en plus de celles du tableau : `PUBLIC_URL` (l'adresse publique du serveur), `DATA_DIR` (un dossier sur le disque persistant) et `API_KEY` (une longue chaîne aléatoire qui protège `/review-request` et `/report`).

Variables facultatives : `TWILIO_COUNTRY` (pays des numéros achetés, `CA` par défaut, `US` pour les États-Unis), `CURRENCY` (`cad` par défaut). Si tu préfères fixer les identifiants Stripe toi-même, `node app/setup-stripe.js` les affiche une fois ; mets-les dans `STRIPE_PRICE_ID`, `STRIPE_COUPON_ID`, `STRIPE_PORTAL_CONFIG_ID` et `STRIPE_WEBHOOK_SECRET`.

Sans identifiants Twilio, le serveur tourne en mode test : les textos et les achats de numéros s'affichent dans les journaux au lieu d'être faits pour de vrai. Sans clé Stripe, le formulaire répond que l'inscription n'est pas encore ouverte.

## Ajouter un client à la main

Pour un client signé en personne, ajoute un bloc dans `clients.json` (voir `clients.example.json`), achète son numéro dans la console Twilio et règle ses webhooks :
- *A call comes in* → `POST https://TON-URL/voice`
- *A message comes in* → `POST https://TON-URL/sms`

## Demandes d'avis par API

Pour les brancher sur le logiciel du client (Zapier, Make : « facture payée », « rendez-vous terminé ») :

```bash
curl -X POST https://TON-URL/review-request \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"client":"+15145550100","phone":"+14385551234","name":"Julie"}'
```

## Rapport mensuel

```bash
curl "https://TON-URL/report?client=%2B15145550100&month=2026-09" -H "Authorization: Bearer $API_KEY"
# {"client":"+15145550100","month":"2026-09","missed_call":14,"sms_reply":6,"review_request":22}
```

## Tests

```bash
npm test
```

## Conformité SMS

- Les textos partent uniquement vers des personnes qui viennent d'appeler ou qui sont clientes du commerce.
- Twilio gère automatiquement les réponses ARRÊT/STOP.
- Au Canada, respecte la LCAP (identification de l'expéditeur, option de désabonnement). Aux États-Unis, l'enregistrement **A2P 10DLC** est obligatoire pour les numéros locaux : l'achat automatique de numéros américains demande d'abord cet enregistrement dans Twilio.
