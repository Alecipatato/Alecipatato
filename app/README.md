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

## Installation (environ 1 h, une seule fois)

1. **Twilio** : crée un compte sur twilio.com et ajoute du crédit (20 $ suffisent pour commencer). Chaque abonné coûte environ 1,15 $/mois pour son numéro, plus ~0,01 $ par texto.
2. **Stripe** : crée un compte sur stripe.com et récupère ta clé secrète (commence par `sk_test_` en mode test, `sk_live_` en mode réel).
3. **Hébergement** : déploie tout le dépôt sur Render, Railway ou Fly.io (~5 $/mois). Commande de démarrage : `cd app && npm start`. **Prends un disque persistant** : la liste des abonnés (`clients.json`) y est enregistrée.
4. **Configurer Stripe** : une seule commande crée le produit, le prix, le coupon -50 % et le webhook :
   ```bash
   STRIPE_SECRET_KEY=sk_test_... PUBLIC_URL=https://ton-serveur.onrender.com node app/setup-stripe.js
   ```
   Elle affiche quatre variables à copier à l'étape suivante.
5. **Variables d'environnement** :

   | Variable | Rôle |
   |---|---|
   | `PUBLIC_URL` | URL publique du serveur, par exemple `https://rappelpro.onrender.com` |
   | `TWILIO_ACCOUNT_SID` | Identifiant du compte Twilio |
   | `TWILIO_AUTH_TOKEN` | Jeton Twilio (sert aussi à vérifier que les requêtes viennent de Twilio) |
   | `STRIPE_SECRET_KEY` | Clé secrète Stripe |
   | `STRIPE_PRICE_ID` | Donné par `setup-stripe.js` |
   | `STRIPE_COUPON_ID` | Donné par `setup-stripe.js` (premier mois -50 %) |
   | `STRIPE_WEBHOOK_SECRET` | Donné par `setup-stripe.js` |
   | `STRIPE_PORTAL_CONFIG_ID` | Donné par `setup-stripe.js` (portail d'annulation) |
   | `API_KEY` | Une longue chaîne aléatoire qui protège `/review-request` et `/report` |
   | `CONTACT_EMAIL` | Ton courriel de contact, affiché sur le site, les pages légales et dans les textos |
   | `LEGAL_NAME` | Ton nom ou le nom de ton entreprise enregistrée, pour les pages légales |
   | `LEGAL_ADDRESS` | Ton adresse d'affaires, pour les pages légales |
   | `TWILIO_COUNTRY` | *(facultatif)* pays des numéros achetés, `CA` par défaut (`US` pour les États-Unis) |
   | `CLIENTS_FILE` | *(facultatif)* fichier des abonnés, par défaut `app/clients.json` |
   | `EVENTS_FILE` | *(facultatif)* journal des événements, par défaut `app/events.jsonl` |

   Sans identifiants Twilio, le serveur tourne en mode test : les textos et les achats de numéros s'affichent dans la console au lieu d'être faits pour de vrai. Sans clé Stripe, le formulaire répond que l'inscription n'est pas encore ouverte.

6. **Test complet en mode test Stripe** : remplis le formulaire du site avec ton propre cellulaire et la carte de test `4242 4242 4242 4242`. Tu dois recevoir le texto de bienvenue avec ton numéro RappelPro. Compose le code d'activation, puis fais-toi appeler sans répondre.
7. **Passer en mode réel** : relance `setup-stripe.js` avec ta clé `sk_live_...` et remplace les cinq variables Stripe.
8. **Pages légales** : `site/conditions.html` et `site/confidentialite.html` sont des modèles de départ. **Fais-les relire par un juriste** avant d'accepter de vrais clients. Tant qu'une variable `CONTACT_EMAIL`, `LEGAL_NAME` ou `LEGAL_ADDRESS` manque, le site affiche « [à configurer : …] » à sa place.

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
