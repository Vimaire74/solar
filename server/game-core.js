/* Solar Conquest — cœur de jeu côté serveur.
   On NE réécrit PAS les règles : on charge le bloc <script> logique de carte.html
   (SOURCE UNIQUE) dans un contexte Node avec des stubs DOM, et on appelle ses
   fonctions (initGame, doColonize, doAITurn, endTurn…) sur l'état autoritatif G.
   Validé headless le 2026-06-29. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── DOM ENREGISTREUR (option de TEST, cf. server/playthrough.js) ────────────────────────────────
// Quand un « recorder » est fourni, chaque ouverture/fermeture de fenêtre et chaque texte affiché sont
// consignés. Sans recorder, comportement identique à avant (stubs muets) : zéro impact en production.
let _REC = null;
function setRecorder(r){ _REC = r || null; }
function makeEl(id) {
  const el = {
    _id: id || null,
    style: new Proxy({}, { get: () => '', set: () => true }), dataset: {}, children: [],
    classList: {
      add(c){ if(_REC && c==='hidden' && el._id) _REC.close(el._id); },
      remove(c){ if(_REC && c==='hidden' && el._id) _REC.open(el._id, el); },
      toggle(){}, contains(){ return false; }
    },
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
  return el;
}

function buildSandbox() {
  // getElementById CACHE les éléments par id : indispensable pour piloter les modales
  // headless (ex. attaque : showAttackModal règle slider.min, confirmAttack le relit).
  const _els = {};
  const document = {
    getElementById(id){ return _els[id] || (_els[id] = makeEl(id)); }, createElement(){ return makeEl(); },
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

/* Fonctions du jeu que le SERVEUR appelle. Si l'une manque après chargement, c'est qu'elle a été
   écrite (ou déplacée) dans un bloc <script> d'interface, hors du moteur — et le serveur l'ignore
   SILENCIEUSEMENT. Ça s'est produit deux fois, avec des conséquences invisibles en test :
     · `uiFillIncome` (revenu net) : le correctif était du code mort pendant une semaine ;
     · `doRaidTarget` (raid ciblé)  : le serveur retombait toujours sur un raid sans cible.
   On vérifie donc explicitement, et on échoue BRUYAMMENT. */
const FONCTIONS_MOTEUR_REQUISES = [
  'initGame', 'startTurn', 'endTurn', 'runEndOfRound', 'doMaintenance', 'doRevenues', 'advancePirates',
  'doColonize', 'doEstablishRoute', 'doUpgrade', 'buyTech', 'useAbility', 'doRaid', 'doRaidTarget',
  'resolveWarCombat', 'declareWar', 'showWarModal', 'getNodeOwnerAI', 'doAITurn',
  /* ⚠️ AJOUTÉES LE 2026-08-23 avec la réparation des conquêtes. `ACTIONS.attack` délègue désormais
     à `playerAssaultColony` et désigne le défenseur avec `defenseurPrincipal` — les deux seules
     fonctions qui traitent les humains, les IA et la cohabitation de la même façon. Les déclarer
     ici, c'est garantir qu'un renommage futur soit signalé au démarrage plutôt que de faire
     retomber l'assaut en silence, comme `getNodeOwnerAI` l'a fait pendant des semaines. */
  'defenseurPrincipal', 'playerAssaultColony', 'stAssautJoueurChoisi', '_warBetween', 'defenseIA',
  'setDecisionSink', 'resolveDecision', 'refreshWarViews', 'scSetG', 'scDeserialize', 'rehydrateState',
  'showAgendaSelModal', 'confirmRouteToken', 'dismissDiscovery', 'cruiserAvailable', 'cruiserAfford',
  'routeManageDeploy', 'routeManageRecall', '_forgeUpgrade',
  /* Bloc @flux — la machine à états. Elle vit dans `moteur.js` (et non côté serveur) parce que le
     déroulement d'une partie est une RÈGLE : le solo hors ligne la fait tourner aussi. Si l'une de
     ces fonctions disparaît, le serveur perd le flux SANS S'EN APERCEVOIR — d'où ce contrôle. */
  'fluxInit', 'fluxAller', 'fluxEtat', 'fluxActiver', 'fluxActiverTous', 'fluxARepondu',
  'fluxResteARepondre', 'fluxPeutAgir', 'fluxActionPermise', 'fluxDiagnostiquer', 'fluxArguments',
  'fluxDeclarer', 'fluxTable', 'fluxNumeros', 'fluxTypes', 'fluxDonnees',
  // Sans elle, le serveur ne verrait qu'UNE question alors que le moteur en pose plusieurs :
  // les autres joueurs attendraient un message qui n'arriverait jamais. Mieux vaut refuser de démarrer.
  'fluxQuestionsEnAttente',
  'defenseIA',   // sans elle, le serveur retomberait sur l'ancienne formule sans que personne ne le voie
  /* Assaut du joueur : le SERVEUR délègue à ces fonctions pour que la défense d'un humain lui soit
     réellement demandée. Si elles disparaissaient, on retomberait dans « l'IA joue à sa place ». */
  'stAssautJoueurChoisi', 'stAssautJoueurResoudre',
  /* Flux des guerres et fin de tour, migrés sur la machine (les anciennes `processAllWars` /
     `finishTurn` vivaient dans des fermetures et étaient donc INVISIBLES d'ici — impossible de
     vérifier qu'elles existaient). Maintenant qu'elles sont nommées, on peut l'exiger. */
  'stGuerres', 'guerreEtape', 'guerreSuivante', 'guerreCourante', 'guerresPreparer',
  'stFinDeTour', 'stBilanDeTour', 'stDysonPuisGuerres',
  'fluxOublierVolatiles', 'fluxDetteDecisions', 'stInvestDemander'
];

/* Charge le MOTEUR du jeu — c'est-à-dire `moteur.js`, un vrai fichier.
   ⚠️ HISTORIQUE, à ne pas refaire : les règles étaient collées dans index.html et il fallait les en
   EXTRAIRE (d'abord « le plus gros bloc <script> », puis une sentinelle `@moteur`). Les deux étaient
   des devinettes, et elles ont coûté deux bugs majeurs — `uiFillIncome` et `doRaidTarget` vivaient
   hors du bloc extrait, donc invisibles pour le serveur. Il n'y a plus rien à deviner : on lit le
   fichier des règles.
   L'argument reste le chemin de l'INDEX (tous les appelants le passent) ; `moteur.js` est son voisin. */
function loadLogic(htmlPath) {
  const dossier = path.dirname(htmlPath);
  const moteurPath = path.join(dossier, 'moteur.js');
  let logic;
  try { logic = fs.readFileSync(moteurPath, 'utf8'); }
  catch (e) {
    throw new Error('MOTEUR INTROUVABLE : ' + moteurPath + '\n'
      + 'Les règles du jeu vivent dans `moteur.js`, chargé par index.html via <script src>.\n'
      + 'Si ce fichier manque, le serveur ne peut pas faire tourner le jeu.');
  }
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
  /* CONTRÔLE : toutes les fonctions dont le serveur a besoin sont-elles bien DANS le moteur ?
     Une absence ici signifie que la fonction vit dans un bloc d'interface : le serveur ne
     l'exécutera jamais et se rabattra en silence sur un comportement dégradé. */
  const manquantes = FONCTIONS_MOTEUR_REQUISES.filter(n => typeof sb[n] !== 'function');
  if (manquantes.length) {
    throw new Error('MOTEUR INCOMPLET — ces fonctions sont absentes du bloc @moteur d\'index.html :\n  · ' +
      manquantes.join('\n  · ') +
      '\nElles vivent probablement dans un bloc <script> d\'interface. Déplace-les dans le bloc @moteur.');
  }
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
  /* Le raid EXIGE une cible explicite. Le repli `doRaid()` frappait `G.ais[0]` — une nation
     arbitraire, jamais désignée par le joueur : en multijoueur, on pillait un joueur au hasard. */
  raid:     (sb, a) => {
    if (a.target && typeof sb.doRaidTarget === 'function') sb.doRaidTarget(a.target, a.node || null);
    else if (typeof sb.doRaid === 'function') sb.doRaid();   // ouvre la demande de cible (décision)
    _postAction(sb);
  },
  attack:   (sb, a) => {
    // Assaut du PLATEAU : on résout avec le MÊME modèle que la modale de combat (resolveWarCombat) — jetons
    // engagés vs défense affichée, PAS l'ancien confirmAttack (coût de trajet). Ainsi l'affichage ne ment plus.
    const G = sb.__G, p = G.player, node = a.node;
    if (!node) { _postAction(sb); return; }
    /* ═══════ ATTAQUER UN JOUEUR HUMAIN N'A JAMAIS PU FONCTIONNER ═══════
       ⚠️ DEUX DÉFAUTS ICI, ET LE MÊME MAL : ce bloc était une SECONDE implémentation de l'assaut,
       écrite quand seules les IA pouvaient être attaquées. Marc et Laurent, partie 140A du 23/08 :
       « on peut pas attaquer quelqu'un en direct, ça ne fait rien ».

       1. `getNodeOwnerAI` ne rend un propriétaire QUE s'il est tenu par l'ordinateur
          (`o._isAI !== false`). Contre une colonie humaine elle rend `null`, et la ligne suivante
          sortait EN SILENCE : pas d'AC, pas de ressources, pas de message, pas de guerre. Le
          défenseur n'était évidemment jamais prévenu.
       2. La guerre était cherchée par `w.a === owner || w.b === owner` — N'IMPORTE QUELLE guerre
          impliquant le propriétaire, pas la MIENNE. Au tour 10 il existait déjà une guerre
          Jupitériens ↔ Ceinturiens : l'assaut de Marc contre le Jupitérien a repris CETTE guerre-là,
          posé `G.warWith` dessus, et n'a jamais déclaré la sienne.

       ON DÉLÈGUE DONC AU MOTEUR. `playerAssaultColony` sait déjà tout faire correctement, et pour
       tout le monde : `defenseurPrincipal` désigne le vrai défenseur (humain, IA, ou les DEUX en
       cohabitation extra-solaire), `declarerGuerre(attaquant, cible, …)` ne connaît que deux nations
       nommées, et la cible est rangée dans `G._flux.donnees` — donc sérialisable. Le serveur ne
       recalcule plus rien : il appelle. */
    const owner = (typeof sb.defenseurPrincipal === 'function') ? sb.defenseurPrincipal(node, p) : null;
    if (!owner || owner === p) {
      try { sb.addLog('⚠️ Assaut impossible sur ' + node + ' : aucune nation adverse n\'y défend.', 'red'); } catch (e) {}
      _postAction(sb); return;
    }
    /* La fin de `playerAssaultColony` ouvre la modale SOLO. Les éléments du bac à sable l'absorbent
       sans broncher, mais tout l'état utile est posé AVANT ces lignes : un échec éventuel de la
       partie affichage ne peut donc pas laisser l'assaut à moitié fait. */
    try { sb.playerAssaultColony(node, owner, p); } catch (e) {}
    const war = (typeof sb._warBetween === 'function') ? sb._warBetween(p.civ.id, owner.civ.id) : null;
    /* ══ QUI DÉCIDE DE LA DÉFENSE ? ══════════════════════════════════════════════════════════
       ⚠️ CORRIGÉ LE 2026-08-07 — c'était LE défaut le plus grave du multijoueur.
       Ce bloc calculait `G._aiWarCommitted = min(jetons, matériaux, énergie)` et appelait
       `resolveWarCombat` DIRECTEMENT : la défense était donc décidée par une formule **même quand
       le défenseur était un humain connecté**. Marc et son ami l'ont vécu dans les deux sens :
       « j'ai rien pu choisir ».
       Le pire : le moteur SAIT router cette décision (`stAssautJoueurChoisi` → `_emitDecision
       ('defense', défenseur, …)`), et ce chemin fonctionne — il n'était simplement JAMAIS emprunté,
       parce que le serveur avait sa PROPRE implémentation de l'assaut. Encore deux implémentations
       de la même chose, et c'est la mauvaise qui tournait en ligne.
       MAINTENANT on délègue au moteur, qui décide à qui poser la question :
         · défenseur HUMAIN → une vraie fenêtre de défense lui est envoyée (jetons + supercroiseur),
           et le combat n'est résolu QU'APRÈS sa réponse ;
         · défenseur IA     → défense déterministe, comme avant.
       La fenêtre de résultat est produite par `stAssautJoueurResoudre` (moteur), donc identique
       dans les deux cas et pour les deux camps.
       ══════════════════════════════════════════════════════════════════════════════════════ */
    const defenseurHumain = !!(owner && owner._isAI === false);
    if (!defenseurHumain) {
      /* Défense d'une nation tenue par l'ordinateur : règle unique, définie dans le MOTEUR
         (`defenseIA`) — elle tient compte de la menace, du niveau de la colonie, et de ce que le
         Réseau Orbital lui apprend. Le serveur ne recalcule rien : il appelle. Deux implémentations
         d'une même règle finissent toujours par diverger, on l'a déjà payé plusieurs fois ici. */
      G._aiWarCommitted = (typeof sb.defenseIA === 'function')
        ? sb.defenseIA(owner, p, node)
        : Math.max(0, Math.min(owner.forceTokens || 0, owner.res.materials || 0, owner.res.energy || 0));
    }
    if (p && (p.acLeft || 0) > 0) p.acLeft -= 1; // l'assaut coûte 1 AC
    /* `_attacksThisTurn` n'est PLUS incrémenté ici : `playerAssaultColony` le fait déjà. Le compter
       deux fois faisait croire au moteur que le joueur avait attaqué deux fois — ce qui pèse
       maintenant sur la rétrocession d'initiative (qui a frappé le plus ce tour). */
    const tokens = Math.max(1, parseInt(a.tokens) || 1);
    // Supercroiseur : le drapeau est posé par la modale SOLO ; sur le chemin serveur il doit venir
    // de l'action, sinon il est silencieusement ignoré (le joueur le déploie et rien ne se passe).
    try { G._cruiserDeployed = !!a.cruiser && sb.cruiserAvailable(p) && sb.cruiserAfford(p); } catch (e) { G._cruiserDeployed = false; }
    /* On passe par le flux NOMMÉ du moteur : il range la cible et l'ennemi dans `G._flux.donnees`
       (donc sérialisables), émet la décision de défense si le défenseur est humain, et n'appelle
       `resolveWarCombat` qu'ensuite. */
    try {
      const d = sb.fluxDonnees();
      d.assautCible = node;
      d.assautEnnemi = owner.civ.id;
      sb.stAssautJoueurChoisi(tokens);
    } catch (e) {
      // Filet : si le flux nommé échoue, on ne laisse pas la partie sans combat.
      try { if (typeof sb.resolveWarCombat === 'function') sb.resolveWarCombat(tokens); } catch (e2) {}
    }
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

module.exports = { Engine, loadLogic, setRecorder };
