/* ============================================================================
   TEST — NATION DOMINANTE / SUPRÊME : UNE FOIS PAR COUPLE, DÈS LE TOUR 6 (Marc, 21/09)
   ----------------------------------------------------------------------------
   « Nation dominante (4 colonies connectées d'avance) +3 ; nation suprême (6 d'avance) +6 :
   c'est une seule fois par partie. À partir du tour 6. » Choix de Marc : par couple, les deux
   paliers — +3 la première fois à 4 d'avance, +6 la première fois à 6 d'avance.
   Avant : +3/+6 à CHAQUE tour tant que l'écart durait.
   Et : l'événement « Accords diplomatiques » ne baisse plus la tension de −5 (doublon retiré) ;
   seul un pacte signé la remet à 0.
   Usage : node test_tension_dominance.js
   ========================================================================== */
'use strict';
const path = require('path'), vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function partie(tour) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G; G.turn = tour; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) { n.routes = []; n.cards = []; }
  const N = vm.runInContext('NODES', sb);
  const libres = Object.keys(N).filter(id => !N[id].decorative && !N[id].noColonize && N[id].type !== 'orbital_station');
  return { sb, G, A: G.ais[0], B: G.ais[1], P: G.player, libres };
}
/* A : 1 colonie connectée ; B : 1 + n colonies connectées ; le joueur : 1 non comptée. */
/* A seule sur Éris, loin de tout ; B dans le système intérieur ; le joueur sur Titan. */
const LOIN_B = ['phobos', 'deimos', 'ceres', 'vesta', 'io', 'europe', 'ganymede', 'callisto'];
function ecart(m, n) {
  m.A.colonies = [{ nodeId: 'eris', level: 1, connected: true }];
  m.B.colonies = LOIN_B.slice(0, 1 + n).map(id => ({ nodeId: id, level: 1, connected: true }));
  m.P.colonies = [{ nodeId: 'titan', level: 1, connected: true }];
}
const tens = (m, x, y) => m.sb.getTens(x.civ.id, y.civ.id) || 0;
/* On n'isole que la dominance : les autres griefs sont neutralisés (pas de routes, pas de blocage
   possible sur des nœuds dispersés). On lit donc la variation brute d'`updateTension`. */
const tour = (m, t) => { m.G.turn = t; const av = tens(m, m.A, m.B); m.sb.updateTension(); return tens(m, m.A, m.B) - av; };

console.log('§1 Avant le tour 6 : rien, même à 6 colonies d\'avance');
{ const m = partie(5); ecart(m, 6); const d = tour(m, 5); if (d <= 0) ok('tour 5 : ' + d); else ko('dominance facturée au tour 5 : +' + d); }

console.log('§2 4 d\'avance au tour 6 : +3 une fois, puis rien');
{
  const m = partie(6); ecart(m, 4);
  const d6 = tour(m, 6), d7 = tour(m, 7), d8 = tour(m, 8);
  note('tour 6 : ' + d6 + ' · tour 7 : ' + d7 + ' · tour 8 : ' + d8);
  if (d6 === 3) ok('+3 au tour 6'); else ko('tour 6 : ' + d6 + ' au lieu de +3');
  if (d7 <= 0 && d8 <= 0) ok('rien ensuite (l\'érosion de −1 reprend)'); else ko('refacturé : ' + d7 + ' / ' + d8);
  /* L'écart passe à 6 : le second palier tombe, une fois. */
  ecart(m, 6); const d9 = tour(m, 9), d10 = tour(m, 10);
  if (d9 === 6 && d10 <= 0) ok('passage à 6 d\'avance : +6 une fois, puis rien'); else ko('palier 6 : ' + d9 + ' puis ' + d10);
}

console.log('§3 6 d\'avance d\'emblée : les deux paliers tombent ensemble (+9)');
{ const m = partie(6); ecart(m, 6); const d = tour(m, 6); if (d === 9) ok('+9'); else ko(d + ' au lieu de +9'); }

console.log('§4 La nation en avance ne reçoit rien');
{ const m = partie(6); ecart(m, 6); m.sb.updateTension(); if (tens(m, m.B, m.A) === 0) ok('B → A : 0'); else ko('B → A : ' + tens(m, m.B, m.A)); }

console.log('§5 Accords diplomatiques : plus de −5 automatique');
{
  const m = partie(6);
  m.sb.setTens(m.A.civ.id, m.B.civ.id, 7); m.sb.setTens(m.P.civ.id, m.A.civ.id, 7); m.sb.setTens(m.A.civ.id, m.P.civ.id, 7);
  vm.runInContext('_evDiploResolve(G)', m.sb);
  if (tens(m, m.A, m.B) === 7 && tens(m, m.P, m.A) === 7) ok('tensions inchangées (7 / 7)'); else ko('tension modifiée : ' + tens(m, m.A, m.B) + ' / ' + tens(m, m.P, m.A));
  vm.runInContext('_evDiploSel={}', m.sb);
  try { vm.runInContext('_evDiploConfirm("' + m.P.civ.id + '")', m.sb); } catch (e) { note('_evDiploConfirm : ' + e.message.split('\n')[0]); }
  if (tens(m, m.P, m.A) === 7 && tens(m, m.A, m.P) === 7) ok('aucun pacte signé : toujours 7'); else ko('sans pacte : ' + tens(m, m.P, m.A) + ' / ' + tens(m, m.A, m.P));
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_tension_dominance : +3 / +6 une fois par couple dès le tour 6 ; plus de −5 aux Accords diplomatiques.');

/* Accords commerciaux : −2 entre TOUS les couples, IA comprises (Marc, 21/09). */
{
  const m = partie(6);
  for (const [x, y] of [[m.A, m.B], [m.B, m.A], [m.P, m.A], [m.A, m.P]]) m.sb.setTens(x.civ.id, y.civ.id, 5);
  vm.runInContext('_evCommResolve(G)', m.sb);
  const v = [tens(m, m.A, m.B), tens(m, m.B, m.A), tens(m, m.P, m.A), tens(m, m.A, m.P)];
  if (v.every(x => x === 3)) console.log('   ✔ Accords commerciaux : −2 partout, IA entre elles comprises (' + v.join('/') + ')');
  else { console.log('   ❌ Accords commerciaux : ' + v.join('/') + ' au lieu de 3/3/3/3'); process.exit(1); }
}
