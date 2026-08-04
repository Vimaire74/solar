# Solar Conquest — Construction multijoueur (suivi vivant)

> Doc UNIQUE de suivi pour ne jamais perdre où on en est. Mise à jour : 2026-06-29.
> ⚠️ Lire d'abord `docs/REPRISE.md`. La section ci-dessous (2026-07-02) fait AUTORITÉ ; le reste du doc décrit un pilote Node headless qu'on N'UTILISE PLUS pour le jeu en ligne (gardé comme historique + il sert encore aux TESTS headless).

## ⭐ MISE À JOUR 2026-07-02 — PIVOT + état réel

**Hébergement = PHP mutualisé (pas de Node).** → Plan retenu : **relais PHP+MySQL + le VRAI jeu tourne dans le navigateur de l'HÔTE** (autorité). Déployé et fonctionnel sur https://solar.guerir.ch.

**Décision clé (après régressions) :** on avait d'abord câblé le mode en ligne sur un *pilote de tour parallèle* (le `driver.js`/broker headless) → ça court-circuitait la vraie mécanique (moral, Fin de tour manuelle, vrais panneaux). **On a pivoté : `online.js` lance maintenant `initGame` SANS sink → le vrai flux solo tourne tel quel** (vrais modales, gel du moral, undo, pouvoirs, popups). Résultat : le mode en ligne = le solo calibré, à l'identique. Le `driver.js`/broker restent uniquement pour les tests headless.

**Côté serveur (`server/php/`, tout syntaxe-validé) :** schema.sql + endpoints auth/lobby/état/boîte-aux-lettres (voir REPRISE §6). L'hôte publie l'état (JSON ~34 Ko) toutes les 3 s via `put_state.php` ; les invités lisent via `get_state.php`.

**Phase 2 (2 humains) — v1 construite, protocole validé headless, PAS testée en live :**
- Accroche dans `interleaveStep` (`carte.html`) : si la nation courante est `_remoteHuman`, l'hôte met l'interleave en pause et appelle `window._scOnRemoteTurn(civId)`.
- Hôte (`onRemoteTurn`) : publie l'état (activeCiv=distant) → attend l'action du distant (`pull_inputs`) → adopte l'état renvoyé (`scSetG`+`rehydrateState`) → `scSetLocalHuman(hôte)` → `scAdvanceIl` → `scResumeInterleave`.
- Invité (`guestPlayOneAction`) : charge l'état, `G._il=false`, joue UNE action sur son vrai plateau, renvoie l'état (`submit_input`).
- Helpers ajoutés dans `carte.html` : `scSetLocalHuman`, `scResumeInterleave`, `scAdvanceIl`, branche `_remoteHuman` dans interleaveStep, garde `endTurn` → `window._scOnPass`.
- **RESTE Phase 2** : relayer aussi l'agenda/stratégie et les décisions de GUERRE des humains distants (auto/IA pour l'instant) ; tester à 2 navigateurs.

**Équilibrage IA/moral (demandes de Marc, appliquées côté moteur) :**
- Paix/trêve récente → plus de « manifestations » (perte de moral) de cette nation.
- L'IA accepte la paix quand elle n'a pas les moyens de se battre (peu de Force/ressources, moral bas).
- Moral bas → l'IA se soigne au lieu de piller ; raids non-pirates moins fréquents (0,28→0,20).
- (En réserve si besoin : plafonner les manifestations, monter le seuil à 7, réduire le risque de guerre par raid.)

**Bug corrigé :** rupture d'accord commercial = **attaque-surprise** → `breakAccordAndAttack` appelle désormais `playerAssaultColony` (capture immédiate si victoire) au lieu de juste déclarer la guerre.

**Mouchard de debug en ligne** : `online.js` envoie console+erreurs+journal de partie à `api/log.php` ; lire sur `api/debug_view.php`.

---

## Décisions verrouillées
- **Source unique = `index.html`** (2026-07-16 ; `solar_conquest_carte.html` archivé). `server/selftest.js` et `game-core.js` chargent le bloc logique d'`index.html`.
- **Serveur : Node.js** — il fait tourner **exactement le même code JS** que le jeu.
- **Base de données : MySQL / MariaDB.**
- **Connexion joueurs : comptes avec login.**
- **Le solo reste jouable hors-ligne** tout du long ; le jeu se connecte seulement pour une partie en ligne.

## Architecture
- `server/game-core.js` charge le bloc logique de `carte.html` dans Node (stubs DOM) → état autoritatif `G` + fonctions du jeu (`initGame`, `doColonize`, `doAITurn`, `endTurn`…). **Aucune règle réécrite.**
- `server/server.js` (à venir) : HTTP + WebSocket. Auth (register/login), lobby (créer/rejoindre), salles de jeu (1 partie = 1 `Engine`), IA côté serveur, persistance MySQL. Autorité = le serveur ; navigateurs et IA = clients qui envoient des **actions** et reçoivent l'**état**.
- `carte.html` en mode en ligne : écran login + lobby ; en partie, envoie des actions et **affiche l'état reçu** (réutilise les fonctions de rendu existantes).

## Checklist
- [x] Stack choisie (Node + MySQL + comptes).
- [x] **CRUX validé** : la logique de `carte.html` tourne **sans écran** dans Node (test OK : `initGame`, `doColonize`, `doAITurn`).
- [x] `server/game-core.js` : chargeur + API `Engine` (newGame / apply / aiAction). Testé.
- [x] `server/schema.sql` (users, games, game_players) + `server/package.json`.
- [x] **Sérialisation validée** : `JSON.stringify(G)` marche direct (6 Ko, pas de circularité, fonctions auto-retirées). Côté client : réhydrater `agenda`/`civ`/`event` par id (pour `calcVP` etc.).
- [x] **FILET DE SÉCURITÉ** : `server/selftest.js` joue des parties ENTIÈRES tout-IA sur `carte.html` sans écran. **30 parties, 0 crash, 0 invariant KO.** → à relancer après CHAQUE étape de refactor.
- [ ] **Généralisation du moteur player→nation (EN COURS — le gros morceau).** Idée clé : `G.player` = « la nation en train d'agir » ; le serveur la fait tourner. La **rotation est prouvée** (test : changer `G.player` adapte automatiquement tensions, `aiId`, `wins`). Solo intact (50 parties tout-IA, 0 crash).
  - [x] A. **Tensions** par `civ.id` (résolveur `_tk`, la clé `'player'` → nation active). Filet OK.
  - [x] B. **Guerres** canoniques par nation (`w.a`, `w.b`, `w.winsBy`) + vue dérivée (`w.aiId`, `w.wins`) via `_attachWar`. Rotation testée OK, filet OK.
  - [x] C. **IA cible-nation** : chaque IA calcule `ai._enemy = _aiResolveTarget(ai)` = nation **humaine** la plus proche (flags `_isAI` posés à `initGame`). Raids, destruction de routes, reprise de colonie, estimation de force, pression de tension et choix de colonisation visent cet ennemi (plus jamais `G.player` en dur → plus d'auto-ciblage sous rotation). Helpers IA-vs-IA restreints aux vraies IA. **Solo strictement identique** (50 parties vertes), test 2-humains OK (IA vise un humain ≠ elle-même, sans crash). *Reste pour D : la résolution de combat de GUERRE (`resolveAiAssault`, `G.wars.find(aiId===…)`) encore centrée joueur — à généraliser avec le driver de rotation où on peut la tester en boucle complète.*
  - [x] D1. **Guerre généralisée** : `resolveAiAssault` vise `ai._enemy` (plus `G.player` en dur), comptage via `winsBy` canonique ; finders de guerre IA rendus autonomes (`_warOf` = implication, indépendant de `G.player`) ; helper `_warBetween`. **Découverte clé : un tour d'IA est désormais AUTONOME — pas besoin de faire tourner `G.player` pour les IA.** Prouvé : une IA assaille le bon humain alors que `G.player` est une 3ᵉ nation ; vue dérivée (`aiId`, `wins`) cohérente. Solo : 60 parties vertes.
  - [x] D2. **Driver de tour** `server/driver.js` (`GameDriver`) : roster stable + sièges humain/IA, `activate(civId)` (rotation `player`/`ais` + `refreshWarViews`), manche entrelacée (ordre tiré au sort, 1 action = 1 passage), tours d'IA autonomes, `submitHuman(civId,action)` (active la nation puis applique), repli IA `stepHumanFallback` (déconnexion), clôture de manche (pirates/maintenance/revenus/événement). Testé : 40 parties mixtes 1H+2IA complètes (0 crash, invariants OK, guerres canoniques) + apply humain (colonize tombe sur la bonne nation) + assaut de guerre sous rotation.
  - [ ] D3. **Reste serveur** : `server/server.js` = diffusion d'état (WebSocket) + réception des actions des clients (s'appuie sur `GameDriver`).
  - [ ] (rappel) après désérialisation côté client/serveur : appeler `refreshWarViews()` pour ré-attacher les vues de guerre.
- [~] **Décisions-en-attente (EN COURS — fidélité complète, choix de Marc)** : courtier de décisions inerte en solo.
  - [x] Infra **courtier** dans `carte.html` : `setDecisionSink(fn)`, `_emitDecision(kind,nation,payload,cb,adapt)`, `resolveDecision(id,answer)`, `G._pending`. En SOLO (`_decisionSink=null`) → modales DOM inchangées. En SERVEUR → émet `{id,kind,nation,payload}` au bon client, la réponse rappelle le handler existant. Testé.
  - [x] Tranche **agenda** routée + testée (émet `agenda` pour l'humain actif → `resolveDecision({agendaId})` pose l'agenda sur la bonne nation ; IA reçoivent le leur).
  - [x] Tranche **draft Stratégie** routée + testée (multi-humain : `_runDraftStep` teste `nat._isAI===false`, émet `strategy` pour chaque humain ; sous-décision `strategy_calm` pour les cartes apaisantes ; applicateur `_applyStratTo(nat,card)` paramétré par nation ; solo via `applyStrategy(G.player)` inchangé). Va jusqu'à `startTurn`.
  - [x] **TOUTES les modales restantes routées** (broker-aware, inertes en solo) + testées (14/14 émettent le bon type sans planter, solo 50 parties vertes) :
    - Décisions : `invest1`, `invest2` (`showInvestmentModal/2`), `espionage`, `extrasolar`, `empath_copy`, `ai_dyson`, `dyson_build` (`showDysonModal` : décision si refus, notice sinon), `peace_offer` (`showPeaceOfferModal` : refuser = poursuite directe, proposer = éval IA existante), `war_combat` (`showWarCombatModal` → STANDOFF/DEFEND/attaque/skip), `accord_confirm` (`showAccordInfo`).
    - Notices d'information (continuation lue à la réponse) : `war_result` (`showWarModal`, + offre de colonisation butin), `event_result` (`showEventModal`), `event_announce` (`showEventAnnounce`), `eot` (`showEOTModal` → `continueAfterEOT`).
    - Helper `_emitNotice` pour les modales d'info dont la continuation est posée après l'appel.
  - [x] **Multi-humain setup** : agenda généralisé (`_serverAgendaDraft`/`_agendaStep` : chaque humain choisit, IA auto via `_aiPickAgendas`). `initGame` diffère le draft en mode serveur jusqu'à ce que le driver pose les sièges (`boot`→`showAgendaSelModal`). Stratégie déjà multi-humain. Testé 2H+2IA.
  - [x] **Assaut IA→humain nation-safe + défense routée** : `maybeAiAssaultPlayer`/`showAiAssaultDefenseModal`/`resolveAiAssaultOnPlayer` prennent un `defender` explicite (helper `_warHumanFoe`), comptage `winsBy` canonique, finder autonome. La décision `defense` part vers l'humain assailli. Prouvé sous rotation (3ᵉ nation active) : la défense va au bon humain, combat canonique. Solo vert.
  - [x] ✅ **ORCHESTRATION queue de tour (RÉSOLU)** : `startInterleaved` sort tôt en mode serveur (`G._serverActionPhase`) → le driver pilote les actions ; à la fin de manche il appelle `runEndOfRound()` du moteur qui enchaîne (modales routées) guerres→maintenance→événement→EOT→investissement→draft→tour suivant via `continueAfterEOT`. API driver : `boot(seats,onDecision)`, `pump()`, `answer(id,ans)`, `act(civId,action)`, `actAuto(civId)`. Notices auto-acquittées. **Testé : 1H+3IA et 2H+2IA, parties complètes (10 tours, phase 'over'), toutes décisions routées chaque tour, 640+ parties sans faille d'invariant, solo 60 vertes.**
  - [ ] (rare, à surveiller) 1 invariant KO observé sur ~195 parties orchestrées une fois, non reproduit sur 640+ ensuite — probable edge très rare de combat défensif, à pister avec une graine si ça réapparaît.
- [x] **DÉCISION HÉBERGEMENT** : Kreativmedia = mutualisé **PHP-only** (pas de Node, pas de process permanent ; SSH chroot + cron + MySQL illimité). → abandon de Node/WebSocket, passage au **Plan A : PHP+MySQL relais + moteur dans le navigateur de l'HÔTE** (le jeu étant au tour par tour, polling HTTP ~2 s suffit). Comptes avec login (choix de Marc).
- [x] **API PHP** (`server/php/`) : `schema.sql` (users, games, game_players, game_state, game_inputs) + endpoints `register/login/logout/me`, `create_game/join_game/game_info/start_game`, `get_state/put_state`, `submit_input/pull_inputs`. Sessions PHP + PDO. **Syntaxe validée (14/14 via php-parser).**
- [x] **Protocole de relais prouvé headless** (`relay_sim.js`) : l'hôte applique les coups d'un joueur DISTANT via la boîte aux lettres, état transitant en JSON (34 Ko) ; partie complète, 0 échec de parse.
- [x] **Client en ligne** `server/php/online.js` (v1, syntaxe OK) : API + connexion/inscription/lobby + boucle hôte (pilote le moteur in-page, relaie les distants) + boucle invité (poll/rendu) + panneau de décisions générique. Pont `scGetG/scSetG` + `rehydrateState` dans `carte.html` (réhydratation d'état reçu testée : calcVP OK). **Solo intact.**
- [x] **Guide de déploiement** : `docs/DEPLOIEMENT_PLESK.md` (base MySQL, FTP, config.php, HTTPS, test API).
- [ ] **RESTE (rodage LIVE, 2 navigateurs)** : brancher les ACTIONS de plateau des joueurs (en v1 l'action humaine = « Passer ») ; tester la boucle hôte/invité réelle ; ajustements UI. Le backend est déployable ; les décisions (agenda/stratégie/paix/défense/invest/Dyson/accord) sont déjà câblées.
- [ ] IA plus forte (vise son agenda, planifie) — testable via les simulateurs, en parallèle.
- [ ] Déploiement sur le serveur de Marc + bump cache PWA.

## Notes techniques
- Le serveur ne charge QUE le plus gros `<script>` (bloc logique). Les 2 petits blocs (UI mobile) ne sont pas nécessaires côté serveur.
- `G` est exposé via un getter (`__G`) car déclaré en `let`. Les fonctions du jeu sont accessibles directement sur le contexte.
- Quand `carte.html` évolue (règles), le serveur recharge le nouveau script au prochain lancement — **rien à régénérer**, c'est la même source.
