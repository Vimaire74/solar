/* ============================================================================
   TEST — L'ORDINATEUR NE CONSTRUIT PLUS DE ROUTES QUI TOMBENT OU NE RAPPORTENT RIEN
   ----------------------------------------------------------------------------
   Partie BCE3 (Marc, 21/09) : « ces routes faut s'en occuper, il perd tellement d'actions ».
     · Tours 1 à 3 : les Martiens relient Titan par Phobos→Cérès→Europe→Titan. Le tronçon
       Cérès→Europe n'a AUCUNE extrémité à eux : `tomberRoutesOrphelines` le retire au tour
       suivant, le réflexe « relier une colonie isolée » (`tryRoute`) le repose. 1 action et
       1 jeton par tour, pour rien, trois tours de suite.
     · Tour 10 : cinq routes vers des colonies étrangères (Encelade→Titan, Triton→Pluton…) :
       0 VP chacune (`routeCompte`), entretien payé quand même. Le tacticien les proposait
       (`coupsPossibles` listait toute liaison adjacente) et, faute de mieux, les jouait.

   RÈGLES VERROUILLÉES ICI :
     1. `tryRoute` ne pose jamais un tronçon sans extrémité à soi (il tomberait au tour suivant) ;
        un chemin qui en exige un est écarté entier ;
     2. `coupsPossibles` ne propose plus de route vers la colonie d'une autre nation ;
     3. CONTRE-ÉPREUVE : une route vers un nœud LIBRE voisin reste proposée (+1 VP, extension) ;
     4. CONTRE-ÉPREUVE : une colonie à deux sauts, par un relais libre, se relie toujours
        (Phobos→Cérès→Europe : chaque tronçon touche une colonie à soi).
   Usage : node test_routes_ia_utiles.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage(colonieIsolee) {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['martiens']);
  const G = sb.__G; G.turn = 2; G.phase = 'actions';
  const mar = G.ais[0]; mar._isAI = true;
  mar.colonies = [{ nodeId: 'phobos', level: 2, connected: true }, { nodeId: colonieIsolee, level: 1, connected: false }];
  mar.routes = []; mar.forceTokens = 4; mar.acLeft = 3; mar.acMax = 3;
  mar.res = { energy: 8, materials: 8, science: 4, morale: 6 };
  sb.updateConnections(mar);
  return { sb, G, mar };
}
const propre = (m) => m.mar.routes.filter(r => !m.mar.colonies.some(c => c.nodeId === r.from || c.nodeId === r.to));

console.log('1. Titan à trois sauts : aucun tronçon orphelin posé');
{ const m = montage('titan');
  for (let i = 0; i < 3; i++) { m.G.turn = 2 + i; m.mar.acLeft = 3; try { m.sb.doAITurn(m.mar, {}); } catch (e) { ko('doAITurn : ' + e.message); break; }
    const orph = propre(m);
    if (orph.length) { ko('tour ' + m.G.turn + ' : route sans extrémité à soi posée — ' + orph.map(r => r.from + '→' + r.to).join(', ')); break; }
    vm.runInContext('tomberRoutesOrphelines()', m.sb); }
  if (!ecarts.length) ok('trois tours joués, aucune route qui tomberait au tour suivant'); }

console.log('2. Le tacticien ne propose plus de route vers une colonie étrangère');
{ const m = montage('titan');
  const jup = m.G.player; jup.colonies.push({ nodeId: 'ceres', level: 1, connected: true });
  const coups = m.sb.coupsPossibles(m.mar).filter(c => c.type === 'route');
  const etr = coups.filter(c => c.to === 'ceres' || c.from === 'ceres');
  if (!etr.length) ok('aucune route vers Cérès (jupitérienne) parmi ' + coups.length + ' routes proposées');
  else ko('route(s) vers une colonie étrangère proposée(s) : ' + etr.map(c => c.from + '→' + c.to).join(', '));
  if (coups.some(c => c.from === 'phobos' && c.to === 'vesta')) ok('CONTRE-ÉPREUVE : Phobos→Vesta (libre) reste proposée');
  else ko('la route vers un nœud libre a disparu aussi'); }

console.log('3. CONTRE-ÉPREUVE — Europe à deux sauts se relie par Cérès (libre)');
{ const m = montage('europe');
  m.sb.doAITurn(m.mar, {});
  const r = m.mar.routes.map(r => r.from + '→' + r.to);
  if (r.some(x => /phobos→ceres|ceres→phobos/.test(x))) ok('premier tronçon posé : ' + r.join(', '));
  else ko('la liaison légitime par un relais libre n\'est plus construite (routes : ' + (r.join(', ') || 'aucune') + ')'); }

console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert'));
process.exit(ecarts.length ? 1 : 0);
