# 🎲 LOT 17 — PARTIES PERSISTANTES ET REPRENABLES (modèle BGA)

> Spécification écrite le 2026-08-05 à partir des décisions de Marc. **Référence : Board Game Arena.**
> Marc : *« Le système BGA est vraiment parfait, faut essayer de faire comme eux. »*
>
> ⚠️ Ce document fige des DÉCISIONS DÉJÀ PRISES. Ne pas les rediscuter, ne pas redemander à Marc.
> Les points encore ouverts sont listés en fin de document, clairement marqués.

---

## 1. Décisions de Marc (verbatim, non négociables)

| Sujet | Décision |
|---|---|
| Rafraîchir la page | **Ne doit JAMAIS casser la partie.** On revient dans la partie **sans rien cliquer**. |
| Parties en cours | Enregistrées **sur le serveur**, reprenables depuis **n'importe quel appareil** avec le même compte (autre navigateur, autre ordinateur, mobile). |
| Partie abandonnée | **Ne doit PAS continuer toute seule.** *« C'est déprimant. »* → l'auto-jeu après absence est **supprimé**. |
| Joueur absent | **Option C retenue** : les autres joueurs peuvent **voter pour le remplacer par une IA**. Le jeu continue alors — mais **sur décision humaine, jamais tout seul**. |
| Liste des parties reprenables | Affichée **au moment de créer une partie**. Pour chaque partie : **date et heure de création au format européen** (jj/mm/aaaa hh:mm), **joueurs connectés** s'il y en a, **sinon le nombre d'IA**. |
| Types de partie | Deux familles, **choisies explicitement à la création** :<br>· **temps réel** — délai par coup : **30 s** / **2 min** / **5 min**<br>· **tour par tour** *(nom voulu par Marc, surtout pas « temps différé »)* — **2** / **3** / **5 coups par jour** |
| Délai expiré | **Ne déclenche RIEN tout seul.** Le joueur est averti qu'il est en retard et qu'il peut être remplacé ; les autres **peuvent alors** voter. Sans vote, la partie attend. |
| Rafraîchissement | Traité comme un **signal de détresse** : déclenche une passe de vérification de la partie (voir étape 5bis). |

---

## 2. État des lieux (ce qui existe vraiment, vérifié le 2026-08-05)

- ✅ L'état de chaque partie est **écrit** sur disque après chaque avancée : `data/games/<code>.json` (`snapshot()`).
- 🔴 **Il n'est JAMAIS RELU.** L'en-tête de `server.js` l'admet : *« reprise après redémarrage : TODO v2 »*.
  → Aujourd'hui, **tout redéploiement détruit les parties en cours**. C'est le gros du chantier.
- ✅ Sessions persistantes depuis la **v7.1** (jetons sur le volume) : un redéploiement ne déconnecte plus.
- 🔴 `armTimer()` fait jouer l'IA à la place d'un joueur **déconnecté** après 30 s de grâce
  (`RECONNECT_GRACE_MS`). **C'est exactement ce que Marc veut supprimer.**
- ⚠️ Rappel d'`ARCHITECTURE_AVENIR.md` §4 : la sérialisation est **fragile** (`Set`/`Map` à réanimer,
  cycles déjà rencontrés, `refreshWarViews()` obligatoire après restauration). Recharger une partie
  depuis le disque, c'est exercer ce chemin fragile **à chaque démarrage** — d'où l'ordre ci-dessous.

---

## 3. Étapes proposées, dans cet ordre

L'ordre n'est pas arbitraire : chaque étape rend la suivante sûre, et chacune est **livrable seule**.

### Étape 1 — Sérialisation prouvée (fondation, sans effet visible)
Écrire → relire → **comparer** un état de partie, et vérifier que le jeu repart correctement.
C'est la tâche **B5** du lot 16. Tant que ce test n'est pas vert, recharger une partie au démarrage
reviendrait à bâtir sur du sable. **Aucun changement visible pour les joueurs.**

### Étape 2 — Recharger les parties au démarrage
Au lancement, relire `data/games/*.json`, reconstruire le pilote de chaque partie non terminée.
→ **Un redéploiement ne détruit plus rien.** Prérequis : étape 1.

### Étape 3 — Reprise automatique après rafraîchissement
Le client, une fois identifié, demande au serveur ses parties en cours et **rentre directement dans
celle où il jouait**, sans écran intermédiaire. Répond à *« si je rafraîchis, je reviens sur la partie »*.

### Étape 4 — Supprimer l'auto-jeu + vote de remplacement (option C)
Retirer l'auto-jeu après absence. À la place : un joueur absent est signalé, et les **autres joueurs
peuvent voter** son remplacement par une IA. Majorité des joueurs présents ; effet immédiat une fois
le vote acquis ; la nation passe en IA jusqu'à la fin de la partie.

### Étape 5 — Liste des parties reprenables
À la création d'une partie : liste des parties en cours de ce compte, avec date/heure européenne,
joueurs connectés ou nombre d'IA, tour en cours. Choix « reprendre » ou « nouvelle partie ».

### Étape 5bis — Le RAFRAÎCHISSEMENT déclenche une passe de vérification (idée de Marc)
Marc : *« si le joueur rafraîchit, c'est probablement intentionnel — il essaie de contrer un bug,
par exemple le jeu n'avance plus. »* C'est juste : un rafraîchissement est un **signal de détresse**,
pas un événement neutre. On s'en sert.

À la reconnexion consécutive à un rafraîchissement, le serveur **examine la partie** :
- une décision est-elle en attente pour ce joueur ? → on la lui **renvoie** ;
- une décision est-elle en attente **sans destinataire** ? (= blocage certain) → on lui en attribue un ;
- aucune décision et aucun joueur actif ? → la partie est figée → on **relance le pilote** (`pump()`) ;
- un minuteur aurait-il dû être armé et ne l'est pas ? → on le **réarme**.

Puis on **dit au joueur ce qui a été trouvé** : « vérification effectuée, rien d'anormal » ou
« un blocage a été détecté et corrigé ». Pas de correction silencieuse.

Les briques existent déjà : `recover()` et la relance anti-gel de `route()` côté serveur, le chien de
garde `_armPlayerStuckWatch` côté client. Il s'agit de les **déclencher au bon moment** plutôt que
d'attendre qu'un délai s'écoule. Bonus : ça remplace avantageusement le chien de garde par délai, qui
avait fini par interrompre le tutoriel.

### Étape 6 — Types de partie (temps réel / tour par tour)
**Choix explicite à la création de la partie** (Marc) : « temps réel » avec ses trois délais,
ou « tour par tour » avec ses trois cadences. Horloges **stockées en dates absolues** (pas en durées restantes),
seule façon qu'elles survivent à un redémarrage du serveur.

---

## 4. ✅ TRANCHÉ le 2026-08-05 — expiration du délai

Marc, sur le fonctionnement réel de BGA : *« si le délai expire, le jeu te l'indique, il te dit que
tu es en retard et que tu peux être expulsé. Mais cela n'arrive que si les autres joueurs votent pour
ton expulsion. »*

**Donc le délai ne déclenche RIEN par lui-même. Il ne fait qu'OUVRIR la possibilité du vote.**
- Le joueur en retard est **averti explicitement** : « tu es en retard, les autres peuvent demander
  ton remplacement ».
- Les autres joueurs voient qu'il est en retard et **peuvent alors** voter son remplacement par une IA.
- Sans vote, la partie attend — indéfiniment s'il le faut. **Aucun automatisme.**
Cela lève la contradiction apparente : le chronomètre est une INFORMATION, pas une sanction.

## 6. ✅ TRANCHÉ le 2026-08-05 — les trois derniers points

| Question | Décision de Marc |
|---|---|
| Notification par email en **tour par tour** | **OUI** — prévenir le joueur quand c'est à son tour. |
| Archivage d'une partie abandonnée | **Automatique après 2 jours**, dès lors qu'elle est abandonnée par **deux joueurs ou plus**. |
| Parties **solo** | Règle d'origine : **une partie lancée HORS connexion reste hors connexion**, elle vit uniquement sur l'appareil. **Une partie lancée EN connexion vit sur le serveur** et se reprend comme une partie multijoueur. |

### 🎯 Pourquoi cette règle solo compte (raisonnement de Marc)
*« Je pense à la suite ainsi, quand ce sera une application. Pour garder une option sans réseau solide. »*
C'est le **cas 1** d'`ARCHITECTURE_AVENIR.md` — le jeu doit rester pleinement jouable sans réseau.
En liant le stockage au **mode de création** plutôt qu'au type de partie, on obtient une règle simple,
sans ambiguïté, et surtout on ne rend jamais le serveur nécessaire à qui joue hors ligne.

---

## 7. Méthode

Chaque étape se termine par une partie à 4 humains lue dans `server/playthrough.js`, plus un test
dédié à l'étape (aller-retour de sérialisation, redémarrage à chaud, vote de remplacement…).
Rien ne part en ligne sans que Marc ait dit oui.

---

## 8. 🔴 ÉTAPE 1 — RÉSULTAT : un obstacle de fond découvert (2026-08-05)

`node server/test_serialisation.js` — écrit pour cette étape. Verdict en deux parties.

### Ce qui MARCHE (rassurant)
```
2. écrit sur disque : 41 Ko
3. restauré dans un moteur NEUF : OK
4. comparaison origine ↔ restauré : ✅ AUCUN écart
   · techTaken est bien un Set après relecture      ✓
   · vues de guerre reconstruites (w.aiId)          ✓
   · nations complètes (civ, res, colonies)         ✓
```
La crainte héritée d'`ARCHITECTURE_AVENIR.md` §4 (Set/Map, cycles) est **levée** : l'état de jeu
lui-même se sérialise et se relit fidèlement.

### 🔴 Ce qui NE MARCHE PAS : la CONTINUATION n'est pas sérialisable
La partie restaurée **ne repart pas**. Cause, vérifiée et non supposée :

Quand le jeu pose une question, il enregistre **une fonction** — la suite à exécuter une fois la
réponse reçue — dans `_pendingDecisions[id] = {cb, adapt}`. `G._pending` (la question) est bien
sérialisé ; **`cb` est une fonction JavaScript, donc jamais**. Au rechargement, la question existe
sans sa suite : `resolveDecision()` ne trouve rien et la partie tourne en rond.

**Pire — collision d'identifiants.** Le compteur `_pendingSeq` repart de zéro dans un moteur neuf :
sa première question s'appelle aussi `d1`. Répondre à la question restaurée `d1` déclenche alors une
**continuation sans rapport**. Mesuré : `resolveDecision('d1')` renvoie `true`… en exécutant le mauvais
rappel. Un rechargement naïf ne planterait donc pas franchement — il **corromprait la partie en silence**,
ce qui est bien pire.

### Ce que ça implique
**L'étape 2 telle qu'imaginée est impossible.** On ne peut pas « recharger un instantané » : la moitié
de l'état d'une partie vit dans des **fermetures JavaScript** à l'intérieur du bac à sable, hors de portée
de toute sérialisation. C'est la même racine que §2 d'`ARCHITECTURE_AVENIR` : le flux de jeu est
implicite (rappels chaînés) au lieu d'être explicite.

### Trois voies possibles — À TRANCHER AVEC MARC
| Voie | Principe | Coût | Effet de bord |
|---|---|---|---|
| **A. Rejouer le journal** | Mémoriser la graine initiale + la liste ordonnée de toutes les réponses/actions ; au redémarrage, **rejouer** pour reconstruire l'état AVEC ses fermetures vivantes. | Moyen. **Exige un jeu déterministe** : 26 `Math.random()` dans le moteur à faire passer par un générateur à graine. | 🎁 **Toute partie devient rejouable à l'identique** — un bug signalé par Marc deviendrait reproductible en une commande. |
| **B. Flux explicite** | Remplacer les rappels chaînés par une machine à états sérialisable. | Élevé, touche tout le flux de décision (parent des chantiers B1/B4 du lot 16). | Assainit l'architecture en profondeur. |
| **C. Reprise partielle** | Ne recharger que les parties SANS question en attente. | Faible. | ❌ Quasi inutile : il y a presque toujours une question en attente. |

**Recommandation** : la voie **A**. Elle résout le problème, ne demande aucune réécriture du flux, et
apporte la reproductibilité des bugs — ce qui, vu notre historique, vaut à soi seul le détour.
La voie B reste souhaitable à terme, mais c'est un chantier bien plus lourd.

---

## 9. 📚 COMMENT FAIT BOARD GAME ARENA (documentation officielle, lue le 2026-08-05)

Marc a posé la bonne question. Réponse : **BGA fait la voie B**, et ce n'est pas un raffinement chez
eux — c'est la fondation même de leur plateforme.

### Le flux de jeu est une MACHINE À ÉTATS déclarée en DONNÉES
Chaque jeu décrit ses états dans `states.inc.php` (ou des classes d'état). Un état porte :
un **numéro**, un `type` (`ACTIVE_PLAYER`, `MULTIPLE_ACTIVE_PLAYER`, `GAME`, `PRIVATE`),
les `possibleactions` autorisées, et les `transitions` vers les états suivants.
Passer à la suite, c'est `$this->gamestate->nextState('pass')` — **une transition nommée**, pas un rappel.

👉 Conséquence : **l'état d'une partie tient dans un NUMÉRO** + les données en base. Il n'y a
**aucune continuation en mémoire**. Reprendre une partie est donc gratuit : il n'y a rien à
reconstruire, tout est déjà écrit.

### Les arguments d'un état sont RECALCULÉS, jamais mémorisés
Une méthode `argXxx()` recalcule à la demande ce dont l'écran a besoin dans l'état courant
(ex. la liste des coups possibles). Rien n'est conservé entre deux requêtes — donc rien à perdre.

### 🎯 BGA MET EN GARDE CONTRE EXACTEMENT NOTRE PROBLÈME
Dans la page sur les états parallèles privés, à propos des « client states » :
> *« the problem with this approach is that players will lose their progress on browser refresh (F5) »*

C'est mot pour mot le symptôme de Marc. BGA documente ce piège **pour dire de ne pas le faire**.
Et ailleurs : *« When a game is in prod and you change the ID of a state, all active games
(including many turn based) will behave unpredictably »* — confirmation qu'une partie vivante
n'est rien d'autre qu'un **numéro d'état** persistant.

### Ce que ça change pour nous
- Notre **voie B** est celle de BGA. Notre voie A (rejouer un journal) est un contournement : elle
  donnerait la persistance et la reproductibilité, mais **laisserait l'architecture fragile**.
- La machine à états réglerait AUSSI deux chantiers déjà identifiés dans le lot 16 :
  · **B4** (une seule décision en vol) → c'est le type `MULTIPLE_ACTIVE_PLAYER` de BGA, qui permet
    à quatre joueurs de choisir leur carte Stratégie **en même temps** ;
  · **B1** (la perspective globale) → les `args` recalculés par état et par joueur suppriment le
    besoin de « basculer `G.player` » pour savoir de qui on parle.
- Coût : c'est le chantier le plus lourd du projet. Mais c'est le seul qui répond vraiment à
  *« faire comme BGA »*, et il rembourse trois dettes d'un coup.

**Sources** : documentation officielle BGA Studio —
`Your game state machine: states.inc.php`, `Game database model: dbmodel.sql`.

---

## 10. 🏗️ VOIE B EN COURS — GO de Marc « d'un bloc » (2026-08-05)

### Fait : la carte du flux (`server/states.js`)
**32 états déclarés en DONNÉES**, avec type, actions possibles et transitions nommées — aucune
logique de jeu dans ce fichier (les règles restent dans le bloc `@moteur` d'index.html, source unique).

| Type | Nombre | Rôle |
|---|---|---|
| `AUTO` | 6 | le jeu applique une règle et transite seul |
| `ACTIF` | 15 | UNE nation doit répondre |
| `MULTI_ACTIF` | 4 | PLUSIEURS nations agissent **en même temps** |
| `INFO` | 6 | fenêtre à lire, accusé de réception |
| `FIN` | 1 | terminus |

**Couverture vérifiée : 24 questions réelles sur 24.** Toutes celles observées en partie
(`agenda`, `strategy`, `war_combat`, `eot`, `accord_request`, `raid_target`, `espionage`…) ont
désormais un état.

Le fichier **refuse de se charger** si une transition pointe dans le vide, si un état joueur n'a
aucune action, ou si un état est inatteignable. Ce contrôle a immédiatement trouvé un vrai trou :
l'état `DYSON` était déclaré mais atteignable par aucune transition. Mieux vaut échouer au
démarrage que chez un joueur.

### Ce que la machine règle par construction
- **B4 du lot 16** (une seule décision en vol) → le type `MULTI_ACTIF` : à 4 joueurs, tout le monde
  choisit sa carte Stratégie en même temps, au lieu d'attendre chacun son tour.
- **La reprise** → l'état d'une partie devient un NUMÉRO, persistable. Plus de continuation en mémoire.
- **Les sous-choix** (espionnage, télépathie, extra-solaire, capture de route) deviennent des états :
  aujourd'hui ils vivent dans des rappels et disparaissent avec le processus.

### Reste à faire pour la voie B
1. **Moteur de transitions** : le pilote avance d'état en état ; `etatCourant` remplace `G._pending`.
2. **Migrer le flux d'`index.html`** : remplacer chaque chaîne de rappels par une transition nommée.
   C'est le gros morceau, et il touche le cœur du jeu.
3. **Persistance** : écrire/relire `{numéro d'état, données}` — devient trivial une fois 1 et 2 faits.
4. Puis seulement : reprise après rafraîchissement, vote de remplacement, types de partie, horloges.

⚠️ **Le jeu sera instable pendant l'étape 2.** À ne pas déployer tant qu'elle n'est pas finie et
qu'une partie complète à 4 humains n'est pas relue dans `playthrough.js`.

### Fait : le moteur de transitions (`server/machine.js`)

Le module ne connaît **aucune règle**. Il sait seulement dans quel état on est, qui doit agir, et
quelle transition mène où. Les règles restent dans le bloc `@moteur` d'index.html.

**Ce qu'il apporte, mesuré :**
```
sauvegarde de l'état de flux d'une partie vivante : 266 octets
  {"v":1,"etat":50,"actifs":["martiens"],"repondu":[],"donnees":{...},"tour":1,...}
restauration → la partie REPART (transition suivante acceptée)
```
À comparer avec l'avant : **impossible**, quelle que soit la taille du fichier, parce que la moitié
de l'état vivait dans des fermetures JavaScript.

**Garanties vérifiées par `_t_machine.js` :**
- trois humains **actifs en même temps** en état `MULTI_ACTIF`, et l'on sait qui n'a pas encore
  répondu → c'est le chantier **B4** du lot 16, dissous par construction ;
- une nation IA n'est pas activée quand l'état ne concerne que les humains ;
- une action non déclarée dans l'état courant est **refusée** (l'équivalent du `checkAction` de BGA) ;
- une **transition inventée lève une erreur** — on ne peut plus créer de chemin implicite à la volée ;
- le **diagnostic** repère un état joueur sans nation active, c'est-à-dire une partie qui ne peut
  plus avancer. C'est la brique demandée par Marc pour traiter le rafraîchissement comme un signal
  de détresse : le serveur saura DIRE ce qu'il a trouvé.

### 🔴 Reste le gros morceau : migrer le flux d'index.html
Il faut remplacer chaque chaîne de rappels (`_warModalCb`, `_peaceCb`, `continueAfterEOT`…) par une
transition nommée. **C'est là que le jeu sera instable.** Rien ne se déploie tant qu'une partie
complète à 4 humains n'a pas été relue dans `playthrough.js`.

---

## 11. ✅ ÉTAPE 4 FAITE — l'auto-jeu est mort, le vote le remplace (2026-08-06, v7.3)

> Étape 4 est passée AVANT les étapes 2 et 3 (recharger les parties au démarrage) pour une raison
> simple : c'est elle qui répond à la demande de Marc — « rafraîchir la page ne doit pas casser la
> partie » — et elle ne dépend d'AUCUNE des briques bloquées par la sérialisation des continuations.
> Elle est courte, vérifiable, et supprime un vrai dégât. Les étapes 2/3 restent en attente de la
> voie B (machine à états), qui est le gros morceau.

### Le vrai coupable n'était pas le navigateur
La partie n'était pas cassée par le rechargement de la page : elle était cassée par le SERVEUR.
À la fermeture de la socket, `armTimer()` armait 30 secondes, puis **répondait à la place du joueur**
(`autoAnswer` = première option de la liste). Recharger le jeu peut dépasser 30 s — mobile, réseau
lent, cache vide, et le moteur pèse désormais 488 Ko. Le temps de revenir, l'agenda avait été choisi
à sa place. Un deuxième délai (`AFK_MS`, 2 min) **validait tout seul** une action encore en attente
de confirmation. Et c'est le même mécanisme qui faisait qu'une partie abandonnée se terminait seule
et arrivait « finie » — « c'est déprimant » (Marc, 2026-08-04).

### La règle, maintenant
**Le temps n'a plus aucun pouvoir sur une partie.** Le serveur ne joue jamais à la place de personne.
Une partie dont le joueur attendu est absent attend — sans limite.
Il ne reste qu'un délai, `ECHEANCE_MS` (90 s), et il **n'agit pas** : il ne fait qu'afficher un bouton
chez les AUTRES joueurs. Ceux-ci peuvent alors **voter** le remplacement de l'absent par une IA
(option C, choisie par Marc). Unanimité des humains présents requise. Ne rien faire reste un choix
valable — et c'est le choix par défaut.

Seul le vote peut convertir un siège humain en IA. Aucune horloge ne le peut.

### Ce qui a changé
| Fichier | Changement |
|---|---|
| `server/server.js` | `armTimer`/`AFK_MS` **supprimés**. Nouveaux : `attendre()`, `voterRemplacement()`, `remplacerParIA()`, message `vote_ia`, diffusions `absence` / `vote`. `autoAnswer` ne sert plus qu'à solder la décision d'un joueur **que le vote vient de remplacer**. |
| `server/server.js` | `renvoyerLaMain()` : **un seul** point qui répond à « où en est la partie et qu'ai-je à faire ? », utilisé par `join` ET `resync`. Il existait deux versions divergentes, et **aucune ne savait rendre une action TENUE** : après un rafraîchissement au mauvais moment, le joueur retrouvait un plateau muet, sans barre Valider/Annuler. |
| `online.js` | Bandeau d'absence non bloquant + bouton « Proposer de le remplacer par une IA », état du vote. Sans ce bandeau, les autres joueurs ne sauraient pas **pourquoi** rien ne bouge et croiraient la partie plantée. |
| `server/test_refresh.js` | 🆕 le test qui prouve tout ça. |

### Le test (`node server/test_refresh.js`)
Vrai serveur, vraies WebSockets, deux humains, deux IA. Il vérifie surtout **ce qui ne doit PAS
arriver** — un test qui se contenterait de « la partie finit » passait aussi avec l'ancien auto-jeu,
et c'est bien pour ça que le défaut a vécu si longtemps :

1. un joueur disparaît → **4 s après l'échéance, rien n'a été joué à sa place** ;
2. il revient → il **retrouve exactement sa fenêtre** (`décision agenda (d1)`), sans un clic ;
3. il repart → l'échéance ouvre le vote, et c'est **le vote** qui remplace, pas l'horloge ;
4. après le vote, **la partie repart** (la décision qui bloquait la table est soldée).

### Trouvé en chemin : `test_ws.js` ne testait plus rien
Le test bout-en-bout s'inscrivait avec les pseudos `testhote` / `testinvite`. Or les comptes sont
identifiés par une **adresse email** depuis le passage aux comptes serveur : l'inscription était
refusée, plus rien ne se passait, et le test restait **muet jusqu'à son timeout de 120 s**. Réparé
(adresses email, timeout ramené à 60 s) : une partie complète à 2 humains + 2 IA passe en 1,2 s.
*Leçon : un test qui ne peut plus échouer bruyamment ne protège plus de rien.*

### Ce qui reste (inchangé)
Les parties vivent toujours **en mémoire** : un redémarrage du serveur les perd. C'est l'étape 2, et
elle est bloquée par la sérialisation des continuations — `node server/test_serialisation.js` est
toujours rouge sur le seul point « la partie restaurée repart » (l'état, lui, revient parfait).
La voie B (machine à états) reste le chemin choisi.

---

## 12. ✅ ÉTAPES 2 ET 3 FAITES — parties reprenables par REJEU (2026-08-06, v7.3)

### Le détour qu'on a évité
L'étape 1 avait buté sur un mur : l'état se sérialise parfaitement, mais les **continuations**
(« après cette réponse, fais ceci ») sont des fonctions, et JSON n'écrit pas de fonctions. La voie
retenue était la **voie B** — réécrire tout le flux en machine à états, façon BGA. C'est plusieurs
séances de travail sur 6 000 lignes de rappels imbriqués, avec un jeu instable entre-temps.

Avant de s'y lancer, une question simple : **et si on ne sauvegardait pas le flux, mais qu'on le
REFAISAIT ?** Garder la graine du hasard et la liste ordonnée des entrées reçues, puis rejouer la
partie depuis le début. On se retrouve *réellement* dans le flux vivant — continuations comprises —
sans réécrire une seule règle.

Ça ne vaut que si le moteur est **déterministe**. Ce n'est pas une opinion, ça se mesure :
`node server/test_determinisme.js` joue deux parties complètes (79 étapes, 10 tours, 4 nations,
colonisations réelles) avec la même graine et compare les deux états **au caractère près**.
→ **identiques.** Le seul écart trouvé était `_lastProgress`, l'horodatage du chien de garde
anti-blocage — de l'instrumentation, aucune règle ne le lit.

Il a suffi, pour cela, de semer `Math.random` **dans le bac à sable** (`game-core.js`) : une seule
ligne couvre les 26 tirages du moteur, **sans toucher `moteur.js`**. Sans graine (solo, navigateur),
c'est le vrai `Math` qui est rendu : le mode hors ligne ne change pas d'un iota. Le test le vérifie
aussi — deux parties sans graine doivent **différer**, sinon le hasard aurait été tué par mégarde.

### Ce que ça donne
| Avant | Après |
|---|---|
| Les parties vivaient en mémoire. Toute mise à jour du serveur, tout redéploiement Coolify, tout plantage effaçait **toutes** les parties en cours. | Le serveur rejoue ses parties au démarrage. `node server/test_redemarrage.js` tue le serveur au **SIGKILL** (pas d'arrêt propre) et vérifie qu'un joueur retrouve sa partie : **même tour, même journal, et la main rendue**. |

### Les trois garde-fous
1. **Une seule porte.** Toute entrée qui modifie une partie passe par `appliquer()` : elle journalise
   puis exécute. Un appel direct à `g.driver.answer(...)` ailleurs créerait un trou dans le journal
   et la partie rejouée divergerait **en silence**. Nouveau type d'entrée ⇒ nouveau cas *dans* ce
   commutateur, jamais à côté.
2. **Une empreinte après chaque entrée.** Au rejeu, elles sont comparées une à une : on ne dit pas
   « ça n'a pas marché », on nomme l'entrée exacte où les deux parties se séparent. C'est ce qui a
   permis de trouver le premier écart en quelques minutes.
3. **En cas de divergence, on ne sert RIEN.** La partie n'est pas chargée et son journal est conservé
   en `.echec`. Une partie manquante se constate ; une partie **fausse** se découvre trois tours plus
   tard, quand plus personne ne sait pourquoi.

### Un piège attrapé au passage
Le remplacement d'un humain par une IA (le vote) **change la partie**. En écrivant simplement les
sièges d'aujourd'hui dans le journal, le rejeu serait reparti avec cette nation jouée par l'IA
**dès le premier tour** — une autre partie. Le remplacement est donc une **entrée datée** du journal,
pas un état de départ. Le journal garde les sièges **d'origine**.

Deuxième piège, plus sournois : après le rejeu, la partie était bien là, au bon tour… mais le joueur
recevait un **plateau muet**. Le rejeu rend l'ÉTAT ; c'est `route()` qui rend **la main**. Sans lui,
tout est correct et le joueur croit quand même sa partie cassée. *C'est la troisième fois sur ce
projet qu'une production correcte est perdue faute d'être remise au bon destinataire.*

### Ce que ça ne fait pas encore
- Le journal est écrit à chaque entrée dans `data/rejeu/<code>.json`. Pas de purge automatique des
  parties abandonnées (règle des 2 jours : à faire).
- La **liste des parties reprenables** à la connexion (étape 5) n'existe pas encore : le client ne
  rejoint que la dernière partie mémorisée dans son navigateur.
- Les **types de partie** (temps réel / tour par tour) et les horloges (étape 6) restent à faire.
- `states.js` / `machine.js` restent en place : la carte du flux et son moteur de transitions gardent
  leur valeur (validation, lisibilité, avenir mobile). Mais la migration du flux **n'est plus une
  urgence** : elle ne conditionne plus les parties reprenables.

---

## 13. 🔄 CORRECTION DE CAP — le rejeu est RETIRÉ, on fait le vrai modèle BGA (2026-08-06)

### Ce que Marc a dit
> « Je préfère que tu fasses ça bien, je veux pas de situation hybride, adopte le même
> fonctionnement exact de BGA dont je sais qu'il fonctionne très bien sinon ce que j'économise
> maintenant je vais le payer plus tard. C'est déjà le cas de certaines actions que tu as faites… »

Il a raison, et l'objection est juste. Le rejeu marchait — le test le prouvait — mais c'était un
**second mécanisme de vérité** sur « où en est la partie ». Deux mécanismes finissent toujours par
donner deux réponses différentes, et c'est le jour où ça arrive qu'on paie.

### Ce qui a été retiré (intégralement, pas à moitié)
- le journal de rejeu (`data/rejeu/`), `appliquer()`, `rejouer()`, `rechargerParties()`, les empreintes ;
- la graine du hasard dans le bac à sable (`mathSeme`) et le paramètre `graine` du pilote ;
- `server/test_determinisme.js` et `server/test_redemarrage.js`, devenus sans objet.

**Conséquence assumée : les parties ne survivent PAS à un redémarrage du serveur, comme avant.**
C'est temporaire et c'est le prix de ne pas construire deux fois.

### 💡 Ce que cette suppression a appris (à ne pas oublier)
En découpant le bloc à retirer, j'ai emporté **deux fonctions qui n'avaient rien à voir**
(`puitsNotices` et `installerJournalPilote`, qui se trouvaient juste après). `node --check` était
vert : la syntaxe était parfaite, le serveur ne routait plus rien. Ce sont `test_refresh.js` et
`test_ws.js` qui l'ont attrapé en quelques secondes.
*Une suppression est une modification comme une autre. « Ça compile » ne veut rien dire.*

---

## 14. 🏗️ LE VRAI MODÈLE BGA — la machine vit dans `moteur.js` (v7.3)

### La décision de fond : OÙ vit le flux
BGA déclare son flux côté serveur (`states.inc.php`) **parce que BGA n'a pas de mode hors ligne** :
chez eux le navigateur n'est qu'un afficheur. Nous, si. Le déroulement d'une partie est donc une
**règle du jeu**, au même titre que le coût d'une colonie, et il vit là où vivent les règles :
dans **`moteur.js`** — chargé par le navigateur, lu par le serveur, embarqué dans l'appli mobile.
**Un seul flux pour les trois modes.** Le laisser dans `server/states.js` aurait laissé le solo sur
les anciens rappels : l'hybride, encore.

`server/states.js`, `server/machine.js` et leurs tests jetables ont donc été **supprimés**. Il n'en
reste aucune copie : une copie finit par diverger, et on teste alors la mauvaise.

### Ce qui est en place (bloc `@flux`, bas de `moteur.js`)
- **32 états déclarés en données** — numéro, type, `kind` (le nom de fenêtre que le client connaît
  déjà), actions permises, transitions. Numéros espacés de 10 : on intercale, on ne renumérote
  jamais (BGA : *« all active games will behave unpredictably »*).
- **L'état vivant est rangé dans `G._flux`** : numéro d'état, nations actives, réponses reçues,
  curseurs. Donc sérialisé avec la partie, sans effort. *C'est tout le chantier en une phrase.*
- **Transitions strictes** : `fluxAller('nom')` refuse tout nom non déclaré, et dit lesquels sont
  permis. Une transition inventée à la volée, c'est le flux implicite qui revient.
- **`ST`, registre de fonctions par NOM** — équivalent des `stXxx` / `argXxx` de BGA. On enregistre
  des noms, pas des références : un nom se sérialise, une fonction non.
- **Arguments recalculés, jamais mémorisés** (`fluxArguments`) — doctrine BGA. C'est ce qui fait
  qu'un joueur revenu après un rafraîchissement voit la question telle qu'elle est *maintenant*.
- **`fluxPeutAgir`** = le `checkAction` de BGA : une action hors tour est **refusée**, pas appliquée.
- **Contrôle de cohérence au chargement du moteur** : transition vers le vide, état joueur sans
  action, état inatteignable → le moteur **refuse de se charger**. Donc avant la moindre partie.
- **`fluxDiagnostiquer`** : une partie figée sait dire pourquoi, avec les 12 dernières transitions.
  C'est la brique de l'idée de Marc — « le rafraîchissement amène le jeu à vérifier les bugs ».

Test : `node server/test_flux.js` (7 points, tous verts).

### ⚠️ Où on en est exactement
La machine est **installée et vérifiée, mais pas encore aux commandes**. Le jeu tourne toujours sur
les anciens rappels ; la machine naît avec la partie et observe. Il reste à migrer, flux par flux :

| Flux | Continuations à supprimer |
|---|---|
| Guerre (`processAllWars`, paix, combat, défense) | `_warModalCb` (21), `_warCombatCb` (12), `_peaceCb` (6), `G._assaultThenCb`, `G._warChoiceCb` |
| Fin de tour (`runEndOfRound`, `continueAfterEOT`) | chaîne d'appels imbriqués |
| Événements (`showEventChoiceModal`, comm, diplo) | `_evModalCb` (9) |
| Agenda / investissements | `_relayRemoteAgendas`, files d'attente en fermeture |
| Sphère de Dyson, assauts IA | `showAiDysonModal`, `maybeAiAssaultPlayer` (`done`) |

**16 fonctions prennent aujourd'hui une « suite » en paramètre. L'objectif est zéro.**

### 🎯 La condition de fin, mesurable et non négociable
`node server/test_serialisation.js` au **vert** : une partie sauvegardée pendant qu'une question est
posée doit repartir et aller jusqu'au bout. C'est rouge aujourd'hui, sur ce seul point. Le jour où
il passe au vert, la persistance des parties est acquise — et elle l'est **par construction**, pas
par un mécanisme à côté.

---

## 15. ⚔️ LE FLUX DES GUERRES EST MIGRÉ (2026-08-06)

### Ce qui a changé
`processAllWars(onDone)` gardait la file des guerres ET son index **dans des fermetures**
(`processOngoing(idx)`), et chaque fenêtre posait sa suite dans `_warModalCb = () => processOngoing(idx+1)`.
Trois conséquences, toutes vécues : une partie sauvegardée pendant une guerre ne pouvait pas repartir ;
le point de vue et l'index étaient capturés ensemble (la famille de bugs « la fenêtre part au mauvais
belligérant ») ; et il n'y avait **rien à lire** pour savoir où en était la partie.

Maintenant : la file et le curseur vivent dans `G._flux.donnees`, et chaque suite est une fonction
**nommée** qui ne capture rien. Ce dont une étape a besoin — la guerre, l'ennemi, son nom — est
**recalculé** depuis le curseur (doctrine BGA : *never store the args, always recompute them*).
La file est tenue par **identifiant de nation**, jamais par référence : une guerre peut se terminer
en cours de file (vassalisation, paix), et une référence gardée pointerait dans le vide.

`_warModalCb` — la variable qui portait la suite — **n'existe plus**. Elle vivait hors de `G`, ce qui
voulait aussi dire que deux parties tournant dans le même processus serveur partageaient le même
emplacement. La suite est désormais un **nom** rangé dans la partie à laquelle elle appartient.

### Effet de bord réparé au passage : les DEUX fins de tour
Il y avait deux `finishTurn` : une fermeture dans `endTurn` (solo), une autre dans `runEndOfRound`
(serveur). `ARCHITECTURE_AVENIR.md` les signalait comme cause racine — *« deux chemins = deux
comportements ; le jeu appris hors ligne peut différer du jeu en ligne »*. Et elles **avaient déjà
divergé** : seule la version serveur mémorisait `G._lastEOT`, si bien qu'en solo le garde-fou
anti-réexécution ne pouvait pas ré-afficher le bilan. Elles sont fusionnées en une seule fonction
nommée, `stFinDeTour`.

### 🔴 Deux pièges payés — à retenir
1. **Un paramètre qui change de nature se vérifie sur TOUS ses usages.** En faisant passer le `done`
   de `maybeAiAssaultPlayer` d'une fonction à un nom, je n'avais converti **qu'un** de ses six points
   de sortie. Les cinq autres appelaient `done()` sur une chaîne : la partie se figeait au tour 1,
   sans exception ni message.
2. **`fluxAppeler` avalait un nom inconnu en silence.** Deux suites que j'avais oublié d'enregistrer
   ne faisaient donc *rien du tout* — pas d'erreur, pas de trace, juste une partie qui s'arrête. Il a
   fallu instrumenter le moteur pour la voir. C'est corrigé : **un nom inconnu lève maintenant une
   erreur** qui nomme la suite manquante et liste celles qui sont enregistrées.
   *Une continuation perdue en silence ne doit pas pouvoir renaître dans l'outil censé la supprimer.*

### Où en est la dette, en chiffres
| Continuation gardée comme FONCTION | occurrences |
|---|---|
| ~~`_warModalCb`~~ | **0** (supprimée) |
| `_warCombatCb` | 12 |
| `_evModalCb` | 9 |
| `_forcedWarCb` | 7 |
| `_peaceCb` | 6 |
| `G._warChoiceCb` | 6 |
| `G._assaultThenCb` | 5 |

Fonctions prenant encore une « suite » en paramètre : **15** (16 au départ).
`test_serialisation.js` reste rouge sur son seul point : le courtier de décisions
(`_emitDecision`) garde toujours la continuation sous forme de **fonction**. C'est le prochain verrou,
et le plus structurant : tant qu'il n'accepte pas un NOM, aucune partie ne repartira après une
sauvegarde, quel que soit le nombre de flux migrés.

---

## 16. ✅ LA CONDITION DE FIN EST ATTEINTE — `test_serialisation.js` est VERT (2026-08-06, v7.4)

```
5. LA PARTIE RESTAURÉE REPART-ELLE ?
   ✅ la partie est allée jusqu'à son terme (tour 10).
✅ SÉRIALISATION FIABLE : écrite, relue, identique, et la partie repart jusqu'au bout.
```

Une partie sauvegardée **pendant qu'une question est posée** repart et va jusqu'au bout. C'est ce
qui était déclaré impossible à l'étape 1, et c'est la condition que je m'étais fixée pour dire que la
migration tenait. Elle n'a jamais été déplacée en cours de route.

### Le verrou, et comment il a sauté
`_pendingDecisions` gardait pour chaque question `{cb, adapt}` — **deux fonctions**, dans une
variable de module. Trois défauts, dont le dernier était le plus grave :
- une fonction ne se sérialise pas : l'état revenait parfait, la partie s'arrêtait sur la première
  question, sa suite envolée ;
- le registre vivait **hors de `G`**, donc partagé entre toutes les parties d'un même processus ;
- `_pendingSeq` aussi : après une reprise, les identifiants repartaient à `d1` et se télescopaient
  avec les anciens. Une réponse pouvait déclencher **la mauvaise continuation, en silence**.

Le registre est maintenant `G._flux.decisions` : `id -> {suite, adapt}`, deux **noms** résolus dans
le registre `ST` au moment de la réponse. Il se sauvegarde avec la partie, appartient à sa partie,
et le compteur d'identifiants aussi.

### Ce qui a été migré
| Flux | Ce qui vivait dans une fermeture | Où c'est rangé maintenant |
|---|---|---|
| Guerre | file des guerres + index, `_warModalCb`, `_peaceCb`, suites de combat | `G._flux.donnees` (file par identifiant, suites nommées) |
| Fin de tour | `finishTurn` ×2 (solo + serveur) | `stFinDeTour`, une seule fonction nommée |
| Événements | suite de l'annonce (`onDone`) | `G._flux.donnees.suiteAnnonce` |
| Bilan | `()=>continueAfterEOT()` | nom `'continueAfterEOT'` |
| Investissements | `_invQueue` / `_invAsk` ×2 (niv. 1 et 2) | `G._flux.donnees.fileInvest`, `stInvestDemander` |

Mesure permanente : **`node server/test_reprise.js`** sauvegarde une partie dans chacune des cinq
familles de questions et vérifie qu'elle repart. **5/5.**

### Deux pièges de plus, payés en route
- **`_emitRemote` avait sa PROPRE copie du courtier.** En migrant le courtier, la copie est restée
  derrière et a planté au premier bilan : *« _pendingSeq is not defined »*. Elle passe maintenant par
  la même machinerie — il ne doit exister **qu'un seul** registre de questions en attente, sinon les
  deux divergent et l'un des deux n'est pas sauvegardé.
- **Un script de migration qui échoue à mi-parcours n'écrit rien.** Une assertion sur le niveau 2 a
  interrompu un patch qui avait déjà transformé le niveau 1 *en mémoire* : rien n'a été enregistré,
  mais j'ai cru le contraire, et l'erreur suivante (`stInvestDemander is not defined`) n'avait plus
  aucun rapport apparent. Vérifier l'état du FICHIER après chaque patch, pas la sortie du script.

### Ce qui reste (dette mesurée, plus une impression)
| Continuation encore sous forme de FONCTION | occurrences |
|---|---|
| `_warCombatCb` (assaut du joueur, hors flux de fin de tour) | 13 |
| `G._warChoiceCb` (bouton « Annuler » du combat) | 8 |
| `_forcedWarCb` (guerre populaire) | 8 |
| `_evModalCb` (fenêtres d'événement solo) | 9 |
| `_pendingDiscovery` (tuile Découverte) | 4 |

Ces flux ne bloquent plus la reprise des cinq familles testées — ils se déclenchent **pendant** le
tour d'action d'un joueur, pas pendant une question de fin de tour. Ils restent à migrer pour que le
`fluxDetteDecisions()` tombe à zéro en toutes circonstances, mais ce n'est plus un préalable :
**la persistance des parties peut maintenant être construite dessus, à la manière de BGA** — on
sauvegarde `G` (état + flux), on le relit, la partie repart.

---

## 17. ✅ LES PARTIES SURVIVENT AU REDÉMARRAGE — le modèle BGA, pour de vrai (v7.4)

```
── on TUE le serveur (SIGKILL, aucun arrêt propre) ──
── on le relance sur le même dossier de données ──
   · partie BEB8 reprise — tour 8 — reda@test.local, redb@test.local
   ✔ même tour · ✔ même journal · ✔ la main rendue · ✔ jouée jusqu'au bout
```

Un fichier par partie : l'état du jeu (`G`, qui contient désormais le DÉROULEMENT dans `G._flux`)
plus ce que le serveur seul connaît (qui occupe quel siège, qui est l'hôte). De qui on attend un
geste n'est **pas** mémorisé : c'est recalculé au chargement en rejouant `pump()`. C'est exactement
le modèle BGA, et il n'a été possible qu'une fois le flux devenu une donnée.

Si un chargement échoue, la partie **n'est pas servie** et son fichier est conservé en `.echec` :
une partie manquante se constate, une partie fausse se découvre trois tours plus tard.
Test : `node server/test_redemarrage.js`.

### 🔴 Le bug le plus grave de toute la migration, trouvé ici
Pour charger une partie, le serveur démarre d'abord une partie **neuve** (pour construire le bac à
sable), puis remplace `G`. La partie neuve avait posé ses propres questions `d1`, `d2`… dont les
suites encore « volatiles » (fonctions) vivent dans une table **hors de `G`** — elles ne peuvent pas
y vivre, ce sont des fonctions. Les identifiants de la partie restaurée repartant eux aussi de `d1`,
**une réponse pouvait retrouver la suite de la partie neuve et l'exécuter.** En silence, sur le
mauvais état. C'est le télescopage d'identifiants annoncé dans le bandeau du courtier : il est
arrivé pour de bon. `fluxOublierVolatiles()` est appelé à chaque restauration, depuis
`rehydrateState` — le point de passage obligé.

### L'anti-gel sait enfin dire pourquoi
Il réessayait toutes les 1,2 s **indéfiniment** : une partie bloquée produisait une ligne de log par
seconde, pour toujours, sans que personne apprenne pourquoi. Il est borné à 4 tentatives, puis il
**diagnostique** — via `fluxDiagnostiquer()` de la machine — prévient les joueurs, et envoie à
l'admin l'état du flux, les nations attendues et les douze dernières transitions.
C'est l'idée de Marc (« le rafraîchissement amène le jeu à vérifier les bugs éventuels »), et c'est
ce diagnostic qui a nommé les deux blocages suivants au lieu de me laisser deviner.

### Trois autres flux migrés dans la foulée
| Flux | Ce qui vivait dans une fermeture / hors de `G` |
|---|---|
| Événement de fin de tour | `_evModalCb` — une variable de MODULE. Après une reprise elle valait `null` : la fenêtre se fermait et **la partie s'arrêtait là, sans un mot**. |
| Tour de table des accords | file des humains + nation d'origine ; la main revenait à la mauvaise nation |
| Tirage d'agenda (local et distant) | la file contenait des **objets** nations (JSON les duplique → plus les mêmes qu'en `G`) et les **cinq agendas proposés** étaient perdus : un joueur revenu en aurait revu cinq autres |

### ⚠️ Un piège de conception, à ne pas refaire
Le tour de table des accords repassait « l'étape d'après » à chaque tour de boucle. Comme cette étape
était **déjà mémorisée**, elle finissait par s'écraser **par elle-même** : `stApresEvenement`
s'appelait lui-même, ne trouvait plus rien, et la partie s'arrêtait juste après le dernier joueur.
*Une étape d'après se pose UNE fois, à l'entrée du flux — pas à chaque itération.*

### État de la migration
- `node server/test_reprise.js` : **5 / 5** familles de questions reprennent.
- `node server/test_serialisation.js` : **vert**.
- `node server/test_redemarrage.js` : **vert** (testé à 14, 22, 26 et 38 coups).
- `node server/playthrough.js 4` : propre, trois exécutions de suite.

Reste en dette (flux qui se déclenchent **pendant** le tour d'action, donc sans effet sur la reprise
des cinq familles) : `_warCombatCb` (assaut du joueur), `G._warChoiceCb` (bouton Annuler),
`_forcedWarCb` (guerre populaire), `_pendingDiscovery` (tuile Découverte).

---

## 18. ✅ LA DETTE EST SOLDÉE — plus une seule continuation en fonction (v7.4)

Les cinq variables de MODULE qui portaient les suites du jeu **n'existent plus** :
`_warModalCb`, `_peaceCb`, `_evModalCb`, `_warCombatCb`, `_pendingDiscovery`, `_forcedWarCb`.
Elles avaient deux défauts, tous deux payés pendant cette migration :
- elles ne survivaient pas à une sauvegarde (JSON n'écrit pas de fonctions) ;
- elles étaient **partagées entre toutes les parties d'un même processus serveur**.

Derniers flux migrés :

| Flux | Ce qui vivait dans une fermeture | Où maintenant |
|---|---|---|
| Assaut du joueur sur une colonie | cible, ennemi, jetons engagés | `G._flux.donnees.assautCible/assautEnnemi`, suites `stAssautJoueurChoisi` / `stAssautJoueurResoudre` |
| Défense contre l'assaut d'une IA | cible, menace, plafond, supercroiseur | `G._aiAssaultCtx` (un seul exemplaire : le chemin serveur en avait un second, dans une fermeture) |
| Guerre populaire | `_forcedWarCb` | `G._flux.donnees.suiteGuerrePop` |
| Tuile Découverte | `_pendingDiscovery` | `G._decouverteEnAttente` |
| Attaque de route, Annuler, standoff, défense | 5 consommateurs de `_warCombatCb` | un point unique, `_combatSuiteLire()` |

**Purge des entrées orphelines.** Une question peut être abandonnée sans réponse (le flux change
d'avis, une guerre se termine avant qu'on y réponde) : son entrée restait dans le registre pour
toujours et le fichier de sauvegarde grossissait à chaque tour. On garde les 50 dernières.

### État final, tout vérifié
| Test | Résultat |
|---|---|
| `test_serialisation.js` | ✅ écrite, relue, identique, et la partie repart |
| `test_reprise.js` | ✅ 5/5 familles de questions |
| `test_redemarrage.js` | ✅ survit à un SIGKILL, même tour, même journal, jouable |
| `test_refresh.js` | ✅ rien ne se joue à la place d'un absent |
| `test_flux.js` | ✅ machine cohérente, transitions strictes |
| `selftest.js 3` | ✅ 0 crash, 0 invariant KO |
| `playthrough.js 4` | ✅ propre, trois exécutions de suite |

⚠️ Il reste à faire relire par Marc une partie complète à quatre humains, à l'écran. Les bancs
d'essai ne voient ni la mise en page ni les textes hors contexte.
