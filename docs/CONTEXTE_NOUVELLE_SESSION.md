# SOLAR CONQUEST — Contexte complet pour nouvelle session
_Document de transfert — à lire en entier avant de commencer_

---

## 1. CE QU'ON VEUT FAIRE

Créer **`solar_conquest_mobile.html`** — une interface mobile pour le jeu Solar Conquest, qui charge la logique du jeu depuis **`solar_conquest_game.html`** (version desktop qui FONCTIONNE). 

L'interface mobile doit :
- Fonctionner comme une **vraie app mobile** (max 430px, design soigné)
- **Cartes style Magic: The Gathering** pour toutes les entités (nations, technologies, actions)
- Être jouable sur iPhone/Android directement dans le navigateur
- Réutiliser 100% de la logique de jeu existante — zéro réécriture de règles

---

## 2. FICHIERS DANS LE DOSSIER `/Desktop/star conquest/`

| Fichier | Taille | État | Description |
|---------|--------|------|-------------|
| `solar_conquest_game.html` | 4103 lignes | ✅ FONCTIONNE | Version desktop complète — source de vérité |
| `solar_conquest_mobile.html` | 4130 lignes | ❌ À REFAIRE | Tentative mobile — pleine de bugs |
| `solar_conquest_logic.js` | 3296 lignes | ✅ OK | Logic.js extrait du desktop (globals en `var`) |
| `images/terre.png` | 455 KB | ✅ | Image planète Terriens |
| `images/mars.png` | 389 KB | ✅ | Image planète Martiens |
| `images/ceinture.png` | 722 KB | ✅ | Image Ceinturiens |
| `images/jupiter.png` | 692 KB | ✅ | Image Jupitériens |

**NE PAS MODIFIER** `solar_conquest_game.html` — c'est la référence qui marche.

---

## 3. LE JEU — RÈGLES COMPLÈTES

### Vue d'ensemble
Solar Conquest est un jeu de stratégie 4X au tour par tour, 1 joueur humain vs 2-3 IA. 10 tours. Thème : colonisation du système solaire.

### Les 4 Nations
| ID | Nom | Emoji | Couleur | Spécialité | Passif |
|----|-----|-------|---------|------------|--------|
| `terriens` | Terriens | 🌍 | bleu | Gouvernance | Moral ≥ 4 → +1 pt Gouvernement/tour |
| `martiens` | Martiens | 🔴 | rouge | Militaire | Cartes militaires -1⚡. Colonisation -1🪨-1⚡ |
| `ceinturiens` | Ceinturiens | ⚫ | gris | Navigation | Raids coûtent 1 jeton (au lieu de 2) + 1⚡ |
| `jupiteriens` | Jupitériens | 🟠 | orange | Technologie | Upgrade jovien gratuit en 🔬 |

### Ressources
- ⚡ Énergie — pour acheter des actions et des cartes
- 🪨 Matériaux — pour coloniser et upgrader
- 🔬 Science (Savoir) — pour les technologies
- ❤️ Moral — affect le nombre d'AC par tour
- ⚔️ Jetons Force — pour les guerres et routes

### Actions par tour (AC = Actions Cards)
Le joueur dispose de 2-5 AC par tour selon son niveau de gouvernance et moral. Chaque action coûte 1+ AC.

**Actions possibles :**
- 🏗 **Coloniser** un nœud libre (coût : 1 AC + matériaux + énergie)
- ⬆ **Améliorer** une colonie (Niv.1→2→3)
- 🛤 **Établir une route** entre deux nœuds colonisés
- 🔬 **Acheter une technologie** (coût : 1-2 AC + ressources)
- 🃏 **Jouer une carte civique ou militaire**
- ⚔️ **Déclarer la guerre**
- 🕵️ **Espionner** (voler une branche tech)
- ↩ **Annuler** la dernière action (Undo)
- ✅ **Fin de tour** (bouton obligatoire)

### Arbre technologique (6 branches)
- **Expansion** 🏗 — colonisation bonifiée (bonus Martiens)
- **Navigation** ⚗️ — routes et mobilité (bonus Ceinturiens)
- **IA & Renseignement** 🔍 — espionnage et défense
- **Sciences Expér.** 🧪 — bonus recherche
- **Spiritualité & Nature** 🕊️ — moral et gouvernance (bonus Terriens)
- **Mines & Énergie** ⚡ — production ressources
- **Empathes** 🧬 — branche spéciale (copier techs adverses)

Chaque branche : T1 (1AC+🔬), T2 (1AC+2🔬, nécessite T1), T3 (2AC+3🔬, nécessite T2 personnel)

### Carte du système solaire
Nœuds : Lune, Phobos, Déimos, Cérès, Vesta, Io, Europe, Ganymède, Callisto, Jupiter (x7 orbitales), Titan, Encelade, Triton, Pluton, Éris

4 Zones : Interne, Joviène, Saturnienne, Externe

### Guerre
- Déclaration : coûte de la Tension et des jetons
- Combat : 2 rounds, dés modifiés par force/tech
- Options : Attaque, Tenir Position (standoff), Paix
- Dure 2 tours, résolution à la fin

### Scoring (fin tour 10)
- VP par colonie (baseVP × niveau)
- Bonus agenda accompli
- Points gouvernance
- Techs T3 acquises

---

## 4. ARCHITECTURE TECHNIQUE

### La bonne approche (à utiliser)
```
solar_conquest_mobile.html
  ├── <script> (inline, logic from solar_conquest_game.html)
  └── <script> (mobile UI)
```

**NE PAS** créer de fichier .js séparé — les navigateurs bloquent le chargement de fichiers locaux via `<script src="">` quand on ouvre un fichier HTML directement.

### Comment extraire la logique du desktop
Prendre tout le contenu de la balise `<script>` principale de `solar_conquest_game.html` et le mettre en inline dans le mobile.

**Changement OBLIGATOIRE** : Les variables globales en haut du script desktop sont en `let`. Il faut les changer en `var` pour qu'elles soient accessibles entre blocs de script :
```js
// Changer ces lignes dans le bloc logique :
var G={};var mode=null;var routeFrom=null;var selectedCiv=null;
var selectedAiCiv=null;var selectedAiCivs=[];var gameDifficulty='easy';
var undoStack=[];var _warModalCb=null;var _pendingDiscovery=null;
var _evModalCb=null;var _warCombatCb=null;var _warSliderMode='att';
var _agendaPool=[];var _selectedAgendaId=null;
```

### Overrides OBLIGATOIRES (dans le 2e bloc script, avec syntaxe d'assignation PAS function)
```js
// CORRECT — assignation au runtime
render = function() { uiFullRender(); };
renderTopBar = function() { uiRenderResBar(); };
renderActions = function() { if(uiCurrentTab==='actions') uiRenderActions(); };
renderTechTree = function() { if(uiCurrentTab==='techs') uiRenderTechs(); };
renderRight = function() { if(uiCurrentTab==='diplo') uiRenderDiplo(); };
renderMap = function() { /* carte SVG mobile */ };
closePopup = function() { uiCloseCard(); };  // CRITIQUE
setDifficulty = function(level) { gameDifficulty = level; };  // CRITIQUE
selectCiv = function(id) {
  selectedCiv = id;
  const nAIs = {'easy':1,'normal':2,'hard':3}[gameDifficulty]||1;
  const others = Object.keys(CIVS).filter(c => c !== id);
  selectedAiCivs = others.sort(()=>Math.random()-.5).slice(0,nAIs);
};
showAgendaSelModal = function() {
  uiAgendaPool = shuffle([...AGENDAS_POOL]).slice(0,5);
  uiAgendaSel = null;
  uiShowAgendaModal();
};
showStrategyModal = function() {
  G.player.stratBonus = null;
  startTurn();
};
initTechResize = function() {};
changePanel = function() {};
getTechAreaMode = function() { return 'full'; };
toggleLog = function() { uiSetTab('journal'); };
drawStars = function() {};
drawConnections = function() {};
```

### Stubs desktop OBLIGATOIRES (éléments cachés dont la logique a besoin)
```html
<div class="desktop-stub" style="display:none!important">
  <div id="top-bar"><span id="civ-badge-top"></span><span id="turn-disp"></span>
       <span id="ac-disp"></span><span id="score-p"></span><span id="score-a"></span></div>
  <svg id="solar-svg" viewBox="0 0 980 320">
    <g id="stars"></g><g id="connections"></g><g id="routes-ai"></g>
    <g id="routes-p"></g><g id="pirates-g"></g><g id="nodes-g"></g>
  </svg>
  <div id="tech-panel"><div id="tech-body"></div></div>
  <div id="action-bar">
    <button id="btn-col"></button><button id="btn-route"></button>
    <button id="btn-cancel"></button><button id="btn-end"></button>
  </div>
  <div id="npop" style="display:none"><div id="npop-body"></div></div>
  <div id="eot-modal" style="display:none"><div id="eot-body"></div></div>
  <div id="agenda-sel-modal"><div id="agsel-context"></div>
       <div id="agsel-agendas"></div><button id="agsel-confirm-btn"></button></div>
  <div id="strategy-modal"><div id="strat-options"></div><div id="strat-sub"></div></div>
  <div id="war-modal"><div id="war-body"></div></div>
  <div id="war-combat-modal"><div id="wcm-body"></div></div>
  <div id="event-modal"><div id="ev-title"></div><div id="ev-body"></div>
       <button id="ev-ok-btn"></button></div>
  <div id="event-announce-modal"><div id="evann-title"></div><div id="evann-body"></div>
       <button id="evann-btn"></button></div>
  <div id="bilan-modal"><div id="bilan-body"></div><button id="bilan-ok"></button></div>
  <div id="tech-detail-modal"><div id="td-art"></div><div id="td-name"></div>
       <div id="td-branch"></div><div id="td-tier"></div><div id="td-effect"></div>
       <div id="td-cost"></div><button id="td-buy-btn"></button></div>
  <div id="invest-modal"><div id="inv-opts"></div><div id="inv-ai-pick"></div></div>
  <div id="invest2-modal"><div id="invest2-opts"></div><div id="inv2-ai-pick"></div></div>
  <div id="espionage-modal"><div id="esp-opts"></div></div>
  <div id="empath-copy-modal"><div id="emp-opts"></div></div>
  <div id="route-recall-modal"><div id="rr-body"></div></div>
  <div id="calm-modal"><div id="calm-body"></div><div id="calm-opts"></div></div>
  <div id="pirates-modal"><div id="pir-body"></div></div>
  <div id="civ-cards"></div><div id="civ-sel-screen"></div>
  <button id="btn-start"></button>
  <div id="left-panel"><div id="war-risk-display"></div><div id="res-display"></div>
       <div id="actions-display"></div><div id="log-panel"><div id="log-entries"></div></div></div>
  <div id="right-panel"><div id="r-civ-hdr"></div><div id="r-res"></div>
       <div id="r-actions"></div><div id="r-events"></div></div>
</div>
```

### Flux de démarrage
```
1. Page charge → bloc logique s'exécute → overrides mobile appliqués
2. Écran difficulté → uiSelDiff('easy'|'normal'|'hard') → gameDifficulty=level
3. Écran nation → swipe → uiNationIdx change
4. Bouton Commencer → uiStartGame():
   - selectCiv(civId)  ← notre override, pas l'original
   - initGame(selectedCiv, selectedAiCivs)
   - → initGame appelle showAgendaSelModal() → notre override → show agenda modal mobile
5. Joueur choisit agenda → uiConfirmAgenda():
   - G.player.agenda = chosen
   - G.ais.forEach(ai => ai.agenda = ...)
   - show game-screen
   - startTurn()  ← qui appelle showStrategyModal() → notre override → skip + startTurn() direct
6. Jeu commence
```

---

## 5. CE QUI DOIT ÊTRE CONSTRUIT (UI MOBILE)

### Design cible : CARTES STYLE MAGIC

Chaque élément du jeu doit être présenté comme une carte :

**Carte Nation** (écran de sélection) :
```
┌────────────────────────┐
│ 🌍  TERRIENS           │ ← emoji + nom en titre
│ ─────────────── ──── ──│ ← bande de couleur de civilisation
│ [IMAGE PLANÈTE]        │ ← photo de la planète (images/terre.png)
│                        │
│ Lune terrestre         │ ← sous-titre gris
│ ─────────────────────  │
│ PASSIF                 │ ← label
│ Moral ≥ 4 → +1 pt Gov │ ← texte du passif
│ ─────────────────────  │
│ ⚡2  🪨6  🔬3  ❤️4  ⚔️2 │ ← ressources de départ
└────────────────────────┘
```

**Carte Technologie** :
```
┌────────────────────────┐
│ T1  EXPANSION      🏗️  │
│ ─────────────────────  │
│ Biosphère Autonome     │ ← nom
│ ─────────────────────  │
│ Colonisation -1🪨       │ ← effet
│ ─────────────────────  │
│ Coût: 1AC  1🔬         │ ← coût
│ [ACHETER]  ou  ✓ Acquis│ ← bouton ou statut
└────────────────────────┘
```

**Carte Action** (panneau actions) :
```
┌────────────────────────┐
│ 🏗  Coloniser          │
│ Cérès · ⚬ Libre        │
│ ─────────────────────  │
│ 1AC  -2🪨  -1⚡         │
│ [COLONISER]            │
└────────────────────────┘
```

### Structure de l'écran de jeu
```
┌─────────────────────────────┐
│ RES BAR (fixe en haut)      │ ← ⚡8 🪨5 🔬3 ❤️4 | Tour 3/10 | 3AC
├─────────────────────────────┤
│                             │
│  ZONE PRINCIPALE            │ ← contenu selon l'onglet actif
│  (scrollable)               │
│                             │
├─────────────────────────────┤
│ TAB BAR (fixe en bas)       │ ← 🗺️Carte | ⚡Actions | 🔬Techs | 🤝Diplo | 📜Journal
└─────────────────────────────┘
```

### Les 5 onglets
1. **🗺️ Carte** — SVG du système solaire, cliquable par zone (Interne/Joviène/Saturnienne/Externe), puis par nœud
2. **⚡ Actions** — Liste des actions disponibles en cartes, bouton UNDO si disponible, bouton FIN DE TOUR (toujours visible, en bas)
3. **🔬 Techs** — Grille de cartes tech par branche, grayed si inaccessible
4. **🤝 Diplo** — Tensions avec chaque IA, statut de guerre
5. **📜 Journal** — Log des événements du tour

### Éléments OBLIGATOIRES
- **Bouton FIN DE TOUR** : toujours visible dans l'onglet Actions, gros, bien contrasté
- **Bouton UNDO** : apparaît dans Actions quand `undoStack.length > 0`
- **Toast erreur** : quand une action échoue, message explicite (ex: "❌ 2 AC manquants, 1🪨 manquants")
- **Barre ressources** : toujours visible en haut — lisible sur fond sombre

---

## 6. BUGS À NE PAS RÉPÉTER

### Bug 1 — Hoisting JavaScript
```js
// ❌ JAMAIS faire ça pour les overrides
function render() { uiFullRender(); }  // hoisting → écrase l'original

// ✅ Toujours faire ça
render = function() { uiFullRender(); };  // assignation au runtime
```

### Bug 2 — script src bloqué en local
```html
<!-- ❌ Bloqué par le navigateur (file://) -->
<script src="solar_conquest_logic.js"></script>

<!-- ✅ Inline uniquement -->
<script>/* contenu de logic.js ici */</script>
```

### Bug 3 — const entre blocs script
```js
// Block 0 (logique): const NODES = {...}
// Block 1 (mobile): const NODES = {...}  ← ERREUR: re-déclaration
// Solution: les variables mobiles doivent avoir des noms uniques (préfixe ui)
```

### Bug 4 — position:fixed dans un sous-container
```css
/* Si on limite la largeur via un wrapper div, tous les éléments position:fixed
   doivent devenir position:absolute par rapport au wrapper */
#root-wrap { position: relative; max-width: 430px; }
/* Tous les enfants fixes deviennent: */
#civ-sel { position: absolute; inset: 0; }
```

### Bug 5 — setDifficulty du desktop crash en mobile
```js
// Original appelle document.getElementById('diff-easy') qui n'existe pas en mobile
// Override OBLIGATOIRE:
setDifficulty = function(level) { gameDifficulty = level; };
```

### Bug 6 — closePopup du desktop crash en mobile
```js
// Original appelle document.getElementById('npop') qui peut être null
// Override OBLIGATOIRE:
closePopup = function() { /* fermer la carte mobile active */ };
```

### Bug 7 — selectCiv du desktop fait du DOM
```js
// Original modifie des cartes #cc-terriens qui n't existent pas en mobile
// Override OBLIGATOIRE:
selectCiv = function(id) {
  selectedCiv = id;
  const nAIs = {'easy':1,'normal':2,'hard':3}[gameDifficulty]||1;
  const others = Object.keys(CIVS).filter(c => c !== id);
  selectedAiCivs = others.sort(()=>Math.random()-.5).slice(0,nAIs);
};
```

---

## 7. IMAGES

Les images sont des fichiers PNG locaux dans `images/` :
- `images/terre.png` → Terriens
- `images/mars.png` → Martiens
- `images/ceinture.png` → Ceinturiens
- `images/jupiter.png` → Jupitériens

**Règle absolue** : Ne jamais lier des images depuis des URLs internet. Utiliser les chemins relatifs locaux. Ne PAS encoder en base64 (ça fait 3MB pour rien, ça ralentit tout).

---

## 8. TEST NODE.JS (pour vérifier sans navigateur)

```js
// Tester le flux complet sans navigateur :
const vm=require('vm'), fs=require('fs');
// [créer sandbox avec mocks DOM]
// [charger les scripts]
vm.runInContext('setDifficulty("normal")', ctx);
vm.runInContext('selectCiv("terriens")', ctx);
vm.runInContext('initGame(selectedCiv,selectedAiCivs)', ctx);
vm.runInContext('showAgendaSelModal()', ctx);
vm.runInContext('G.player.agenda=uiAgendaPool[0]; startTurn()', ctx);
vm.runInContext('endTurn()', ctx);
// Doit passer sans erreur
```

---

## 9. INSTRUCTION POUR LA NOUVELLE SESSION

**Objectif unique** : Créer `solar_conquest_mobile.html` qui fonctionne parfaitement.

**Approche recommandée** :
1. Lire `solar_conquest_game.html` pour extraire le bloc `<script>` principal
2. Créer le HTML mobile avec ce bloc inline + override block
3. Tester avec Node.js avant tout
4. Design en cartes Magic pour tous les éléments
5. Ne jamais dire "c'est fait" sans avoir passé le test Node.js

**Priorités absolues** :
1. Le bouton FIN DE TOUR doit toujours être visible
2. Chaque action impossible doit expliquer pourquoi (toast)
3. Le bouton UNDO doit fonctionner
4. Les ressources doivent être lisibles en permanence
5. Le design doit être beau — cartes, pas des listes de texte

**Ce que l'utilisateur attend** :
- Une interface qui ressemble à une vraie app de jeu mobile
- Des cartes visuelles pour chaque technologie, action, nation
- Zéro bandeau d'erreur rouge
- Un jeu jouable de bout en bout (10 tours)
