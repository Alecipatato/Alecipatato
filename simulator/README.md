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
| Pneus | Formule de Pacejka calée sur un Michelin Cup 2 R : le grip culmine vers 10-12 % de glissement puis redescend, ellipse d'adhérence, sensibilité à la charge |
| Masse | Bilan de composants poste par poste (≈ 1671 kg en ordre de marche), affiché dans la page |
| Alimentation électrique | Batterie 30 kWh limitée à 25 C (750 kW) + génératrice 600 kW entraînée par le V12, dont la puissance est retirée de ce que le V12 envoie aux roues |
| Thermique moteurs | Échauffement selon les pertes, réduction de puissance au-delà de 165 °C |
| Freins | Couple plafonné par les étriers carbone-céramique |
| Résistance au roulement | Crr 0,012 appliqué à la charge totale, appui compris |
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

Masse en ordre de marche ≈ 1671 kg (bilan de composants), ≈ 5000 ch cumulés (4 × 500 ch électriques + 3000 ch thermiques), appui total > 2000 kg à 220 km/h,
vitesse de pointe ≈ 440 km/h, 0–100 km/h en 1,74 s, 1,64 g au départ,
freinage ≈ 1,4 g, 2,0 g en virage à haute vitesse.
Ce sont des valeurs de démonstration, pas les spécifications d'un véhicule réel.

## Ce qui vient de chiffres réels et ce qui vient du cahier des charges

Réels (publiés par Koenigsegg pour le Jesko Absolut) : empattement 2,70 m,
voie 1,68 m, Cx 0,278, surface frontale ≈ 1,88 m².
Réalistes mais estimés : bilan de masse, capacité et taux de décharge de la
batterie, rendements, couples de freinage, appui des ventilateurs (ordre de
grandeur des Brabham BT46B et McMurtry Spéirling).
Cahier des charges, pas un véhicule existant : le V12 quad-turbo de 3000 ch et
les 4 moteurs de 500 ch. Aucun V12 de série n'atteint ces valeurs.
