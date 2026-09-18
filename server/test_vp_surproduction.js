/* ============================================================================
   TEST — SURPRODUIRE RAPPORTE : +1 VP PAR RESSOURCE AU PLAFOND, PAR TOUR, 4 AU PLUS
   ----------------------------------------------------------------------------
   RÈGLE (Marc, 18/09) : « chaque nation gagne +1 VP par tour à chaque tour où elle surproduit dans
   l'une des 4 ressources, donc maximum 4 VP par tour. Dès le tour 1. »
   Surproduire = dépasser le plafond au moment où l'excédent est perdu, la frontière de tour
   (`continueAfterEOT` → `surproductionVP` → `enforceCaps`). Le moral est plafonné à la source
   (`doRevenues`), qui pose un drapeau lu ici.
   Usage : node test_vp_surproduction.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(tour) {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = tour || 3; G.phase = 'actions';
  const jup = G.player;
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup].concat(G.ais)) { n.res.morale = 5; n.res.energy = 3; n.res.materials = 3; n.res.science = 3; n.tempVP = 0; n._vpDetail = []; n.rpt = n.rpt || {}; }
  sb.setDecisionSink(() => {});
  return { sb, G, jup };
}
const vp = n => n.tempVP || 0;
const motifs = n => (n._vpDetail || []).map(e => e.raison);
const lignes = m => (m.G.log || []).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, ''));

console.log('§1 Deux ressources au-dessus du plafond : +2 VP, et l\'excédent reste perdu');
{
  const m = montage(3);
  m.jup.res.energy = 15; m.jup.res.materials = 25;      // plafonds 12 et 20
  vm.runInContext('surproductionVP(); enforceCaps();', m.sb);
  note('VP +' + vp(m.jup) + ' · motifs ' + JSON.stringify(motifs(m.jup)) + ' · stock ' + m.jup.res.energy + '⚡ ' + m.jup.res.materials + '🪨');
  if (vp(m.jup) === 2) ok('+2 VP'); else ko('+' + vp(m.jup) + ' VP au lieu de +2');
  if (/Surproduction/.test(motifs(m.jup)[0] || '')) ok('le motif dit « Surproduction »'); else ko('motif : ' + motifs(m.jup));
  if (m.jup.res.energy === 12 && m.jup.res.materials === 20) ok('l\'excédent est bien écrêté (12⚡ 20🪨)'); else ko('pas écrêté');
  const l = lignes(m).find(x => /Surproduction/.test(x));
  if (l) ok('journal : « ' + l.slice(0, 80) + ' »'); else ko('rien au journal');
}

console.log('§2 Rien au plafond : rien');
{
  const m = montage(3);
  vm.runInContext('surproductionVP(); enforceCaps();', m.sb);
  if (vp(m.jup) === 0) ok('0 VP'); else ko('+' + vp(m.jup) + ' VP sans surproduction');
}

console.log('§3 Les quatre ressources, moral compris (plafonné à la source par doRevenues) : 4 VP, pas plus');
{
  const m = montage(4);
  m.jup.res.energy = 12; m.jup.res.materials = 20; m.jup.res.science = 10; m.jup.res.morale = 9;
  m.jup.rpt.energy = 3; m.jup.rpt.materials = 3; m.jup.rpt.science = 3; m.jup.rpt.morale = 2;
  vm.runInContext('doRevenues();', m.sb);
  note('drapeau moral : ' + m.jup._surprodMorale + ' (tour ' + m.G.turn + ') · moral ' + m.jup.res.morale);
  vm.runInContext('surproductionVP(); enforceCaps();', m.sb);
  note('VP +' + vp(m.jup) + ' · ' + JSON.stringify(motifs(m.jup)));
  if (vp(m.jup) === 4) ok('4 VP, le maximum'); else ko('+' + vp(m.jup) + ' au lieu de 4');
  if (m.jup._surprodMorale === 4) ok('le débordement de moral est bien vu par doRevenues'); else ko('drapeau moral absent');
}

console.log('§3bis Moral : seulement au-delà de 10 — le plafond de la Tyrannie (6) ne compte pas');
{
  const m = montage(4);
  m.jup.govFormMoraleCap = 6;                            // Tyrannie
  m.jup.res.morale = 5; m.jup.rpt.morale = 3;            // 5 + 3 = 8 : dépasse 6, pas 10
  vm.runInContext('doRevenues();', m.sb);
  note('moral après revenu : ' + m.jup.res.morale + ' (plafond de forme 6) · drapeau : ' + m.jup._surprodMorale);
  vm.runInContext('surproductionVP(); enforceCaps();', m.sb);
  if (vp(m.jup) === 0) ok('Tyrannie écrêtée à 6 : aucun VP de surproduction de moral'); else ko('+' + vp(m.jup) + ' VP sous Tyrannie');
  const m2 = montage(4);
  m2.jup.res.morale = 9; m2.jup.rpt.morale = 2;          // 11 > 10
  vm.runInContext('doRevenues(); surproductionVP(); enforceCaps();', m2.sb);
  if (vp(m2.jup) === 1) ok('sans forme autoritaire, 9 + 2 > 10 : +1 VP'); else ko('+' + vp(m2.jup) + ' au lieu de +1');
}

console.log('§4 Une seule fois par tour, même si la frontière est franchie deux fois');
{
  const m = montage(5);
  m.jup.res.energy = 15;
  vm.runInContext('surproductionVP(); surproductionVP(); enforceCaps(); surproductionVP();', m.sb);
  if (vp(m.jup) === 1) ok('+1 VP, pas +2 ni +3'); else ko('+' + vp(m.jup));
}

console.log('§5 Les ordinateurs y ont droit aussi, et le rapport final le montre');
{
  const m = montage(6);
  const mar = m.G.ais[1];
  mar.res.science = 14;                                 // plafond 10
  vm.runInContext('surproductionVP(); enforceCaps();', m.sb);
  if (vp(mar) === 1) ok('Martiens : +1 VP'); else ko('Martiens : +' + vp(mar));
  const det = vm.runInContext('calcVP(G.ais[1]).det', m.sb);
  const l = (det.evt || []).find(x => /Surproduction/.test(x));
  if (l) ok('rapport : « ' + l + ' »'); else ko('le rapport ne montre pas la surproduction : ' + JSON.stringify(det.evt));
}

console.log('§6 Dès le tour 1');
{
  const m = montage(1);
  m.jup.res.materials = 21;
  vm.runInContext('surproductionVP(); enforceCaps();', m.sb);
  if (vp(m.jup) === 1 && (m.jup._vpDetail[0] || {}).tour === 1) ok('+1 VP au tour 1'); else ko('tour 1 : +' + vp(m.jup));
}

console.log('§7 La frontière de tour réelle (continueAfterEOT) passe bien par la règle');
{
  const m = montage(3);
  m.jup.res.energy = 15;
  try { vm.runInContext('continueAfterEOT();', m.sb); } catch (e) { note('continueAfterEOT : ' + e.message.split('\n')[0]); }
  if (vp(m.jup) === 1) ok('continueAfterEOT → +1 VP'); else ko('continueAfterEOT n\'a pas compté (+' + vp(m.jup) + ')');
  if (m.jup.res.energy <= 12) ok('et écrête'); else ko('pas écrêté : ' + m.jup.res.energy);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_vp_surproduction : +1 VP par ressource au plafond, par tour, 4 au plus, dès le tour 1.');
