# 🔨 LOT 16 — CHANTIER PRÉPARÉ (aucune ligne écrite, en attente du GO de Marc)

> Préparé le 2026-08-03. Fondé sur l'analyse de `ARCHITECTURE_AVENIR.md` — **le lire d'abord**.
> Objectif : rendre le jeu solide pour les trois cas visés (mobile hors ligne / IA serveur /
> multijoueur 4 joueurs) **sans jamais casser le jeu qui tourne bien aujourd'hui (v5.1)**.
>
> ⚠️ RIEN ici ne doit être commencé sans un GO explicite de Marc, **tâche par tâche**.

---

## Découpage en deux vagues

La distinction n'est pas cosmétique : la **vague A** ne touche pas au déroulement d'une partie et
peut se faire pendant que les amis de Marc testent. La **vague B** immobilise le jeu.

---

# VAGUE A — sans danger, faisable à tout moment

> **ÉTAT au 2026-08-03 : A1, A2 et A4 sont FAITS (v5.9). Reste A3.**

### A1. Numéro de version dans le protocole client/serveur
**Pourquoi** : sur mobile, un joueur garde une vieille application des mois. Elle parlera à un
serveur récent sans que rien ne le détecte. On vient déjà de perdre deux jours sur une question de
version de fichier ; sur mobile ce sera pire et le correctif deviendra coûteux.
**Quoi** : un champ `proto` dans le message `hello`/`auth`. Si le client est trop ancien, le serveur
répond un message clair (« mets à jour l'application ») au lieu de laisser la partie dérailler.
**Coût** : ~10 lignes. **Risque** : nul.

### A2. Déclarer explicitement le bloc moteur
**Pourquoi** : `game-core.js` charge « le plus gros bloc `<script>` » d'`index.html`. C'est une
heuristique. `uiFillIncome` vit dans un bloc que le serveur ne charge **jamais** — c'est ce qui a
rendu le correctif du revenu net inopérant pendant une semaine.
**Quoi** : marquer le bloc par un commentaire sentinelle (`/* @moteur */`) et le charger par ce
marqueur ; **échouer bruyamment** s'il est absent. Puis inventorier ce qui vit hors moteur et
décider, fonction par fonction, si c'est légitime (pur affichage) ou si ça doit migrer.
**Coût** : petit. **Risque** : faible — un test le vérifie immédiatement.

### A3. Le banc d'essai doit EXÉCUTER le serveur, pas le rejouer
**Pourquoi** : `playthrough.js` réimplémente la distribution de `server.js`. Une régression du
serveur passerait inaperçue.
**Quoi** : faire tourner le vrai `server.js` et brancher 4 clients WebSocket simulés.
**Coût** : moyen. **Risque** : nul (outil de test).

### A4. Valider le CONTENU des réponses client
**Pourquoi** : le serveur vérifie que la décision appartient au siège qui répond, mais pas le
contenu (jetons engagés, cible). Indispensable avant d'ouvrir le jeu à des inconnus.
**Coût** : petit. **Risque** : faible.

---

# VAGUE B — chantiers de fond, le jeu est immobilisé

### B1. 🔴 Rendre la perspective EXPLICITE (chantier principal)
**Pourquoi** : c'est la cause unique de quatre bugs déjà vécus (bilan mélangé, raids mal attribués,
victoire chez l'autre joueur, combat/paix envoyés au seul joueur 1). Voir `ARCHITECTURE_AVENIR.md`
§2. Tant que « le joueur » est une globale, la famille reviendra.

**Le point le plus urgent** : **38 rappels différés** (`_warModalCb`, `_peaceCb`, `_warCombatCb`)
traversent une décision. L'entrée dans chaque guerre est sécurisée (`_focusWar`), **la reprise ne
l'est pas** : la réponse arrive 30 secondes plus tard et le code reprend avec la perspective
courante, qui a pu changer.

**Approche progressive proposée** (ne PAS tout réécrire d'un coup) :
1. Encapsuler chaque rappel différé dans un « emballage de perspective » qui mémorise la nation au
   moment de l'émission et la restaure à la reprise. *Gain immédiat, risque contenu.*
2. Passer la nation en **paramètre explicite** dans le flux de guerre (`showPeaceOfferModal(nat,…)`,
   `showWarCombatModal(nat,…)`, `resolveWarCombat(nat,…)`).
3. Migrer les globales restantes vers un état par nation : `G.warWith`, `G.warTurnsLeft`,
   `G.warWins`, `G._aiWarStance`, `G._aiWarTarget`, `G.warRisk`, `G._peaceOffer`,
   `G._postWarColonizeOffer`.
4. Ne garder en global que ce qui est **réellement commun** : la rivière de cartes, `G.techTaken`
   (une carte exclusive prise par une faction est bien indisponible pour les autres — c'est une
   RÈGLE, pas un bug), les accords, la carte.

**Filet obligatoire** : après chaque étape, `node server/playthrough.js` à 4 humains — le tableau
des destinataires doit rester réparti entre les vrais belligérants.
**Coût** : plusieurs heures, à étaler. **Risque** : réel. **Ne pas lancer pendant une phase de test.**

### B2. Unifier les deux chemins de fin de tour
**Pourquoi** : `endTurn` (solo) et `runEndOfRound` (serveur) coexistent. Deux chemins = deux
comportements ; je m'y suis fait piéger deux fois. Pour le mobile, le jeu appris hors ligne doit se
comporter exactement comme en ligne.
**Coût** : moyen. **Risque** : moyen — c'est le cœur de la boucle de jeu.

### B3. Isoler l'IA derrière une interface (prérequis du cas 2)
**Pourquoi** : l'IA lit et écrit des globales, écrit dans le journal, ouvre des fenêtres. Elle n'est
pas une fonction « état → action » ; on ne peut pas la remplacer.
**Quoi** : `proposerCoup(état, nation) → action`, en réutilisant le vocabulaire d'`ACTIONS`
(`server/game-core.js`). Puis **deux** implémentations — une locale (hors ligne), une distante
(forte) — et un test qui vérifie que **les deux produisent des coups légaux** sur les mêmes états.
**Coût** : important. **Risque** : moyen (l'IA actuelle sert de référence de non-régression).

### B4. Plusieurs décisions en vol
**Pourquoi** : `G._pending` est un emplacement unique. À 4 joueurs, le choix de carte Stratégie est
strictement séquentiel : quatre attentes là où tout le monde pourrait choisir en même temps. Rendrait
aussi le bilan de fin de tour **vraiment** simultané (aujourd'hui c'est un canal parallèle que le
moteur n'attend pas).
**Coût** : important. **Risque** : élevé — touche au cœur du courtier de décisions.
**À faire APRÈS B1** : sans perspective explicite, plusieurs décisions en vol serait ingérable.

### B5. Robustesse de la sauvegarde/reprise (prérequis mobile)
**Pourquoi** : sur mobile, l'OS tue l'application en arrière-plan. La reprise sera sollicitée bien
plus qu'aujourd'hui, or elle est fragile : `Set`/`Map` à réanimer, références circulaires qui ont
déjà planté, `refreshWarViews()` obligatoire après restauration.
**Quoi** : une sérialisation explicite et testée (écrire → relire → comparer), plutôt que des
revivers ajoutés au fil des plantages.
**Coût** : moyen. **Risque** : faible si couvert par un test.

---

## Ordre conseillé

**A1 → A2 → A4 → A3**, puis **B1 (par étapes) → B2 → B5 → B3 → B4**.

La vague A peut commencer dès maintenant sans gêner les tests avec les amis de Marc.
La vague B attend une fenêtre où le jeu peut être immobilisé.

---

## Rappel de méthode

Une partie → lire la transcription → corriger → une partie. Jamais 20 parties d'un coup.
Pour tout bug d'affichage : capturer l'`innerHTML` réellement produit, et chercher s'il existe un
second rendu de la même zone avant de conclure.
