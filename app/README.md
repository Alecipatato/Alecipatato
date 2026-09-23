# RappelPro : le produit

Serveur Node.js sans dépendance, qui fait trois choses :

1. **Appel manqué → texto** : l'appelant reçoit un SMS en quelques secondes et le propriétaire est averti.
2. **Réponses transférées** : quand l'appelant répond au texto, sa réponse est renvoyée au propriétaire.
3. **Demande d'avis Google** : un SMS avec le lien d'avis, déclenché par une requête HTTP (Zapier, Make, formulaire, ou toi manuellement).

Un rapport mensuel (`/report`) compte les appels récupérés, ce qui te sert à prouver la valeur au client.

## Comment ça marche chez le client

Le commerce **garde son numéro**. On active un **transfert d'appel sur non-réponse ou occupé** vers le numéro Twilio de RappelPro (avec la plupart des opérateurs, c'est un code du type `*92` ou `**61*`, à voir avec l'opérateur du client). Tout appel qui arrive chez RappelPro est donc un appel manqué.

## Installation (environ 1 h la première fois)

1. **Twilio** : crée un compte sur twilio.com et achète un numéro local avec SMS et voix (~1,15 $/mois). Un numéro par client.
2. **Hébergement** : déploie le dossier `app/` sur Render, Railway ou Fly.io (offres gratuites ou ~5 $/mois). Commande de démarrage : `npm start`.
3. **Variables d'environnement** :

   | Variable | Rôle |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | Identifiant du compte Twilio |
   | `TWILIO_AUTH_TOKEN` | Jeton Twilio (sert aussi à vérifier que les requêtes viennent de Twilio) |
   | `PUBLIC_URL` | URL publique du serveur, par exemple `https://rappelpro.onrender.com` |
   | `API_KEY` | Une longue chaîne aléatoire qui protège `/review-request` et `/report` |
   | `CLIENTS_FILE` | *(facultatif)* chemin du fichier des clients, par défaut `app/clients.json` |
   | `EVENTS_FILE` | *(facultatif)* journal des événements, par défaut `app/events.jsonl` |

   Sans identifiants Twilio, le serveur tourne en mode test et affiche les SMS dans la console au lieu de les envoyer.

4. **Clients** : copie `clients.example.json` vers `clients.json` et ajoute un bloc par client, identifié par son numéro Twilio.
5. **Webhooks Twilio** (dans la console, sur chaque numéro) :
   - *A call comes in* → `POST https://TON-URL/voice`
   - *A message comes in* → `POST https://TON-URL/sms`
6. **Test** : appelle le numéro Twilio depuis ton cellulaire. Tu dois recevoir le texto.

> Sur un hébergement gratuit, le disque peut être effacé au redémarrage. Si tu veux garder l'historique des rapports, utilise un disque persistant (Render et Railway en offrent).

## Envoyer une demande d'avis

```bash
curl -X POST https://TON-URL/review-request \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"client":"+15145550100","phone":"+14385551234","name":"Julie"}'
```

Dans Zapier ou Make, branche la même requête sur « facture payée » ou « rendez-vous terminé » dans le logiciel du client : les demandes d'avis partent sans que personne n'ait à y penser.

## Rapport mensuel

```bash
curl "https://TON-URL/report?client=%2B15145550100&month=2026-09" -H "Authorization: Bearer $API_KEY"
# {"client":"+15145550100","month":"2026-09","missed_call":14,"sms_reply":6,"review_request":22}
```

Envoie ces chiffres au client chaque mois : « 14 appels manqués récupérés, 6 clients ont répondu au texto ».

## Tests

```bash
npm test
```

## Conformité SMS

- Les textos partent uniquement vers des personnes qui viennent d'appeler ou qui sont clientes du commerce.
- Twilio gère automatiquement les réponses ARRÊT/STOP.
- Aux États-Unis, l'enregistrement **A2P 10DLC** est obligatoire pour les numéros locaux. Au Canada, respecte la LCAP (identification de l'expéditeur, option de désabonnement).
