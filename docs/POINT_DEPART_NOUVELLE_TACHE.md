# Solar Conquest — Point de départ pour une nouvelle session
*Document de passation autonome. Dernière mise à jour : 2026-06-25.*

> 🛑 **PARTIELLEMENT OBSOLÈTE (2026-07-16).** Point d'entrée à jour = **`docs/REPRISE.md`**. Le fichier de référence n'est PLUS `solar_conquest_carte.html` (archivé) mais **`index.html`** (édité directement) ; le tuto `tutorial.html` en est régénéré. Lire ce doc seulement pour l'historique.

> ⚠️ (historique) **FICHIER DE RÉFÉRENCE (màj 2026-06-25) : `solar_conquest_carte.html`.**
> C'est désormais LE fichier à tester et à modifier (double-clic). Il contient : moteur entrelacé + **nouvelle carte du système solaire** (vue globale image + secteurs cliquables, images dans `assets/map/`) + les corrections UI récentes (popup « autres nations » rouge/agrandi + timing, VP affiché dans la barre du haut, hauteur du modal d'agenda adaptée au mobile, bouton Fin de Tour masqué pendant les choix de début).
> `solar_conquest_interleaved_full.html` est l'**ancienne** base entrelacée (sans la nouvelle carte) — conservée mais en retard. `index.html` / `small_screen` / `game` n'ont pas la nouvelle carte non plus. À resynchroniser seulement avant un déploiement.

---

## 0. Le projet en bref
Jeu de stratégie spatiale au tour par tour (système solaire : colonies, routes, technologies, civique, diplomatie, guerre, points de victoire). 2 à 4 nations (1 humain + IA), 10 tours. Civilisations : Terriens, Martiens, Jupitériens, Ceinturiens.

**Cap produit (objectif final) :** **multijoueur en ligne** (joueurs distants) + **IA capables d'être des adversaires valables**. Marc ne veut PAS de hot-seat.

**Décision d'architecture (validée) :** modèle de tour **ENTRELACÉ** — ordre **aléatoire** chaque tour, **1 action = 1 passage** (tu joues une action, la main tourne), jusqu'à ce que tous passent → fin de manche. (Abandon du séquentiel « toi tout → IA tout ».)

---

## 1. Les fichiers qui comptent (dossier `Desktop/star conquest/`)
- **`solar_conquest_carte.html`** ← **FICHIER DE RÉFÉRENCE — C'EST CE QUE MARC TESTE.** Moteur entrelacé + **nouvelle carte** (vue globale image + secteurs, `assets/map/`) + corrections UI récentes. Jouable en double-clic.
- **`solar_conquest_interleaved_full.html`** = ancienne base entrelacée (vraie UI + règles + boucle entrelacée), **sans la nouvelle carte**. En retard sur `carte`.
- **`index.html` / `solar_conquest_small_screen.html`** = le **vrai jeu d'origine** (séquentiel), intact. `index.html` est le déployé (= small_screen). `small_screen` est la **source** du moteur extrait.
- **`solar_conquest_game.html`** = version desktop (logique synchronisée, sans icônes images, sans `CARD_ART`).
- **`multijoueurs/`** = **moteur propre découpé** (cœur serveur futur) :
  - `data.js` — toutes les données (carte, cartes, civs, événements, agendas, investissements), SANS DOM.
  - `engine.js` — **109 fonctions de règles** extraites, SANS DOM, **GÉNÉRÉ** par `build_engine.py` (régénérer après modif du jeu).
  - `ai.js` — IA POC.
  - `sim.js` / `sim_interleaved.js` — simulateurs headless (parties entières / entrelacées).
  - `build_engine.py` — régénère `engine.js` depuis `solar_conquest_small_screen.html`.
  - `ARCHITECTURE.md` — détail de l'archi + jalons.
- **`moteur/`** = ancien POC entrelacé (preuve de concept, modèle de données différent — peut servir de référence).
- **`scripts/test_regles.js`** — 13 règles vérifiées sur le vrai jeu (`node scripts/test_regles.js`).
- **`regles/Regles_Solar_Conquest_v16.docx`** — règles à jour.
- **`docs/`** — `RESUME_PROJET.md`, `ETAT_ET_RESTE.md`, `ARCHITECTURE.md`, `CARTES_INVENTAIRE.md` (prompts nano banana), ce fichier.

---

## 2. Ce qui a été fait (résumé des changements récents)
**Sur le vrai jeu (`small_screen` + `game` + `index`) :**
- **Cartes illustrées** : toutes les illustrations tech/civique/militaire intégrées (`CARD_ART`, fichier mobile) ; grandes + petites cartes générées (`scripts/make_card.py`/`make_mini.py`) ; tuiles militaires/civiques et popup détail utilisent `CARD_ART` ; Supercroiseur décalé ; badge « +0 PV » masqué.
- **Icônes de ressources** : emojis ⚡🪨🔬❤️ remplacés par **images inline base64** (`.ri`, balises `<i class=ri-X></i>` sans guillemets) PARTOUT dans l'UI mobile ; `rEmoji` renvoie ces balises ; corrigé un bug `textContent`→`innerHTML` (balises affichées en texte).
- **Équilibrage** : Réseau Empathique `+1🔬/tour` (au lieu +2 Gouv) ; Sphère de Dyson : nations acceptantes `+3⚡/tour` ; Domination des Corporations `+5 pts` ; Démocratie Directe coût `3🪨2⚡1🔬` + entretien `−2🪨−2⚡`.
- **Bug colonisation** : Expansion Rapide (stratégie −1 AC) limitée à **1 colonisation/tour** (drapeau `_stratColUsed`). Test RÈGLE 12.
- **Refonte guerre** : guerre populaire forcée → vrai combat (plus de capture auto) ; IA déclare → tu défends ; **max 2 attaques/tour** ; « Exiger la paix » (tribut) ; **tension effective −6** envers les autres nations en guerre ; **attaque de route** joueur (clic carte) + IA. Tests RÈGLE 12, 13.
- **Règles Word v15 (Dyson, Empathique) puis v16 (Corpo, Démocratie).**

**Nouveau — moteur découpé (`multijoueurs/`)** : extraction auto du vrai moteur (109 fonctions), tourne sans DOM, en entrelacé, parties entières validées (sim 100 parties 0 anomalie). Étapes 1-3 faites.

**Retrofit jouable (`solar_conquest_interleaved_full.html`)** : vrai jeu + boucle entrelacée + IA une-action ; **fenêtre centrale** récap des actions des autres nations (format log, espacé, ~2 s, robuste au log plafonné à 80 lignes) ; bouton **Annuler** du combat réparé ; la main ne passe qu'après **fermeture des modales** ; **bilan de fin de tour** avec section « Autres nations » ; **IA plus agressive** (seuil 2→1,3 ; contre-attaque dès ~70% de ta force) ; **combat passe la main** après résolution.

---

## 3. CARTE ROUTIÈRE — passer du HTML à l'UI propre (étape 4) puis serveur (5) et IA (6)
État : le **moteur** (`multijoueurs/`) contient déjà toutes les règles, tourne sans écran, en entrelacé. Reste à **rebrancher la vraie UI dessus** pour qu'il soit la seule source de vérité.

### Étape 4 — Rebrancher la vraie UI sur le moteur-module (le gros bloc)
- **4a. Répartir l'état** : décider ce qui appartient au **moteur** (joueurs, colonies, guerres, tensions, tour) vs à l'**UI** (`mode`, `routeFrom`, callbacks de modales, rendu). C'est le vrai nœud : aujourd'hui c'est mélangé (variables partagées).
- **4b. L'UI lit l'état du moteur** : les fonctions de rendu doivent lire `engine.getState()` au lieu de leur propre `G`.
- **4c. L'UI envoie des ACTIONS** : réécrire les ~12 gestionnaires (coloniser, route, tech, civique, attaque…) pour appeler **`engine.applyAction(...)`** au lieu de muter `G`.
- **4d. Modales → « décisions en attente »** : combat/défense, Dyson, guerre populaire, draft stratégie, investissement → le moteur renvoie `state.pending`, l'UI affiche la modale et rappelle **`engine.resolvePending(decision)`**. (Mécanisme déjà prouvé sur le POC.)
- **4e. Brancher les 37 crochets UI** du moteur via **`engine.setUI({render, addLog, showWarCombatModal, …})`** (déjà prévu dans `engine.js`).
- **4f. Boucle entrelacée pilotée par le moteur** (`nextActor`) ; l'IA (`ai.js`) devient un **client** qui envoie des actions.
- **Difficulté principale = 4a + 4c** (la réécriture des liaisons d'état UI).

### Étape 5 — Serveur + multijoueur
- Serveur **Node + WebSocket + BDD** (Marc a déjà serveur + BDD). Le moteur tourne côté **serveur** (autorité) ; le navigateur devient un **client léger** ; l'IA = un client. C'est là que la séparation propre paie.

### Étape 6 — IA plus forte
- IA qui **vise son agenda secret**, planifie, fait de la diplomatie. (Aujourd'hui : priorités simples + agressivité réglée à la louche.)

**Recommandation sur le timing :** faire l'étape 4 **au moment de monter le serveur (étape 5)** — c'est là qu'elle prend son sens — plutôt que maintenant. En solo, le **retrofit jouable suffit**.

---

## 4. Réglages / mémos en attente (retrofit) — à valider par le test de Marc
- **IA agressivité** : seuil baissé (réglage), à juger en jouant — encore trop molle ou trop ? Le « n'a pas les moyens d'attaquer » (IA à court de ressources pour engager ses jetons) reste à affiner (lui faire garder une réserve de ressources en guerre).
- Confirmer en jeu : fenêtre récap persiste après le tour 3 ; combat de fin de manche OK ; combat passe bien la main.

---

## 5. Comment lancer / tester / régénérer
- **Jouer le retrofit** : double-clic `solar_conquest_interleaved_full.html`.
- **Sim headless** : `node multijoueurs/sim_interleaved.js 100` (entrelacé) ; `node multijoueurs/sim.js 100` (séquentiel).
- **Régénérer le moteur** après modif du vrai jeu : `python3 multijoueurs/build_engine.py`.
- **Tests de règles** : `node scripts/test_regles.js` (13 règles, sur les 2 HTML).
- **Éditer le Word** : `unpack.py`/`pack.py` ou `zipfile` Python sur `word/document.xml` (apostrophes droites ' ; ancres sans apostrophe).

---

## 6. Préférences de Marc (IMPORTANT)
- Concis et direct, pas de flagornerie, **pas de mensonge**, ne pas utiliser le mot « honnêtement ».
- **Toujours un GO formel avant de lancer une itération/action qui coûte des tokens.**
- **« mémorise »** = prendre note SANS implémenter.
- Chercher d'abord la solution **la plus simple/gratuite** ; proposer le coûteux seulement en expliquant pourquoi c'est mieux, et il choisit.
