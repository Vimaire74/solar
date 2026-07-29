/* Solar Conquest — cœur de jeu côté serveur.
   On NE réécrit PAS les règles : on charge le bloc <script> logique de carte.html
   (SOURCE UNIQUE) dans un contexte Node avec des stubs DOM, et on appelle ses
   fonctions (initGame, doColonize, doAITurn, endTurn…) sur l'état autoritatif G.
   Validé headless le 2026-06-29. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl() {
  return {
    style: new Proxy({}, { get: () => '', set: () => true }), dataset: {}, children: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){}, hasAttribute(){ return false; },
    appendChild(c){ return c; }, removeChild(c){ return c; }, insertBefore(c){ return c; }, replaceChild(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, right:0, bottom:0, width:0, height:0, x:0, y:0 }; },
    focus(){}, blur(){}, click(){}, remove(){}, closest(){ return null; }, contains(){ return false; },
    getContext(){ return { fillRect(){}, clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, drawImage(){} }; },
    setProperty(){}, getPropertyValue(){ return ''; },
    offsetWidth:0, offsetHeight:0, offsetParent:null, clientWidth:300, clientHeight:600,
    scrollWidth:600, scrollHeight:600, scrollLeft:0, scrollTop:0, scrollTo(){},
    innerHTML:'', outerHTML:'', textContent:'', value:'', disabled:false, checked:false,
    parentElement:null, parentNode:null, firstChild:null, nextSibling:null
  };
}

function buildSandbox() {
  // getElementById CACHE les éléments par id : indispensable pour piloter les modales
  // headless (ex. attaque : showAttackModal règle slider.min, confirmAttack le relit).
  const _els = {};
  const document = {
    getElementById(id){ return _els[id] || (_els[id] = makeEl()); }, createElement(){ return makeEl(); },
    createElementNS(){ return makeEl(); }, createTextNode(){ return makeEl(); },
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    body: makeEl(), documentElement: makeEl(), head: makeEl(),
    addEventListener(){}, removeEventListener(){}, createComment(){ return makeEl(); }
  };
  const navigator = { serviceWorker:{ register(){ return Promise.resolve(); }, addEventListener(){} }, userAgent:'node', language:'fr' };
  const localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){}, clear(){} };
  const sb = {
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout(){ return 0; }, clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
    requestAnimationFrame(){ return 0; }, cancelAnimationFrame(){},
    document, navigator, localStorage,
    matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){} }; },
    alert(){}, confirm(){ return true; }, prompt(){ return null; },
    getComputedStyle(){ return { getPropertyValue(){ return ''; } }; }
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  sb.window.addEventListener = function(){}; sb.window.removeEventListener = function(){};
  return sb;
}

// Charge UNIQUEMENT le bloc logique du jeu (le plus gros <script> sans src).
function loadLogic(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  blocks.sort((a, b) => b.length - a.length);
  const logic = blocks[0]; // le bloc logique (350 Ko)
  const sb = buildSandbox();
  vm.createContext(sb);
  vm.runInContext(logic, sb, { timeout: 8000 });
  // exposer l'état G (déclaré en `let`, donc non global) via un getter
  vm.runInContext("Object.defineProperty(globalThis,'__G',{get:()=>G,set:v=>{G=v},configurable:true});", sb);
  // Neutraliser les fonctions client-only qui font un JSON.stringify de l'état :
  // - scSaveGame (sauvegarde localStorage), - saveUndo (pile d'annulation locale).
  // Toutes deux inutiles côté serveur (autorité), et elles plantent sur les références
  // circulaires _enemy des vues de guerre. L'annulation n'a pas de sens en multijoueur.
  vm.runInContext("if(typeof scSaveGame==='function'){scSaveGame=function(){};}", sb);
  vm.runInContext("if(typeof saveUndo==='function'){saveUndo=function(){};}", sb);
  return sb;
}

// Dispatch d'une action client -> fonction du jeu. À compléter au fil des actions.
// _postAction : en headless les modales sont des stubs DOM → on applique nous-mêmes leurs suites :
// - dismissDiscovery() : applique la tuile Découverte en attente après une colonisation ;
// - _scHideConfirm() : désarme le popup Valider/Annuler (sinon _scGuard bloque l'action suivante).
function _postAction(sb){
  try { if (typeof sb.dismissDiscovery === 'function') sb.dismissDiscovery(); } catch (e) {}
  try { if (typeof sb._scHideConfirm === 'function') sb._scHideConfirm(); } catch (e) {}
  // FINALISER l'action (équivalent de « Valider » en solo) : vider la pile d'annulation pour
  // qu'aucun undo tardif ne défasse l'action, et lever tout blocage de confirmation.
  try { vm.runInContext('undoStack=[];_scConfirmArmed=false;', sb); } catch (e) {}
}
const ACTIONS = {
  colonize: (sb, a) => { sb.doColonize(a.node); _postAction(sb); },
  route:    (sb, a) => {
    const before = sb.__G.player.routes.length;
    sb.doEstablishRoute(a.from, a.to);
    // le choix « déployer un jeton » est une modale en solo → on applique la décision envoyée par le client
    if (sb.__G.player.routes.length > before && typeof sb.confirmRouteToken === 'function') sb.confirmRouteToken(!!a.token);
    _postAction(sb);
  },
  upgrade:  (sb, a) => { sb.doUpgrade(a.node); _postAction(sb); },
  buyTech:  (sb, a) => { sb.buyTech(a.card); _postAction(sb); },
  raid:     (sb, a) => { if (a.target && typeof sb.doRaidTarget === 'function') sb.doRaidTarget(a.target, a.node || null); else sb.doRaid(); _postAction(sb); },
  attack:   (sb, a) => {
    // Assaut du PLATEAU : on résout avec le MÊME modèle que la modale de combat (resolveWarCombat) — jetons
    // engagés vs défense affichée, PAS l'ancien confirmAttack (coût de trajet). Ainsi l'affichage ne ment plus.
    const G = sb.__G, p = G.player, node = a.node;
    if (!node) { _postAction(sb); return; }
    const owner = (typeof sb.getNodeOwnerAI === 'function') ? sb.getNodeOwnerAI(node)
                : (G.ais || []).find(x => x.colonies.some(c => c.nodeId === node));
    if (!owner) { _postAction(sb); return; }
    // Guerre avec le propriétaire (déclarée si besoin) + cible de capture.
    let war = (G.wars || []).find(w => w.a === owner.civ.id || w.b === owner.civ.id);
    if (!war && typeof sb.declareWar === 'function') {
      try { sb.declareWar('Assaut sur ' + node + ' !', 'player', owner.civ.id); } catch (e) {}
      war = (G.wars || []).find(w => w.a === owner.civ.id || w.b === owner.civ.id);
    }
    G.warWith = owner.civ.id;
    if (war) { war.live = true; war.justDeclared = false; war.turnsLeft = 99; }
    vm.runInContext('_warAttackColonyTarget=' + JSON.stringify(node), sb);
    // Défense IA DÉTERMINISTE = ce qu'elle peut payer (exactement ce que la modale affiche comme défense utilisable).
    G._aiWarCommitted = Math.max(0, Math.min(owner.forceTokens || 0, owner.res.materials || 0, owner.res.energy || 0));
    if (p && (p.acLeft || 0) > 0) p.acLeft -= 1; // l'assaut coûte 1 AC
    p._attacksThisTurn = (p._attacksThisTurn || 0) + 1;
    const tokens = Math.max(1, parseInt(a.tokens) || 1);
    try { if (typeof sb.resolveWarCombat === 'function') sb.resolveWarCombat(tokens); } catch (e) {}
    if (war) war.aiRecaptureTarget = null; // pas de reprise auto invisible (défense de fin de tour est routée)
    _postAction(sb);
  },
  power:    (sb)    => {
    const G = sb.__G, p = G.player;
    if (p && p.civ && p.civ.id === 'jupiteriens') {
      // Forge Orbitale : choisir une lune joviène Nv.1 connectée (pas de modale headless) → repli auto sur la 1re.
      const el = (p.colonies || []).filter(c => ['io', 'europe', 'ganymede', 'callisto'].includes(c.nodeId) && c.level === 1 && c.connected);
      if (el.length && typeof sb._forgeUpgrade === 'function') sb._forgeUpgrade(el[0].nodeId);
      else if (typeof sb.useAbility === 'function') sb.useAbility(); // journalise « aucune lune améliorable »
    } else if (typeof sb.useAbility === 'function') sb.useAbility();
    _postAction(sb);
  },
  // Appel générique SUR LISTE BLANCHE de TOUTES les fonctions d'action du jeu (cartes civiques/générales
  // dont gouvernement & Extraction d'He3, calmer une tension, Forge Orbitale, accord commercial…).
  // Le moteur re-valide tout (coûts, AC, déjà pris…). C'est le pont unique : toute nouvelle action du
  // jeu passe par ici sans modif serveur, tant que sa fonction est dans la liste.
  call:     (sb, a) => {
    const OK = ['buyGeneral', 'buyMarket', 'applyCalmTension', '_forgeUpgrade', 'proposeAccord', 'doRaid', 'doUpgrade', 'buyTech'];
    if (OK.indexOf(a.fn) !== -1 && typeof sb[a.fn] === 'function') sb[a.fn].apply(null, a.args || []);
    _postAction(sb);
  },
  // Gestion des jetons d'une route existante (le client envoie la route, pas l'index local)
  routeToken: (sb, a) => {
    const p = sb.__G.player;
    const idx = p.routes.findIndex(r => (r.from === a.from && r.to === a.to) || (r.from === a.to && r.to === a.from));
    if (idx >= 0) {
      vm.runInContext('_routeManageIdx=' + idx, sb);
      if (a.deploy) sb.routeManageDeploy(); else sb.routeManageRecall();
    }
    _postAction(sb);
  },
  endTurn:  (sb)    => (sb._il ? sb.passTurnIL && sb.passTurnIL() : sb.endTurn && sb.endTurn())
};

class Engine {
  constructor(htmlPath) { this.sb = loadLogic(htmlPath); }
  newGame(humanCiv, aiCivs) { this.sb.initGame(humanCiv, aiCivs); return this.state(); }
  state() { return this.sb.__G; }            // état brut (sérialisation propre à venir)
  apply(action) { const fn = ACTIONS[action.type]; if (!fn) throw new Error('action inconnue: ' + action.type); fn(this.sb, action); return this.state(); }
  aiAction(aiIndex) { this.sb.doAITurn(this.sb.__G.ais[aiIndex || 0], true); return this.state(); }
}

module.exports = { Engine, loadLogic };
