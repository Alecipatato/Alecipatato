# RappelPro — Plan d'affaires

## L'idée en une phrase

Les commerces de services locaux (plombiers, électriciens, dentistes, garages, salons, cliniques) **perdent des clients à chaque appel manqué** et **manquent d'avis Google**. RappelPro règle les deux automatiquement, pour un abonnement mensuel.

## Pourquoi ce business et pas un autre

| Contrainte | Comment RappelPro y répond |
|---|---|
| Budget < 500 $ | Pas de stock, pas de bureau. Coûts : un numéro Twilio (~1,15 $/mois par client), des SMS (~0,008 $ l'unité), un hébergement gratuit ou à 5 $/mois. |
| < 10 h/semaine | Une fois installé, le service tourne tout seul. Ton temps va à la vente, pas à la livraison. |
| Compétences tech + vente | La tech est simple (le code est dans `app/`). Ce qui fait la différence, c'est la prospection. |
| Revenu récurrent | Abonnement mensuel : chaque client signé s'ajoute au revenu du mois suivant. |

## L'offre

**1. Rappel automatique des appels manqués.** Quand le commerce ne répond pas, l'appelant reçoit un SMS dans les secondes qui suivent :
> « Bonjour, ici Plomberie Tremblay. Désolé d'avoir manqué votre appel ! Répondez à ce texto avec votre besoin, on vous revient rapidement. »

Le propriétaire reçoit aussi un SMS avec le numéro de l'appelant.

**2. Demande d'avis Google automatique.** Après chaque service, le client reçoit un SMS avec le lien direct vers la page d'avis Google du commerce.

### Tarif

**Un seul abonnement : 89,99 $/mois, tout compris** (rappel des appels manqués, demandes d'avis Google, rapport mensuel, installation gratuite). **Le premier mois est à -50 %, soit 44,99 $.** Sans engagement.

**Garantie :** « Si RappelPro ne vous ramène pas au moins un client dans les 30 premiers jours, le 2e mois est gratuit. » Un seul client récupéré (une job de plomberie à 400 $, un nouveau patient dentaire) rembourse plusieurs mois d'abonnement. À ce prix, la vente se fait presque toute seule.

## Les chiffres pour atteindre 10 000 $/mois

À 89,99 $/mois, **il faut environ 112 clients actifs.** Chaque client coûte environ 4 $/mois (numéro Twilio + textos).

| Clients actifs | Revenu mensuel | Coûts (Twilio + hébergement) | Profit mensuel |
|---|---|---|---|
| 10 | 900 $ | ~60 $ | ~840 $ |
| 50 | 4 500 $ | ~220 $ | ~4 280 $ |
| 112 | **10 079 $** | ~470 $ | **~9 600 $** |

Le rabais du premier mois coûte 45 $ par nouveau client, une seule fois.

### Entonnoir de prospection (hypothèses réalistes)

Le prix bas rend la vente plus facile, mais il faut beaucoup plus de clients.

- À 89,99 $, on peut viser environ **1 client pour 40 commerces contactés**
- Avec une perte d'environ 5 % des clients par mois, il faut signer **~12 nouveaux clients par mois** pour atteindre 112 clients en **12 à 14 mois**
- Ça représente **~120 contacts par semaine** et ~6 h d'installations par mois

**Attention : ce rythme dépasse 10 h par semaine.** À 60 contacts par semaine (~6 clients par mois), le revenu plafonne autour de 5 000 à 6 000 $/mois. Pour aller jusqu'à 10 000 $, il faut une de ces options :

1. **Inscription en libre-service** : un bouton « S'abonner » sur le site (paiement Stripe), avec un guide d'installation que le client suit seul. C'est la vraie solution à ce prix-là.
2. **Un assistant de prospection payé à la commission** (par exemple le premier mois complet de chaque client signé).
3. **Plus de temps** : 15 à 20 h par semaine au lieu de 10.

Il faut être honnête : **aucun business ne garantit 10 000 $/mois.** Ce plan donne un chemin chiffré et réaliste. La variable qui compte le plus, c'est le nombre de commerces que tu contactes chaque semaine.

## Plan des 90 premiers jours

### Semaines 1–2 : mise en place (budget : ~50 $)
- [ ] Choisir **une seule niche** pour commencer (recommandé : plombiers/électriciens ou cliniques dentaires, car ils ratent beaucoup d'appels et chaque client vaut cher)
- [ ] Ouvrir un compte Twilio et acheter un numéro local
- [ ] Déployer `app/` (voir `app/README.md`) et tester avec ton propre téléphone
- [ ] Publier la page `site/index.html` (Netlify ou GitHub Pages, gratuit)
- [ ] Nom de domaine (~15 $/an) et courriel pro

### Semaines 3–6 : premiers clients
- [ ] Monter une liste de 200 commerces de la niche (Google Maps, Pages Jaunes)
- [ ] **Test de l'appel manqué** : appelle chaque commerce pendant les heures d'ouverture. Ceux qui ne répondent pas sont tes meilleurs prospects (voir `prospection.md`).
- [ ] Offrir aux 5 premiers clients un 2e mois gratuit en échange d'un témoignage
- [ ] Objectif : 8 clients

### Semaines 7–12 : régularité
- [ ] 60 contacts par semaine, sans exception
- [ ] Mettre en place l'inscription en libre-service (paiement Stripe + guide d'installation)
- [ ] Demander à chaque client satisfait : « Connaissez-vous un autre propriétaire qui pourrait en profiter ? » (un mois gratuit par référence qui signe)
- [ ] Objectif à la fin du 3e mois : 20 à 25 clients, **1 800 à 2 250 $/mois**

### Mois 4–12 : croissance
- Les clients satisfaits deviennent tes études de cas (« Plomberie X a récupéré 11 appels le premier mois »)
- Rester sur la même niche : les recommandations circulent entre gens du même métier
- Dès ~2 000 $/mois, prendre un assistant de prospection payé à la commission pour dépasser la limite de 10 h/semaine

## Ton emploi du temps (moins de 10 h/semaine)

| Activité | Temps |
|---|---|
| Prospection (appels, courriels, messages) | 4 h |
| Rendez-vous de vente (appels de 20 min) | 2 h |
| Installation des nouveaux clients (~30 min chacun) | 1 à 3 h |
| Rapports mensuels et suivi des clients | 1 h |
| **Total** | **~8 à 10 h** |

## Risques et parades

| Risque | Parade |
|---|---|
| Règles sur les SMS (CRTC/LCAP au Canada, TCPA aux États-Unis) | Les SMS partent uniquement vers des gens qui viennent d'appeler ou qui sont déjà clients. Inclure le nom du commerce et une option « ARRÊT ». Enregistrer le numéro auprès de Twilio (A2P 10DLC aux États-Unis). |
| Le client annule | Un rapport mensuel qui montre les appels récupérés rend l'annulation difficile à justifier. |
| Des concurrents offrent la même chose | Le service local et en français, en personne, sur une seule niche. Les gros logiciels ne font pas l'installation à la place du client. |
| Manque de temps | Tout est automatisé ou scripté. Ce qu'on ne peut pas sauter, c'est les 60 contacts par semaine. |

## Étape suivante (après 112 clients)

Transformer RappelPro en logiciel en libre-service (SaaS) avec des revendeurs, ou ajouter des services à forte valeur (réponse par IA aux textos entrants, prise de rendez-vous automatique) vendus en option à 30 à 50 $/mois de plus par client.
