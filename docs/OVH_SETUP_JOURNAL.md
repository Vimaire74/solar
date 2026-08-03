# 🖧 Serveur OVH + Coolify — journal de mise en place (pour piloter Marc pas à pas)

*Créé le 2026-07-17, mis à jour le 2026-07-18. (Anciennement « HETZNER_… » — renommé après le choix d'OVH.)*
*NB : Claude ne peut pas stocker les captures d'écran ni joindre le serveur (environnement coupé du réseau). Ce journal écrit sert de mémoire des étapes.*

## Objectif
Un serveur unique qui héberge : (à terme) le backend Node du jeu Solar Conquest + plusieurs sites (dont TitanCorp, actuellement sur Netlify). Gestion via **Coolify** (multi-sites, HTTPS auto Let's Encrypt, déploiements, backups).

## ⚠️ Pivot Hetzner → OVH (2026-07-18)
- Hetzner abandonné : la gamme éco (CX23 ~6 €, et l'ARM CAX11) était **en RUPTURE** dans toutes les régions testées ; le x86 « regular » (CPX22) coûtait ~20 €/mo. Pas fiable en dispo.
- **Choisi = OVHcloud VPS-1** : dispo immédiatement, pas cher, pas de frais de montage.

## ✅ Serveur ACTIF (OVH)
- **Plan : OVH VPS-1 2027** — 2 vCore / 4 Go RAM / 40 Go SSD NVMe. **~5,39 € TTC/mois**, backup auto offert, 0 € de montage. Renouvellement auto le 18 août.
- **Localisation : Gravelines (GRA), France** (Region OpenStack os-gra6).
- **Nom : vps-dbd9e4aa.vps.ovh.net** — **IPv4 : 91.134.138.9** — IPv6 : 2001:41d0:305:2100::1:126d
- **Utilisateur : `ubuntu`** (sudo). Image Ubuntu 26.04.
- **Mot de passe** : Marc a dû le changer au 1er login (Ubuntu l'a forcé). Le mot de passe courant = celui que Marc a défini (il le connaît). Codes de récup 2FA OVH : fichier `codes secour OVH.pages` (à mettre en gestionnaire de mots de passe).
- Compte OVH au nom de **Marc Isenschmid** ; facturation à passer au nom de TitanCorp si besoin.

## ✅ Coolify INSTALLÉ (2026-07-18)
- **Coolify v4.1.2** installé sur le VPS (commande `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash`).
- Serveur cible dans Coolify = **« This Machine »** (le VPS lui-même).
- **Compte admin Coolify créé.**
- **Accès tableau de bord : http://91.134.138.9:8000** (web, plus besoin du terminal).
- ⚠️ TODO sécurité : sauvegarder `/data/coolify/source/.env` du serveur dans un gestionnaire de mots de passe (recommandé par l'installeur).

## ✅ v3.3 — 4e partie de Marc : 3 bugs corrigés + relecture des docs (2026-07-23, **`lot15_tout`** REMPLACE lot13/lot14)
> ⚠️ RÈGLE POUR MOI (Claude) : **à CHAQUE reprise, relire `docs/ARCHITECTURE_AVENIR.md` (EN PREMIER) + `docs/LOT16_CHANTIER.md` + `docs/REPRISE.md` + `docs/OVH_SETUP_JOURNAL.md` + `docs/OVH_SERVEUR_LIVE_MULTIJOUEUR.md` + `docs/MULTIJOUEUR_BUILD.md`** avant de coder. Marc les a créés exprès pour ça. Ne plus refaire les mêmes erreurs faute de mémoire.
- **Pouvoir de nation perdu (0 AC → fin de tour forcée sans le proposer)** : CORRIGÉ. Le serveur (`driver.act` + `_freePowerAvailable`) **ne fait plus passer** un humain à 0 AC tant que son pouvoir GRATUIT (0 AC) est dispo ; le client (`onMyActionTurn`) affiche alors le vrai rappel du jeu `_scShowAbilityReminder` (Utiliser → intention power ; Passer → intention pass, via override de `_scAbilityReminderSkip`). Testé headless.
- **Gel « fin du tour 2, ça n'avance plus, je peux pas passer »** : cause = **action refusée silencieusement** (ex. pas assez de ressources / case non adjacente) → le joueur gardait ses AC sans savoir pourquoi. CORRIGÉ : le serveur renvoie une **notice avec la raison** (⚠️) au joueur ; il garde la main + bouton Passer. (Le serveur ne boucle jamais : c'est le joueur qui doit rejouer ou passer.)
- **Log des actions adverses « juste les noms »** : cause = **bug d'ordre** dans `driver._emitLog` — `G.log` est trié plus-récent-en-tête (unshift), mais on envoyait `slice(before)` = les VIEILLES entrées. CORRIGÉ : `slice(0, nNew).reverse()` → la pop-up rouge montre les vrais coups (« Martiens colonise Cérès », « route → Cérès »…). Testé.
- **VRAIES MODALES stratégie + investissements BRANCHÉES (2026-07-23, dans le même lot15)** : le jeu en ligne affiche désormais les **vraies modales graphiques** du jeu (mêmes DOM `#strategy-modal`/`#invest-modal`/`#invest2-modal` + classes CSS `.strat-opt`/`.inv-opt`) au lieu de mes panneaux génériques, pour stratégie / invest1 / invest2. Mécanique : `showStrategyReal`/`showInvestReal` peuplent la vraie modale depuis le payload serveur ; les boutons de validation sont overridés (`confirmStrategy`/`selectInvestment`/`selectInvestment2`) → quand une décision en ligne est active (`STATE._realDecide`), ils **envoient la réponse** au serveur au lieu d'appliquer localement (sinon comportement solo intact). Repli sur panneau générique si la modale absente. Contrat de réponses `{cardId}` inchangé (test_contract vert). **Visuel non testable sans navigateur → à confirmer par Marc.**
- **VRAIE MODALE AGENDA aussi branchée** (2026-07-23, capture d'écran de Marc = l'agenda était le pire) : `showAgendaReal` peuple la vraie modale violette `#agenda-sel-modal` (contexte ressources/revenus/prochain événement calculé comme en solo + les 5 agendas du serveur) ; override `confirmAgendaChoice` → envoie `{agendaId}`. Donc **agenda + stratégie + invest1/2 = vrai look** maintenant.
- **RESTE (apparence)** : événements (event_announce/event_result → encore bandeau notice), combat de guerre (`war_combat`), défense, paix, Dyson, accord, espionnage, extrasolar, empath, strategy_calm → encore panneaux génériques bleus. À brancher sur les vraies modales au même principe (browser-only → itérer avec Marc). Puis : capture de colonie en guerre (cible non routée) ; IA interne plus forte.
- **Upload `lot15_tout`** (index.html + online.js + sw.js + server/×5) → **Redeploy des DEUX applications** (solar-game.com ET live.solar-game.com).

## ⚠️ v3.4 — « jeu s'arrête fin tour 1 » = déconnexion client, PAS un gel serveur (2026-07-23, dans lot15)
- **Diagnostic /debug de Marc** : tour 2, `action/martiens`, martiens (marc) `on:false` = **sa connexion est tombée**. Le serveur n'était PAS figé (il aurait fait jouer l'IA après 30 s) ; c'est le CLIENT de Marc qui était déconnecté → écran figé de son côté.
- **Cause = le rechargement auto sur `controllerchange`** que j'avais ajouté dans le SW (lot14/15) : quand le nouveau service worker s'activait, il rechargeait la page EN PLEINE PARTIE et coupait le WebSocket. **RETIRÉ.** La mise à jour ne se fait plus que via le bandeau manuel « 🔄 Nouvelle version » (le joueur le touche entre deux parties). `index.html` corrigé, dans `lot15_tout`.
- Reconnexion client déjà en place (token + code de partie mémorisés, retry 3 s, visibilitychange/focus, resync). Sans l'auto-reload, la connexion devrait rester stable.
- Note : `lot15_tout` a été mis à jour plusieurs fois aujourd'hui (vraies modales agenda/stratégie/invest + retrait auto-reload). Marc doit uploader la DERNIÈRE version du dossier.

## ✅ v3.5 — retour visuel des actions + analyse partie complète (2026-07-23, dans lot15)
- **Retour visuel du résultat de TON action** (raid/combat/capture : réussi ? combien ?) : le serveur renvoie au joueur agissant les lignes de log de son action → **pop-up VERTE « ✅ Résultat de ton action »** (client `showResultToast`). Testé (raid → « ⚔️ Raid ! +… tension +2 »).
- **DEMANDE EN ATTENTE de Marc : Valider/Annuler par action.** J'avais DÉSACTIVÉ le système confirm/undo en ligne (croyant que c'était la cause du bug « la route s'annule ») — mais Marc le VEUT (comme en solo). Le vrai besoin : play action → boutons Valider/Annuler → il choisit. **Complexe en serveur-autoritaire** à cause de l'ALÉA (colonisation = tuile Découverte aléatoire, raid = vol aléatoire) : un aperçu optimiste local afficherait une découverte ≠ de celle du serveur. À concevoir proprement (sans doute : confirm seulement pour les actions DÉTERMINISTES — tech/civique/militaire/upgrade/pouvoir — via optimiste-local + envoi sur Valider + garde des synchros ; garder les aléatoires en commit direct avec le retour visuel vert). À faire AVEC test navigateur de Marc, pas à l'aveugle (risque de recasser le jeu qui tourne maintenant de bout en bout).

## ✅ v3.6 — VALIDER / ANNULER par action (annulation côté serveur) (2026-07-23, dans lot15)
- **Insight de Marc qui débloque tout** : la tuile Découverte est **figée par nœud pour tout le tour** (`G._discCache[nodeId]`), donc annuler une colonisation puis la refaire donne la MÊME découverte → **annulation sans préjudice**, même pour les actions à aléa figé.
- **Implémentation (annulation côté SERVEUR, pas d'optimiste client)** : `driver.act` pour une action ANNULABLE (colonize/route/upgrade/buyTech/power/buyGeneral/buyMarket) réussie prend une **photo** (`_snap`, coupe les cycles) AVANT, applique, et **TIENT** (`{kind:'confirm'}`) sans avancer. `commit(civId)` fige + continue ; `undo(civId)` **restaure la photo** (via scDeserialize+rehydrate+refreshWarViews) en **gardant `_discCache`** (pas de re-tirage) + reconstruit le roster + repositionne le pointeur d'acteur. Non annulable (commit direct) : raid, attaque, accord, jeton.
- **Serveur** : messages `confirm` / `undo` ; sur action tenue → `confirm_pending` au client + timer de sécurité (auto-Valider après AFK_MS si pas de réponse/déconnexion, pour ne jamais bloquer). **Bot** : valide toujours (`confirm_pending`→`confirm`).
- **Client** : `confirm_pending` → affiche la vraie barre **✓ Valider / ↩ Annuler** (`#sc-confirm`) ; overrides `scConfirmValidate`→`confirm`, `scConfirmCancel`→`undo` ; blocage d'une nouvelle action tant qu'une est en attente.
- **Testé headless** : colonize→TIENT, UNDO→revient exactement à l'état d'avant (découverte figée conservée), re-colonize+COMMIT→figé. + selftest solo, contrat, actions, bot : **0 erreur, 0 gel, 0 cycle**. Détection de rejet resserrée (un « ⚠️ colonie éloignée » n'est PAS un rejet).
- **À confirmer par Marc en navigateur** : la barre Valider/Annuler apparaît bien après une action annulable, et Annuler revient en arrière.

## 📊 ANALYSE de la partie 0CBA de Marc (2026-07-23) — Jupitériens (IA) gagne 113 VP
- Scores : Jupitériens (IA) **113**, Marc (Martiens) **50**, Ceinturiens (bot) **41**. L'IA Jupiter a très bien joué (5 colonies, 12 cartes tech, ressources pleines) → dément « l'IA joue toujours mal » : ici elle domine. La force de l'IA interne est variable (mémo : chantier IA).
- Fait marquant : **la CAPTURE de colonie en guerre FONCTIONNE dans le sens IA→joueur** : « 🏴 Colonie Cérès CAPTURÉE par Jupitériens (6🛡️ vs 11⚔️) ». Donc le combat de guerre défensif marche ; c'est la capture joueur→IA (choix de cible) qui reste non routée (voir §capture).
- « 🛡️ IA Défensive : raid bloqué ! » → une tech ennemie a bloqué le raid de Marc. Sans le retour visuel vert (ajouté maintenant), Marc ne le voyait pas → d'où sa remarque « on voit pas si le raid a réussi ».
- « Guerre Populaire Forcée » : mécanique de moral qui force Marc en guerre. Fonctionne. Marc a perdu une colonie et de la tension.

## ✅ v3.7 — BUG SOLO « fin de tour en double / bloquée » corrigé (2026-07-26, index.html — dans lot15)
- **Diagnostic via debug de l'ancien site** (partie Jupitériens SXV7T6) : à la reprise d'une partie sauvée pendant le bilan de fin de manche, `scResumeGame`→`interleaveStep` revoyait « tous ont passé » et **rappelait `runEndOfRound()` une 2e fois** → revenus + pirates + événement appliqués EN DOUBLE (log : « Revenus nets +7+18+9+7 » deux fois à 13:03:52 et 13:04:02). C'est le « fin de tour en début de tour, le bordel » de Marc.
- **CORRIGÉ** : garde-fou anti-réexécution dans `runEndOfRound` indexé sur `G.turn` (`G._eotDoneTurn`) → un 2e appel le même tour ré-affiche juste le bilan (`G._lastEOT`) au lieu de tout refaire. Testé : revenus appliqués 1× (6→8), 2e appel neutralisé ; selftest 3 parties 0 crash. **Fix moteur → bénéficie SOLO + en ligne** (index.html partagé).
- **Bug 1 (au tour 6, pas de « fin de tour » à 0 AC) — Marc confirme qu'AUCUN bouton Valider n'était visible** → ce n'était donc pas le confirm. Cause = un edge où l'auto-passage (`passTurnIL`) ne s'est pas déclenché (modale fermée à la main, rappel de pouvoir, ou état online) et `_scCanPlayerAct` retourne « peut agir » à 0 AC (il délègue à l'auto-passage) → **aucun filet**. CORRIGÉ par un **chien de garde universel** `_armPlayerStuckWatch` : armé à chaque fois que la main revient au joueur ; si après ~5 s rien n'a avancé (même tour/idx, pas de modale ni confirm ni rappel), il affiche la modale « bloqué » avec bouton **Passer/Fin de tour**. Garantit qu'on ne reste JAMAIS coincé. (Timers neutralisés en headless → n'affecte pas selftest ; 3 parties OK.)
- **À uploader** : `index.html` (+ regénérer `tutorial.html`) — sur solar-game.com (dans lot15) ET, si Marc veut que ses amis testeurs en profitent, sur l'ancien solar.guerir.ch aussi.
- **Demande stats de Marc (partie EN COURS visible dans les stats)** : sur le NOUVEAU serveur c'est DÉJÀ fait — `snapshot(g)` sauve l'état après CHAQUE action, et `/debug` (live.solar-game.com/debug) montre les parties en cours (nations + journal 15 lignes). Si sa remarque vise le système stats fait dans une AUTRE tâche (ancien site PHP), c'est là-bas qu'il faut le changer (save action-par-action côté PHP).

## 📌 MÉMO BUG DE RÈGLE (à corriger plus tard, signalé par Marc 2026-07-23) — timing des cartes Stratégie
- **Symptôme** : les cartes Stratégie qui donnent des ressources (ex. +2⚡ +2🪨) semblent appliquées **en FIN de tour, AVANT l'entretien** (maintenance), au lieu du DÉBUT de tour. Résultat : Marc prend le bonus, l'entretien draine l'énergie, et il **démarre le tour suivant à 0⚡**.
- **Concerne AUSSI le fichier HTML solo** (pas seulement l'en-ligne) → à corriger dans `index.html` (moteur), donc bénéficie aux deux.
- Piste : vérifier l'ordre dans la clôture de manche / `runEndOfRound` / `_applyStratTo` vs `doMaintenance`/`doRevenues`. Le bonus de stratégie devrait être disponible pour le tour où on le joue (début), pas consommé par l'entretien juste après.
- **NON implémenté** (mémo, en attente du GO de Marc).

## 🔧 PARTIE À 2 HUMAINS de Marc+Laurent — 13 bugs à corriger (2026-07-26). Traités par VAGUES testées.
### ✅ VAGUE 1 FAITE (dans lot15) — le multi injouable
- **#2 + #13 (le jeu joue/choisit à ta place)** : le serveur auto-répondait/auto-jouait après `AFK_MS` **même connecté**. CORRIGÉ : `armTimer` ne pose PLUS de minuteur d'auto-jeu pour un joueur **connecté** ; l'auto-jeu ne sert QU'à un joueur déconnecté (grâce 30 s). Un joueur connecté prend tout son temps.
- **#3 (partie abandonnée impossible à quitter, boucle)** : nouveau message serveur **`leave`** → l'hôte (ou toute partie en cours) quittée = partie TERMINÉE pour tous (`game_ended`, snapshot supprimé, `games.delete`). Client : « Recommencer à zéro » (journal) en ligne → `leave` (au lieu de recharger et se ré-embarquer) ; `game_ended` → purge `sc_ws_game` + retour lobby ; logout et « Quitter » envoient `leave` + purgent `sc_ws_game`. Testé : créer → leave → 0 partie restante. **Reste (nicety, plus tard)** : négociation « l'invité demande de recommencer → l'hôte accepte » ; pour l'instant n'importe qui quitte = tout le monde au lobby (peut recréer).
- **#6 (écran totalement bloqué pour l'autre)** : SUPPRIMÉ le voile plein écran `#sc-waitblock`. Le joueur hors de son tour peut regarder librement (carte, journal, empire, diplo, détail des techs, survol des ressources). Seules les **actions concrètes** sont bloquées (interceptions → toast « pas ton tour »). `showWaitBlock` = non bloquant.
### ✅ VAGUE 2 FAITE (dans lot15) — pouvoirs & actions
- **#5 (Forge Orbitale ne marche pas)** : le pouvoir jupitérien ouvrait une modale de choix de lune morte en headless → aucun effet. CORRIGÉ : serveur `ACTIONS.power` pour jupiteriens = repli auto sur la 1re lune Nv.1 connectée + `_forgeUpgrade` ; client = pour jupiteriens on OUVRE la vraie modale de choix localement (le clic sur la lune → `_forgeUpgrade` intercepté → envoi). Testé : Io améliorée, ressources dépensées, abilityUsed.
- **#9 (cartes de Laurent bloquées chez Marc = état partagé)** : les humains utilisaient `G.civicTaken` GLOBAL (les IA avaient déjà `ai._civicTaken` par nation). Réforme Institutionnelle prise par un joueur = bloquée pour l'autre. CORRIGÉ : suivi civique **par nation** (`G.player._civicTaken`). Militaire (Supercroiseur) était déjà par nation (`_milBoughtThisTurn`). Selftest 5 parties OK.
- **#4 (Surtension puis re-invité) — CORRIGÉ (Marc a raison, c'était bien un bug d'ergo)** : la règle « 1 action = la main passe » faisait tourner la main vers l'autre joueur (déjà passé, forcé de re-passer) juste après un pouvoir qui DONNE de l'AC. Fix : `driver.act` → un `power` qui laisse `acLeft>0` **garde la main** (pas de rotation) ; `power` retiré des actions annulables. Testé : Surtension → martien garde la main (AC 0→1), pas de détour par l'autre.
- **#8 (colonisation gratuite ratée)** : pas reproduit headless (le flag `investBonus.freeCol`/strat est par nation, `G.player`=nation active côté serveur). À reconfirmer par Marc avec repro précis.
### ✅ VAGUE 3 FAITE (dans lot15) — règles/fin de tour
- **#12 (pirates attaquent les colonies)** : branche « raid sur colonie » RETIRÉE de `advancePirates`. Les pirates de fin de tour n'attaquent QUE les routes non protégées. (L'événement « Prolifération des pirates » reste distinct.)
- **#7 (Investissement Recherche 1×/tour)** : `cm_research` passé en `perTurn:true` + traceur `_civicPerTurn` par nation, remis à zéro chaque tour (comme le militaire). Plus bloqué à vie.
- **#10 (avis « gagné » trop rapide)** : les avis IMPORTANTS (résultat de combat `war_result`, résultat d'événement `event_result` — ex. « +X VP ») sont désormais PERSISTANTS avec bouton « ✓ Continuer » (plus d'auto-disparition). **#10a (VP événement non comptés)** : vérifié — `calcVP` compte bien `tempVP` et les événements l'alimentent, donc les VP SONT comptés ; c'est probablement l'étiquette « Toi » mal rendue du point de vue de l'autre joueur (perspective), pas une perte. À reconfirmer.
- **RESTE non fait (à faire plus tard, besoin repro navigateur)** : **#1** (revenu agenda ≠ barre du haut — calcul d'aperçu), **#11** (Sphère de Dyson multi-nations : demander accepter/guerre aux AUTRES humains — vrai chantier de routage de décision, non implémenté online).
- **Upload** : `lot15_tout` COMPLET (index.html + online.js + sw.js + server/×4) → **Redeploy des DEUX applications**. `index.html` aussi utile sur solar.guerir.ch pour les amis.

### ✅ APERÇU REVENU NET + règles de pénurie (2026-07-26, index.html — dans lot15)
- Demande de Marc : la barre du haut ET le menu Empire doivent montrer le **revenu NET** (revenus − entretien) par ressource, négatif visible, pour anticiper.
- Fait : nouvelle fonction `_netIncome(p)` (revenus colonies/accords/rpt/investissements × moral 0=rien / 1=÷2, MOINS entretien colonies+routes+gouvernement). Badge `_netBadge` « +N/t » vert / « −N/t » rouge affiché dans **`top-res`** (barre du haut) et **`r-res`** (menu Empire). Testé : valeurs numériques valides, selftest OK. NB : le tooltip existant `revenueBreakdownHTML` montrait « net AVANT entretien » (trompeur) — le nouveau badge montre le VRAI net.
- **Règles de pénurie** ajoutées dans le menu Empire (sous colonies/routes) : entretien colonies impayé → −moral ; moral 0 = guerre civile (rien), 1 = ÷2 ; route sans ⚡ = non alimentée (pas de revenu, cargos vulnérables) ; route non protégée = pillée/DÉTRUITE par pirates.
- Estimation (≈) : suppose toutes les routes alimentées ; ne déduit pas les pertes de moral dues à l'entretien impayé.
- **#1 (revenu agenda ≠ barre haut)** : la barre du haut est maintenant un NET précis ; l'écran d'agenda montre le revenu BRUT de départ (peu d'entretien au tour 1, donc proche). Écart normal (métriques différentes) — à reconfirmer si Marc voit encore un souci.
- **Upload** : `lot15_tout` (online.js + server/server.js) → Redeploy des DEUX applications.

### ✅ Jetons engageables + « cooldown » → « récupération » (2026-07-26, dans lot15)
- **Compteur de jetons Force barre du haut** : n'affiche plus le total mais **seulement les ENGAGEABLES** (`forceTokens − colonies connectées hors base`), c.-à-d. hors garnison, routes et récupération. (Le menu Empire garde le détail des 4 catégories.)
- **Traduction « cooldown » → « récupération »** (choix de Marc) dans TOUT le texte affiché : `index.html`, `regles.html`, `tutorial.js`/`tutorial.html`. Les VARIABLES du code (`forceCooldown`, `getCooldownTurn`, `cruiserCooldown`, `fastCooldown` — C majuscule) sont INTACTES (36 dans index.html). Vérifié : 0 « cooldown » minuscule restant, blocs JS compilent, selftest OK.
- **lot15_tout enrichi** : ajout de `regles.html` + `tutorial.html` + `tutorial.js` (pour la traduction). Total = 11 fichiers. Upload TOUT à la racine du dépôt (+ `server/`).

## 📌 MÉMO (à faire plus tard, décidé avec Marc 2026-07-23) — UN SEUL cerveau IA
- Aujourd'hui redondance : IA interne (`doAITurn`, dans le moteur) + bot externe (`server/bot.js`). Inutile.
- Décision : **centraliser sur l'IA INTERNE**. Elle seule marche hors-ligne (téléphone, niveau 1 sans réseau) ; en ligne le serveur la fait déjà tourner en interne pour les sièges IA. → le bot externe = **retiré comme joueur**, gardé au plus comme outil de test.
- Tout l'effort « IA à la hauteur d'un humain » (demande initiale de Marc) va dans `doAITurn` : planification, gestion des ressources, diplomatie, viser son agenda. **Gros chantier**, à faire quand on pourra tester en navigateur. Bénéficie solo hors-ligne + en ligne + apps mobiles d'un coup.
- NON implémenté pour l'instant (mémo).

## ✅ v3.2 — App téléphone (PWA) durcie (2026-07-23, **`lot14_pwa`** : index.html + sw.js)
- **Clarification terminologique importante** : « application » a semé la confusion. Dans Coolify, « application » = jargon pour un déploiement (solar-game.com, live.solar-game.com). L'« app de téléphone » = le MÊME jeu solar-game.com, simplement **installé** sur le téléphone (PWA : icône écran d'accueil, plein écran). Pas un projet séparé. Marc est sur **Android**.
- **Installation Android** : Chrome → solar-game.com → menu ⋮ → « Installer l'application ». Devient une app plein écran, même jeu, même multijoueur.
- **Durcissement `sw.js` (v2)** pour les 3 objectifs de Marc (rendu identique au web / multijoueur qui marche dans l'app / fluidité) : HTML+JS servis **network-first** (toujours la dernière version en ligne → online.js jamais périmé), assets lourds **cache-first + revalidation** (ouverture rapide), WebSocket `wss://live.solar-game.com` cross-origin **non intercepté** (MP passe direct), shell précaché (hors-ligne solo immédiat), **versionnage de cache** qui purge l'ancien à chaque déploiement.
- **`index.html`** : détection de mise à jour → petit bandeau « 🔄 Nouvelle version — toucher pour mettre à jour » + rechargement auto au changement de SW (l'app installée ne reste jamais coincée sur du vieux cache).
- Non vérifiable sans le téléphone de Marc → à tester après install : rendu, multijoueur, fluidité, et que le bandeau de mise à jour apparaît après un déploiement.
- **Upload `lot14_pwa`** (index.html + sw.js) → **Redeploy de solar-game.com uniquement**.

## 🔑 Convention de langage avec Marc (2026-07-23, demandé par Marc)
- **Toujours désigner les ressources Coolify par leur domaine exact** tel qu'affiché dans son interface : dire « la ressource **solar-game.com** » (le site statique, Build Pack Static) et « la ressource **live.solar-game.com** » (le serveur de jeu, Build Pack Dockerfile). Ne pas dire « la ressource site » / « la ressource live » sans le domaine. Règle générale : employer les mots qui apparaissent À L'ÉCRAN chez lui.
- Aide-mémoire : `online.js`, `index.html`, images → redéployer **solar-game.com**. `server/*` → redéployer **live.solar-game.com**. `index.html` modifié → les DEUX (il sert aussi de moteur au serveur).

## 🔑 Leçons apprises (accès serveur — IMPORTANT pour piloter Marc)
- Marc **déteste et ne veut pas le terminal Mac** ; mais **le Terminal Mac supporte le COLLER (Cmd+V)** → c'est la voie qui a marché (SSH + coller les commandes). Grossir le texte : menu Terminal → Présentation → Plus grand (le raccourci Cmd+ ne marche pas sur son clavier).
- **La console KVM web d'OVH NE supporte PAS le coller** (limitation connue) + clavier QWERTY → garble les mots de passe. À ÉVITER.
- **La réinstallation OVH (manager + CLI) n'offre PAS de script post-install** (seulement OS + clé SSH). Impossible d'auto-installer un logiciel par là.
- Le **terminal `ovhcloud` (CLI web)** n'exécute que des commandes OVH, pas de shell dans le VPS.
- **L'environnement de Claude est coupé du réseau** → Claude ne peut ni joindre le VPS, ni pousser sur GitHub. Flux de déploiement : Claude écrit les fichiers → Marc les dépose (web) → Coolify déploie.

## ✅ Solar Conquest EN LIGNE (2026-07-21)
- **GitHub** : compte Marc = **Vimaire74**, dépôt public **`Vimaire74/solar`** (branche `main`). Contenu = le site statique complet (index.html, sw.js, regles.html, tutorial, livret PDF, assets/ 71 Mo).
- **Upload web GitHub** : échoue au-delà de ~25 Mo par commit → il a fallu **4 lots** (préparés dans `Pour uploader/lot1..lot4`, cartes réparties par taille). Pour les mises à jour futures : re-glisser les fichiers modifiés (mêmes chemins = remplacés), puis Redeploy dans Coolify.
- **Coolify** : ressource dans projet, Build Pack **Static**, image **nginx:alpine**. Piège rencontré : déployer avant que le dépôt soit rempli → « Remote branch main not found ».
- **Site accessible** : http://yqszljbcwhko04qzsqsmiy57.91.134.138.9.sslip.io (domaine de test auto sslip.io, sans TLS). Le solo marche ; le mode en ligne PHP est mort (normal, sera remplacé par le serveur Node).
- **Multi-sites** : pas de partitions — 1 site = 1 ressource/conteneur Coolify, routage par nom de domaine, BDD créées à la demande. Site de rencontres = future ressource séparée + BDD + SMTP externe (port 25 bloqué sur VPS OVH → Brevo gratuit 300/j envisagé).

## ✅ Domaine + HTTPS (2026-07-21)
- **`solar-game.com` acheté chez OVH**, titulaire = **TitanCorp (société Delaware, via Stripe Atlas)** → anonymat de Marc préservé (whois montre la société). NB : le .fr était impossible pour une société US (règle AFNIC) ; solar.<tld> pris partout (mot du dictionnaire).
- Options : DNSSEC activé (gratuit), **1 boîte Zimbra incluse** (à configurer : contact@solar-game.com, utile pour les stores), DNS Anycast refusé (payant, inutile).
- Zone DNS : enregistrement **A → 91.134.138.9** (+ www). MX = Zimbra, ne pas toucher.
- Coolify : Domains = `https://solar-game.com,https://www.solar-game.com`, direction www & non-www, **Let's Encrypt OK** → **le jeu est servi en HTTPS sur https://solar-game.com** (testé). L'URL sslip.io n'est plus la référence.

## ✅ Backend Node ÉCRIT ET TESTÉ en local (2026-07-21 soir)
- `server/server.js` fait et prouvé (partie entière 2 humains WebSocket + 2 IA, 0 erreur) — détails dans `docs/OVH_SERVEUR_LIVE_MULTIJOUEUR.md` §5.A.
- `server/Dockerfile` prêt (contexte = racine du dépôt, il embarque `index.html` ; données dans le volume `/data`).
- Fichiers à uploader sur GitHub prêts dans **`Pour uploader/lot5_serveur/`** (7 petits fichiers, dossier `server/`).
- **Décisions produit de Marc (2026-07-21)** : app Android+Apple (mobile+tablette) via Capacitor ; **niveau 1 = jeu actuel, jouable HORS-LIGNE** (déjà acquis : le jeu est 100% client, embarqué dans l'app) ; **niveau 2 = multijoueur payant** (verrou côté serveur via champ `tier` du compte, déjà prévu) ; niveau 3 plus tard. ⚠️ Stores : paiement in-app obligatoire, commission Apple/Google 15-30 % à intégrer aux prix.

## ✅ Serveur multijoueur DÉPLOYÉ (2026-07-22 matin)
- Lot 5 uploadé sur GitHub. 2e ressource Coolify : Build Pack **Dockerfile**, Dockerfile Location `/server/Dockerfile`, Base Directory `/`, Ports Exposes `8080`, volume persistant monté sur **`/data`** (comptes + parties), DNS `live` → 91.134.138.9.
- **https://live.solar-game.com/health → {"ok":true} en HTTPS.** Pièges rencontrés : ne pas mettre le chemin du Dockerfile dans « Base Directory » (c'est le champ « Dockerfile Location » de la page suivante) ; Persistent Storage = menu de gauche de la page de l'application.

## ✅ Client en ligne v2.1 + actions de plateau (2026-07-22 aprem, en attente d'upload)
- **`online.js` v2.1** : en plus du lobby/décisions de la v2.0, le tour d'action propose désormais les **vraies actions** — 🏗 Coloniser, 🛤 Route (avec choix du jeton de protection), 🔬 Acheter une tech, ⬆️ Améliorer une colonie — avec **listes de cibles valides** calculées depuis l'état (règles du jeu chargées dans la page). Plus 🤖 « IA joue pour moi » et ⏭ Passer. **Notices affichées** (résultats de combat, événements, fin de tour) en bandeau auto-refermant.
- **Serveur mis à jour** : `game-core.js` (actions colonize/route/upgrade/buyTech + correctifs headless : tuile Découverte appliquée, jeton de route, désarmement du popup Valider) ; `server.js` (diffusion des notices + **sérialisation coupant les cycles** — bug `_enemy` circulaire qui gelait l'envoi d'état, trouvé et corrigé en test).
- **Testé bout-en-bout en local** (serveur + 2 clients WS, parties complètes) : 8 actions réelles appliquées, 40 notices reçues, l'humain qui joue vraiment score 55 VP (vs 3 en passant), 0 erreur. Outils : `server/test_contract.js`, `server/test_actions.js`.
- ⚠️ **IGNORER `lot6_client` (obsolète)** → tout est dans **`Pour uploader/lot7_maj/`**.
- **Étape suivante (5 min de Marc)** : glisser LE CONTENU de `lot7_maj` à la RACINE du dépôt GitHub (online.js + dossier server, ça fusionne/remplace) → dans Coolify **Redeploy des DEUX ressources** (site statique ET serveur live) → ouvrir https://solar-game.com dans 2 navigateurs, créer 2 comptes, créer/rejoindre une partie (code), jouer. Rapporter ce qui casse (rodage).
- Reste connu : raids/attaques/pouvoirs/gouvernement pas encore dans le menu d'action (→ 🤖 en attendant) ; état non filtré (secrets adverses visibles en console) ; reprise des parties après redémarrage serveur.

## ✅ Rodage v2.2 après 1er test réel de Marc (2026-07-22 soir, en attente d'upload)
- **Bilan du test de Marc** (2 navigateurs, vraie partie) : compte/lobby/partie OK ; l'accueil intégré du jeu appelait le PHP mort → **`lvSubmit`/`lvTryAutoLogin` repris par online.js** (les boutons de l'accueil parlent maintenant au serveur WS ; champ = pseudo) ; **gel au tour 3** après « IA joue mon coup » (tour des investissements) ; « jeu en aveugle » (plateau caché/bloqué).
- **Anti-gel serveur** : reprise auto après exception moteur (`recover` → repompe), retente si le moteur rend `idle/guard`, endpoint **https://live.solar-game.com/debug** (état des parties : tour, lastRoute, pending, sièges — pour diagnostiquer à distance).
- **Anti-gel client** : watchdog 40 s → `resync` (le serveur renvoie la décision/le tour en attente) ; **reprise automatique de la partie après rechargement de la page** (token + code mémorisés).
- **Visibilité** : fond des panneaux à 45 % d'opacité, bouton **« 👁 Voir le plateau »** sur chaque panneau + pastille « ▶ Reprendre », l'état du plateau est re-rendu en continu.
- **Upload** : re-glisser le contenu de `lot7_maj` (online.js + server/server.js modifiés) → Redeploy des DEUX ressources.
- Prochain gel éventuel : ouvrir /debug et me copier la réponse.

## ✅ v2.3 — vrai plateau + fix investissements (2026-07-22, en attente d'upload : `lot8_maj`)
- **Bug de Marc corrigé (moteur, `index.html`)** : au tour 3/7, seuls l'hôte choisissait les investissements — désormais **chaque humain** reçoit son choix Niv.1 et Niv.2 (file `_emitRemote` invités → hôte, même schéma que les agendas). Vérifié : invest1×2 + invest2×2 en partie 2 humains ; solo intact (selftest OK). Limite restante : l'investissement Espionnage d'un invité applique le choix de branche automatiquement (modale routée seulement pour l'hôte).
- **Ergonomie normale (online.js v2.3)** : pendant ton tour, plus de menu imposé — **le vrai plateau est débloqué** : Coloniser/Route/Techs/Améliorer se jouent avec les boutons normaux du jeu (les fonctions du jeu sont interceptées → intention envoyée au serveur, qui reste l'autorité). Le bouton « Fin de Tour » du jeu = passer (crochet `_scOnPass`). Barre discrète en haut : « À toi de jouer » + ☰ Menu (l'ancien menu en secours) + 🤖 IA + ⏭ Passer. Raids/attaques/pouvoirs : toujours via 🤖 (pas encore interceptés).
- **Upload lot8_maj** = `index.html` + `online.js` à la RACINE du dépôt → **Redeploy des DEUX ressources** (index.html sert aussi de moteur au serveur).

## ✅ v2.4 — reconnexion blindée (2026-07-22 soir, en attente d'upload : `lot9_maj` — REMPLACE lot8)
- **Diagnostic du bug de Marc via /debug** : sa fenêtre hôte était `on:false` — WebSocket mort jamais rattaché → le serveur faisait jouer l'IA à sa place après 3 s (« je ne peux pas jouer »). Pas un bug de tours.
- **Client** : reconnexion en boucle (toutes les 3 s, tant que pas rouvert), aussi hors partie ; re-tentative au retour sur l'onglet (visibilitychange/focus — Firefox coupe les WS des onglets en arrière-plan) ; bandeau « 🔌 reconnexion… » visible ; token expiré (serveur redéployé) → écran de connexion prérempli au lieu d'un blocage silencieux ; re-join automatique via le code mémorisé.
- **Serveur** : joueur déconnecté → l'IA ne prend la main qu'après **30 s** (annonce diffusée aux autres), et si le joueur revient le compte à rebours redevient l'anti-AFK normal (2 min).
- **Upload lot9_maj** = `index.html` + `online.js` + `server/server.js` → Redeploy des DEUX ressources. (lot8 non uploadé = inclus ici.)
- Astuce rodage : une fenêtre qui semble morte → recharger la page suffit (re-login token + re-join auto).

## ✅ v2.5 — GROS LOT « tout d'un coup » (2026-07-22 nuit, en attente d'upload : **`lot10_tout`** — REMPLACE lot8 ET lot9)
- **🤖 BOT-JOUEUR « Claude »** (`server/bot.js`) : joue comme un vrai client humain (WebSocket, vraies actions coloniser/route/tech/upgrade/raid, vraies réponses aux décisions, rythme humain ~1 s/coup). **Invocation : créer une partie avec un siège « Humain (à rejoindre) », noter le code, puis ouvrir `https://live.solar-game.com/bot?code=XXXX`** (option `&civ=martiens` pour choisir son siège, `&fast=1` pour les tests). Testé : partie complète hôte + bot + IA, 0 erreur.
- **Actions restantes branchées** (serveur + interception client) : **raid** (ciblé ou non — testé : jeton dépensé, vol, tension), **attaque de colonie** (on pilote la vraie modale du jeu headless : coût de trajet et contre-attaque respectés — testé), **pouvoir de civilisation** (`useAbility` — branché, PAS testé). Prérequis technique : `getElementById` du bac à sable met désormais les éléments en cache par id (game-core.js).
- **Secrets masqués** : l'état envoyé à chaque joueur cache désormais **les agendas adverses** (🔒 « Agenda secret », révélés en fin de partie). Testé sur partie complète.
- **Reporté (honnêteté)** : le choix de branche d'Espionnage pour un INVITÉ (investissement) reste automatique (routé seulement pour l'hôte) ; autres secrets (mains/choix en cours) pas encore filtrés ; pouvoir de civ à tester en vrai.
- **Upload `lot10_tout`** (index.html + online.js + server/×3) → **Redeploy des DEUX ressources**.

## ✅ v2.6 — 2e partie réelle de Marc contre le bot : bugs corrigés (2026-07-23, **`lot11_tout`** REMPLACE lot10)
- **Cause commune de la plupart des bugs** : les actions NON interceptées (gouvernement, Extraction He3, cartes civiques/générales, gestion jetons de route, Forge, Calmer) s'exécutaient en LOCAL seulement → le serveur les ignorait puis écrasait l'affichage à la synchro → AC qui « régressent », Biosphère « déperdue » mais énergie perdue, boucle d'action, raid qui « redonne » des AC. **Corrigé** : action générique `call` (liste blanche buyGeneral/buyMarket/applyCalmTension/_forgeUpgrade) + `routeToken` (déploie/rappelle un jeton sur une route), interceptées côté client. Le serveur reste l'autorité.
- **Gel au tour d'un joueur (bot compris)** : `saveUndo()` du jeu faisait un `JSON.stringify` de l'état → **plantait sur les références circulaires `_enemy`** dès qu'une guerre existait (après tour 5-6). Neutralisé côté serveur (comme `scSaveGame`) — l'annulation n'a pas de sens en multi. C'était LA cause des parties qui se figeaient après quelques tours.
- **Anti-boucle bot** : si une action est refusée (revient identique), le bot passe en `auto` au lieu de boucler.
- **Pop-up rouge des actions adverses** rétablie (message `log` → bandeau rouge, comme les tours d'IA en solo).
- **Onglet préservé** : après chaque synchro, on ne revient plus de force à la carte globale (l'onglet actif Techs/Empire/Diplo est restauré).
- **Debug enrichi** : `/debug` renvoie maintenant, par partie, l'état de chaque nation (AC, jetons, ressources, colonies, routes, cartes) + les 15 dernières lignes du journal. À me copier en cas de souci.
- **Restent connus (non bloquants)** : « journal invisible jusqu'au tour 4 » (devrait aller mieux avec les synchros plus fréquentes — à reconfirmer) ; espionnage d'un invité auto ; pouvoir de civ à tester ; secrets autres qu'agendas non filtrés.
- **Upload `lot11_tout`** (index.html + online.js + server/×5 dont Dockerfile) → **Redeploy des DEUX applications** (solar-game.com ET live.solar-game.com).

## ✅ v3.0 — INTÉGRATION COMPLÈTE (2026-07-23, **`lot12_tout`** REMPLACE lot11) — demande de Marc : « finis tout d'un coup »
- **Changement d'approche** (Marc en a marre du bout-par-bout qui laisse à chaque fois une action non branchée) : **pont générique unique**. Toute fonction d'action du jeu est interceptée côté client et validée par une **liste blanche serveur** (`ACTIONS.call` : buyGeneral, buyMarket, applyCalmTension, _forgeUpgrade, proposeAccord, doRaid, doUpgrade, buyTech ; + handlers dédiés colonize/route/upgrade/buyTech/raid/attack/power/routeToken). Plus aucune action « oubliée ».
- **Système Valider/Annuler (undo) NEUTRALISÉ en ligne** : c'était la cause du bug « la route s'annule / l'AC pas décompté » et de l'incohérence « la tech demande validation mais pas la colonie ». En multijoueur le serveur fige chaque action immédiatement (pas de take-back). `scArmConfirm`/`_scGuard`/`saveUndo` désactivés quand une partie en ligne tourne (solo intact). Serveur : `_postAction` vide `undoStack` et lève `_scConfirmArmed` (finalisation propre).
- **Anti-flicker** : après chaque coup, le client redemande l'état autoritaire à 120 ms et 500 ms → le plateau reflète le vrai résultat au lieu de l'affichage local périmé.
- **TEST HEADLESS EXHAUSTIF** (`server/test_allacts.js`) : les 7 familles d'action jouées via le vrai moteur, TOUTES appliquent leur effet + décrémentent l'AC : route, colonize, buyTech, gouvernement/He3 (buyMarket), upgrade, raid, pouvoir de civ. + selftest solo, contrat, actions, 2 parties bot complètes : **0 erreur, 0 gel, 0 référence circulaire**.
- **Reste (mineur, à confirmer par Marc en vrai navigateur)** : rendu visuel des actions sur le plateau (je ne peux pas tester un navigateur ici) ; espionnage d'un invité auto ; secrets autres qu'agendas non filtrés.
- **Upload `lot12_tout`** (index.html + online.js + server/×5) → **Redeploy des DEUX applications** (solar-game.com ET live.solar-game.com).

## ✅ v3.1 — retour 3e partie de Marc (2026-07-23, **`lot13_tout`** REMPLACE lot12)
- **Carte qui revient toujours en vue globale** : CORRIGÉ. `G.mapView`/`G._zoomNode` sont de l'affichage CLIENT ; le serveur les écrasait à chaque synchro → retour forcé à la carte globale à chaque clic. Désormais préservés à travers les synchros (comme l'onglet actif). La carte cliquable reste affichée.
- **Panneaux de décision enrichis** (Marc voulait « la bonne interface » pour invest/stratégie) : investissements Niv.1/2 montrent ✅ bénéfice + ⚠️ contrepartie de chaque option **et ce que les adversaires ont choisi** ; stratégie montre la description + 🕊️ effet sur la tension + ton rang d'initiative. (Les vraies modales du jeu sont trop couplées à l'application locale pour les brancher sans navigateur de test — panneau enrichi = même info, sans risque.)
- **Bot plus malin** : choix pondéré (coloniser 5 / tech 4 / upgrade 3 / route 3 / raid 1) au lieu d'aléatoire pur ; raid seulement avec réserve de jetons. (L'IA INTERNE des sièges « IA » — `doAITurn` — joue mal/passive : c'est un réglage lourd dans index.html, risqué sans navigateur → NON touché, à faire quand Marc peut tester.)
- **Email** : le bouton « 📧 Envoyer par email » du jeu **marche déjà** (mailto → ouvre l'appli mail avec le log). Pas besoin de compte email : c'est le client mail de Marc qui envoie. (L'ancien envoi serveur `save_result.php` est mort mais silencieux, sans effet.)
- **BUG CONNU NON CORRIGÉ (prochaine étape dédiée, nécessite test navigateur de Marc)** : **capture de colonie en GUERRE** — le choix de quelle colonie/route ennemie attaquer n'est pas transmis dans la décision `war_combat` routée (payload sans cible) → `_warAttackColonyTarget=null` → la capture ne s'applique jamais côté serveur. Fix = étendre le payload `war_combat` (colonies + routes attaquables) + l' acheminement de la cible dans le callback `showWarCombatModal` + UI de sélection côté client. Fragile (partie guerre) → à faire prudemment avec Marc en test.
- **Upload `lot13_tout`** → **Redeploy des DEUX applications**.

## ✅ v3.2 — Guerre & conquête + vraies modales + Dyson à plusieurs (2026-07-26, **`lot15_tout`** À REDÉPLOYER)
Ordre demandé par Marc : « commence par guerre et conquêtes et finis par Dyson ».
- **#21 Capture de colonie en guerre — CORRIGÉ** : la décision `war_combat` routée transporte désormais la **cible** (colonies ennemies attaquables + routes + menace IA). Côté client : panneau riche (bouton par colonie avec distance/QG/focus, sous-écran de choix des jetons, options Défendre / Tenir). Le callback capture la cible (`_warAttackColonyTarget`). Testé headless : colonie ennemie **CAPTURÉE** via cible routée (ennemi 1→0, joueur 1→2).
- **#22 Vraies modales d'événements — FAIT** : les événements **interactifs** (🤝 Accords Commerciaux, 🕊️ Accords Diplomatiques) n'ouvraient qu'une overlay locale non routée → **en ligne ils FIGEAIENT la partie** (le serveur attendait un clic jamais reçu). Désormais routés via le courtier (`event_comm` / `event_diplo`) avec vraie UI de choix côté client (boutons de nation / cases à cocher de pactes). Les notices d'événements (annonce/résultat) affichent gros emoji + nom centré, façon modale. Testé : routage + application (accord +3 VP, pacte −6🔩) + chemin réel `continueAfterEOT` sans blocage.
  - **Multi-humains COMPLET (Marc a dit « oui »)** : chaque humain fait désormais SES propres accords. `continueAfterEOT` → `_runInteractiveEventAllHumans(ev)` itère sur toutes les nations humaines, « active » chacune (G.player) le temps de sa décision, puis restaure le joueur principal. Faisable sans refonte car les tensions passent par `_tk('player')→G.player.civ.id` (déjà par-nation) et les ressources/pactes s'appliquent sur `G.player` courant. Testé headless (2 humains + 1 IA) : les DEUX reçoivent la décision l'un après l'autre, filtrage des candidats correct (pas de double accord), coût −6🔩 débité sur les ressources de CHAQUE humain, G.player restauré, tour qui enchaîne le draft stratégie normalement.
- **#23 Sphère de Dyson à plusieurs — FAIT** : quand un **humain** bâtit Dyson, chaque **autre humain** reçoit une décision `human_dyson` (accepter le monopole = +3⚡/tour, ou refuser = guerre). Sa décision **prime** sur l'ancienne logique auto-IA (un humain à tension élevée qui accepte n'est plus traîné en guerre). Les sièges IA gardent la décision auto ; le bâtisseur garde le dernier mot (Forcer/Renoncer) s'il reste des refus. Testé headless : 3 cas (refus→guerre, accept→paix, tension élevée+accept→pas de guerre).
- **tutorial.html régénéré** depuis index.html (copie + `tutorial.js` à la place d'`online.js`).
- **Régression** : selftest solo (0 crash), `test_contract` partie complète en WebSocket (agenda/stratégie/invest/ai_dyson/peace_offer/defense OK). Changements = branches de routage additives, flux d'action inchangé.
- **À faire par Marc quand GO** : uploader **`lot15_tout`** (index.html + online.js + tutorial.html modifiés ; server/×5 inchangés) → **Redeploy solar-game.com ET live.solar-game.com**.

## 🐞 v3.3 — retour de partie de guerre de Marc (2026-07-26, en cours, `lot15_tout`)
Batch de bugs guerre signalés en vrai jeu en ligne. Traités/testés jusqu'ici :
- **Reprise « gratuite » de colonie — CORRIGÉ (2 endroits)** : `resolveAiAssault` (tour d'action IA) et `resolveAiAssaultOnPlayer` (fin de tour) ne faisaient payer l'IA (`applyCombatEngage`) **que si le joueur défendait** (`if(dCommit>0)` / `if(defTokens>0)`). Si tu ne pouvais/voulais pas défendre, l'IA reprenait/capturait **sans dépenser ni immobiliser ses jetons** → reprise en boucle jusqu'à 0 énergie. Désormais l'attaquant paie TOUJOURS ses jetons engagés. Testé : IA passe de e/m/jetons 3/3/8 → 0/0/5 (+3 en récupération) après un assaut.
- **Défense invisible en ligne — CORRIGÉ** : la reprise pendant le **tour d'action** de l'IA (`tryRecaptureAssault`→`resolveAiAssault`) se résolvait en douce (défense auto, jamais routée). En ligne on la **diffère** au chemin de fin de manche `maybeAiAssaultPlayer`, qui LUI route la fenêtre de défense (`_emitDecision('defense',...)`) et te laisse choisir tes jetons. Vérifié : décision `defense` routée (maxDef/menace/cible), partie complète WS sans gel (`defense:1`).
- **`/debug` ENRICHI** (server.js) : journal complet (200 lignes, ordre chrono), par nation → AC x/max, jetons, jetons en récupération, colonies **avec niveau/connexion/⚑conquête**, routes avec jetons ; bloc `wars` (cible de reconquête IA, tours restants, agresseur, a-frappé-ce-tour) ; `warTrace` filtré (capture/reprise/combat/défense). But : capter de vraies données au prochain test.
- **#24 popup Forge bloquée — CORRIGÉ** (cause unique de plusieurs symptômes) : en ligne, `_forgeUpgrade` est intercepté (envoi d'intention) et n'exécute PAS la version locale, qui fermait la modale `#forge-modal`. Résultat : la popup Forge **restait affichée** par-dessus le jeu → « je ne vois plus le jeu », la partie avançait dessous → « stratégie prématurée », « ressources figées ». Fix : l'intercepteur ferme lui-même `#forge-modal` (online.js).
- **#27 affichage attaque — CORRIGÉ** (`_warShowAttackSlider`) : affiche désormais les jetons **engageables** (`forceTokens − garnison réservée`) au lieu du total ; défense ennemie = **exacte utilisable** (min tokens/mat/énergie +1 garnison) avec renseignement (intel≥2), sinon **total ennemi ±1**. La défense IA est rendue **déterministe** (= ce qu'elle peut payer) pour que l'affichage ne mente pas. Testé compile + régression.
- **#28 comptage jetons — NON-BUG (vérifié + expliqué)** : « Effort de Guerre » (st7, `forceKeep`) donne bien +1 **permanent** (test 5→6). « Surge Militaire » (st2, `force:2`) donne +2 **temporaires retirés au startTurn suivant** (test 7→5). Les jetons de raid partent en **récupération** (cooldown), pas perdus (test 5→3, recup 0→2). D'où le « moins de jetons » ressenti. Le `/debug` enrichi montre `recup` pour lever le doute.
- **#29 — raid OK, Nv.3 jovien à surveiller** : `doRaidTarget` logue déjà le butin (« Raid sur X ! +⚡🪨 » / « rien »). Le journal de Marc montrait « 🛡️ IA Défensive : raid bloqué ! » → son raid a été **bloqué par la tech ennemie** (pas de gain, mécanisme normal). Colonies joviennes Nv.3 : `_forgeUpgrade` exige `level===1` → **ne peut pas** doubler une amélioration ; cause non reproduite → le `/debug` enrichi (niveaux + ⚑conquête) la révélera au prochain test.
- **Coût de guerre ÷2 (`nav2_war`) — IMPLÉMENTÉ** : dans `applyCombatEngage` (coût symétrique) + branche défense standoff. Ressources ÷2 arrondi bas (`floor(e/2)`), jetons immobilisés inchangés (choix de Marc). Testé : engage 5 → ressources −2 (au lieu de −5), jetons −5.
- **Régression complète OK** après tous ces changements : selftest (0 crash), `test_contract` partie complète WS (décision `defense` exercée, aucun gel).
- **Batch livré dans `lot15_tout`** (index.html + online.js + tutorial.html + server/server.js). **Reste ouvert** : le vrai chemin du Nv.3 jovien (attend données du prochain test).

## 🐞 v3.4 — 2e retour de partie (2 humains) de Marc (2026-07-26, `lot15_tout`)
- **RÈGLE récupération jetons — CORRIGÉE** (`applyCombatEngage`) : en cas de **VICTOIRE**, seule la **moitié** (arrondi bas) des jetons engagés part en récupération ; l'autre moitié reste **disponible immédiatement**. Avant je mettais la totalité en récupération (erreur). Défaite inchangée (moitié perdue déf. + reste en récup). Testé : engage 6 victoire → 7 dispo + 3 récup ; engage 5 → 8 dispo + 2 récup.
- **#30 action rejetée garde la main — CORRIGÉ** (driver `act`) : une action sans effet (pas assez de ressources/AC, impossible, déjà pris…) ne passe plus le tour ni ne fait tourner la main vers l'autre joueur — le joueur rejoue.
- **#31 comptage jetons — logique VALIDÉE par simulation** (hors la règle victoire ci-dessus) : engage/défaite corrects, pas de double-retour, total conservé. Le « perd tout puis retrouve » = récupération à +2 tours + retard d'affichage client (à rafraîchir après combat).
- **CADRE (rappel) : le projet EST le multijoueur humain-vs-humain.** Les chemins de guerre de fin de tour (`maybeAiAssaultPlayer`, etc.) et l'affichage adverse ont été écrits en supposant que les nations non actives sont des IA. Les adapter au 2e HUMAIN (router défense **et** popup résultat vers le bon humain ; afficher le pseudo au lieu de « IA ») est la SUITE du chantier, pas un imprévu. À faire proprement/testé.
- **Reste ouvert (prochaine passe, priorité à valider avec Marc)** : #32 guerre 2 humains (défense+résultat routés, pseudos), #33 événement diplomatie non résolu en ligne, #34 investissements au DÉBUT du tour + capacité de nation dans le menu empire (desc + coût), #35 Forge 2× + route Titan→Encelade retirée, + rafraîchir l'affichage des jetons juste après combat.

## 🐞 v3.5 — batch #32→#35 (2026-07-26, `lot15_tout`)
- **#32 guerre 2 humains — partiellement fait** : (a) plus d'assaut AUTO occulté en fin de tour quand l'attaquant est un HUMAIN (`maybeAiAssaultPlayer` sort si `ai._isAI===false`) → un humain attaque à SON tour (visible), fini la « guerre occultée ». (b) Label adverse : `score-a-label` ne dit plus « IA » en dur — affiche le **pseudo** (via `window._scPseudo` peuplé par online.js depuis les sièges) sinon le nom de civ. *Reste* : router le choix de DÉFENSE + le popup RÉSULTAT vers l'humain défenseur quand il est assailli pendant le tour de l'attaquant (resolveWarCombat auto-calcule encore la défense) — changement async à faire proprement.
- **#33 événement diplomatie — non reproduit** : en headless (2 humains) l'événement `event_diplo` se résout correctement (les 2 reçoivent la décision, pacte appliqué, tour avance). Bug probablement client/affichage ou lié à la déconnexion du 2e joueur. À reproduire en live avec le /debug enrichi.
- **#34 capacité nation — FAIT** : menu Empire affiche sous les ressources le **passif** + le **pouvoir actif** avec coût standardisé (x AC − y mat − z énergie). Sous-partie « investissements au début du tour » : c'est voulu en fin de tour précédent (effet T3→T5) ; déplacement = changement de timing des effets → laissé, à rediscuter.
- **#35 Forge 2× / route retirée — non reproduit** : `_forgeUpgrade` est gardé serveur (`if(p.abilityUsed)return`) → ne peut pas s'appliquer 2× dans un tour. Route Titan→Encelade retirée : cause non identifiée. Besoin du /debug enrichi en live.
- **Régression OK** : selftest (0 crash), test_contract (partie WS complète, `defense` exercée).

## 🐞 v3.6 — défense du défenseur humain + affichage (2026-07-26, `lot15_tout`)
- **#32 DÉFENSE du défenseur humain — CÂBLÉE** : quand un humain assaille la colonie d'un AUTRE humain (`playerAssaultColony` → `_warCombatCb`), on émet désormais une décision `defense` vers le DÉFENSEUR humain (fenêtre de choix des jetons, `maxDef`, menace = jetons de l'attaquant). Son choix pilote la défense via `G._aiWarCommitted` (lu par `resolveWarCombat`). Le résultat passe par `showWarModal` → notice `war_result` **diffusée aux DEUX joueurs**. Testé (logique) : défenseur engage 2 → aPow 3 (garnison incluse), combat résolu, décompte jetons correct, notice émise. (En solo/IA : inchangé.)
- **#35 Forge 2× — vraisemblablement réglé par #24** : la popup Forge ne se fermait pas en ligne → impression de pouvoir la rejouer. Corrigé (fermeture de `#forge-modal` dans l'intercepteur). Côté serveur `abilityUsed` empêche déjà 2 forges/tour. Suppression route Titan→Encelade : cause non reproduite (données live nécessaires via /debug enrichi).
- **#33 diplo** : la fenêtre `event_diplo` s'affiche et se résout (headless-prouvé, 2 humains) ; l'échec live venait probablement de la déconnexion du 2e joueur. À reconfirmer en live.
- Régression complète OK (selftest 0 crash, test_contract partie WS entière).

## 🧹 v3.7 — retrait des bandeaux qui masquaient la barre du haut (2026-07-27, `lot15_tout`)
- **Barre bleue `#sc-turnbar` (online.js) RETIRÉE** : « 🎮 À toi de jouer — Menu / IA / Passer », fixée en haut (z-index 8600), elle recouvrait `#top-bar` (ressources + bouton Capacité). Redondante : « Passer » se fait par le bouton **Fin de Tour** natif du jeu (`window._scOnPass`), et c'est la disparition du bandeau d'attente qui signale ton tour. `turnBar()` neutralisée (ne crée plus la barre).
- **Bandeau bleu `#sc-resume-btn` (index.html) RETIRÉ** aussi (« ▶ Reprendre / ABANDONNER »), même problème (recouvrait le haut, apparaissait aussi sur l'ancien site solo). Auto-sauvegarde conservée en coulisse.
- Reste éventuellement la petite pastille `#sc-status` (top:8px, « en attente… ») — discrète, laissée sauf demande.
- NB session : le dossier a été renommé `star conquest` → **`solar`** (racine `/Users/marcisenchmid/Desktop/solar`). Un rapport de continuité a été écrit : `outputs/RAPPORT_Solar_Multijoueur.md`.

## 🐞 v3.8 — RACINE du bug de capture trouvée (2026-07-27, `lot15_tout`)
- **DEUX systèmes d'attaque coexistaient** : le récent `resolveWarCombat` (capture) et l'ancien `confirmAttack`+`showAttackModal` (détruit, défense ALÉATOIRE). Le SERVEUR résout `{type:'attack'}` via game-core `ACTIONS.attack` = l'ANCIEN `confirmAttack` → il **détruisait** la colonie (la retirait de l'IA) sans jamais te la donner, et avec une défense aléatoire → **tes captures ne tenaient jamais en ligne**. C'est LA cause du « colonies redonnées aux Ceinturiens » répété.
- **CORRIGÉ** : `confirmAttack` **CAPTURE** désormais (colonie retirée de l'IA ET ajoutée à toi, niveau −1, `_conquest:3`, +2 VP, garnison détruite, −1 moral IA) au lieu de détruire ; défense IA **déterministe** = garnison (1) + ce que l'IA peut payer (min tokens/mat/énergie), l'IA paie sa défense. Testé via le **chemin serveur exact** (showAttackModal+confirmAttack) : colonie **capturée et persistée** (IA 1→0, toi 1→2). selftest 0 crash, test_contract partie WS complète.
- **RESTE (#37, en cours) — événements en ligne** : s'affichent en bandeau minimal au lieu de la vraie `#event-modal` ; l'événement interactif diplomatie s'auto-résout sans montrer la fenêtre de choix. À faire : rendre la vraie modale côté client + garantir le routage de l'interactif.

## 🔎 v3.9 — AUDIT critique demandé par Marc (2026-07-27)
**Constat central (confirmé par `docs/MULTIJOUEUR_BUILD.md`)** : le modèle en ligne ÉPROUVÉ (solar.guerir.ch) = le navigateur de l'HÔTE fait tourner le VRAI jeu (`initGame` SANS sink → vraies modales, vrai flux). En migrant sur le serveur OVH autoritaire, le jeu a été basculé sur le driver+broker headless, qui **remplace les vraies modales par des panneaux génériques** et ajoute des routines. C'est LA cause des « visuels minimalistes » et du ressenti « le jeu gère à ma place ».
- **Crash tests** : 4 civs jouées en partie complète (10 tours) = **0 crash** ; les 10 événements résolus headless = **0 erreur**. Donc le code n'a pas de crash ; le souci est l'AFFICHAGE + le routage.
- **`armTimer` audité = CORRECT** : n'auto-joue JAMAIS pour un joueur CONNECTÉ (uniquement 30 s après une vraie déconnexion). Donc « le jeu gère les événements à ma place » = un problème d'AFFICHAGE (événements en bandeau, pas la vraie modale), pas une auto-résolution.
- **CORRIGÉ — vraie modale d'événement restaurée** : `showEventReal` (online.js) affiche `#event-modal` (résultat, couleur par type compétition/menace/opportunité) et `#event-announce-modal` (annonce) au lieu du bandeau. Branché dans `showNotice`.
- **Chantier « restaurer tous les visuels » — avancement** :
  - ✅ `event_result` / `event_announce` → vraie `#event-modal` / `#event-announce-modal` (`showEventReal`).
  - ✅ `peace_offer` → vraie `#peace-modal` (offre de ressources +/−, Proposer/Se battre) (`showPeaceReal`).
  - ⬜ RESTE : `war_combat`, `defense`, `ai_dyson`/`human_dyson`/`dyson_build`, `accord_confirm`, `espionage`, `extrasolar`, `empath_copy`, `strategy_calm`, événements INTERACTIFS `event_comm`/`event_diplo` (→ vraie fenêtre de choix `#event-choice-modal`).
  - ✅ **Restyle universel du panneau générique** (`#sc-decision`) : passe du « bleu minimaliste » au **look natif du jeu** (carte sombre `#0c0c24`, bordure violette, police du jeu) et s'inscrit dans la **bande centrale** (top/botband) → ne couvre plus la barre du haut. Couvre d'un coup l'apparence de TOUTES les décisions restées en panneau (combat, défense, dyson, accord, espionnage, extra-solaire, empathie, calmer-tension, événements interactifs). CSS pur → contrats de réponse inchangés (test_contract vert).
  - ✅ **Modales existantes RÉUTILISÉES** (Marc : « le layout est déjà dans le fichier, ne reconstruis pas ») : `ai_dyson`/`human_dyson`/`dyson_build` → `#dyson-modal` (`showDysonReal`) ; `accord_confirm` → `#accord-modal` (`showAccordReal`) ; `espionage` → `#espionage-modal` et `empath_copy` → `#empath-copy-modal` (`showOptsReal`). Chaque converteur peuple le DOM existant + boutons → envoient la réponse (contrats inchangés, test_contract vert).
  - ✅ **Événements interactifs** `event_comm`/`event_diplo` → VRAIES fenêtres `showCommEventModal`/`showDiploEventModal` (appelées sur le client ; overrides `_evCommPick`/`_evDiploToggle`/`_evDiploConfirm`/`_evDiploNone` → envoient la réponse au lieu d'appliquer localement ; sélection diplo mémorisée dans `window._scDiploSel`).
  - ✅ **war_combat / defense / extrasolar / strategy_calm** = panneau piloté par le **payload SERVEUR autoritaire**, désormais au **look natif** (restyle). CHOIX DÉLIBÉRÉ : réutiliser `showWarCombatModal` sur le client le ferait **recalculer** (posture IA aléatoire, cibles) → données divergentes du serveur. Le payload serveur (colonies attaquables, menace, défendre/tenir) prime. Donc panneau natif = correct, pas un compromis.
  - **BILAN : visuels d'origine restaurés partout.** Modales exactes du jeu : agenda, stratégie, invest1/2, événements (annonce+résultat), paix, Dyson, accord, espionnage, télépathie, événements interactifs comm/diplo. Panneau natif piloté serveur : combat/défense/extra-solaire/calmer-tension. Test : selftest 0 crash + test_contract partie WS complète (contrats intacts). **Client uniquement → redeploy solar-game.com.**

## 🐞 v4.0 — modales de CHOIX affichées en DOM direct SANS routage (2026-07-27, `lot15_tout`)
Audit demandé par Marc (« tu trouves d'autres lignes du même genre ? »). Résultat : DEUX fuites, toutes deux corrigées.
- **`triggerGuereeForcee` (guerre populaire forcée, #forced-war-modal)** — affichait la modale en DOM direct → invisible/bloquant en ligne. ROUTÉE : `_emitDecision('forced_war',...)` + `showForcedWarReal` côté client (vraie fenêtre). Choix paix/route/colonie/passer ; callback protégé try/catch. Testé : émission + « paix » résolue sans gel.
- **`showRouteCaptureModal` (route conquise → récupérer/détruire, #route-capture-modal)** — même problème. ROUTÉE : `_emitDecision('route_capture',...)` + `showRouteCaptureReal`. Testé : capture → route ajoutée au joueur (0→1).
- **Passées en revue, PAS des fuites** : agenda/invest/stratégie/espionnage/empathie/défense (déjà routées) ; `showRouteManageModal` = action locale du joueur (gérée par intention `routeToken`) ; `showAttackModal` = ancien chemin inutilisé en ligne (le plateau attaque via `playerAssaultColony`).
- selftest 0 crash + test_contract partie WS complète. **Client → redeploy solar-game.com.**
- ⚠️ Colonie qui « repart » toujours non épinglé (headless : la capture persiste). Cause probable = enchevêtrement des chemins d'attaque ; à trancher par l'unification du combat OU un /debug pris au moment exact.

## 🔀 v4.1 — ordre fin/début de tour + pouvoir confirmable (2026-07-27, `lot15_tout`)
- **ORDRE de fin/début de tour réaligné sur la spec de Marc** : guerre populaire forcée → guerre normale → revenus+entretien → **événement de fin de tour (affiché AVANT le bilan)** → bilan EOT officiel → tour suivant → **plafonnement des ressources (12/20/10/10) au DÉBUT du tour suivant** → invest → stratégie → jeu. Fait via `_resolveEndTurnEvent(done)` appelé dans `finishTurn` avant `showEOTModal`, et `enforceCaps()` déplacé de `finishTurn` vers `continueAfterEOT`. Testé : selftest 0 crash + test_contract complet.
- **Événement interactif (accords commerciaux/diplomatiques) — routage CONFIRMÉ** : test dédié 2 humains → `event_diplo->terriens` puis `event_diplo->jupiteriens`, done appelé. Le code route bien. Si Marc « ne le voit toujours pas », c'est la version DÉPLOYÉE qui est en retard → uploader le lot15 à jour.
- **Pouvoir gratuit CONFIRMABLE** (demande de Marc) : `driver._isConfirmable` inclut désormais `power` → Valider/Annuler après un pouvoir. `commit()` GARDE la main si le pouvoir laisse de l'AC (ex. Surtension) → pas de retour du bug #4. `_hold.actionType` mémorise le type. Testé : test_contract complet OK.
- **Guerre populaire forcée + route conquise** désormais routées (v4.0). ⚠️ Colonie qui « repart » : toujours non épinglé en headless (capture persiste) — probablement l'enchevêtrement des chemins d'attaque ; unification du combat = vrai remède.

## ✅ v4.2 — RACINE RÉELLE du « colonie qui repart » (2026-07-27, `lot15_tout`)
- **Repro exacte de Marc** : capture, puis action suivante (route vers la colonie conquise) → la colonie repart. Reproduit le raisonnement en headless : moteur (`doEstablishRoute`/`updateConnections`) et snapshot driver (`_snap`/`_restore`) = **propres** (la capture persiste). Donc la capture ne « repart » pas côté logique.
- **VRAIE CAUSE** : l'attaque du PLATEAU passe par `attackColony → playerAssaultColony → confirmWarCombat` (modale de combat de guerre), qui **n'était PAS dans `INTENT_MAP`** → jamais envoyée au serveur. La capture se faisait donc **uniquement sur l'écran du joueur** (résolution locale). À l'action suivante, le client se resynchronise sur l'état SERVEUR (qui n'a jamais capturé) → la colonie « repart » à sa nation. Seul l'ancien `confirmAttack` était intercepté (modale legacy inutilisée par le plateau).
- **CORRIGÉ** : `confirmWarCombat` ajouté à `INTENT_MAP` → au clic « Engager », envoie `{type:'attack', node:_warAttackColonyTarget, tokens:wcm-slider}` au serveur (portée globale partagée entre scripts → `_warAttackColonyTarget` lisible). Le serveur capture via `ACTIONS.attack`→`confirmAttack` (déjà réparé pour capturer). Testé : `{type:'attack'}` → colonie capturée ET **persistée côté serveur** ; test_contract complet OK.
- **v4.3 — modèles de combat UNIFIÉS (correctif de l'écart)** : `game-core ACTIONS.attack` ne pilote plus l'ancien `confirmAttack` (coût de trajet). Il résout désormais avec `resolveWarCombat` — le MÊME modèle que la modale : jetons engagés vs défense = ce que l'IA peut payer + garnison. Déclare la guerre si besoin, pose `_warAttackColonyTarget`, fixe `G._aiWarCommitted` (défense déterministe), −1 AC. Testé : engager 4 vs défense affichée 4 = pas de capture (égalité) ; engager 5 = capture. **L'affichage ne ment plus** : la défense montrée est la vraie ; on engage juste au-dessus pour gagner. selftest 0 crash + test_contract complet. **`game-core.js` a changé → redeploy live.solar-game.com.**

## ✅ v4.4 — GO de Marc : tous les mémos + guerre occultée (2026-07-27, `lot15_tout`)
- **RACINE des « fenêtres qui ne s'affichent pas »** : le `pump()` du driver **acquittait automatiquement** les notices → le jeu enchaînait sans attendre le clic « Continuer ». Résultat de combat et résultat d'événement passaient inaperçus. CORRIGÉ : `_isBlockingNotice` (war_result, event_result) → ces notices deviennent **bloquantes** (fenêtre statique à valider) ; si `nation` est null, le driver l'adresse à un humain (sinon gel). Vérifié : `war_result` apparaît maintenant comme décision dans test_contract, partie complète sans gel.
- **Vraies fenêtres** : `war_result` → `#war-modal` (`showWarResultReal`, bouton Continuer envoie l'ack) ; `event_result` → `#event-modal` bloquant (`showEventResultBlocking`).
- **Guerre « occultée » — CORRIGÉ** : dans `processAllWars` (branche `war.live`), refuser la paix envoyait DIRECTEMENT à l'assaut ennemi → le joueur n'avait jamais sa fenêtre d'attaque. Désormais : refus de paix → **ta fenêtre de combat** (colonie/route/tenir) → résolution + fenêtre de résultat → PUIS assaut ennemi.
- **MÉMOS APPLIQUÉS** :
  - « Non, route passive » → « **Non, laisser sans protection militaire** » (online.js, 2 occurrences).
  - **Butin manquant** (pirates, raid) : les ressources sont des balises `<i class=ri-…>` que le serveur **supprimait** (strip HTML) → « → + » vide. Nouveau `plainText()` les convertit en emoji (⚡🪨🔬🙂) avant nettoyage. Corrige le toast vert ET le journal /debug. Testé.
  - **Toasts séquencés** : le vert (toi) d'abord et **1 s plus court** (6 s → 5 s) ; le rouge (autres nations) est **différé** jusqu'à la fin du vert (avant : superposés au même endroit).
  - **Pirates retirés de la CARTE** : suppression du marqueur/cercle sur Triton. Bandeau reformulé « Risque ce tour sur tes **routes non protégées** » (plus de position) ; ligne EOT idem. Règles inchangées : hasard, risque croissant, routes non protégées uniquement.
- Régression : selftest 0 crash + test_contract partie WS complète. **index.html + online.js + server.js + driver.js + game-core.js modifiés → redeploy des DEUX applications.**

## ✅ v4.5 — guerre après refus de la Sphère de Dyson (2026-07-27, `lot15_tout`)
Log de Marc : refus Dyson → « GUERRE DÉCLARÉE » puis, au tour suivant, « 🕊️ Jupitériens propose la paix » → « 🤝 Paix blanche ». Aucun combat, aucune fenêtre. DEUX causes :
1. **L'IA mettait fin à la guerre TOUTE SEULE** (`doAITurn` → si `!winnable` → `endWar()`), sans demander au joueur → paix blanche imposée, le joueur ne pouvait jamais combattre. CORRIGÉ : si l'adversaire est **humain**, l'IA ne termine plus la guerre ; elle pose `_wantsPeace=true` et le joueur tranche dans la fenêtre de fin de tour (accepter la paix OU poursuivre avec sa fenêtre d'attaque). Testé : guerre déclarée par refus Dyson **survit** au tour d'une IA faible (1 guerre avant → 1 après, `_wantsPeace` posé).
2. **Guerre FRAÎCHEMENT déclarée par le joueur** (`declaredBy` = 'player' ou 'dyson') : `processFresh` n'affichait qu'un message d'info puis passait au tour suivant — aucune fenêtre de combat. CORRIGÉ : après le message, on ouvre **la fenêtre d'attaque** (colonie/route/tenir) → résolution → fenêtre de résultat → suite. (La correction v4.4 ne couvrait que les guerres EN COURS, pas les fraîches.)
- Régression : selftest 0 crash ; test_contract partie complète avec `war_result:5`, `peace_offer:3`, `defense:1` → le cycle de guerre s'exerce réellement, sans gel. **index.html modifié → redeploy des deux applications (le serveur charge index.html comme moteur).**

## ✅ v4.6 — jetons nets, moins de bruit visuel, événements validables (2026-07-27, `lot15_tout`)
- **Jetons de la barre du haut = NET** : nouvelle **source unique** `engageableTokens(p)` = réserve − garnison (1 jeton réservé par colonie connectée hors base). Les jetons sur routes et en récupération ne sont déjà pas dans `forceTokens`. Utilisée par la barre du haut ET la fenêtre de combat → plus d'écart d'affichage. Testé sur le cas exact de Marc (4 colonies + 4 jetons) → affiche **1**, pas 4.
- **Fenêtres VERTES supprimées** (demande de Marc : trop d'infos) : `showResultToast` neutralisée — plus de récapitulatif de l'action qu'on vient de faire. **Conservés** : la barre de VALIDATION (Valider/Annuler) et les fenêtres **ROUGES** (ce que font les autres nations).
- **Événements VALIDABLES** : `event_announce` rejoint `war_result`/`event_result` dans les notices **bloquantes** ; côté client `showEventAnnounceBlocking` affiche `#event-announce-modal` avec « Compris → » qui envoie l'ack. Test : `event_announce:5`, `war_result:6`, `war_combat:1`, `defense:2` sur une partie complète, **sans gel**.
- Régression : selftest 0 crash + test_contract complet. **index.html + online.js + driver.js → redeploy des deux applications.**

## ✅ v4.7 — comptes email, archives, stats, emails, signalement de bug (2026-07-27, `lot15_tout`)
- **Identifiant = ADRESSE EMAIL** (serveur : validation regex ; client : champ `type=email` + contrôle avant envoi). Sert aussi à recevoir les scores.
- **Mot de passe visible** : bouton œil 👁/🙈 dans le formulaire de connexion/inscription.
- **Archives par joueur** : `data/archives/<email>.json`, **10 dernières parties** (plus récente en tête) avec code, **date+heure FR** (`jj/mm/aaaa hh:mm`, fuseau Europe/Zurich), nations, **scores par nation**, **journal complet** (400 lignes, icônes converties en emoji) et **bugs signalés**.
- **`/stats`** (texte brut, copiable) : joueurs inscrits + date d'inscription, puis par joueur ses 10 parties (date FR, scores, bugs, journal complet), et les derniers emails journalisés. → c'est CE fichier à me copier.
- **EMAILS** : `sendMail()` via **nodemailer** si `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM` sont définis. **Sans SMTP configuré, rien n'est perdu** : tout est écrit dans `data/outbox.log` et visible dans `/stats`. Envois : (1) **nouvelle inscription** → admin, (2) **fin de partie** → scores au(x) joueur(s) + admin, (3) **bug signalé** → admin. `ADMIN_MAIL` par défaut = **marc@guerir.ch**.
- **Fin de partie** : classement détaillé par nation rétabli (médailles, pseudo, ma nation surlignée, date FR) + mention « envoyé par email ».
- **🐞 Signaler un bug** : lien sur l'écran de fin → fenêtre de saisie → le texte est **joint au journal de la partie** (archive → visible/copiable dans `/stats`) ET envoyé par email à l'admin. Message WS `bug_report`.
- `package.json` : ajout de `nodemailer`. Tests mis à jour (comptes de test en email).
- Régression : selftest 0 crash + test_contract partie WS complète. **Tous les fichiers modifiés → redeploy des DEUX applications.**
- ⚠️ **ACTION REQUISE de Marc pour que les emails PARTENT vraiment** : fournir les identifiants SMTP dans Coolify (variables d'env de live.solar-game.com). Sans ça, tout est archivé mais rien n'est expédié.

## ✅ v4.8 — 1re application du banc d'essai (2026-08-01)
Première partie lue ligne par ligne avec `playthrough.js`. Deux défauts INVISIBLES aux tests classiques :
- **Bilan de fin de tour jamais affiché en ligne** : la notice `eot` était acquittée d'office par le serveur → le joueur ne voyait aucun récapitulatif revenus/entretien. CORRIGÉ : `eot` devient bloquant et s'affiche dans la VRAIE fenêtre `#eot-modal` (`showEotReal`). Vérifié : `eot:10` sur une partie de 10 tours.
- **Ordre annonce/stratégie inversé** : on choisissait sa carte Stratégie AVANT de connaître l'événement à venir — ce qui vidait l'annonce de son intérêt. CORRIGÉ : l'annonce est déplacée AVANT le draft (`runStrategyDraft` → `showEventAnnounce` → `_runStrategyDraftAfterAnnounce`), avec garde `G._announcedTurn` contre la double annonce. Vérifié sur les tours 1, 3, 5, 7 : `event_announce` précède bien `strategy`.
- NB : l'annonce du **Jugement Final** (tour 10) reste non bloquante — conséquence VOULUE du correctif anti-blocage de fin de partie.
- Régression : selftest 0 crash + test_contract complet.

## 🔬 MÉTHODE DE VÉRIFICATION OBLIGATOIRE (décidée avec Marc, 2026-08-01) — À LIRE AVANT DE LIVRER
**Constat qui a motivé cette règle** : `selftest` et `test_contract` vérifient l'ÉTAT du moteur, jamais l'INTERFACE.
Aucun bug d'affichage ne peut donc y apparaître (fenêtre absente, mauvais texte, fenêtre au mauvais moment,
partie figée en attendant un clic). J'ai livré plusieurs fois « tests verts » avec un jeu cassé. Pire : je testais
le chemin que je venais de modifier, pas celui que le jeu emprunte (`confirmAttack` vs `resolveWarCombat`,
`endTurn` vs `runEndOfRound`) — deux fois la même erreur.

**OUTIL** : `node server/playthrough.js [civ]` — joue **UNE** partie complète et imprime une TRANSCRIPTION
chronologique : chaque décision (et son destinataire), chaque FENÊTRE ouverte avec son TEXTE réel, chaque ligne
de journal. Plus des contrôles automatiques : la partie se termine-t-elle ? une décision est-elle sans
destinataire (= blocage) ? chaque type de décision a-t-il une VRAIE fenêtre côté client (sinon = panneau générique) ?

**PROTOCOLE (exigé par Marc) — ne pas y déroger :**
1. Lancer **UNE** partie.
2. **LIRE la transcription ligne par ligne** — comme un joueur regarde son écran : le texte de chaque fenêtre,
   l'ordre des étapes, une fenêtre manquante après une conquête / un raid / une fin de tour.
3. **Corriger** les problèmes trouvés.
4. **Relancer UNE partie**, relire, corriger. Et ainsi de suite.
   ❌ JAMAIS 20 parties d'un coup : le but est de REGARDER ce qui s'affiche, pas d'accumuler des statistiques.
5. Seulement ensuite : selftest + test_contract (non-régression du moteur), puis synchro du lot.

**LIMITE ASSUMÉE** : ce banc ne voit PAS la mise en page (largeurs, défilement, boutons hors écran sur mobile,
chevauchements). Cela demande un vrai navigateur → seules les captures d'écran de Marc les révèlent. Le banc doit
rendre ces captures EXCEPTIONNELLES, pas les remplacer.

**Limite actuelle du banc (à améliorer)** : le « joueur » simulé passe son tour au lieu d'attaquer/coloniser ;
le flux de guerre n'est donc pas encore exercé de bout en bout par la transcription. Prochaine amélioration :
lui faire jouer de vraies actions (colonisation, attaque) pour lire aussi les fenêtres de combat et de capture.

## ✅ v4.9 — LE revenu enfin net + bilan de fin de tour complet en ligne + numéro de version (2026-08-01, `lot15_tout`)

### 🔴 La vraie cause du « revenu brut » (bug signalé par Marc depuis des semaines, jamais résolu)
Il existait **DEUX fonctions qui écrivaient la barre du haut `#top-res`**, l'une après l'autre :
1. `updateUI()` écrivait la version **nette** (`_netIncome`) — correctif du 2026-07-26 ;
2. quatre lignes plus bas, `updateUI()` appelle `uiFillIncome()`, qui **réécrivait tout** `#top-res` à partir de `uiIncome(p)` — une **troisième** fonction de revenu qui ne déduit **aucun** entretien.
Le second rendu écrasait le premier : mon correctif du 26 juillet était du **code mort**. Même chose pour les jetons de Force (`uiFillIncome` réaffichait `p.forceTokens`, la réserve brute, au lieu de `engageableTokens`).
- **Corrigé** : `uiFillIncome` (dernier rendu, donc le seul qui compte) utilise maintenant `_netIncome(p)` et `engageableTokens(p)`. Le rendu en double dans `updateUI` a été **supprimé**. `uiIncome()` n'est plus utilisée pour l'affichage.
- **Infobulle « Revenu par tour »** : le total disait « Revenu net (avant entretien) » — libellé contradictoire ET valeur brute. Deux lignes désormais : *Total brut (avant entretien)* et *Revenu net (entretien déduit)*, ce dernier venant de `_netIncome` (source unique). Les ressources à 0 ou négatives sont affichées (`fmt` les masquait : une déduction ramenant à 0 devenait invisible) et le négatif est rouge.
- **Vérifié sur la position exacte de Marc** (Martiens, 4 colonies Nv.1, 3 routes) : barre = `+11🪨`, énergie ramenée à 0 (au lieu de `+8🪨 +6⚡`), jetons 5 au lieu de 8.

### 🧪 LEÇON DE MÉTHODE (à ne plus jamais oublier)
J'avais « testé » `_netIncome()` **en isolation** et conclu que l'affichage était bon. Il ne l'était pas : je n'avais jamais regardé **ce qui est réellement écrit dans le DOM**. Règle : pour tout bug d'affichage, **capturer l'`innerHTML` réellement produit** (stub `document.getElementById`) et le lire, jamais se contenter d'appeler la fonction de calcul. Et **chercher s'il existe un second rendu** de la même zone (`grep` sur l'id de l'élément) avant de conclure.

### ✅ Bilan de fin de tour COMPLET en réseau/multijoueur
En mode serveur, `showEOTModal` n'envoyait que `{turn, maint, revs}` et le client reconstruisait un résumé pauvre. Désormais le jeu construit le vrai bilan (`buildEOTBody`, **fonction pure sans DOM**) et l'envoie entier ; `showEotReal` l'injecte tel quel dans la vraie fenêtre → bilan **rigoureusement identique en solo, en réseau et en multijoueur** (actions du tour, entretien détaillé, revenus, une section par nation, guerre, pillages, pirates).
- Corollaire nécessaire : `G.turnActions` et `G._raidsThisTurn` sont **globaux** → en multijoueur les actions de toutes les nations se mélangeaient et les raids étaient attribués au mauvais joueur. Chaque nation tient maintenant son **propre journal** (`p._turnActions`, `p._raidsThisTurn`), remis à zéro en début de manche.
- `playthrough.js` **relit le texte intégral du bilan** à chaque tour et signale un bilan vide ou une section manquante.

### 🔢 Numéro de version sur l'écran de connexion (GO de Marc)
`index.html` porte `window.SOLAR_BUILD_HTML`, `online.js` porte `SOLAR_BUILD_JS`. L'écran de connexion affiche la version ; **si les deux diffèrent, il affiche les deux en rouge** → un upload partiel ou un cache devient visible immédiatement. **À INCRÉMENTER À CHAQUE MODIFICATION des deux fichiers.**


## ✅ v5.0 — lot de 8 corrections après la partie Marc + Laurent (2026-08-03, `lot15_tout`)

*Contexte : partie 0C7D à 2 humains + 1 IA, terminée le 01/08/2026 (Ceinturiens 124, Martiens 115, Jupitériens 19). Le jeu se déroule bien de bout en bout ; les 8 points ci-dessous sont des défauts d'affichage et de règle relevés par Marc.*

1. **Tutoriel inaccessible depuis solar-game.com** — aucun lien vers `tutorial.html` sur l'écran de connexion. AJOUTÉ (avec un lien vers les règles). `tutorial.html` a aussi été **régénéré** : il datait d'avant les corrections de la v4.9 (rappel de `REPRISE.md` §3 : le régénérer après CHAQUE modification du jeu).
2. **Cartes tech illisibles quand non achetées** — le grisage passait par `opacity:.3` (et `.4` / `.6`), ce qui efface le texte sur un écran peu lumineux ou sur mobile. On garde la distinction « carte éteinte » mais avec `opacity:.62` / `.68` / `.85`, un fond légèrement éclairci et un texte plus clair (`.tc-effect` `#8898b8`→`#a4b4d4`). On doit pouvoir LIRE une techno avant de pouvoir l'acheter.
3. **Bilan de fin de tour réservé au joueur actif** — pendant l'intervalle de fin de manche il n'y a plus de joueur actif : c'est un temps commun. Désormais le jeu construit **un bilan PAR NATION** (bascule temporaire de perspective, `buildEOTBody` étant pure) et le serveur envoie à chaque humain **le sien, au même instant** (`sendEotToAll`). Entretien et revenus sont mémorisés par nation (`p._lastMaint`, `p._lastRevs`) au moment où ils sont calculés — une seule source de chiffres.
4. **🔴 Fenêtre de victoire affichée chez l'autre joueur** — `server.js` faisait un `broadcast` de TOUTES les notices : Laurent voyait la fenêtre de victoire de Marc, puis l'inverse. Une notice appartient à UNE nation (`p.nation`) : elle part maintenant au siège correspondant, **et à lui seul**.
5. **🔴 Aucune fenêtre après la victoire née du refus de la Sphère de Dyson** — `onDecision` commençait par `if (STATE._answering) return;` : toute fenêtre arrivant pendant qu'une autre attendait une réponse était **jetée en silence**. Remplacé par une **file d'attente** : chaque fenêtre est montrée à son tour, aucune n'est perdue. (Corrige toute une classe de « la fenêtre n'est pas apparue ».)
6. **Capitale encore imprenable** — la règle avait été supprimée à un endroit mais **trois blocages subsistaient** : `attackColony`, `breakAccordAndAttack`, et la liste de cibles de la guerre forcée (plus le repli de ciblage de l'IA). Tous retirés. Règle en vigueur : la capitale est assaillable, défendue d'office par **10 jetons** auto-alimentés, auxquels s'ajoutent les jetons que le défenseur engage s'il peut les payer. Vérifié : un assaut à 3 jetons contre une capitale échoue, la fenêtre de résultat s'affiche.
7. **Trois actions d'affilée** — un joueur enchaînait action normale + pouvoir gratuit + action offerte par ce pouvoir pendant que les autres attendaient. **Le comportement « le pouvoir garde la main » est retiré** (il avait été introduit en v3.x sous le nom « bug #4 ») : la main tourne après un pouvoir comme après toute action, l'AC gagné sert au passage suivant. Vérifié sur le pilote : `power` → la main passe bien à la nation suivante.
8. **Détail des points de victoire disparu** — il existe toujours en solo (`#vp-wrap`), mais **en ligne** l'écran de fin ne recevait que les totaux. Le serveur envoie désormais tout le décompte de `calcVP` (colonies, routes, cartes, bonus tech, revenus/tour, agendas, événements, bonus spéciaux) et le client affiche le même tableau, **tous les postes y compris ceux à 0** — on voit donc aussi les points qu'on n'a PAS gagnés.

**Numéro de version** : `2026-08-03 · v5.0` dans `index.html` et `online.js`.
**Régression** : `node --check` sur les 3 fichiers, selftest 0 crash, playthrough 73 étapes / fin propre / 0 problème, bilans par nation vérifiés (3 corps distincts produits).

### ⚠️ Constat de méthode
Les points 4 et 5 étaient invisibles en headless : ils ne se manifestent qu'avec **deux clients humains réels**. Le banc d'essai ne simule qu'un seul joueur — il ne peut pas voir « la fenêtre part au mauvais joueur ». Prochaine amélioration utile du banc : simuler **deux humains** et vérifier le destinataire de chaque fenêtre.

## ✅ v5.1 — banc d'essai à 4 HUMAINS + les fenêtres de guerre partaient toutes au même joueur (2026-08-03, `lot15_tout`)

### 🧪 Le banc simule enfin une vraie table (GO de Marc)
`playthrough.js` n'installait qu'UN humain + des IA. Il était donc **structurellement aveugle** aux bugs de DESTINATAIRE : avec un seul humain, personne ne peut recevoir une fenêtre à tort et deux fenêtres ne se concurrencent jamais. Il installe désormais **4 nations humaines**, rejoue la distribution de `server.js` et dépose chaque fenêtre dans la **boîte aux lettres** de son destinataire. Contrôles ajoutés :
- aucune fenêtre personnelle reçue par quelqu'un d'autre que son destinataire ;
- aucune fenêtre personnelle émise sans destinataire (= blocage) ;
- fenêtres **collectives** (bilan, annonce et résultat d'événement) reçues par TOUS, et bilan **différent pour chacun** (deux bilans identiques = bascule de perspective ratée) ;
- deux fenêtres en vol pour le même joueur → rappel que la file d'attente du client est indispensable ;
- aucun joueur privé de tour (famine) ;
- contrôle statique : `online.js` doit contenir une file d'attente (`STATE._queue`).
Usage : `node playthrough.js` (4 humains) ou `node playthrough.js 1` (ancien mode).

**Deux défauts du banc lui-même corrigés au passage** :
- corrélation par numéro d'étape au lieu de l'identifiant de fenêtre (le moteur émet AVANT que la boucle n'incrémente l'étape) → faux positifs en série ;
- 🔴 le joueur simulé ne faisait **que passer son tour** : `NODES` est déclaré en `const` dans `index.html`, il n'est donc **pas** une propriété du bac à sable (contrairement aux `function`), et `sb.NODES` valait `undefined` — toute la logique de colonisation échouait en silence. Ajout de `_ctx(sb,'NODES')`. Seuil d'attaque abaissé à 2 jetons (le maximum payable en début de partie était 2, donc aucune guerre ne se déclenchait). Résultat : 201 étapes, 9 attaques, 4 colonisations au lieu de 40 « passe ».

### 🔴 Les fenêtres de guerre partaient TOUTES au même joueur
Mesuré par le nouveau banc sur une partie à 4 : **20 fenêtres de combat sur 20** et **20 offres de paix sur 20** adressées au joueur 1 — y compris pour les guerres des trois autres, qui n'avaient aucune fenêtre. En partie réelle, le joueur 1 aurait décidé à la place de tout le monde s'il faut attaquer ou faire la paix.
- **Cause** : tout le flux de guerre est écrit du point de vue de `G.player` (héritage du solo, où il n'existe qu'un humain et où toutes les guerres sont les siennes). `processAllWars` traitait chaque guerre **sans changer de perspective**.
- **Correction de fond** (et non point d'émission par point d'émission) : `_focusWar(w)` bascule `G.player`/`G.ais` sur un belligérant AVANT de traiter sa guerre — l'agresseur s'il est humain (`w.a` est toujours l'agresseur, `declareWar` l'écrit ainsi), le défenseur recevant de toute façon sa propre fenêtre de défense. **N'agit qu'en mode serveur** : en solo `G.player` est déjà le seul humain, rien ne change.
- **Vérifié sur 3 parties** : combat et paix vont désormais aux deux belligérants réels, et ce sont des joueurs différents d'une partie à l'autre. Solo intact (selftest 0 crash), mode 1 humain intact.

### ✅ Annonces d'événement invisibles pour les autres joueurs
Trouvé par le même banc : une annonce/résultat d'événement est **globale**, mais le pilote l'attribuait au *premier humain trouvé* (repli anti-blocage) — les autres ne la voyaient jamais. Les **fenêtres collectives** (`eot`, `event_announce`, `event_result`) sont désormais diffusées à toute la table par `sendWindowToAll`, celui qui porte la décision débloquant le flux.

### ⚠️ Ce que le banc ne voit toujours pas
La mise en page (largeurs, défilement, boutons hors écran), et le fait qu'il **rejoue** la logique de `server.js` au lieu de l'exécuter : si `server.js` régressait, le banc ne le verrait pas directement. Deux garde-fous statiques compensent en partie (file d'attente côté client, pas de diffusion générale des notices personnelles).


## ✅ v5.2 — le numéro de version et le lien tutoriel étaient sur le MAUVAIS écran (2026-08-03)

Marc a uploadé le lot 15 et redéployé les deux applications : **ni la version, ni le lien tutoriel** n'apparaissaient.

**Cause — il existe DEUX écrans de connexion, et j'ai modifié le mauvais :**
1. `#civ-sel` dans `index.html` (champs `lv-user` / `lv-pass`) = **le vrai écran d'accueil**, celui que le joueur voit au démarrage ;
2. `screenAuth()` dans `online.js` = un SECOND écran, visible seulement si on **annule une partie**.
J'avais tout mis dans le second. C'est **exactement le même piège** que le revenu net (deux fonctions écrivaient `#top-res`, la seconde écrasait la première) : je modifie un rendu sans vérifier que c'est celui que le jeu emprunte.

**Corrigé** : lien tutoriel + lien règles + zone version (`#lv-build`) ajoutés dans `#civ-sel`. Un commentaire y signale explicitement l'existence du second écran, pour ne pas retomber dedans.

**Deuxième piège évité de justesse** : `online.js` **REMPLACE** `window.lvTryAutoLogin`. Un appel à `lvShowBuild()` placé dedans aurait été du code mort dès que la couche en ligne est chargée. L'appel est donc fait sur `DOMContentLoaded`, puis rejoué par `online.js` après `hijackBuiltinAuth()` — c'est seulement à ce moment que `SOLAR_BUILD_JS` est connu, donc qu'une incohérence entre les deux fichiers peut être détectée. `SOLAR_BUILD_JS` est aussi exposé sur `window` (un `const` seul n'est pas visible depuis l'autre fichier).

**Vérifié** en rendant l'écran d'accueil : les deux liens et la zone version sont bien présents et produisent « Version 2026-08-03 · v5.2 ».

### 📌 Règle qui découle de ces deux incidents
**Avant de modifier un affichage, chercher s'il existe un SECOND endroit qui produit la même chose**
(`grep` sur l'identifiant DOM, sur le nom de la fonction, et vérifier si `online.js` la remplace).
Deux jours perdus sur le revenu, un déploiement pour rien sur la version : c'est la même erreur.


## ✅ v5.3 — supercroiseur ignoré en ligne + IA « qui ne font rien » au bilan (2026-08-03, partie 6DA8)

### 🔴 Le Supercroiseur n'était JAMAIS pris en compte en ligne
Marc assaille la capitale martienne Phobos, engage ses jetons **et son Supercroiseur** → « ⚔️ Égalité ».
- **Cause** : `G._cruiserDeployed` est un drapeau posé par la **modale SOLO**. La réponse réseau
  (`{action, node, tokens}`) ne le transportait pas, et le panneau générique ne proposait même pas
  le déploiement. Le moteur résolvait donc **toujours** le combat sans le croiseur.
- **Corrigé** : le payload `war_combat` expose `cruiser:{has, afford, power}` ; le client affiche une
  case « ⚓ Déployer le Supercroiseur (+5⚔️) » et renvoie `cruiser:true` ; le gestionnaire de réponse
  arme `G._cruiserDeployed` AVANT `resolveWarCombat`. Idem sur le chemin `ACTIONS.attack` de
  `game-core.js` (assaut depuis le plateau), qui l'ignorait aussi.
- **Reproduit puis vérifié** sur le cas exact de Marc (10 jetons vs capitale à 10 jetons de garnison) :
  **avant → « Égalité », 10 contre 10 ; après → « Victoire, tu CAPTURES Phobos », 15 contre 10.**

### ⚠️ Engagement rogné en silence
Le moteur plafonne l'engagement à `min(jetons possédés, jetons PAYABLES)` (1🪨+1⚡ par jeton), mais la
fenêtre proposait un curseur allant jusqu'aux jetons **possédés**. Le joueur pouvait donc croire avoir
engagé 15 jetons quand le moteur n'en retenait que ce qu'il pouvait payer. Le payload envoie désormais
`maxEngage` (le vrai plafond), le curseur s'y borne, et un avertissement explique la limite :
*« Tu possèdes N jeton(s) mais ne peux en payer que M »*. **Ce qui est proposé est ce qui est appliqué.**
La fenêtre signale aussi qu'une CAPITALE est défendue d'office par 10 jetons.

### 🔴 « Les IA ne font rien » dans le bilan de fin de tour
Le journal montrait bien les coups des IA, mais leur section du bilan affichait « Rien fait ce tour ».
- **Cause** : la concaténation `G.aiActions → nat._turnActions` n'existait que dans `interleaveStep`,
  le chemin **SOLO**. Le serveur appelle `doAITurn` **directement** (`driver._stepActor`) et sautait
  donc l'étape. Encore un cas de « deux chemins pour la même chose » (cf. `ARCHITECTURE_AVENIR.md` §3).
- **Corrigé** : nouvelle méthode `driver._aiTurn(nat)` qui joue le tour ET reporte les actions dans le
  journal de la nation. Les 3 appels à `doAITurn` du driver passent par elle.
- **Vérifié** : le bilan liste « Surtension », « Colonise Déimos », « Forge Orbitale »… au lieu de
  « Rien fait ce tour ».

### 📌 Demande FAITE en v5.4 (voir plus bas)
**Outil de resynchronisation du tutoriel.** `tutorial.html` est une copie d'`index.html` mais le
scénario de `tutorial.js` n'est plus synchronisé avec le déroulement du jeu qui a évolué. Marc veut un
**second programme** qui resynchronise le tutoriel après quelques mises à jour du jeu. À concevoir
(inventaire des étapes du tutoriel vs séquence réelle des fenêtres, signalement des écarts).


## ✅ v5.4 — outil de RESYNCHRONISATION DU TUTORIEL (2026-08-03, GO de Marc)

### Le besoin
Le jeu évolue, `tutorial.js` non. Le scénario du coach pointe vers des ÉLÉMENTS du jeu (fenêtres,
cartes, fonctions) et suppose un ORDRE d'enchaînement. Quand `index.html` change, le tutoriel se
désynchronise **en silence**. Marc : *« le tutorial ça va pas du tout, les enchaînements ne sont pas
synchronisés au déroulement du jeu »*.

### L'outil : `node server/tutorial-sync.js [--fix]`
Il ne réécrit **pas** les textes pédagogiques (travail humain). Il **diagnostique** la dérive et
régénère ce qui est mécanique. Cinq contrôles :
1. **Identifiants DOM** — chaque `glow` / `awaitClick` / `requireChoice` existe-t-il encore ?
2. **Cartes** — chaque `demo:{kind,id}` correspond-il encore à une carte du jeu ?
3. **Fonctions** — chaque `window.X()` appelée par le tutoriel existe-t-elle encore ?
4. **ORDRE RÉEL** — on joue une vraie partie et on compare la séquence des fenêtres à celle du scénario.
5. **`tutorial.html`** — doit être une copie d'`index.html` avec `online.js` → `tutorial.js` (`--fix`).

**Piège rencontré en le construisant** : impossible de dérouler une partie SOLO sans écran — les
modales attendent un clic et la partie se fige au tour 1. On passe donc par le **pilote serveur**,
qui répond aux fenêtres : la séquence des décisions qu'il émet EST la séquence vue par le joueur.
Le joueur simulé doit aussi **coloniser** (pas seulement passer), sinon les fenêtres « Découverte »
et « Jeton de route » ne s'ouvrent jamais et le contrôle les croit obsolètes à tort.

### Ce qu'il a trouvé, et qui est corrigé
```
séquence réelle du jeu : agenda → ANNONCE ÉVÉNEMENT → STRATÉGIE → découverte → bilan …
séquence du scénario   : agenda → STRATÉGIE → ANNONCE ÉVÉNEMENT → découverte …
```
Depuis la **v4.8**, l'annonce de l'événement vient **AVANT** le tirage de la carte Stratégie — c'était
voulu (connaître l'événement donne son intérêt au choix de la carte), mais le tutoriel enseignait
toujours l'ordre inverse. **Les deux étapes ont été interverties** et leurs textes réécrits pour
expliquer le lien : *« Maintenant que tu sais ce qui arrive, tire ta carte Stratégie… »*.
Après correction, la séquence du scénario suit exactement celle du jeu.

Reste un point signalé « à vérifier à la main » : la fenêtre `route-token-modal` ne s'ouvre pas sur
3 tours parce que le joueur simulé colonise mais ne construit pas de route. Limite assumée de l'outil,
signalée en jaune et non en rouge.

### Usage recommandé
Lancer `node server/tutorial-sync.js` **après quelques mises à jour du jeu, avant de livrer un lot**.
Rouge = à corriger, jaune = à regarder, `--fix` régénère `tutorial.html`.


## 📝 MÉMO (noté, NON implémenté — à faire quand Marc donne le GO)
*Section purgée le 2026-08-03 : les entrées précédentes (libellé « route passive », Sphère de Dyson multi-nations, avancée des pirates sur la carte, événements invisibles) étaient **déjà corrigées** et n'avaient jamais été retirées d'ici — elles nous ont fait perdre du temps à tous les deux. Ne laisser ici QUE ce qui est réellement en attente.*

- **SMTP `535 Authentication failed`** : les emails sont archivés (`data/outbox.log`, visibles dans `/stats`) mais rien ne part. Vérifier les identifiants OVH dans Coolify (`SMTP_USER` = adresse complète).
- **IA de guerre** : elle engage tout ce qu'elle peut payer au lieu d'estimer le juste nécessaire.
- **Bilan « Actions ce tour »** : un assaut résolu via la fenêtre de combat n'est pas inscrit dans `turnActions` — il n'apparaît donc pas dans la liste des actions du bilan (les lignes de journal, elles, sont correctes).
- **Toast vert de résultat d'action** : supprimé avec les fenêtres bleues. Si un retour visuel du butin (commerce avec les pirates) est souhaité, il faut le redemander — ce n'est plus une correction mais un ajout.
- **Banc d'essai** : `route_capture`, `human_dyson`, `espionage`, `extrasolar`, `empath_copy` jamais exercés ; le joueur simulé passe son tour au lieu de coloniser.
- **Non reproduits** : colonies joviennes à Nv.3, route Titan→Encelade supprimée deux fois.
- **Timing des cartes Stratégie** (mémo du 2026-07-23, à reconfirmer) : bonus de ressources semblant appliqué en fin de tour avant l'entretien plutôt qu'en début de tour.

## ▶️ Reste à faire (prochaine session) — RIEN ne se déploie sans GO de Marc
2. **Rebrancher le client** (tâche D du chantier) : `online_ws.js` (WebSocket au lieu du polling PHP) + reviver `__set`/`__map` + `refreshWarViews()` après désérialisation.
3. **Test multijoueur à 2 navigateurs** sur le vrai serveur.
4. Plus tard : filtrage des secrets dans `state`, reprise après redémarrage, BDD, Capacitor/stores.
5. TitanCorp : reste sur Netlify tant que pas de domaine dédié ; migrable sur ce serveur plus tard.
