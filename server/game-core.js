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
  const document = {
    getElementById(){ return makeEl(); }, createElement(){ return makeEl(); },
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
  return sb;
}

// Dispatch d'une action client -> fonction du jeu. À compléter au fil des actions.
const ACTIONS = {
  colonize: (sb, a) => sb.doColonize(a.node),
  route:    (sb, a) => sb.doEstablishRoute(a.from, a.to),
  buyTech:  (sb, a) => sb.buyTech(a.card),
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
