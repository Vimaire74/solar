# 🚀 REPRISE — À LIRE EN PREMIER (mode d'emploi anti-gaspillage de tokens)

> Ce fichier est le point d'entrée. Il évite de relire toutes les conversations.
> Dernière mise à jour : 2026-07-16.
>
> 🆕 Pour la bascule serveur live (Node autoritaire) : lire **`docs/OVH_SERVEUR_LIVE_MULTIJOUEUR.md`** (plan + reste à faire).

## 1) Quoi relire, dans quel ordre (économie de tokens)
0. 🏛️ **`docs/ARCHITECTURE_AVENIR.md`** — **À LIRE EN PREMIER, AVANT TOUT CODE.** Pourquoi les mêmes
   bugs reviennent (la perspective est une variable globale), ce qui cassera quand le jeu deviendra
   une application mobile, et ce qu'il ne faut surtout pas contourner. Toute correction doit être
   pesée à l'aune de ce document.
0bis. 🔨 **`docs/LOT16_CHANTIER.md`** — les chantiers préparés, découpés en « sans danger » et
   « le jeu est immobilisé ». Rien ne s'y lance sans un GO explicite de Marc, tâche par tâche.
1. **CE fichier** (REPRISE.md) — état global + où est quoi.
2. `docs/MULTIJOUEUR_BUILD.md` — détail de l'architecture en ligne (si on touche au multijoueur).
3. `docs/DEPLOIEMENT_PLESK.md` — comment c'est déployé (si on touche au serveur).
4. Le fichier concerné seulement (voir « carte des fichiers » plus bas). **Ne PAS relire `index.html` en entier** (~480 Ko) : cibler avec `grep`.

Les autres docs (`RESUME_PROJET.md`, `TODO_mobile.md`, `SPEC_IA_strategie.md`, etc.) sont d'anciennes références — n'y aller qu'au besoin.

## 2) Ce qu'est le projet
**Solar Conquest** : jeu de stratégie spatiale au tour par tour (colonies, routes, techs, guerre, diplomatie, 10 tours, 2-4 nations = 1+ humains + IA). Un **seul fichier de jeu**.

## 3) Le fichier de jeu — RÈGLE IMPORTANTE (màj 2026-07-16)
- **`index.html`** = LE jeu ET la source qu'on ÉDITE directement (~520 Ko, tout en un HTML+CSS+JS inline). Marc l'uploade sur le serveur.
- **`tutorial.html`** = copie d'`index.html` où `<script src="online.js">` est remplacé par `<script src="tutorial.js">`. **À RÉGÉNÉRER après CHAQUE modif du jeu** : `cp index.html tutorial.html && sed -i 's#<script src="online.js"></script>#<script src="tutorial.js"></script>#' tutorial.html`.
- **`solar_conquest_carte.html`** = ANCIENNE source parallèle, désormais **ARCHIVÉE dans `archives/`** (2026-07-16). Ne plus l'éditer. `server/selftest.js` pointe maintenant sur `index.html`.
- **`regles.html`** = règles du jeu (lien depuis le menu Journal). C'est LA source des règles ; on ne maintient plus le .docx/.pdf.

## 4) État actuel (2026-07-16)
- ✅ **Solo** : complet, calibré, fonctionne. Sauvegarde auto locale + bouton « Reprendre la partie » après refresh ; bouton « Recommencer à zéro » (Journal).
- ✅ **En ligne contre les IA** : DÉPLOYÉ et fonctionnel sur **https://solar.guerir.ch**. Le mode en ligne lance le **vrai jeu** dans le navigateur de l'hôte (fidèle au solo à 100 %) + synchro de l'état vers le serveur.
- ✅ **Debug + suivi (v21)** : logs de TOUTES les parties en base (rotation 10 dernières), email à Marc à chaque nouveau joueur, rapport quotidien par email (scores + liens logs). Déployé.
- 🟡 **2 humains en ligne (Phase 2, modèle hôte)** : actions/décisions de l'invité branchées ; reste = test live 2 navigateurs. ⚠️ Guerre humain↔humain et paix de l'invité encore auto (non routées). **On n'investit PLUS dans ce modèle hôte** (voir §17) — la vraie suite = backend Node autoritaire.
- ▶️ **Prochaine grande étape choisie par Marc** : **migration vers un serveur live Node autoritaire sur OVH** (✅ serveur en service) pour un vrai multijoueur. Plan + reste à faire : **`docs/OVH_SERVEUR_LIVE_MULTIJOUEUR.md`**.
- 🐛 Connu, non réglé : crash `techTaken.has` en ligne (Set non re-sérialisé — même cause que la reprise localStorage, réglée en solo via reviver `__set`/`__map`) ; « routes gratuites » vu une fois par Marc, non reproduit (attend un log).

## 5) Architecture en ligne (résumé)
Hébergement Kreativmedia = **PHP mutualisé, pas de Node**. Donc modèle **relais** :
- Le **navigateur de l'HÔTE fait tourner le vrai jeu** (il est l'autorité) et publie l'état (JSON) toutes les ~3 s via PHP → MySQL.
- Les **invités** interrogent l'état (polling) et l'affichent ; à leur tour (Phase 2), ils jouent une action sur leur vrai plateau et renvoient l'état à l'hôte.
- PHP = simple boîte aux lettres + stockage. Pas de WebSocket (inutile au tour par tour).

## 6) Carte des fichiers
- `index.html` / `solar_conquest_carte.html` : le jeu (voir §3).
- `server/php/` : le backend en ligne
  - `schema.sql` : tables MySQL (users, games, game_players, game_state, game_inputs).
  - `db.php`, `config.php` (identifiants MySQL, déjà remplis), endpoints `register/login/logout/me`, `create_game/join_game/game_info/start_game`, `get_state/put_state`, `submit_input/pull_inputs`.
  - `online.js` : TOUTE la couche en ligne (auth, lobby, boucle hôte, jeu invité, mouchard de debug). Inclus par `index.html` via `<script src="online.js">`.
  - `log.php` + `debug_view.php` : mouchard (voir §8).
- `server/` : outils de VÉRIFICATION headless (Node, pas déployés)
  - `game-core.js` : charge le JS de `index.html` dans Node (sans écran).
  - `driver.js` : pilote de tour headless (utilisé par les tests).
  - `selftest.js` : joue des parties tout-IA pour vérifier que rien n'est cassé.
- `docs/` : cette doc.

## 7) Déploiement (rappel)
Sur `httpdocs/` de solar.guerir.ch : `index.html` + `online.js` à la racine ; les `.php` (dont `config.php`) dans `api/` ; le dossier `assets/` (images). **Ne PAS** uploader `sw.js` pour l'instant (cache). Base MySQL `solar1` déjà créée et remplie. Détails : `docs/DEPLOIEMENT_PLESK.md`.

## 8) Debug à distance (le mouchard)
`online.js` capture console + erreurs + tout le journal de partie et l'envoie à `api/log.php`. Pour lire : ouvrir **`https://solar.guerir.ch/api/debug_view.php`** (texte). `?clear=1` pour vider. → Demander ce journal à Marc quand un bug survient en ligne.

## 9) Vérifier sans navigateur (avant de livrer)
Depuis le dossier projet :
- `node -e "require('./server/game-core.js')"` → le jeu charge sans erreur de syntaxe.
- `node server/selftest.js 40` → 40 parties tout-IA, doit finir « invariants KO : 0 ».
- `node --check server/php/online.js` → syntaxe de la couche en ligne.
- Après une modif du jeu, régénérer le tuto : `cp index.html tutorial.html && sed -i 's#<script src="online.js"></script>#<script src="tutorial.js"></script>#' tutorial.html`. (`selftest.js` lit directement `index.html`.)
- ⚠️ **`node -e "require('./server/game-core.js')"` ne suffit PAS** : ça charge juste le module, ça n'évalue pas le JS du jeu. Seul `node server/selftest.js N` construit l'Engine et évalue vraiment le code → **toujours lancer selftest après une modif de texte/JS**.
- ⚠️ **Apostrophes** : dans une chaîne JS en quotes simples (`_evOverlay('…')`, `innerHTML='…'`), toute apostrophe française (`l'annule`, `c'est`) DOIT être échappée `\'` sinon SyntaxError silencieuse (non vue par « charge OK »).

## 10) Ce qui reste / en attente
- 🟡 **Phase 2 (2 humains)** : actions de plateau de l'invité BRANCHÉES ; reste = **test live à 2 navigateurs** + (optionnel) router l'agenda/stratégie de l'invité (auto pour l'instant). Mécanique : `addAction` (invité, `G._il=false`) → `_scGuestMaybeSubmit` (attend fermeture des modales) → `window._scOnBoardAction` → online.js renvoie l'état via `submit_input`. Voile `#sc-waitblock` bloque le plateau hors du tour de l'invité. Détail : `MULTIJOUEUR_BUILD.md`.
- 🎨 **Apparence / UI** : chantier en cours de démarrage (demande de Marc).
- 🐛 Points mineurs notés : timing popup route (peut-être réglé par la refonte, à confirmer), vérifier que toutes les images de cartes civiques sont uploadées.

## 11) Préférences de Marc (rappel)
Concision, pas d'obséquiosité, ne jamais mentir, ne pas lancer d'itération coûteuse en tokens sans GO (assoupli pour ce build). Chercher le plus simple/gratuit d'abord. « mémorise » = noter sans implémenter.

## 13) 🤖 IA — moteur à UTILITÉ (refonte 2026-07-05)
Fini les anciennes « recettes » : plus de listes de priorités par civ (`profileOrder`), plus de tactique pirate tirée au sort (`_tactic` rushtech/mixte), plus de probabilités de raid (0.72/0.20…), plus de modulations de contexte.
- Cœur : `actionUtilities()` dans `doAITurn` calcule une VALEUR par type d'action (colonize/upgrade/tech/route/civic/military/raid/raidAI/assaultAI + heal). `chooseAndAct()` joue la meilleure (>0) à chaque AC, recalculée à chaque pas.
- Les exécuteurs (`tryColonize`, `tryTech`, `tryUpgrade`, `tryRaid`…) et la logique de GUERRE (`aiWarPolicy`, `tryRecaptureAssault`, `aiRouteRaid`) sont conservés.
- Raids = valeur FAIBLE (base pirate 3 / autres 1,5) → secondaires. **Plafond 1 action agressive/tour/IA** (`_attacksThisTurn>=1`). Identité civ gardée via `_econBranches()` (quelle branche tech) uniquement.
- Résultat mesuré (40 parties, 4 nations) : développement ~70 % des actions (tech 31 % = 1ʳᵉ action), raids ~29 %. Les Ceinturiens colonisent le plus (~5 colonies) au lieu de spammer les raids.
- Pour re-mesurer : `/tmp/measure2.js` (compte les actions dans le log + dev/civ).
- **Pouvoirs gratuits (0 AC)** : l'IA active désormais le sien en début de `doAITurn` (bloc `abilityUsed`). Ceinturiens=Commerce pirates (toujours), Terriens=Diplomatie Verte +3 Gouv si 🪨≥5, Martiens=Surtension +1 AC si ⚡≥4 & 🪨≥2 & tour≤7, Jupitériens=Forge Orbitale (lune joviène Nv1→2) si dispo & 🪨≥3 & ⚡≥3. Avant, seuls les Ceinturiens l'utilisaient. Mesure via `abilityUsed` en fin de phase (`/tmp/measure4.js`).

## 14) Équilibrage énergie + routes IA + « se souvenir de moi » (2026-07-05)
- **Entretien colonies (doMaintenance)** : Biosphère Avancée (`bio2_bonus`) → colonies Nv.2-3 sans entretien **énergie** ; Terraformation (`terra3`) → colonies Nv.2-3 sans **aucun** entretien. Nv.1 inchangé (1⚡). Textes des 2 cartes mis à jour. (⚠️ Word/PDF pas encore modifiés pour ces 2 cartes.)
- **Routes IA** : retiré le garde `énergie≥2` de `tryRoute` (bloquait la connexion à 0⚡) et `_routeUtil` passe à 18 (connecter > coloniser plus). Résultat mesuré : colonies non connectées 0,5 % (avant : beaucoup), énergie fin de tour ~5 (avant ~0).
- **« Se souvenir de moi »** : case cochée par défaut dans `#lv-auth`. Serveur : `db.php` (gc_maxlifetime 30 j + `remember_cookie()`), `login.php`/`register.php` prolongent le cookie si `remember`. Client : `lvTryAutoLogin()` au chargement → me.php → clique `sc-online-btn` si session valide. **Fichiers à réuploader : index.html + api/db.php + api/login.php + api/register.php.** Limite : sur hébergement mutualisé, si le GC de session du host ignore gc_maxlifetime, la persistance peut être < 30 j (repli propre : re-login). Solution 100 % robuste = token en base (non fait, plus lourd).

## 15) Comptes email + enregistrement des parties + email de récap (v19, 2026-07-05)
- **Login par EMAIL** (remplace le pseudo). `users` : nouvelle colonne `email` (UNIQUE) ; `username` devient nom d'affichage (auto = préfixe email). `register.php`/`login.php`/`me.php` réécrits ; `online.js` screenAuth + landing `#lv-auth` : champ Email.
- **Parties enregistrées** : table `game_results` (user_id, email, my_civ, won, summary JSON = nations+IA+VP+journal). `doEndGame()` POST → `save_result.php` (silencieux ; n'enregistre que si connecté).
- **Email de récap** : `save_result.php` envoie via `mail()` au joueur (nation, adversaires + mention IA, VP). ⚠️ `mail()` sur mutualisé souvent bloqué/spam → la base est le filet fiable.
- **Reclassement carte** : `cm_explore` (Extraction d'He3) et `cm_forages` (Capture d'astéroïdes) forcées en tête des cartes civiques (tri dans le rendu `#sec-civ`).
- **DÉPLOIEMENT v19** : (1) exécuter `server/php/migrate_v19_email_results.sql` dans phpMyAdmin ; (2) uploader `index.html`, `online.js`, et dans `api/` : `db.php login.php register.php me.php save_result.php` ; (3) associer un email à ton compte existant (UPDATE dans la migration) ou te ré-inscrire.
- Idée non faite (proposée) : une page debug listant `game_results` pour voir les parties de l'ami sans dépendre de l'email.

## 16) Multijoueur invité : actions + undo restreint + routage agenda/stratégie (2026-07-06)
- **Invité = TOUR COMPLET** : il joue toutes ses actions librement (vrai plateau, `G._il=false`), puis clique **« Fin de tour »** (`window._scOnPass`) pour terminer et renvoyer l'état (`submit_input`, `passed:true`). Ne se termine plus automatiquement à 0 AC (pour laisser annuler). Voile `#sc-waitblock` bloque le plateau hors de son tour / pendant l'attente. (Le hook per-action `_scOnBoardAction` a été retiré.)
- **Undo restreint (solo + en ligne)** pour éviter les conflits : annulable = tech / civique / militaire / pouvoir gratuit / **upgrade** (gardent `saveUndo()`). NON annulable (= `undoStack=[]`, commit-point) = colonisation, route, dépôt/rappel de jeton, raid, accord, attaques (`doColonize`, `doEstablishRoute`, `routeManageDeploy/Recall`, `doRaid`, `proposeAccord`, `attackEnemyRoute`, `confirmAttack`, `doRaidTarget`). L'IA n'a jamais d'undo (action UI sur `G.player`).
- **Agenda + Stratégie de l'invité ROUTÉS** (plus auto) : helper `_emitRemote`/`_isRemote` (carte.html) → `window._scRemoteDecision` (online.js `relayRemoteDecision` : publie `pending`, attend la réponse via `waitRemote(...,'answer',id)`, `resolveDecision`). Invité : `guestAnswerDecision` (réutilise `askLocalDecision`) sur `s.pending`. Branches : `confirmAgendaChoice`→`_relayRemoteAgendas` ; `_runDraftStep` (branche `_isRemote` avant l'auto) ; sous-décision `strategy_calm`. Auto-pick reste en repli. Les `_remoteHuman` gardent `_isAI=true` → **combat/guerre encore auto** (non routés) — prochain chantier si besoin.
- **Défense de l'invité ROUTÉE** : `showAiAssaultDefenseModal` (déjà nation-safe, param `defender`) → branche `_isRemote(p)` → `_emitRemote('defense',…)`. Quand l'invité déclare la guerre à une IA et que celle-ci contre-assaille, l'invité choisit ses jetons de défense (avant, la modale s'ouvrait à tort chez l'hôte).
- **Reste NON routé (guerre)** : `showPeaceOfferModal` est centré `G.player` (paix de l'invité encore AUTO via `aiWarPolicy` car `_remoteHuman` garde `_isAI=true`) ; les IA n'attaquent pas l'invité proactivement (ciblent `_isAI=false`=hôte) ; pas de guerre humain-vs-humain. Rendre tout ça routable = **rendre le sous-système guerre nation-safe** (refactor conséquent) + test live. `showAiDysonModal` ne prompte que l'hôte (invité auto-décide Dyson).
- **DÉPLOIEMENT** : uploader `index.html` + `online.js`. ⚠️ **Non testé en live** (nécessite 2 navigateurs + serveur) — premier essai = rodage ; en cas de souci, lire `api/debug_view.php`.

## 17) 🎯 DIRECTION ARCHITECTURE (décision Marc, 2026-07-06) — À LIRE
**Objectif final** : app mobile sur les stores (Apple + Android) en multijoueur en ligne.
- **Le bon modèle cible = SERVEUR AUTORITAIRE** (comme BGA) : l'état vit sur un serveur, les règles tournent sur le serveur, les clients envoient des INTENTIONS (pas l'état), le serveur valide + pousse. `game-core.js` (moteur JS pur, sérialisable, headless, généralisé « par nation » + routage de décisions) est **déjà prêt à tourner côté serveur** → l'actif durable, transférable tel quel. L'UI HTML/JS actuelle sera **emballée** (Capacitor/Cordova) en app iOS+Android.
- **Le modèle actuel « hôte autoritaire » (navigateur de l'hôte = serveur, PHP = boîte aux lettres) est un CONTOURNEMENT** dû à l'hébergement PHP mutualisé (pas de Node). C'est une couche JETABLE pour le produit final (`online.js` relais). **Ne PAS surinvestir dedans** (ex : ne pas faire le gros refactor « guerre nation-safe » juste pour l'hôte).
- **DÉCISION DE MARC = OPTION B** : pour l'instant on **garde le modèle hôte tel quel** (jouable entre amis, gratuit), on **ne le peaufine plus**. On migrera vers le backend Node autoritaire quand Marc sera prêt à payer un vrai hébergement.
- **Continuer d'investir = les RÈGLES (le moteur)** : c'est ce qui transfère. La bascule future sera mécanique (moteur isolé).
- Migration future : petit backend Node exécutant `game-core.js` + WebSocket + DB ; hébergeur qui exécute Node (VPS type OVH — choisi et en service, ou serverless + temps réel géré). Recherche d'hébergeurs en cours (voir docs/HEBERGEMENT_NODE.md).

## 18) 🎓 TUTORIEL sur le VRAI jeu (2026-07-06)
- `tutorial.html` = **copie de `index.html`** dont le `<script src="online.js">` est remplacé par `<script src="tutorial.js">`. Zéro modif d'index.html. ⚠️ **À RÉGÉNÉRER quand le jeu change** : `cp index.html tutorial.html && sed -i 's#online.js#tutorial.js#' tutorial.html` (garde le `<script src=...>` du tuto).
- `tutorial.js` = couche « coach » (IIFE, comme online.js mais SANS réseau). Elle : neutralise l'IA (`window.doAITurn`→pass, apprentissage calme), lance `initGame('terriens',['martiens'])`, injecte une bulle coach (bas-centre, z-index max) + surbrillance des vrais boutons (btn-col/btn-route/btn-ability/btn-end/tech-tabs…), hooke `addAction` (avance sur l'emoji d'action) et `addLog` (commentaires contextuels événement/tension/raid/guerre). **Bouton « Suivant » sur chaque étape = filet de sécurité** (jamais bloqué).
- Séquence : agenda → stratégie → ressources → coloniser → route (mentionne le « + » entre colonies) → améliorer → technos → pouvoir → fin de tour → bilan → jeu libre tours 2-4 → fin au tour 4.
- Pour tester : ouvrir `tutorial.html` (à côté de `tutorial.js` + `assets/`). Pas encore testé en vrai (UI non testable headless).
- ✅ FAIT : carte globale expliquée (étape « La carte du système solaire ») ; bouton **◀ Retour** ; bulle **déplaçable + réductible** (`–`/`+`) ; positionnement auto (opposé de la cible) ; **synchro tuto ↔ validations du jeu** (`wrapSync` sur `confirmAgendaChoice`/`applyStrategy`/`dismissEventAnnounce`/`showEOTModal`/`continueAfterEOT` + `syncAdvance` avec vérif fenêtre fermée) → plus de décalage entre bouton du jeu et bouton du tuto ; étape « Événements » (annonce tour d'avant, résolution fin de tour pair).
- ▶️ PROCHAIN GROS CHANTIER (attend le GO de Marc) : **cinématique « démo auto puis essai »** pour chaque menu (techs/civiques/gouv, colonisation/route/amélioration, raids/guerre) : le tuto prend les commandes, clique/défile/achète lui-même avec décompte animé des ressources (ressources gonflées pour éviter les manques), s'arrête pour expliquer (ex. tech Nv.2 verrouillée), puis rend la main au joueur. À construire menu par menu, en commençant par les techs.

## 19) Changements récents (2026-07-12 → 2026-07-16)
- **Règle de guerre / garnison** : la garnison est un VRAI jeton réservé (1 par colonie connectée hors capitale, `defFloor`). L'attaquant immobilise 1 jeton en cooldown **par jeton de défense adverse (garnison comprise)** ; à la prise d'une colonie, le jeton de garnison est **détruit**. Code + `regles.html` + `tutorial.js` à jour.
- **Word/PDF abandonnés** : les règles vivent dans **`regles.html`** (mobile-friendly, police relative). Lien encadré « 📖 Règles du jeu » en haut du menu Journal.
- **Debug en base + emails (v21)** : `log.php` écrit chaque partie en base (rotation 10) ; `register.php` email à Marc au nouveau joueur ; `daily_report.php` (jeton `report_token` dans `config.php`, `admin_email=marc@guerir.ch`) = rapport quotidien. Fichiers PHP déjà déployés par Marc.
- **Sauvegarde/reprise locale** : `scSerialize/scDeserialize` (reviver `__set`/`__map` pour Sets/Maps), autosave 2 s dans `localStorage`, bouton vert « ▶ Reprendre la partie » après refresh, `scClearSave()` en fin de partie. Bouton **« Recommencer à zéro »** (`scAbandonGame`) dans le Journal.
- **Bug Io–Jupiter corrigé** : `jorbital1` (« Station Jupiter ») était le seul anneau orbital sans flag non-colonisable → l'IA la colonisait et créait une route Io→Jupiter. Ajout `noColonize:true` (+ baseVP 0) + gardes joueur/IA/popup. Plus de route Io–Jupiter.
- **Stratégie** : bouton « Ignorer » remplacé par **« Valider mon choix »** (sélection puis validation, comme l'agenda) — `selectStrategy`/`confirmStrategy`, classe `.so-selected`.
- **Renommage catégorie** : « Actions civiles » → **« Économie & Société »** (onglet « Eco&Soc », titre de section « 💼 Éco & Société ») dans index/tutorial ; `regles.html` aligné (§7.2 « Actions Économie & Société »).
- **Note Tyrannie** (regles.html §4.2) : n'ouvre pas droit aux PV « bon gouvernement », d'où +1 AC au lieu de points de gouvernement.
- **Batch de bugs de l'ami (juin)** : cooldown raid IA, extra-solaire dégate (tech gardée), routes exigent 1 AC, clic-ailleurs ne ferme plus une fenêtre en attente, Forge Orbitale (choix de colonie + « déjà max »), event pirate (max 2 routes protégées perdues), police top-bar + compteur de jetons Force + retrait du « ? », texte « Raid » Empire, coûts affichés en « − », modal-lock (grise les boutons pendant une décision).

## 12) ⚠️ RÈGLE UI — menus / modaux (à respecter À CHAQUE ajout ou modif de menu)
Défaut récurrent à NE PLUS reproduire : un menu qui déborde de l'écran — le haut passe sous la barre du haut, le bas passe sous la barre du bas, et on ne peut pas scroller.

Règles obligatoires pour tout menu (événements, début/fin de tour, guerre, accords, etc.) :
- **JAMAIS `position:fixed;inset:0`** pour un menu. Il DOIT rester dans la **zone centrale**, entre les deux barres : `top:var(--topband,0); bottom:var(--botband,0); left:0; right:0;`.
- **Toujours scrollable** : conteneur `overflow-y:auto; align-items:flex-start;` + un peu de padding bas. La carte (`ea-card`/équivalent) avec `max-width` raisonnable et `width:100%`.
- Les modaux **existants** du jeu suivent déjà ce patron (voir la liste de sélecteurs `#invest-modal,#strategy-modal,#event-modal,…` dans le CSS avec `top:var(--topband)!important;bottom:var(--botband)!important;overflow:auto`). **Tout nouveau modal doit être ajouté à cette liste OU reproduire ces styles.**
- Objectif de fond voulu par Marc : **préférer inscrire ces menus DANS la zone centrale** (comme la carte ou l'arbre tech) plutôt que des popups flottants.

Données contextuelles à afficher dans ces menus (fait pour les accords via `_evMyStats()` / `_evAiInfo()`) :
- Toujours montrer pour **notre nation** : VP, jetons Force, ressources utiles à la décision.
- Montrer pour **les nations concernées** ce qui est visible : VP (public), Force (via `perceivedForce` → exact si Renseignement niv.2 `intel_2`, sinon estimation ±3). Économie/moral d'une IA **uniquement** avec `getIntelLevel>=2`.
