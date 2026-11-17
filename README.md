# ⚡ EasyTrade

Plateforme de trading d'actions américaines simplifiée, connectée au courtier **Alpaca** :

- Un bouton **ACHETER** et un bouton **VENDRE**.
- Vous choisissez votre **perte maximum** et votre **objectif de gain**, en % ou en $. Ils sont envoyés à Alpaca sous forme d'ordre *bracket* : la position se ferme **toute seule**, même si l'application est éteinte.
- Un **robot IA** optionnel : un indicateur technique repère une opportunité (croisement des moyennes mobiles 20/50 filtré par le RSI), puis **Claude** l'analyse et l'approuve ou la rejette avant que l'ordre parte.

> ⚠️ **Le trading comporte un risque réel de perte en capital.** Ni cette application ni l'IA ne garantissent de gains. Commencez en **compte test** (argent fictif), et ne passez en argent réel qu'avec des sommes que vous pouvez vous permettre de perdre. Ceci n'est pas un conseil financier.

## Installation

Il faut [Node.js](https://nodejs.org) version 20 ou plus récente.

1. Créez un compte sur [alpaca.markets](https://alpaca.markets). Dans le tableau de bord **Paper Trading**, générez une clé API (*API Keys*).
2. *(Optionnel, pour le robot IA)* Créez une clé API sur [console.anthropic.com](https://console.anthropic.com). Elle est payante à l'usage : Claude n'est appelé que lorsqu'un signal apparaît.
3. Dans le dossier du projet :

```bash
npm install
```

```bash
cp .env.example .env
```

4. Ouvrez `.env` et collez vos clés dans `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` et `ANTHROPIC_API_KEY`.
5. Lancez le serveur :

```bash
npm start
```

6. Ouvrez http://127.0.0.1:3000 dans votre navigateur.

## Passer en argent réel

1. Chez Alpaca, ouvrez et approvisionnez un compte **Live**, puis générez des clés **Live** (elles sont différentes des clés Paper).
2. Dans `.env` :

```
TRADING_MODE=live
LIVE_CONFIRM=J'ACCEPTE LES RISQUES
ALPACA_KEY_ID=<clé live>
ALPACA_SECRET_KEY=<secret live>
```

3. Redémarrez. Un badge rouge **ARGENT RÉEL** s'affiche, et chaque ordre manuel demande une confirmation.

## Garde-fous

Ces limites se règlent uniquement dans `.env`, pas depuis l'interface :

| Variable | Défaut | Rôle |
|---|---|---|
| `MAX_AMOUNT_PER_TRADE` | 1000 | Montant maximum par ordre (manuel ou robot), en $ |
| `MAX_DAILY_LOSS_PCT` | 3 | Le robot s'arrête tout seul si le compte perd ce % dans la journée |
| `MAX_BOT_POSITIONS` | 3 | Nombre maximum de positions ouvertes pour que le robot ouvre un nouveau trade |

En plus :

- Le robot démarre **arrêté** : c'est à vous de le lancer.
- Si Claude est indisponible, refuse de répondre ou renvoie une erreur, le signal est **rejeté** et aucun ordre n'est passé.
- « Analyser maintenant » avec le robot arrêté **ne passe aucun ordre** : c'est une simple analyse.
- La vente à découvert est désactivée par défaut pour le robot.
- Le serveur n'écoute que sur votre ordinateur (`HOST=127.0.0.1`). Si vous l'exposez sur un réseau, définissez `APP_PASSWORD`.

## Bon à savoir

- Le marché américain est ouvert de 15h30 à 22h00 (heure de Paris). En dehors de ces horaires, les ordres au marché restent en attente et le robot ne fait rien.
- Les ordres avec stop-loss et objectif portent sur des **actions entières** : il faut au moins le prix d'une action.
- La vente à découvert nécessite un compte sur marge (2 000 $ minimum chez Alpaca) et une action « shortable ».
- Le flux de prix gratuit (IEX) ne couvre qu'une partie des échanges du marché.

## Structure

```
server/
  index.js        API HTTP et fichiers de l'interface
  alpaca.js       Appels à Alpaca (compte, prix, ordres bracket)
  indicators.js   Moyennes mobiles, RSI, détection de signal
  ai.js           Validation des signaux par Claude (sortie JSON structurée)
  bot.js          Boucle du robot et garde-fous
  config.js       Lecture du .env, sécurité du mode réel
public/           Interface web (HTML/CSS/JS, sans framework)
```

Tests : `npm test`
