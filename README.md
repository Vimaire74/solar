# Lot 18-5 — CE LOT EST EN **v11.57** · cache `sw.js` **v278** · 2026-10-05 — SERVEUR À REDÉPLOYER

(Seulement les fichiers changés depuis la v11.56 — lot18-4. Détail : docs/REPRISE.md §228.)

- IA (E5) : au combat de fin de tour, un ordinateur n'attaque plus une cible dont la défense attendue (garnison, cartes, croiseur, jetons) dépasse sa puissance — fin des assauts 4 contre 10 sur une capitale
- IA (E6) : au dernier tour, la note d'un coup est le score lui-même — plus de dépenses sans points, les stocks partent en améliorations et cartes
- IA (expansion) : la prime de colonisation accepte un nœud à 3 sauts du réseau (au lieu de 2), toujours décroissante avec la distance — les Ceinturiens peuvent s'étendre
- Bancs : test_e5_e6.js (nouveau), test_guerre_ia_ia_appli.js (montage adapté à E5)
