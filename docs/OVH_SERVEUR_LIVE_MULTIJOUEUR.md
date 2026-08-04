# 🖧 Serveur live Node autoritaire + Multijoueur (OVH) — plan & reste à faire
*Créé le 2026-07-16. Point d'entrée général : `docs/REPRISE.md`. Détails moteur : `docs/MULTIJOUEUR_BUILD.md`. Recherche hébergeur : `docs/HEBERGEMENT_NODE.md`.*

> But de ce fichier : qu'une nouvelle session puisse démarrer la bascule vers un vrai serveur multijoueur **sans relire tout l'historique**. Rien n'est acheté ; on migre quand Marc est prêt à payer un petit hébergement.

---

## 1) Objectif final
- **Multijoueur en ligne propre** (2–4 joueurs, humains + IA), et à terme **app mobile sur les stores** (iOS + Android) via emballage Capacitor/Cordova de l'UI web actuelle.
- **Modèle cible = SERVEUR AUTORITAIRE** (comme Board Game Arena) : l'état vit sur le serveur, les règles tournent sur le serveur, les clients envoient des **INTENTIONS** (pas l'état), le serveur valide puis pousse l'état + les décisions.

## 2) Pourquoi ce chantier (et pas peaufiner l'existant)
- Le mode en ligne actuel (**modèle « hôte autoritaire »** : le navigateur de l'hôte fait tourner le jeu, PHP+MySQL = boîte aux lettres) est un **contournement** dû à l'hébergement PHP mutualisé (pas de Node). Il est **jouable entre amis et gratuit**, mais c'est une **couche jetable**. → **On ne l'améliore plus** (ex : ne pas faire le refactor « guerre nation-safe » juste pour l'hôte).
- Ce qui **transfère** vers le produit final = **les RÈGLES = le moteur** (`game-core.js`). Continuer d'investir là.

## 3) ✅ Ce qui est DÉJÀ prêt (l'actif transférable — testé headless)
Tout est dans `server/`, chargé depuis le bloc logique d'`index.html` (aucune règle réécrite) :
- **`game-core.js`** : charge le moteur du jeu dans Node sans écran → état `G` + fonctions (`initGame`, `doColonize`, `doAITurn`, `endTurn`…). Sérialisable en JSON.
- **Moteur généralisé « par nation »** : `G.player` = « la nation en train d'agir » ; tensions/guerres/IA sont canoniques par `civ.id` (plus d'auto-ciblage `G.player` en dur). Rotation prouvée.
- **`driver.js` (`GameDriver`)** : orchestration autoritaire d'une partie entrelacée (ordre tiré au sort, 1 action = 1 passage), tours d'IA autonomes, clôture de manche (pirates/maintenance/revenus/événement/EOT/investissement/draft). API : `boot(seats,onDecision)`, `pump()`, `answer(id,ans)`, `act(civId,action)`, `actAuto(civId)`.
- **Décisions-en-attente routées** : broker `setDecisionSink(fn)` / `_emitDecision(kind,nation,payload,cb)` / `resolveDecision(id,answer)` — **inerte en solo**, émet vers le bon client en serveur. **14/14 modales routées** (agenda, stratégie, invest1/2, espionnage, extrasolaire, empath, Dyson, paix, combat de guerre, accord, + notices event/eot). Testé **640+ parties orchestrées** (1H+3IA et 2H+2IA), 10 tours complets, 0 faille d'invariant.
- **`selftest.js`** : joue des parties entières tout-IA sur `index.html` → filet de sécurité (« invariants KO : 0 »). **À relancer après chaque étape.**
- **`schema.sql`** : tables `users, games, game_players, game_state, game_inputs`.
- **Protocole de relais prouvé headless** (`relay_sim.js`) : état transitant en JSON (~34 Ko), partie complète, 0 échec de parse.

> Conséquence : la partie **la plus dure (moteur multi-nation + décisions routées + orchestration)** est **finie et prouvée**. Il reste surtout à **exposer ce moteur derrière un serveur réseau réel** et à **rebrancher le client dessus**.

## 4) Décision hébergement (voir `HEBERGEMENT_NODE.md` pour le détail)
- **Choix final = OVHcloud** (VPS-1, Gravelines, France — Hetzner abandonné : rupture de stock, voir OVH_SETUP_JOURNAL.md) → RGPD / données en Europe (~5,39 €/mois TTC, backup inclus).
- **Deux garde-fous à poser dès le 1er jour** : (1) **Docker** (backend portable, pas de lock-in) ; (2) **état des parties en base/Redis, jamais en mémoire d'un seul serveur** → scaling horizontal facile plus tard.
- **Coolify** (gratuit, installé sur le VPS) = déploiement type Git + **TLS auto (Let's Encrypt)** + backups → gomme l'essentiel du DevOps.
- Alternative « zéro DevOps », un peu plus chère : **Render** (Node + WebSocket + Postgres managé + TLS auto, palier gratuit pour tester).
- Stores : Apple/Google ne valident PAS l'hébergeur, ils examinent l'app. Requis : **HTTPS/TLS**, **politique de confidentialité**, **suppression de compte**, gestion correcte des données.

## 5) 🚧 Reste à faire (le chantier)
- [x] **A. `server/server.js` — ✅ FAIT (2026-07-21, testé bout-en-bout)** : HTTP (`/health`) + WebSocket (`ws`, seule dépendance) autour du `GameDriver`. Comptes fichier JSON + scrypt (BDD plus tard), champ `tier` prévu pour les niveaux payants. Lobby (create/join/start, code de partie à 4 car.), décisions routées vers le bon client, repli IA (déco 3 s / AFK 2 min, réponse auto = 1re option — heuristique validée sur partie complète), reconnexion (re-join → renvoie la décision en attente), snapshots d'état par partie dans `DATA_DIR/games/`. **Test `test_ws.js` : partie ENTIÈRE 2 humains WS + 2 IA, 27 décisions routées, 0 erreur.** Protocole client→serveur : `register/login/token/create/join/start/act/answer/auto/state/game_info/ping` ; serveur→client : `registered/logged/game/started/decision/your_action/turn/waiting/log/state/over/error`. Réponse à une décision : `{choice:<id option>}`. TODO dans A : filtrer les secrets adverses dans `state`, reprise des parties après redémarrage serveur (snapshots déjà écrits), timeouts configurables.
- [ ] **B. Persistance de l'état en base** (pas en mémoire) : sauver `state_json` (+ `pending`) après chaque coup → reprise + scaling. Adapter `schema.sql` au SGBD choisi (MySQL/MariaDB déjà écrit ; Postgres si Render/Coolify Postgres).
- [ ] **C. Protocole client↔serveur** : le client envoie des **intentions** (`act(civId,action)` / `answer(id,ans)`), le serveur **valide** (le moteur est l'autorité) puis **pousse** l'état + les décisions (`pending`) par WebSocket. Réutiliser le broker (`setDecisionSink`/`resolveDecision`). **Après toute désérialisation : appeler `refreshWarViews()`** (ré-attache les vues de guerre) et utiliser le reviver `__set`/`__map` (Sets/Maps).
- [~] **D. Rebrancher le client — v2.0 ÉCRITE (2026-07-22), à roder en vrai navigateur** : nouveau **`online.js`** (racine du site, drop-in : index.html le charge déjà ; l'ancien PHP reste archivé dans `server/php/online.js`). WebSocket vers `wss://live.solar-game.com` (auto `ws://127.0.0.1:8080` en local), auth par pseudo + token localStorage, lobby (créer/rejoindre par code, salle d'attente en push), décisions via panneaux génériques **avec le vrai contrat de réponses** (`agendaId`/`cardId`/`branch`/`node`/`defTokens`/`tokens`/`accept`/`war`/`force`/`confirm` — testé sur 4 parties complètes serveur+2 clients, 8 kinds couverts, 0 erreur, `server/test_contract.js`), état affiché via `scDeserialize`→`scSetG`→`rehydrateState`→`scSetLocalHuman`→`render`, reconnexion auto (token + re-join). **Limites v2.0 (prochaines itérations)** : tour d'action = « IA joue pour moi » ou « Passer » (les actions de plateau — coloniser/route/tech — restent à brancher, y compris côté serveur : compléter `ACTIONS` dans game-core.js) ; notices (résultats de combat/événements) auto-acquittées par le serveur, non montrées aux joueurs ; `state` non filtré (secrets adverses visibles dans la console d'un client malin).
- [ ] **E. Corriger le bug `techTaken.has` en ligne** au passage : c'est un `Set` non re-sérialisé → utiliser le reviver `__set`/`__map` (déjà en place en solo pour la sauvegarde localStorage) côté (dé)sérialisation serveur **et** client.
- [ ] **F. Infra OVH — ✅ FAIT (voir OVH_SETUP_JOURNAL.md)** : compte + VPS (CPX22, DE/FI) + Coolify + sous-domaine (ex. `live.solar.guerir.ch`) + TLS + Docker + base + backups.
- [ ] **G. Stores (plus tard)** : emballage Capacitor/Cordova (iOS+Android) + politique de confidentialité + suppression de compte.
- [ ] **H. Tests** : `selftest.js` (déjà) + **test live 2–4 navigateurs** + test de charge léger + reconnexion.

## 6) ▶️ Par où commencer (ordre recommandé — le plus simple/gratuit d'abord)
1. **En LOCAL, gratuit** : écrire `server/server.js` (Node + `ws`) autour du `GameDriver` **déjà prouvé**, dans **Docker**. Objectif : une partie 2 humains jouable **sur sa propre machine** (deux onglets), état en base locale. Rien à payer tant que ça ne tourne pas.
2. Quand c'est jouable en local → **provisionner le VPS OVH** (✅ fait), installer Coolify, déployer le conteneur, brancher TLS + sous-domaine.
3. Rebrancher le client en WebSocket (`online_ws.js`) et tester en vrai à 2–4 navigateurs.
4. Plus tard seulement : emballage stores.

> Réflexe : **backend local d'abord (0 €)**, le VPS OVH est déjà en service. Cohérent avec la préférence de Marc (le plus simple/gratuit avant le coûteux).

## 7) Coût & déclencheur
- Rien n'est acheté. **Déclencheur = Marc décide de lancer le vrai produit.**
- Budget attendu : **~4–8 €/mois** (VPS OVH) largement suffisant pour quelques joueurs au tour par tour. Render ~7–25 $/mois si on veut zéro admin serveur.

## 8) Points d'ancrage dans le code (pour ne pas chercher)
- Moteur : `server/game-core.js` (API `Engine`). Orchestration : `server/driver.js` (`GameDriver` : `boot/pump/answer/act/actAuto`).
- Décisions : `setDecisionSink` / `_emitDecision(kind,nation,payload,cb)` / `resolveDecision(id,answer)` ; après désérialisation : `rehydrateState(g)` + `refreshWarViews()`.
- (Dé)sérialisation robuste des `Set`/`Map` : reviver `__set`/`__map` (déjà dans `index.html` pour la sauvegarde locale — `scSerialize`/`scDeserialize`).
- Schéma : `server/schema.sql`. Ancien relais PHP (référence, pas réutilisé en Node) : `server/php/`.
