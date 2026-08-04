# TODO — Solar Conquest mobile (`solar_conquest_small_screen.html`)

Mémos en attente d'implémentation. Rien n'est codé tant que Marc n'a pas donné le go.
À chaque implémentation : vérification Node/jsdom (pas d'erreur JS + comportement attendu).

> **✅ 2026-06-16 — Lot Civique + Militaire FAIT** (les 2 HTML + Word v12, vérifié Node) :
> suppression des cartes civiques héritées (gov1/gov2/gov3/eco1/eco2) ; nouvelle carte 📜 Réforme Institutionnelle (CIVIC_MARKET, +5 pts gouv permanents, 1×/partie, 1 AC + 3🔬) ; rivière militaire toutes cartes visibles ; militaire 1× par carte par tour (joueur ET IA). Les 15 mémos ci-dessous restent en attente.

---

## 1. Diplomatie — estimation des jetons Force adverses
Dans l'onglet Diplo, à côté des deux barres de tension de chaque nation, afficher une estimation de ses **jetons Force** :
- **Sans tech de renseignement** → valeur **approximative** = vrai nombre **± un aléa entre −3 et +3** (tiré au hasard, ex. affiche « ~5 » alors que le réel est 4).
- **Avec la tech d'info précise** (a priori `intel_2` « Réseau Orbital / Info nations disponible », `getIntelLevel(G.player) ≥ 2`) → afficher le **chiffre exact**.

## 2. Tension maintenue pendant la guerre
Quand une guerre est déclarée, la tension entre les deux nations doit **rester au maximum (10/10) pendant toute la durée de la guerre**.
Actuellement elle **retombe tout de suite** (incohérent). À corriger côté déclaration/résolution de guerre (`declareWar` / là où la tension est remise à zéro) : la garder à 10 tant que la guerre est active, redescente seulement **à la fin** de la guerre.

## 3. Sphère de Dyson — pouvoir renoncer à l'achat
Quand la modale Dyson présente le résultat (les autres nations acceptent ou refusent), si **au moins une refuse**, le joueur doit pouvoir **annuler l'achat de la tech** au lieu de subir la guerre.
Aujourd'hui : un seul bouton « Continuer » (forcé d'accepter).
À faire : **deux boutons côte à côte** dans `#dyson-modal` / `applyDysonClose` :
- **Forcer** : on garde la Sphère, guerre immédiate avec les récalcitrants ;
- **Renoncer** : on annule l'achat (**rembourser** le coût AC + ressources, retirer la carte), pas de guerre.

## 4. Guerre — message explicite quand l'adversaire tient aussi
Quand le joueur choisit **« Tenir position »** et que l'IA tient également (standoff), afficher un **message explicatif** du type **« L'IA choisit de tenir aussi »**, pour que le joueur comprenne le résultat (au lieu de juste subir le −2❤️ −1🪨 −1⚡ sans explication).
- À placer dans la branche standoff de `warHoldPosition` (et/ou dans le bilan de combat affiché).
- **Multijoueur (à venir)** : le même message doit s'appliquer pour **l'autre nation** qui choisit de tenir (généraliser, pas seulement « l'IA »).

## 5. Cartes tech — ressources insuffisantes en rouge
Mettre **en rouge** les ressources manquantes pour acheter une tech, **sur les petites cartes (rivière) ET sur la grande carte (modale détail)**.
- Petites cartes : la branche `!canAfford` de `renderTechTree` colore déjà chaque ressource (`ok ? gris : rouge`) — vérifier que c'est bien visible/cohérent.
- Grande carte (`showTechDetail`, `td-cost`) : aujourd'hui le coût ne distingue pas la ressource manquante → colorer en rouge chaque ressource dont `G.player.res[r] < cost[r]`.

## 6. Combat — pas de VP en cas d'égalité
En cas d'**égalité au combat** (draw / standoff), **aucune victoire militaire** n'est acquise → **pas de bonus VP** (pas de +3 VP). Vérifier la résolution de combat pour qu'un match nul ne crédite aucun point de victoire militaire.

## 7. Coût de guerre par jeton — affichage + blocage strict
Règle (déjà dans `NOTES_DESIGN.md`) : **1🪨 + 1⚡ par jeton engagé** pour **attaquer, défendre ou tenir**.
État du code (`resolveCombat`, ~ligne 2849) : le coût `−engagedP🪨 −engagedP⚡` est bien prélevé **à la résolution**, mais :
- il est **plafonné** (`Math.max(0, res − jetons)`) → **pas de blocage** si on ne peut pas payer ;
- il **n'est pas affiché** dans le slider d'allocation des jetons ;
- « Tenir » applique un coût **forfaitaire** (−2❤️ −1🪨 −1⚡/camp), pas par jeton.

À faire :
1. **Afficher** le coût `−X🪨 −X⚡` dans le slider (attaque/défense), mis à jour avec le nombre de jetons.
2. **Blocage strict** : on ne peut engager que les jetons qu'on peut **payer** (1🪨+1⚡ chacun) — limiter le slider / refuser sinon (« si tu peux pas payer, tu peux pas le faire »), **pas de plafonnement silencieux**.
3. **Prélever immédiatement** à l'allocation (et appliquer le coût par jeton aussi à « tenir »/défendre selon l'intention).

## 8. Cartes militaires « Supercroiseur » et « Flotte de chasseurs » — achetables une seule fois
**Supercroiseur** et **Flotte de chasseurs** ne doivent pouvoir être choisis **qu'une seule fois** chacun (pas répétables).
Ce sont a priori des cartes militaires actuellement `repeatable:true` (cartes Force : +2/+4/+6 jetons, ~lignes 1154-1158) → passer ces deux-là en **non répétables** (`repeatable:false`, 1× par joueur, comme les civiques exclusives). Vérifier les noms exacts au moment de coder.

## 9. Sphère de Dyson prise par une IA — demander l'avis du joueur
Quand **une IA** construit la Sphère de Dyson (monopole énergétique), le jeu doit **demander son avis au joueur** (comme ça se fait quand c'est le joueur qui la construit) : **accepter** le monopole, ou **refuser → déclarer la guerre** à cette IA.
Actuellement : si une IA la prend, le joueur n'est pas consulté. À ajouter : symétriser la mécanique Dyson pour le cas « IA constructrice → chaque autre nation (dont le joueur) accepte ou entre en guerre ».
(Lié au mémo #3 qui traite le cas inverse : joueur constructeur pouvant renoncer.)

## 10. Attaque de colonie ciblée — coûte une action + guerre focalisée
Attaquer une colonie pendant son tour doit :
- **coûter une action (1 AC)** ;
- déclencher une **guerre focalisée uniquement sur CETTE colonie** (pas une guerre générale ouverte) ;
- **colonie acquise** si on **gagne le premier combat** → on peut la **coloniser** ;
- **non acquise** sinon, mais **ré-attaquable au tour suivant** (tout en laissant la liberté de faire un autre choix ce tour-là).

À intégrer côté `attackColony` / `confirmAttack` / résolution de guerre (cibler la colonie, capture sur victoire, ré-attaque possible au tour suivant).

## 11. Guerre focalisée sur la colonie attaquée — défense IA & abandon (lié au #10)
**Bug observé** : j'attaque Titan (guerre vs Jupitériens), je re-cible Titan à l'écran de guerre, je gagne — mais le système affiche « Défense réussie, la route Io-Europe tient ». Incohérent : l'IA a contre-attaqué une route au lieu de défendre Titan, et je ne conquiers pas Titan.

**Comportement voulu :**
- La guerre déclenchée par une attaque de colonie est **focalisée sur cette colonie** (ex. Titan) : l'IA **défend Titan**, et si je gagne je **conquiers/colonise Titan**.
- L'IA **peut** lancer un combat supplémentaire pour me surprendre, mais alors elle doit **répartir (split) ses jetons** entre la défense de Titan ET son attaque (la route), pas faire les deux à pleine force.
- L'IA peut **choisir d'abandonner** sa colonie (ne pas défendre Titan) → **moral −2** (la population ne comprend pas qu'on abandonne les siens).
  - Si dans le même temps l'IA **gagne une colonie** au joueur → **moral +1** en compensation → **net −1** (la population n'aime quand même pas l'abandon).

À intégrer dans la résolution de guerre (cible = colonie attaquée, défense IA prioritaire sur cette cible, logique de split si l'IA contre-attaque, malus/compensation de moral à l'abandon).

## 12. Choix des bonus de début de tour — priorité au plus faible
À NE PAS confondre avec les événements « à réussir » (Ruée/Savoir/Suprématie, qui gardent leur condition).
Pour les **bonus de début de tour** (cartes Stratégie / bonus piochables) :
- Le joueur/IA **le plus faible (VP le plus bas)** choisit ses bonus **en premier** ; ordre inverse de VP, **égalité départagée par jetons Force**.
- Implique sans doute un **pool partagé** drafté dans cet ordre (à préciser).
- **Investissements** : on peut choisir **le même** que d'autres (pas d'exclusivité) → choix **simultané** possible (plus besoin que l'IA « prenne » une option au joueur).

## 13. Diplomatie — expliciter l'événement en cours
Dans l'onglet Diplomatie : afficher **l'événement en cours** (nom + effet expliqué) et **à quelle fin de tour il se réalise**.

## 14. Propriétaire de colonie non affiché
Dans le détail d'une colonie (popup au clic sur un nœud), on ne voit pas **à qui appartient** la colonie. Afficher clairement la **nation propriétaire** (emoji + nom), pour le joueur ET pour chaque adversaire. (Ligne `npop-info` dans `showNodePopup` — affiche actuellement « IA Nv.X » sans nommer la nation.)

## 15. Impossible de PRENDRE une colonie adverse (même une lune de départ)
Aujourd'hui attaquer une colonie ne fait que la **rétrograder/détruire**, jamais la **capturer**. Il faut pouvoir **prendre possession** d'une colonie adverse (y compris une lune de base). Lié aux mémos #10/#11 (guerre focalisée sur la colonie + capture sur victoire).

---

## ÉTAT À LA REPRISE (important)
- **Spirale de moral des IA : réglée** (plus de « Guerre civile IA (moral 0) » en boucle dans le dernier log). Stratégies IA + récup moral + cessez-le-feu + anti-sur-extension = OK.
- **Déséquilibre restant** : le joueur gagne encore largement (≈113 vs 23) via le **snowball de guerre** — il rétrograde des colonies pour +3 VP à répétition + Sphère de Dyson. Le **flux de guerre (#10/#11/#15)** est LE levier restant : guerre focalisée sur la colonie attaquée, capture, rôles attaquant/défenseur corrects.
- **Événements « à réussir »** : remis en **condition d'origine** (gagnant = leader sur la condition, égalité = plus bas en VP puis force) dans `solar_conquest_small_screen.html`. **À FAIRE : re-synchroniser `solar_conquest_game.html`** (il a encore la version « dernier en VP ») + ajouter « l'IA essaie de gagner l'événement en cours ».
- **Mémo #12** : ✅ FAIT — draft des bonus de début de tour (pool commun limité, du plus faible VP au plus fort, égalité par jetons Force ; investissements non exclusifs). Vérifié Node (ordre, rareté, IA pré-draftée, 5 tours sans erreur JS).
- **Guerre refondue** : ✅ FAIT — attaquer une colonie = 1 manche résolue immédiatement + capture ; la guerre s'arrête sauf si l'autre nation poursuit (IA : calcul force/moral/revenus, reprise prioritaire, conservation des ressources). Règles Word → `Regles_Solar_Conquest_v8.docx`.
- **Brouillard d'information** : ✅ FAIT (helper `perceivedForce`, les deux fichiers) — force rivale en ±3 estimée/stable (exacte si `intel_2`), éco & moral cachés sans tech ; l'IA décide sur une estimation ±3 de la force joueur (exacte si elle a la tech) ; écran de combat : défense ennemie « inconnue » sans tech, fourchette ±1 avec tech (`intel_1`+). Vérifié Node + 5 tours.
  - ⚠️ Reste à décider : le panneau rivaux (fogué) est encore visible sous l'onglet **Empire** ET sous Diplomatie. À confirmer : le retirer complètement d'Empire (rivaux uniquement en Diplo) ?
  - ⚠️ Règles Word : pas encore documenté le brouillard ni le flux « Se battre » (à faire si go).
- **Blocage « Se battre » corrigé** : ✅ FAIT — refuser la paix ouvre désormais le choix d'une colonie ennemie à assaillir (combat résolu ce tour, capture si victoire), avec option « Poursuivre sans assaut ». La guerre se « réalise » donc à chaque tour côté joueur.
- **IA après reprise** : ✅ FAIT — une fois sa colonie reprise (ou si elle n'a rien perdu), l'IA ne poursuit la conquête que si elle est **nettement dominante (≥ 2× ta force estimée)** ; sinon elle propose la paix. Vérifié Node (3 branches) + 5 tours.
- **Bug concurrence guerre populaire** : ✅ FAIT — `triggerGuereeForcee` affichait sa fenêtre de choix pendant que `endTurn` lançait déjà `processAllWars` → fenêtres superposées, `G.warWith` volé, clic ignoré. Corrigé : la guerre populaire est sérialisée (flag `_forcedWarPending` → `_forcedWarCb` chaîne vers `processAllWars`) et la nation cible est épinglée. Vérifié Node (sérialisation + bonne nation + capture).

- **Moral : pénalités basées sur le moral FIGÉ en fin de phase d'actions** : ✅ FAIT (les deux fichiers) — snapshot `_moraleRev` du joueur (à `endTurn`) et de chaque IA (après `doAITurn`). `applyMoralPenalty` (revenus) et la réduction d'AC (`startTurn`) utilisent ce snapshot, pas le moral écrasé par les guerres de fin de tour. Donc une baisse due à une guerre subie ne pénalise qu'au tour suivant (grâce d'un tour pour remonter). **Filet IA « se relève » supprimé** → parité totale joueur/IA. Vérifié Node (snapshot protège, pénalité si on finit bas, AC idem, filet IA absent) + 5 tours. À ÉQUILIBRER en test.

- **IA provoquée riposte à parité** : ✅ FAIT (les deux fichiers) — quand TU attaques une colonie (`playerAssaultColony` pose `war.playerProvoked=true`), l'IA contre-attaque dès qu'elle est à parité (`myForce ≥ ta force estimée`) au lieu d'exiger 2× ; garde-fou « je ne peux pas gagner → paix » préservé (si réellement plus faible, elle propose la paix). Corrige le cas « j'attaque Ganymède, je perds, l'IA gagne mais capitule au lieu de riposter ». Vérifié Node (riposte / tient à parité / paix si plus faible / 2× toujours requis si non provoquée) + 5 tours.

- **Guerre Dyson : bug + agresseurs engagés** : ✅ FAIT (les deux fichiers) — `applyDysonClose` ne déclarait la guerre qu'au PREMIER refuser (`G._dysonWarTargets[0]`) → corrigé : boucle sur tous, chacun marqué `war.aiAggressor=true`. Dans `aiWarPolicy`, un agresseur attaque même en infériorité (au moins un assaut) ; `tryRecaptureAssault` bypasse le seuil de force pour un agresseur ; `resolveAiAssault` consomme le statut après l'assaut (ensuite comportement normal = paix si elle ne peut pas gagner). Vérifié Node (3 refus = 3 guerres + agresseur, assaut faible 3 vs 8, consommation, non-agresseur faible = paix) + 5 tours.

## CORRECTIONS CARTES — ✅ TOUT FAIT (vérifié Node, les deux fichiers)
- Ordinateur Quantique : coût +1⚡ ajouté (2🔬 2🪨 1⚡). ✅
- Hyperpropulsion : « routes gratuites » → ENTRETIEN gratuit (0⚡/route, revenu conservé) ; achat inchangé. ✅
- Cartes militaires refondues : Investissements militaires (+2 temp, 1AC 2⚡1🪨, répét.), Drones de Combat (+1 temp, requiert Drones Surveillance, 1AC 1⚡1🪨, répét.), Flottes de Chasseurs (+3, −1 au tour suivant, requiert Robotisation Avancée, 2AC 3⚡3🪨, répét.), Supercroiseur (+5 puissance EN GUERRE permanente, inutile vs raids/pirates, 3AC 4🪨3⚡1🔬, 1×). Force temporaire dissoute au startTurn (`milLoseNext`), warForce en combat (`pPow`/`pDef`), AC variable + tech requise dans buyGeneral + rendu. ✅
- Emoji Drones de Combat : 💫 → 🛩️ (plus de collision visuelle). ✅
- À FAIRE : compléter le Word pour ce lot (militaires + Ordinateur Quantique + Hyperpropulsion).

## (ancien) CORRECTIONS CARTES — détail spec
- **Ordinateur Quantique** : ajouter le coût manquant −1⚡ (code actuel : 2🔬 2🪨 → doit être 2🔬 2🪨 1⚡). Effet +2🔬/tour OK.
- **Hyperpropulsion** : garder « routes gratuites » MAIS = entretien gratuit des routes (pas le 1⚡/route en fin de tour), PAS l'achat. Aujourd'hui `route_force_free` rend l'ACHAT gratuit (ligne 2647) → à inverser : achat normal, entretien gratuit. Reste OK : +3 gov (1x), +3 force, 6🔬 2⚡ 2🪨, 2AC.
- **Robotisation Avancée** : conforme (+2🪨/tour, 3🔬 2🪨 2⚡). RAS.
- **Extracteurs Solaires** : coût 4🪨 1⚡ 2🔬 conforme (le ✗ = marqueur ressource insuffisante, normal).
- **Cartes MILITAIRES — refonte complète selon spec Marc** (le code a 3 cartes à jetons PERMANENTS, faux) :
  - *Investissements militaires* (MANQUANTE à créer) : +2 force immédiat, perdu à la FIN du tour. RÉPÉTABLE (rachetable chaque tour). Coût 1AC 2⚡ 1🪨.
  - *Drones de Combat* : +1 force immédiat, perdu au tour suivant. RÉPÉTABLE. Requiert tech *Drones de Surveillance*. Coût 1AC 1⚡ 1🪨. (code actuel faux : +2 force, 2⚡, sans condition)
  - *Flottes de Chasseurs* : +3 force immédiat, moitié perdue au tour suivant (arrondi → perd 1). RÉPÉTABLE. Requiert *Robotisation Avancée* (chasseurs sans pilote). Coût 2AC 3⚡ 3🪨. (code actuel faux : +4 force, 5⚡, non répétable)
  - *Supercroiseur* : +5 force immédiat, PERMANENT (rien perdu). UNE SEULE FOIS. N'agit QU'EN GUERRE (inutile vs raids/pirates). Coût 3AC 4🪨 3⚡ 1🔬. (code actuel faux : +6 force +2 combat, 8⚡ 3🪨, 2AC)
  - Mécanique d'expiration par carte à CODER (aujourd'hui `applyCard` ligne 2486 ajoute la force définitivement, aucune n'expire).
- **Emoji 💫** : Marc confirme que ce N'EST PAS la collision Capacité (voir bug badge ci-dessous). À voir si on change quand même un emoji.
- **Badge ∞ / 1× qui s'échappe de la carte** : ✅ FAIT — `.gc-art` n'était pas `position:relative`, donc les badges absolus (∞/1×/✗) sautaient dans le coin du panneau ; en cliquant on ouvrait quand même la carte (Drones de Combat). Ajout `position:relative` sur `.gc-art` (les deux fichiers). Chargement OK.

## MÉMOS EN ATTENTE (ne pas implémenter sans go)
- **Uniformiser le design des cartes** : ✅ FAIT (2026-06-17) — titres des cartes **civiques** et **militaires** agrandis comme les **techs** (pleine largeur, une ligne, nowrap/ellipsis ; override `.gcard .gc-name` calqué sur `.tcard .tc-name`). Les trois rivières sont désormais traitées pareil.
- **Récap fin de tour : détail par nation** (en attente de go) : le bilan EOT ne montre que les actions de la DERNIÈRE IA (`G.aiActions` est remis à zéro à chaque `doAITurn`). Solution prête : sauvegarder `ai._turnActions` après chaque tour IA + afficher une sous-section par nation dans `showEOTModal`. Montrer seulement les ACTIONS (publiques), pas ressources/force/moral (brouillard). Marc a dit « pas encore ».
- **Science des Ceinturiens trop fragile** (Marc redira les détails) : départ 1🔬, dépend trop de (a) prendre tôt les techs qui donnent du 🔬/tour et (b) tirer le bonus +3🔬 au draft. Si on rate, la branche science décroche sans rattrapage. Marc veut retoucher la rivière des ACTIONS CIVILES pour offrir une voie de secours science. → attendre ses changements précis avant de coder.
- **Fenêtres Stratégie ET Investissements : trop hautes + pas d'accès aux tensions** :
  1. Taille : `#strategy-modal` (et `#invest-modal`/`#invest2-modal`) dépassent la bande du milieu → haut/bas cachés par les barres. Cause : depuis le draft (mémo #12) le pool affiche 5–6 cartes. Pistes : plafonner `#strat-options` (et conteneurs invest) en `max-height` calé sur la bande + `overflow-y:auto`, réduire taille/padding des `.strat-opt`, et/ou 2 colonnes. Vérifier `uiSyncBands()` avant `showStrategyModal`/`showInvestmentModal`. (Déjà dans la liste `--topband/--botband` lignes 575/578.)
  2. Décision : pendant ces modales on ne peut pas consulter l'onglet Diplo pour voir les tensions → embarquer un MINI-RÉCAP des tensions (par nation : ma tension / la leur) directement dans la fenêtre Stratégie et Investissements, pour décider s'il faut prendre « Calmer les tensions » sans quitter la modale. (Respecter le brouillard : tensions OK = déjà visibles en Diplo.)
- **Guerre populaire forcée — afficher la nation visée** : la fenêtre `forced-war-modal` (`fw-title`/`fw-desc`) ne dit pas CONTRE QUELLE nation est la guerre. Ajouter le nom + emoji de la nation cible (`fwTargetAi`) dans le titre/la description.
- **Interdire d'attaquer la planète/lune mère** : ✅ FAIT (les deux fichiers) — `attackColony` bloque si `nodeId===_atkAI.civ.home` ; le sélecteur « Se battre » (`rejectPeace`/`_showAssaultPicker`) et la cible « colonie la plus proche » de la guerre populaire (`triggerGuereeForcee`) excluent le home. Vérifié Node (clic carte, picker, guerre populaire) + 5 tours. (Word §14.3 déjà à jour. NB : `jorbital1` = « Jupiter » = home Jupitériens ; `eris` = home Ceinturiens, etc.)

_Dernière mise à jour : 2026-06-06._

---

## 🎯 ORIENTATION FUTURE (cap produit — ne pas implémenter sans go explicite)

- **Objectif final : MULTIJOUEUR EN LIGNE.** Le jeu doit évoluer vers du multijoueur en ligne (joueurs sur appareils différents, distants), pas du hot-seat. Marc ne veut PAS de hot-seat.
- **Distribution : applications natives** sur l'App Store (iOS) et le Play Store (Android).
- Conséquence d'architecture à anticiper : aujourd'hui tout est centré sur un `G.player` unique (réf. ~338×) + IA locales. Le online-multi exigera (a) une notion de « joueur actif » générique, (b) un backend de synchronisation d'état (serveur WebSocket / service temps réel), (c) des décisions diplomatie/guerre interactives des deux côtés, (d) un emballage app mobile (ex. Capacitor/React Native autour du HTML, ou réécriture).
- Bonne nouvelle déjà acquise : le modèle de données est symétrique (chaque participant, IA comprise, est un objet joueur complet) → la bascule sera surtout du flux de contrôle + réseau, pas une refonte des données.

_Note ajoutée le 2026-06-11._

> **✅ 2026-06-18 — Économie de combat corrigée (coup de gueule de Marc)** (les 2 HTML) :
> Bug : en défense, l'IA (et le joueur) engageaient TOUS leurs jetons GRATUITEMENT et SANS cooldown → l'ennemi restait full-force chaque tour, et le cooldown (Investissements militaires) ne servait à rien.
> Fix : helper `applyCombatEngage(p,e,won)` — engager e jetons coûte **1🪨+1⚡ chacun**, les jetons **partent en cooldown** (moitié perdue si défaite), **identique en attaque ET en défense**. Appliqué à `resolveWarCombat` (défenseur IA plafonné ~70 % + cooldown) et `resolveAiAssault` (défenseur joueur paie + cooldown, engagement plafonné par les ressources). 
> **Nouveau test** : `scripts/test_regles.js` vérifie sur le vrai code (joueur ET IA) : coût symétrique, cooldown des deux côtés, défense plafonnée par les ressources, route_disc=0🪨, AC=niveau gouv+1, plafonds ressources. → `node scripts/test_regles.js`. À enrichir d'autres règles au fil de l'eau.
> Reste (mémo #7) : le coût par jeton sur « **Tenir position** » (standoff) n'est pas encore passé par le helper — à aligner si besoin.
