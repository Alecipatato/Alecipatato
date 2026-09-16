# Hypercar Simulator

Simulateur temps réel (HTML/JS, sans dépendance) de l'hypercar décrite :
châssis type Koenigsegg, **4 moteurs électriques** (un par roue), **V12 quad-turbo**
en groupe hybride, **suspension adaptative** pilotée roue par roue et
**système de ventilateurs** générant de l'appui à l'arrêt comme en accélération.

## Lancer

Ouvrir `simulator/index.html` dans un navigateur. Aucun serveur requis.

Commandes : flèches / WASD, `Espace` = frein à main, ou glisser à la souris /
au doigt sur la vue du circuit.

## Ce qui est réellement simulé

| Système | Modèle |
|---|---|
| 4 moteurs indépendants | Couple par roue plafonné par la puissance (500 ch / 373 kW par moteur, 2000 ch au total) et le régime, répartition avant/arrière réglable |
| Torque vectoring | Écart entre lacet désiré (Ackermann) et lacet mesuré → couple différentiel gauche/droite |
| V12 quad-turbo 3000 ch (2237 kW) | Montée en régime + **inertie de turbo** (lag) ; fournit la puissance qui recharge/soutient la batterie |
| Ventilateurs | Appui quasi indépendant de la vitesse (≈ 835 kg max), avec inertie des turbines, actif dès le démarrage et renforcé en freinage |
| Aéro passive | Traînée `½ρCdA v²` + portance négative `½ρClA v²` |
| Suspension adaptative | Masse-ressort-amortisseur par roue ; l'amortissement se raidit avec les accélérations et l'appui, et se relâche sur la bosse |
| Transferts de charge | Longitudinal et latéral via la hauteur du centre de gravité, + appui aéro/ventilateurs |
| Pneus | Glissement longitudinal et angle de dérive, ellipse d'adhérence, sensibilité à la charge |
| Rapport de réduction | Réglable de 1,8 à 4,6 : court = reprise, long = vitesse de pointe (2,45 par défaut) |
| Surpuissance | Pied au plancher, moteurs +18 %, turbos en surpression et ventilateurs à 100 %, pendant 9 s puis recharge |
| Anti-lag | Les turbos restent en pression pied levé : la reprise est immédiate |
| Traînée induite | L'appui aéro coûte de la traînée : c'est elle qui borne la vitesse de pointe |
| Conso des ventilateurs | Jusqu'à 190 kW pris sur le groupe, comme sur une vraie voiture à effet de sol |
| Calculateur | Physique et asservissements à pas fixe de 1 ms (1000 Hz), indépendants de la fluidité d'affichage |
| Rupteur | Le couple s'annule à l'approche de 14 500 tr/min moteur (rapport 4,6), ce qui fixe la vitesse de pointe |
| ABS / antipatinage | Écrêtage du couple au-delà de 14 % de glissement |
| Énergie | Consommation batterie, récupération au freinage, soutien du V12 |

Chaque système peut être coupé en direct pour voir son effet (couper les
ventilateurs ou le torque vectoring change immédiatement le comportement).

## Réglages

Modes Circuit / Route / Pluie / Drag, adhérence µ, répartition du couple
avant/arrière, rugosité de la piste.

## Ordres de grandeur obtenus

Monocoque carbone 1250 kg, ≈ 5000 ch cumulés (4 × 500 ch électriques + 3000 ch thermiques), 0–100 km/h ≈ 2,1 s, appui total > 1600 kg à 180 km/h,
vitesse de pointe ≈ 486 km/h au rapport 2,45 (bornée par la traînée induite),
0–100 km/h en 1,4 s au rapport court,
freinage ≈ 1,4 g, 2,0 g en virage à haute vitesse.
Ce sont des valeurs de démonstration, pas les spécifications d'un véhicule réel.
