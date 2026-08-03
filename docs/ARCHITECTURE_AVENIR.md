# 🏛️ ARCHITECTURE — CE QUI TIENDRA ET CE QUI CASSERA

> **À LIRE EN PREMIER À CHAQUE REPRISE**, avec `REPRISE.md` et `OVH_SETUP_JOURNAL.md`.
> Rédigé le 2026-08-03 à la demande de Marc, après le lot v5.1.
>
> Ce document n'est pas un historique (c'est le rôle du journal). C'est **l'analyse de fond** :
> pourquoi les mêmes bugs reviennent, et ce qui va casser quand le jeu deviendra une application
> mobile. Toute correction future doit être pesée à l'aune de ce qui est écrit ici.

---

## 0. Les trois cas visés par Marc (l'objectif final)

| Cas | Description | Contrainte principale |
|---|---|---|
| **1** | Application mobile (Android + iOS) jouable **hors ligne**, en solo contre l'IA | Aucun serveur. Tout doit tourner dans l'appareil. |
| **2** | Application **connectée**, où une IA **plus performante** tourne sur le serveur | Deux IA différentes doivent obéir aux mêmes règles. |
| **3** | Application **multijoueur en ligne** (jusqu'à 4 humains) | Serveur autoritaire, plusieurs perspectives simultanées. |

Règle absolue posée par Marc : *« on doit faire un jeu qui tienne aussi bien en solo contre l'IA,
en local/réseau, qu'en multijoueur par le serveur — donc ne cède pas à la facilité »*. Autrement
dit : **une seule logique de jeu**, jamais un correctif qui ne marche que dans un mode.

---

## 1. Ce qui est SAIN et qu'il faut préserver

**Le courtier de décisions.** `_emitDecision(kind, nation, payload, cb)` / `setDecisionSink()` /
`resolveDecision()`. En solo le sink est `null` → les vraies fenêtres du jeu s'ouvrent. En serveur,
le sink est installé → la même décision part au client concerné. **La logique de jeu est identique
dans les trois cas.** C'est la couture qui rend le projet possible ; ne jamais la contourner.

**Le serveur autoritaire.** L'état vit sur le serveur (`server/driver.js` pilote `game-core.js`, qui
exécute le vrai code d'`index.html`). Le client envoie des INTENTIONS, jamais un état. C'est le bon
modèle pour le cas 3 et il interdit la triche par construction.

**Le motif « fonction pure qui produit le contenu ».** `buildEOTBody(maint, revs, …)` ne touche
aucun DOM : le solo l'injecte, le serveur l'envoie, le client l'injecte tel quel. Résultat : bilan
**rigoureusement identique** dans les trois cas, sans duplication. **C'est le motif à généraliser**
à toutes les fenêtres (voir §4).

---

## 2. LA ligne de faille : la perspective est une variable globale

Le moteur a été écrit pour **un** joueur. « Le joueur », c'est `G.player`. Tout en découle :
`G.warWith` (31 usages), `G.warTurnsLeft`, `G.warWins`, `G._aiWarStance`, `G._aiWarTarget`,
`G.turnActions`, `G._raidsThisTurn`, `G.warRisk`, `G._peaceOffer`, `G._postWarColonizeOffer`,
`G._discCache`.

Le multijoueur fonctionne en **échangeant** ce que `G.player` désigne :
`driver.activate(civId)`, `_focusWar(w)`, la boucle de perspective dans `showEOTModal`.

### Pourquoi c'est le vrai problème

Ces quatre bugs, découverts séparément entre le 26/07 et le 03/08, **sont le même bug** :

| Symptôme constaté par Marc | Cause réelle |
|---|---|
| Bilan de fin de tour mélangeant les nations | `G.turnActions` global |
| Raids attribués au mauvais joueur | `G._raidsThisTurn` global |
| Fenêtre de victoire vue aussi par Laurent | notice diffusée + adressée à `G.player` |
| Combat et paix envoyés au seul joueur 1 (20/20) | `processAllWars` ne changeait pas de perspective |

À chaque fois, la correction a consisté à **dupliquer l'état par nation** (`p._turnActions`,
`p._raidsThisTurn`, `p._lastMaint`, `p._lastRevs`) ou à **basculer la perspective**. Ces correctifs
sont justes, mais ils maintiennent **à la main** un invariant : *« G.player désigne toujours la
nation dont on parle en ce moment »*. Il suffit d'oublier une bascule pour recréer un bug de
destinataire. Il reste des globales non traitées dans la liste ci-dessus.

### Le danger non corrigé : la reprise après décision

Il existe **38 rappels différés** (`_warModalCb`, `_peaceCb`, `_warCombatCb`) qui **traversent une
décision**. En solo la réponse est immédiate. En réseau elle arrive 30 secondes plus tard, et le
code reprend avec la perspective **courante**, qui peut avoir changé entre-temps.

👉 **L'entrée dans chaque guerre est sécurisée (`_focusWar`), la REPRISE ne l'est pas.**
À 4 joueurs, c'est la prochaine famille de bugs. **C'est le chantier n°1 du lot 16.**

---

## 3. Risques par cas d'usage

### Cas 1 — mobile hors ligne
Le plus sûr : le solo ne dépend d'aucun serveur. Deux réserves :

- **Deux chemins de fin de tour coexistent** : `endTurn` (solo) et `runEndOfRound` (serveur). Je me
  suis fait piéger deux fois en corrigeant l'un et pas l'autre. Deux chemins = deux comportements :
  le jeu appris hors ligne peut différer du jeu en ligne.
- **Le moteur est défini par une heuristique.** `game-core.js` charge « le plus gros bloc
  `<script>` » d'`index.html`. Conséquence réelle : `uiFillIncome` vit dans un bloc que le serveur
  **ne charge jamais** — une partie du code de règles/affichage est invisible côté autorité, sans
  que rien ne le déclare. C'est ce qui a rendu le correctif du revenu net inopérant pendant une
  semaine (deux fonctions écrivaient `#top-res`, la seconde écrasait la première).

### Cas 2 — IA forte côté serveur
**Le cas le plus mal préparé.** L'IA actuelle n'est pas une fonction « état → action » : elle lit et
écrit des globales (`G.aiActions`, `ai._turnActions`, `G._aiWarStance`), écrit dans le journal et
déclenche elle-même des fenêtres. Elle est **entremêlée** au moteur.

Pour brancher une IA plus forte il faut d'abord l'isoler derrière une interface explicite
(`proposerCoup(état, nation) → action`), en réutilisant le vocabulaire d'actions qui existe déjà
dans `ACTIONS` (`server/game-core.js`). Et il en faudra **deux** — une locale pour le hors-ligne,
une distante — qui doivent produire des coups **légaux selon les mêmes règles**. Sans interface
commune ni test qui les compare, elles divergeront.

### Cas 3 — multijoueur
- **`G._pending` est un emplacement UNIQUE** : le moteur ne pose qu'une décision à la fois. À
  4 joueurs, le choix de carte Stratégie devient strictement séquentiel — quatre attentes là où tout
  le monde pourrait choisir simultanément. Problème de confort, pas de correction.
- **Le bilan « simultané » actuel est un canal parallèle**, pas une vraie simultanéité : les trois
  autres joueurs reçoivent une fenêtre que le moteur **n'attend pas** et dont il ne saura jamais si
  elle a été lue.
- La famille « mauvais destinataire » reviendra tant que la perspective sera une globale (§2).

---

## 4. Autres dettes structurelles

- **`online.js` redéveloppe de l'interface qui existe déjà** dans `index.html` : quatorze fonctions
  de rendu, plus le tableau des points de victoire réécrit alors qu'il existe en solo (`#vp-wrap`).
  Chaque règle se maintient à deux endroits → divergence garantie à terme.
  *Remède : généraliser le motif « fonction pure » de `buildEOTBody`.*
- **Aucun numéro de version dans le protocole** client/serveur (`t:'decision'`, `t:'notice'`…). Sur
  mobile l'utilisateur garde une vieille application des mois : elle parlera à un serveur récent
  sans que rien ne le détecte. **Dix lignes aujourd'hui, très coûteux plus tard.**
- **Sérialisation fragile** : `Set`/`Map` à réanimer (`__set`/`__map`), références circulaires qui
  ont déjà planté (`_enemy`), `refreshWarViews()` obligatoire après restauration. Sur mobile, l'OS
  tue l'application en arrière-plan : la reprise d'état sera sollicitée bien plus qu'aujourd'hui.
- **Validation des réponses client incomplète** : le serveur vérifie bien que la décision appartient
  au siège qui répond, mais le **contenu** n'est pas audité (nombre de jetons, cible…). À reprendre
  avant d'ouvrir le multijoueur à des inconnus.
- **Le banc d'essai REJOUE la logique de `server.js`** au lieu de l'exécuter : il ne verra pas une
  régression du serveur. Deux garde-fous statiques compensent partiellement.

---

## 5. Méthode de vérification (rappel — non négociable)

`node server/playthrough.js` joue **UNE** partie à **4 humains** et imprime la transcription :
chaque fenêtre, son destinataire, son texte. Protocole imposé par Marc : **une partie → lire →
corriger → une partie**. Jamais 20 parties d'un coup.

Leçon coûteuse à ne pas réapprendre : pour un bug d'affichage, **capturer l'`innerHTML` réellement
produit** et le lire. Ne jamais conclure en appelant la fonction de calcul isolément, et **toujours
chercher s'il existe un second rendu de la même zone** avant de conclure.

---

## 6. Ordre d'attaque recommandé (détail dans `LOT16_CHANTIER.md`)

Par valeur décroissante rapportée au coût et au risque :

1. **Rendre la perspective explicite** dans le flux de guerre (gros chantier, risque réel).
2. **Déclarer explicitement le bloc moteur** au lieu de prendre le plus gros (petit, peu risqué).
3. **Numéro de version dans le protocole** (dix lignes, à faire tout de suite).
4. **Isoler l'IA derrière une interface** (prérequis du cas 2).
5. **Plusieurs décisions en vol** (confort du cas 3).

⚠️ Le point 1 immobilise le jeu quelques jours. **Ne pas le lancer pendant une phase de test avec
les amis de Marc.** Les points 2 et 3 sont sans danger et peuvent se faire à tout moment.
