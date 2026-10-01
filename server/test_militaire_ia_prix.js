/* ============================================================================
   TEST — UNE IA PAIE LES CARTES MILITAIRES AU MÊME PRIX QUE LE JOUEUR (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Rapport de la partie téléphone de Marc (30/09) : « Terriens — Achète Supercroiseur —
   1 AC », lui l'avait payé 3 AC ; Flottes de Chasseurs 1 AC au lieu de 2. Le tacticien proposait
   les cartes militaires comme des technologies (coup `tech` → `buyTech`, qui compte les AC au RANG
   de la carte) au lieu de passer par la porte du joueur (`buyGeneral` : `card.ac`, 1× par tour).
   §1 Supercroiseur : 3 AC prélevés ; refusé avec 2 AC ; jamais proposé avec 2 AC.
   §2 Flottes de Chasseurs : 2 AC.
   §3 Investissements militaires (répétable) : 1 AC, une fois par tour — un second achat le même
      tour est refusé, et le tour suivant il est de nouveau possible (comme pour le joueur).
   §4 contre-épreuve : une vraie technologie de rang 2 coûte toujours 1 AC.
   Usage : node test_militaire_ia_prix.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage(ac) {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('jupiteriens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 5; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  const T = G.ais.find(a => a.civ.id === 'terriens');
  T.res.energy = 30; T.res.materials = 30; T.res.science = 30; T.acLeft = ac;
  return { sb, G, T };
}
const run = (m, code) => vm.runInContext(code, m.sb);
const acheter = (m, id) => run(m, 'appliquerCoup(G.ais.find(a=>a.civ.id==="terriens"),{type:"tech",card:"' + id + '"})');
const propose = (m, id) => run(m, 'coupsPossibles(G.ais.find(a=>a.civ.id==="terriens")).some(c=>c.type==="tech"&&c.card==="' + id + '")');
const possede = (m, id) => m.T.cards.filter(c => c.id === id).length;

console.log('§1 Supercroiseur');
{ const m = montage(5); acheter(m, 'mil3');
  if (possede(m, 'mil3') === 1 && m.T.acLeft === 2) ok('acheté, 3 AC prélevés'); else ko('possédé ' + possede(m, 'mil3') + ', AC restants ' + m.T.acLeft + ' (attendu 2)'); }
{ const m = montage(2);
  if (propose(m, 'mil3')) ko('proposé au tacticien avec 2 AC'); else ok('pas proposé avec 2 AC');
  acheter(m, 'mil3');
  if (possede(m, 'mil3') === 0 && m.T.acLeft === 2) ok('refusé avec 2 AC'); else ko('acheté avec 2 AC (reste ' + m.T.acLeft + ')'); }

console.log('\n§2 Flottes de Chasseurs');
{ const m = montage(5); run(m, 'const _t=G.ais.find(a=>a.civ.id==="terriens"); const _r=CARDS_POOL.find(c=>c.id==="robo2"); _t.cards.push({..._r});');
  acheter(m, 'mil2');
  if (possede(m, 'mil2') === 1 && m.T.acLeft === 3) ok('achetées, 2 AC prélevés'); else ko('possédées ' + possede(m, 'mil2') + ', AC restants ' + m.T.acLeft + ' (attendu 3)'); }

console.log('\n§3 Investissements militaires (répétable, 1× par tour)');
{ const m = montage(5); acheter(m, 'mil_invest');
  const n1 = possede(m, 'mil_invest');
  if (n1 === 1 && m.T.acLeft === 4) ok('premier achat, 1 AC'); else ko('premier achat : ' + n1 + ' carte(s), AC ' + m.T.acLeft);
  if (propose(m, 'mil_invest')) ko('reproposé le même tour'); else ok('pas reproposé le même tour');
  acheter(m, 'mil_invest');
  if (possede(m, 'mil_invest') === 1) ok('second achat du même tour refusé'); else ko('second achat accepté le même tour');
  m.T._milBoughtThisTurn = new Set();
  if (propose(m, 'mil_invest')) ok('de nouveau proposé au tour suivant'); else ko('plus jamais proposé (le joueur, lui, peut le reprendre)'); }

console.log('\n§4 contre-épreuve : technologie de rang 2');
{ const m = montage(5); run(m, 'const _t=G.ais.find(a=>a.civ.id==="terriens"); const _b=CARDS_POOL.find(c=>c.id==="robo2").branch; CARDS_POOL.filter(c=>c.branch===_b&&c.tier===1).forEach(c=>_t.cards.push({...c})); G.branchTiers[_b]=Math.max(G.branchTiers[_b]||0,1);');
  acheter(m, 'robo2');
  if (possede(m, 'robo2') === 1 && m.T.acLeft === 4) ok('Robotisation Avancée : 1 AC'); else ko('robo2 : ' + possede(m, 'robo2') + ' carte(s), AC ' + m.T.acLeft); }

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ cartes militaires des IA : tout est vert');
process.exit(ecarts.length ? 1 : 0);
