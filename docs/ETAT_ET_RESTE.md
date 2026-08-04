# Solar Conquest — État & reste à faire
*Dernière mise à jour : 2026-06-25.*

> 🛑 **OBSOLÈTE (2026-07-16).** État à jour = **`docs/REPRISE.md`** (§4 + §19). Fichier de référence = **`index.html`** (pas `solar_conquest_carte.html`, archivé).

> ⚠️ (historique) **FICHIER DE RÉFÉRENCE (màj 2026-06-25) : `solar_conquest_carte.html`** — moteur entrelacé + **nouvelle carte du système solaire** (vue globale image + secteurs cliquables, images dans `assets/map/`) + corrections UI récentes (popup autres nations rouge/agrandi + timing, VP dans la barre du haut, hauteur du modal d'agenda adaptée au mobile, Fin de Tour masqué pendant les choix de début). C'est ce que Marc teste désormais. `solar_conquest_interleaved_full.html` est l'ancienne base entrelacée, **en retard** (pas la nouvelle carte).

## Deux pistes en parallèle (volontaire, rien n'est gâché)
1. **`solar_conquest_carte.html`** (racine) = **fichier de référence actuel** : copie du vrai jeu + **boucle de tour ENTRELACÉE** + **nouvelle carte** + fixes UI. C'est ce que Marc **teste**. (`solar_conquest_interleaved_full.html` = même base entrelacée mais **sans** la nouvelle carte ; `index.html` d'origine séquentiel reste intact.)
2. **`multijoueurs/`** = **moteur propre découpé** (data.js + engine.js), sans DOM. C'est le **cœur serveur** pour le multijoueur futur. Étapes 1-3 faites (voir `multijoueurs/ARCHITECTURE.md`). `engine.js` est **généré** depuis le vrai jeu via `multijoueurs/build_engine.py` — régénérer après toute modif du jeu.

## Principe de l'entrelacé (décidé avec Marc)
Ordre **aléatoire** chaque tour, **1 action = 1 passage** (tu fais une action, la main tourne), jusqu'à ce que tous passent → fin de manche. Initiative pluggable (réservé : techs empathe/télépathe qui choisissent l'initiative ; mode « plus faible d'abord »).

## Fait récemment (retrofit entrelacé)
- Boucle entrelacée branchée (startTurn→rotation, bouton Fin du tour = passer, action→passe la main).
- IA jouée **une action à la fois**, avec **pause ~2 s** + **fenêtre centrale** « Nation : action » (reprise du texte du log, espacé).
- **Bug log plafonné corrigé** : le log ne garde que 80 lignes → mon repère basé sur la longueur cassait vers le tour 3 (fenêtre disparaissait). Repère désormais sur **l'entrée du log** (robuste). **→ à confirmer par test de Marc.**
- **Bouton Annuler du combat réparé** (fermait la mauvaise modale) : ferme + rembourse l'AC.
- **Ordre corrigé** : la main ne passe qu'une fois **toutes les modales d'action fermées** (ta route/combat finalisé avant le récap des autres), avec plafond anti-blocage.

## RESTE À FAIRE — retrofit (priorité, après confirmation des tests)
1. **Confirmer** que la fenêtre récap persiste jusqu'à la fin de partie (fix plafond 80). ✅ fait, à confirmer en jeu.
2. **Combat de fin de manche** « défaite 0 vs 15 » : ✅ routé via `war.live||G._il` (l'IA t'assaille, tu défends, plus d'auto-assaut joueur). **À revérifier en jeu.**
3. **IA trop passive** (POINT DE FOND, RÉGLAGE — nécessite playtest de Marc) : `_domFactor` 2→1,3 ; barre de **contre-attaque** abaissée (défenseur IA contre-attaque dès ~70% de la force adverse, au lieu de devoir la dépasser). Reste éventuellement : faire que l'IA **garde des ressources** pour engager ses jetons (cause du « n'a pas les moyens »). À affiner selon ressenti.
4. **Combat passe la main** : ✅ après résolution d'un combat (colonie ou route), la main passe (1 action = 1 passage). L'annulation ne passe pas.
5. Mémos UI déjà appliqués : fenêtre centrale espacée, suppression de « À toi de jouer ».
6. **Bilan de fin de tour** : ✅ section « Autres nations ce tour » réajoutée (vue d'ensemble), en plus de la fenêtre pas-à-pas.

## RESTE À FAIRE — gros chantier multijoueur (`multijoueurs/`)
- **Étape 4** : rebrancher la **vraie UI** sur le moteur-module. Obstacle connu : l'UI et le moteur **partagent des variables d'état** (`mode`, `routeFrom`, callbacks…), donc il faut faire passer toutes les références par l'API du moteur = **grosse réécriture des liaisons UI**. Reporté : on joue via le retrofit pour l'instant ; ce branchement propre se fera au moment du serveur.
- **Étape 5** : serveur Node + WebSocket + BDD (multijoueur réel). Marc a déjà serveur + BDD.
- **Étape 6** : IA plus forte (vise son agenda, planifie, diplomatie).

## Comment tester / lancer
- **Retrofit jouable** : double-clic `solar_conquest_interleaved_full.html` (dossier `moteur/` pas nécessaire pour celui-ci).
- **Moteur headless** : `node multijoueurs/sim_interleaved.js 100` (parties entrelacées) ; `node multijoueurs/sim.js 100` (séquentiel).
- **Régénérer le moteur** après modif du vrai jeu : `python3 multijoueurs/build_engine.py`.
- **Tests de règles** (sur le vrai jeu) : `node scripts/test_regles.js` (13 règles).

## Préférences de Marc (rappel)
Concis et direct, pas de flagornerie, pas de mensonge, pas le mot « honnêtement ». **Toujours un GO formel avant de lancer une itération/action coûteuse.** « mémorise » = noter sans implémenter. Chercher d'abord la solution la plus simple/gratuite ; proposer le coûteux seulement en expliquant pourquoi, et il choisit.
