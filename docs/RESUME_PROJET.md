# RÉSUMÉ DU PROJET — Solar Conquest
*Document de contexte à consulter au début de chaque session. À tenir à jour au fil des changements.*
*Dernière mise à jour : 2026-06-20.*

---

## 0. JOURNAL DE SESSION — 2026-06-20 (à lire en premier)

### A. Cartes illustrées (suite de la §13)
- **Toutes les illustrations de tech/civique/militaire intégrées** au jeu via `CARD_ART` (fichier mobile uniquement — le desktop n'a pas de `CARD_ART`). IDs dans `CARD_ART` : bio1, prop1, drones1, quant1, bio2, nav2, hyper3, reseau2, vegetal1, exploit1, terra3, iadef3, robo2, extra3, empathic2, eveil3, extract2, dyson3, mil3, mil2, liens1, gov_senat, gov_democratie, mil_invest, mil1, comm2, tele3, gov_corpo.
- Cartes composées générées (grande `cartes/<id>.png` + petite `cartes/petites/<id>.png`) via `scripts/make_card.py` + `scripts/make_mini.py`. Le jeu charge l'illustration brute `assets/cards/<id>.png` (raw), pas la carte composée.
- **Bug corrigé** : la tuile militaire/civique (`gc-art`) et le popup `showGeneralDetail` n'utilisaient pas `CARD_ART` → ajouté (sinon le Supercroiseur restait en emoji). 
- Supercroiseur (`mil3`) : illustration décalée de 80px vers le bas (titre ne chevauche plus le vaisseau).
- `make_mini.py` : badge « +0 PV » masqué si vp=0 (cartes civiques sans VP).
- Reste sans illustration : `cultures_hydroponiques` (réservé par Marc).

### B. Icônes de ressources dans l'UI mobile
- Les emojis ⚡🪨🔬❤️ remplacés **partout** dans l'UI mobile par des **images inline base64** (classe CSS `.ri-energy/.ri-materials/.ri-science/.ri-morale`, balises `<i class=ri-X></i>` SANS guillemets pour rester valides dans toutes les chaînes JS). 365 conversions. `rEmoji()` renvoie désormais ces balises. ⚔️ (Force) reste un emoji.
- **Protégés** (gardés en emoji) : les 9 `emoji:'…'` de données (planètes SVG, etc.) et les lignes `.textContent`.
- **Bug corrigé** : plusieurs popups affichaient l'effet via `.textContent` → la balise `<i…>` apparaissait en texte brut. Passés en `.innerHTML` (td-effect ×3, tp-effect, disc-desc, evm-result, inv-active, td-branch).
- Le fichier **desktop garde les emojis** (pas de `.ri`).

### C. Équilibrage de cartes
- **Réseau Empathique** (`empathic2`) : `+2❤️/tour, +1🔬/tour` (avant : +2 pts Gouv).
- **Sphère de Dyson** (`dyson3`) : les nations qui ACCEPTENT le monopole reçoivent **+3⚡/tour** (implémenté dans les deux sens : joueur bâtit → IA acceptantes ; IA bâtit → joueur accepte). Modales mises à jour.
- **Domination des Corporations** : `+5 pts` de Gouv (avant +3), coût 2🪨 inchangé.
- **Démocratie Directe** : coût achat `3🪨 2⚡ 1🔬`, entretien `−2🪨 −2⚡/tour`.

### D. Bug colonisation (exploit) corrigé
- La stratégie « Expansion Rapide » (`strat_col_ac`, −1 AC sur colonisation) ne s'applique plus qu'à **UNE colonisation par tour** (drapeau `_stratColUsed`, reset en début de tour). Avant : 0 AC → colonisations illimitées. Test **RÈGLE 12**.

### E. Refonte du système de guerre (mobile + desktop)
- **Guerre populaire forcée** : plus de capture instantanée sans combat → passe par la vraie modale de combat (`playerAssaultColony`, choix des jetons). + option **« Exiger la paix »** (tribut jusqu'à +2🪨+2⚡ si l'IA n'est pas plus forte, sinon refus).
- **IA déclare la guerre** → c'est elle qui frappe, le joueur **défend** (texte corrigé).
- **Max 2 attaques/tour et par nation** (`_attacksThisTurn`, reset début de tour) — joueur ET IA.
- **Tension effective** (`tensEff`) : quand une guerre est active, la tension envers les AUTRES nations baisse de 6 (effets : moins de pénalité moral, accords plus faciles, pas de second front forcé). Pas de guerre populaire contre une nation déjà en guerre avec toi.
- **Attaque de route** (joueur clique la route ennemie sur la carte ; IA via `aiRouteRaid`) : route détruite, **pas de cooldown**, indéfendable ; jeton de protection tient contre 1 jeton, **2+ la détruisent** (jeton perdu + cooldown attaquant) ; **Liens Empathes ET IA Défensive** = jeton non-perdable (routes inattaquables). `resolveRouteAttack()`. Test **RÈGLE 13**.
- `scripts/test_regles.js` : **13 règles**, vertes sur les deux fichiers.

### F. Règles Word
- **v15** : Dyson (+3⚡ acceptantes) + Réseau Empathique (+1🔬). **v16** : Domination Corporations (+5) + Démocratie Directe (nouveau coût/entretien). Édition via Python `zipfile` sur `word/document.xml` (ancres sans apostrophe).

### G. 🚀 NOUVELLE ARCHITECTURE — moteur entrelacé découplé (dossier `moteur/`)
Décisions verrouillées avec Marc :
- **Modèle de tour = ENTRELACÉ (B)** : ordre **aléatoire chaque tour**, **1 action = 1 passage**, la main tourne jusqu'à ce que tous passent. Tue le land-grab ; plus juste pour l'IA et le futur multi. (Abandon du séquentiel « toi tout → IA tout ».)
- **Archi = moteur découplé + UI fine** (PAS de serveur maintenant — prématuré tant que le design bouge ; on hissera le moteur sur le serveur le jour du multi, l'IA deviendra un client). 
- **Initiative pluggable** : `determineTurnOrder` + `INIT_MODE` (`random`/`weakestFirst`) + crochets réservés `peutChoisirInitiative`/`initiativeChoice` (pour techs empathe/télépathe qui choisiront leur initiative).
- Fichiers : **`moteur/engine.js`** (JS pur SANS DOM, UMD Node+navigateur), **`moteur/ai.js`** (cerveau IA séparé : (vue état)→action), **`moteur/sim.js`** (driver headless 100% IA). UI jouable : **`solar_conquest_interleaved.html`** (charge `moteur/engine.js`+`moteur/ai.js` ; humain = Terriens). Pour tester : uploader le fichier **+ le dossier `moteur/`**.
- **Porté** dans le moteur : carte 13 nœuds, arbre tech complet (21 techs/7 branches), économie de combat (cooldown, guerre 2 tours, max 2 attaques, attaque de route, protection tech), tensions, pénalité de moral, pirates, revenus, score, victoire, **CIVIQUE** (formes de gouvernement Tyrannie/Corpo/Sénat/Démocratie avec pts→niveau→AC, entretien Démocratie ; 8 cartes sociales dont Réforme Institutionnelle). AC désormais piloté par le niveau de gouvernement. Validé **800 parties headless, 0 anomalie**.
- **PORTÉ AUSSI** : ~~civique~~ ✅ → ~~événements~~ ✅ → ~~agendas~~ ✅ → ~~investissements T3/T7~~ ✅ (choix interactif, effet permanent) → ~~défense interactive~~ ✅ (**modèle « décision en attente »** : `state.pending` ; `resolvePending(state,decision)` ; l'UI met le jeu en pause et te demande combien de jetons engager quand on t'attaque) → **carte SVG visuelle** ✅ (UI refaite : carte cliquable, colonies colorées, routes, panneaux, actions groupées).
- Validé : **800 parties 100% IA** + **200 parties avec humain** (914 défenses + 400 investissements résolus) — 0 anomalie.
- **RESTE** (raffinements) : guerre populaire forcée + **exiger la paix** + déclaration de guerre auto par tension (l'IA attaque déjà si adjacente+forte, mais pas encore de déclaration formelle par seuil de tension) ; **accords commerciaux** (partage de colonie/paix) ; **choix des jetons côté attaquant** humain (auto = min(.,3) pour l'instant) ; IA qui joue vers son agenda ; équilibrage fin ; civilisations à pouvoirs (Ceinturiens/pirates, etc.) pas encore dans le moteur.
- ⚠️ Le moteur entrelacé est une **base parallèle** : il ne remplace PAS encore `index.html` (le jeu séquentiel complet). On porte les familles de règles dessus avant de basculer.

---

## 1. Le projet en bref
Jeu de stratégie spatiale au tour par tour, **2 à 4 joueurs (1 humain vs IA), 10 tours**. Thème : conquête du système solaire (colonies, routes, techs, diplomatie, guerre, points de victoire).

**Cap produit (objectif final) :** MULTIJOUEUR EN LIGNE (joueurs sur appareils distants), distribué en **applications natives iOS / Android**. Marc ne veut PAS de hot-seat. Aujourd'hui tout est centré sur un `G.player` unique + IA locales → la bascille online exigera une notion de « joueur actif » générique + un backend de synchro. Bonne nouvelle : le modèle de données est déjà symétrique (chaque participant, IA comprise, est un objet joueur complet).

---

## 2. Fichiers (dossier `Desktop/star conquest/`)
- **`solar_conquest_small_screen.html`** — version MOBILE (petit écran). C'est la principale.
- **`solar_conquest_game.html`** — version DESKTOP. **Toujours synchronisée** avec la mobile (mêmes modifs de logique). Quelques fonctions divergent (rendu, certaines modales) → vérifier les ancres avant d'éditer.
- **`Regles_Solar_Conquest_v14.docx`** — règles à jour (versionnées v4 → v14). Mises à jour avec python-docx ou unpack/edit XML/pack (skill docx).
- **`RESUME_PROJET.md`** — ce document.
- **`TODO_mobile.md`** — mémo courant des items faits / en attente + orientation future.
- **`simulate_v1.js`** (DANS le dossier projet, persistant) — banc de test headless sans dépendance (voir §8). Remplace l'ancien `simulate.js` qui était dans le dossier outputs (éphémère, perdu entre sessions).
- **PWA** (mobile installable, sans barre de navigateur) : `manifest.webmanifest`, `sw.js` (service worker network-first), `icon-192.png` / `icon-512.png` / `icon-maskable-512.png`. Liés dans le `<head>` du HTML mobile + enregistrement SW avant `</body>`. **Les 5 fichiers doivent être sur le serveur, dans le MÊME dossier que le HTML servi**, et le site doit être en HTTPS (le SW l'exige).
- **Overrides mobile** : un bloc CSS commenté en fin de `<style>` du HTML mobile (texte +~25 %, carte plafonnée ~40 dvh, barres haut/bas ancrées en `position:fixed`) + JS `setAppHeight`/`uiSyncBands`/`syncFixedBars` (hauteur dvh + `--vh`, mesure des bandes, suivi `visualViewport` anti-pinch). C'est là qu'on ajuste la lisibilité.

---

## 3. Civilisations
| Civ | Emoji | Couleur | Home | Bonus national |
|-----|-------|---------|------|----------------|
| Terriens | 🌍 | vert `#4CAF50` | (Lune/Terre) | Spiritualité ; +1 pt gouv/tour si moral ≥5 |
| Martiens | 🔴 | rouge `#ef5350` | — | Expansion |
| Jupitériens | 🟠 | orange `#FF9800` | `jorbital1` (Jupiter) | Mines & Énergie |
| Ceinturiens | ☠️ | violet `#AB47BC` | `eris` | Navigation ; raids type pirate |

---

## 4. Ressources & économie
- **⚡ énergie, 🪨 matériaux, 🔬 savoir, ❤️ moral.**
- **Plafonds : 🔬 et ❤️ plafonnés à 10. 🪨 et ⚡ DÉPLAFONNÉS** (changement voulu, utile en temps de guerre). Tout passe par `getResCapFor(p)`.
- Moral 0 = guerre civile (aucun revenu ce tour) ; moral 1 = revenus ÷2.
- **Revenus** (fin de tour) : colonies connectées (ressources du nœud + bonus de niveau : +1🔬 au Nv.2, +2🔬 au Nv.3), cartes permanentes (`rpt`), accords commerciaux. **Tooltip** : survoler/cliquer la ligne de ressources en haut → détail des sources + entretien/malus.
- **Entretien** : colonies (par niveau), routes (1⚡/route → +1🪨 si alimentée ; une route NON alimentée = pas de revenu, mais PAS coupée et connectivité conservée — la connexion dépend du **jeton Force** sur la route, pas de l'énergie).

---

## 5. Actions de Commandement (AC) & Gouvernement
- **AC/tour = gov_level + 1** (+ bonus : Tyrannie +1, certaines cartes Stratégie).
- `gov_pts = govPermPts (cumulatifs) + govFormPts (forme active, NE se cumulent PAS entre formes)`.
- Seuils : **5 / 10 / 15 → niveaux 2 / 3 / 4**. Niveau 4 = 5 AC de base.
- **Formes de gouvernement** (une seule active, remplace la précédente, coût en ❤️ non rendu) : Tyrannie 👑 (0 pt, +1 AC, −2❤️), Domination des Corporations 🏢 (3), Sénat Solaire ⚖️ (5), Démocratie Directe 🗳️ (10, +1❤️/tour, entretien −1🪨 −1⚡/tour).
- **Actions civiques (`CIVIC_MARKET`)** : 7 cartes sociales + 4 formes de gouvernement. Le badge « GOV » distingue les formes.
- ⚠️ **Anciennes cartes civiques héritées supprimées** : `gov1` Conseil Civique, `gov2` Alliance Planétaire, `gov3` Sénat Solaire (doublon de nom), `eco1` Marché Orbital, `eco2` Raffinerie Solaire. Ne doivent plus apparaître nulle part (HTML, règles).

---

## 6. Techs, investissements, militaire
- **7 branches** : expansion, navigation, ia_renseignement, sciences_exp, spiritualite_nature, mines_energie, empathes. Tiers 1–3 ; T3 = exclusive (1 acheteur/partie). Empathes nécessite « Union Sacrée ».
- **Investissements** : Niv.1 (choix fin T2, effet T3→T5), Niv.2 (fin T6, effet T7→T9). **Toutes les IA** en choisissent un, **stratégiquement** (`chooseInvestmentForAI`). « Colonies Avancées » (Niv.2) passe toutes les colonies au niveau max → grosse hausse de revenu (notamment 🔬).
- **Cartes militaires** : `mil_invest` (+2 jetons temp), `mil1` Drones (+1, req `drones1`), `mil2` Flottes (+3, req `robo2`), `mil3` **Supercroiseur** (5 jetons insécables réservés à la guerre ; déployable à la demande au combat pour 5🪨 5⚡ ; jamais perdu ; cooldown 2 tours, 1 avec Stratégie Guerrière, seulement sur défaite). Les IA achètent aussi cartes civiques + militaires et déploient le croiseur.
- **EN COURS / À FAIRE (militaire)** : toutes les cartes militaires toujours **visibles** (grisées si non acquérables) au lieu de 2 aléatoires ; et **1× par carte par tour** (joueur ET IA).

---

## 7. Guerre & diplomatie (système actuel)
- **Tension bilatérale** par nation (`tensions[from][to]`, 0–10). Raids, routes en conflit, domination, avance tech la font monter.
- **Assaut** = action (1 AC + jetons) résolue **immédiatement** (1 manche), capture si victoire. La guerre s'arrête après, SAUF si la nation attaquée choisit de continuer.
- **Assaut IA sur le joueur** : pendant son tour (reprise de sa colonie) OU en fin de tour si elle maintient la guerre → le joueur a une **fenêtre de défense** (engager des jetons ; Empathes +2/+4 gratuit ; Supercroiseur auto si ≥1 jeton). Si défense insuffisante (y compris 0 jeton) → perte de la cible (colonie capturée/rétrogradée, route neutralisée), annoncée explicitement. Garde-fou : une IA n'attaque qu'une fois par tour.
- **Paix** : offre avec ou sans ressources ; l'IA accepte selon sa situation. **Trêve de ~2 tours** après chaque paix (`G._peaceCooldown`) → empêche la boucle de guerres populaires à répétition.
- **Guerre populaire forcée** : déclenchée quand une tension atteint 10 (joueur offensé → tu dois attaquer une route/colonie ennemie ; IA offensée → elle t'attaque). **Filet** : si aucune cible accessible (pas de route protégée ni colonie non-mère), bouton « Passer » (sinon blocage). Planètes/lunes mères **imprenables**.
- **Brouillard** : force ennemie estimée ±3 (exacte avec Renseignement intel_2) ; éco & moral cachés sans renseignement.
- **Sphère de Dyson** : le bâtisseur monopolise l'énergie ; les autres acceptent ou guerre. Accepter la Dyson d'une IA = **paix** avec ce bâtisseur (fin de toute guerre fraîche + tension calmée).
- **Affichage** : zone Diplo montre « ⚔️ EN GUERRE » **uniquement** par nation réellement en guerre (corrigé). Bilan de fin de tour : par nation, badge « en guerre » + « a attaqué » ou « n'a pas attaqué ce tour ».

---

## 8. Tests (`simulate_v1.js`)
- **Sans aucune dépendance** (pas de jsdom, pas de npm) : charge le **vrai fichier HTML** dans un bac à sable Node (`vm` + DOM bouchonné en Proxy), fait jouer l'IA via `doAITurn`, pilote un bot joueur léger, résout les modales automatiquement (agenda, draft, EOT, événement, investissements, messages de guerre). Couvre 4 joueurs. RNG déterministe (seed) = reproductible.
- **Détecte : crashes, erreurs JS, parties bloquées** + **assertions ciblées** (cartes héritées absentes, Réforme +5/1×, militaire 1×/tour, rivière complète).
- **Limites v1** : guerre populaire forcée et fenêtre de défense du joueur (assaut IA) sont **auto-passées** (le joueur n'engage pas de jetons) ; l'offensive IA reste pleinement exécutée. **NE détecte PAS** les boucles « pénibles mais sans erreur » ni les bugs visuels (rendu neutralisé). → Toujours tester aussi en navigateur.
- Lancer (depuis le dossier) : `node simulate_v1.js` (10 parties × 2 fichiers), `node simulate_v1.js 50`, ou `node simulate_v1.js 30 mobile` / `... desktop`. **À relancer après chaque grosse modif.**

---

## 9. Décisions d'interface (UX)
- **Un clic sur un nœud ouvre TOUJOURS sa fiche** (Coloniser / Route → voisin / Améliorer / Attaquer / Accord). Plus d'action « en aveugle » selon un mode caché. Les boutons 🏗/🛤 ne servent qu'à surligner.
- **Journal** : légende des nations (couleur par nation) en tête + noms colorés dans chaque ligne. Le journal reste, mais **tout doit être expliqué dans les fenêtres de jeu au bon moment** (principe : le joueur ne lit pas le journal).
- Tooltip revenus, récap de fin de tour par nation.

---

## 10. Conventions de travail (pour Claude)
- **Éditer les DEUX fichiers HTML en synchro** (mobile + desktop). Vérifier les ancres : certaines fonctions diffèrent.
- Globals via `let` → utiliser `G` nu (jamais `window.G`).
- **Vérifier après chaque modif** : `node --check` sur le script extrait + test fonctionnel jsdom ciblé. Relancer `simulate.js` pour les grosses modifs.
- Word : python-docx, cloner le formatage des puces/titres existants.
- Ancrer les `Edit` sur des chaînes exactes et uniques.

## 11. Style & préférences de Marc
- Français. Concis et direct, pas d'obséquiosité, pas de « honnêtement ». Dire la vérité sans la souligner.
- **Jamais lancer une itération/action coûteuse en tokens sans GO formel.** « Mémorise » = prendre note sans implémenter.
- Chercher d'abord la solution la plus simple et gratuite ; proposer le coûteux/complexe seulement en l'expliquant, et laisser choisir.

---

## 12. En cours / prochaines étapes
- **Lot Civique + Militaire** : ✅ FAIT (2026-06-16, vérifié Node — données + achats joueur + 8 tours IA sans erreur, les 2 fichiers).
  1. ✅ Bloc civique hérité (gov1, gov2, gov3, eco1, eco2) supprimé des 2 HTML + règles (plus aucune carte `type:'civique'` dans CARDS_POOL).
  2. ✅ Nouvelle carte civique **📜 Réforme Institutionnelle** dans CIVIC_MARKET (type social, non répétable) : +5 pts gouv permanents à l'acquisition, 1×/partie, 1 AC + 3🔬. Validée par Marc. L'IA la prend quand il n'y a plus de forme à améliorer et qu'elle a le 🔬.
  3. ✅ Rivière militaire : toutes les cartes visibles (grisées si non acquérables).
  4. ✅ Militaire : 1× par carte par tour (joueur ET IA) via `_milBoughtThisTurn` (reset au startTurn / doAITurn). Corrige l'IA qui rachetait Investissements militaires plusieurs fois/tour.
  - ✅ Word → `Regles_Solar_Conquest_v14.docx` (§4.2 source de points permanents + §7.2 Réforme et militaire tout-visible/1×-tour).
- **Lot 2 / futur** : IA encore plus fines ; et à terme, le chantier **multijoueur en ligne + apps mobiles**.

## 13. Cartes illustrées (art) — décisions figées (2026-06-17)
**But** : une illustration par carte (tech + civique + militaire), style **The Expanse** (réaliste, gritty), générée par **nano banana** (Gemini Image) avec mes prompts. Midjourney Lite (15 $/300) possible aussi.

**Grande carte (style Magic)** — VALIDÉE :
- Générateur réutilisable : **`make_card.py`** (720×1008). On lui passe nom/effet/coût/couleur + l'illustration, il sort la carte.
- **Bord coloré = couleur de branche** (reconnaissance rapide) : expansion `#FF9800` · navigation `#42a5f5` · ia_renseignement `#AB47BC` · sciences_exp `#26C6DA` · spiritualite_nature `#66BB6A` · mines_energie `#FFA726` · empathes `#CE93D8` · **civique `#E0B33A` (gold)** · **militaire `#E0413A` (rouge)**.
- **Pas de flavor en petit/italique** (illisible). Effet en gros.
- **Icônes de ressources = vraies images** (pas de texte, pas d'emoji). Choix de Marc parmi 3 planches nano banana : éclair (énergie) + microscope (savoir) du fichier 1, cœur (moral) du fichier 2, roche (matériaux) du fichier 3. Découpées/détourées dans **`images/icons/`** = `energy.png`, `materials.png`, `science.png`, `morale.png`.

**Petite carte (rivière, en jeu)** — VALIDÉE (maquette) : l'illustration en **bandeau** remplace l'emoji, gros titre une ligne, icônes images dans le coût. Intégration = code (à faire) : charger `assets/cards/<id>.png` par id + icônes `assets/icons/<res>.png` à la place des emojis. Cartes sans illu → gardent l'emoji (progressif).

**Arborescence des assets** :
- `images/` → rendus nano banana **bruts** (noms libres) + planètes/vaisseaux. `images/icons/` = les 4 icônes.
- `assets/` → **ce qui va sur le serveur** (à la racine, à côté de `index.html`) : `assets/cards/<id>.png` (illu par id) + `assets/icons/<res>.png`.
- `cartes/` → grandes cartes Magic générées (impression/collection, **pas servies** au jeu).

**Flux par carte** : prompt nano banana (style Expanse) → Marc génère → dépose dans `images/` → je renomme en `assets/cards/<id>.png` → `make_card.py` sort la grande carte → intégration rivière.

**Ancre de style nano banana** (à mettre dans chaque prompt) : « illustration de science-fiction photoréaliste et cinématographique, style The Expanse, gritty/used-future, éclairage dramatique golden-hour, volumétrique, palette réaliste désaturée, ultra-détaillé, composition large 4:3, sans texte/logo/filigrane ».

**Inventaire des 37 cartes + prompts** : `CARTES_INVENTAIRE.md`.

## 14. Arborescence du dossier (rangé le 2026-06-18)
**Racine = uniquement les HTML actifs + `sw.js`** (le service worker DOIT rester à la racine, à côté d'`index.html`, sinon la PWA casse) :
- `index.html` (jeu déployé = copie du mobile), `solar_conquest_small_screen.html` (source mobile), `solar_conquest_game.html` (source desktop), `sw.js`.

Sous-dossiers :
- `assets/` → servi au serveur : `cards/<id>.png` (illustrations), `icons/` (4 icônes ressources), `pwa/` (manifest.webmanifest + icon-192/512/maskable). **Liens HTML mis à jour** : `<link rel="manifest" href="assets/pwa/manifest.webmanifest">`, `apple-touch-icon` = `assets/pwa/icon-192.png`. Manifest `start_url`/`scope` = `/`. `sw.js` précache `./assets/pwa/...`.
- `images/` → rendus nano banana bruts + planètes/vaisseau + `icons/`.
- `cartes/` → grandes cartes générées + `petites/` (aperçus rivière) + `apercus/` (brouillons) + `anciennes/` (4 vieilles cartes).
- `docs/` → tous les `.md` (ce RESUME, TODO_mobile, CONTEXTE…, CARTES_INVENTAIRE) + docx de référence.
- `regles/` → toutes les versions `Regles_Solar_Conquest_v*.docx`.
- `scripts/` → outils : `make_card.py`, `make_mini.py`, `simulate_v1.js` (⚠️ ce dernier cherche les HTML dans le dossier parent ; le lancer depuis la racine : `node scripts/simulate_v1.js`).
- `archive/` → anciens prototypes (`solar_conquest_mockup.html`, `tour1.html`, `sim_4p.js`, `solar_conquest_logic.js/.json`) + dossiers vides non supprimables par le sandbox.

**Déploiement serveur** : uploader `index.html`, `sw.js` (racine) + le dossier `assets/` entier. (Le sandbox ne peut pas SUPPRIMER de dossiers — d'où `archive/_vide_*` ; à supprimer à la main si tu veux.)
