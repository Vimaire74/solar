/* ============================================================================
   TEST — UN ACCORD COMMERCIAL PROPOSÉ À PLUSIEURS NATIONS À LA FOIS (30/09/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, appli, 30/09 : « au lieu de cases à cocher il n'y a qu'un seul choix, donc je ne
   peux pas proposer à plusieurs nations » — puis : « j'ai toujours voulu ça ». Les règles disaient
   « avec la nation de ton choix » ; elles disent désormais « une ou plusieurs ».
   Le cœur : `_evCommPickPlusieurs(ids)` fait N propositions et joue la suite UNE fois. Une suite
   jouée deux fois ferait avancer la fin de tour deux fois ; jouée zéro fois, la partie se fige.

   §1 solo local, deux IA qui acceptent : deux accords, suite jouée une fois.
   §2 en ligne (sommet simultané), réponse `{aiIds:[…]}` : deux accords, sommet clos une fois.
   §3 une IA qui refuse n'empêche pas l'autre accord, et la suite est jouée une fois.
   §4 contre-épreuves : l'ancienne réponse `{aiId}` marche encore ; « Passer » ne signe rien et
      joue la suite ; une liste d'un seul élément = un seul accord.
   Usage : node test_accords_plusieurs.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [G.player].concat(G.ais)) { n.res.morale = 8; n.res.materials = 8; n.res.energy = 8; n.tempVP = 0; }
  vm.runInContext('var __suites=0; fluxDeclarer("stSuiteEspion", function(){ __suites++; });', sb);
  return { sb, G };
}
const accords = (m, a, b) => vm.runInContext('accordEntre(allPlayers().find(n=>n.civ.id==="' + a + '"),allPlayers().find(n=>n.civ.id==="' + b + '"))', m.sb) ? 1 : 0;
const suites = m => vm.runInContext('__suites', m.sb);
const aPlusieurs = m => vm.runInContext('typeof _evCommPickPlusieurs==="function"', m.sb);

console.log('§1 SOLO LOCAL — deux IA qui acceptent');
{
  const m = montage();
  vm.runInContext('fluxDonnees().suiteAccord="stSuiteEspion"; _evCommDone="stSuiteEspion";', m.sb);
  vm.runInContext('stAccordCommChoisi({aiIds:["terriens","martiens"]}, "jupiteriens")', m.sb);
  const n = accords(m, 'jupiteriens', 'terriens') + accords(m, 'jupiteriens', 'martiens');
  if (n === 2) ok('deux accords signés'); else ko(n + ' accord(s) signé(s) au lieu de 2' + (aPlusieurs(m) ? '' : ' (pas de `_evCommPickPlusieurs` dans ce moteur)'));
  if (suites(m) === 1) ok('la suite du tour est jouée une fois'); else ko('suite jouée ' + suites(m) + ' fois');
}

console.log('\n§2 EN LIGNE, SOMMET SIMULTANÉ — réponse {aiIds}');
{
  const m = montage();
  m.sb.setDecisionSink(() => {});
  vm.runInContext('var __fin=0; const _t=_accordsTerminer; _accordsTerminer=function(){ __fin++; }; '
    + 'const d=fluxDonnees(); d.accordsRestants=["jupiteriens"]; d.accordsPaires=[];', m.sb);
  vm.runInContext('stAccordCommChoisi({aiIds:["terriens","ceinturiens"]}, "jupiteriens")', m.sb);
  const n = accords(m, 'jupiteriens', 'terriens') + accords(m, 'jupiteriens', 'ceinturiens');
  if (n === 2) ok('deux accords signés'); else ko(n + ' accord(s) signé(s) au lieu de 2');
  const fin = vm.runInContext('__fin', m.sb);
  if (fin === 1) ok('le sommet est clos une fois'); else ko('sommet clos ' + fin + ' fois');
}

console.log('\n§3 UNE IA REFUSE, L\'AUTRE ACCEPTE');
{
  const m = montage();
  vm.runInContext('fluxDonnees().suiteAccord="stSuiteEspion"; _evCommDone="stSuiteEspion"; '
    + 'const _aa=accordAcceptable; accordAcceptable=function(o,p){ return o.civ.id==="terriens"?{ok:false,raison:"essai"}:_aa(o,p); };', m.sb);
  vm.runInContext('stAccordCommChoisi({aiIds:["terriens","martiens"]}, "jupiteriens")', m.sb);
  if (!accords(m, 'jupiteriens', 'terriens') && accords(m, 'jupiteriens', 'martiens')) ok('refus des Terriens, accord avec les Martiens'); else ko('mauvais résultat : T=' + accords(m, 'jupiteriens', 'terriens') + ' M=' + accords(m, 'jupiteriens', 'martiens'));
  if (suites(m) === 1) ok('suite jouée une fois malgré le refus'); else ko('suite jouée ' + suites(m) + ' fois');
}

console.log('\n§4 CONTRE-ÉPREUVES');
{
  const m = montage();
  vm.runInContext('fluxDonnees().suiteAccord="stSuiteEspion"; _evCommDone="stSuiteEspion";', m.sb);
  vm.runInContext('stAccordCommChoisi({aiId:"terriens"}, "jupiteriens")', m.sb);
  if (accords(m, 'jupiteriens', 'terriens') && suites(m) === 1) ok('ancienne réponse {aiId} : un accord, une suite'); else ko('ancienne réponse cassée');
  const m2 = montage();
  vm.runInContext('fluxDonnees().suiteAccord="stSuiteEspion"; _evCommDone="stSuiteEspion";', m2.sb);
  vm.runInContext('_evCommPick(null)', m2.sb);
  if (!accords(m2, 'jupiteriens', 'terriens') && suites(m2) === 1) ok('« Passer » : aucun accord, une suite'); else ko('« Passer » cassé');
  const m3 = montage();
  vm.runInContext('fluxDonnees().suiteAccord="stSuiteEspion"; _evCommDone="stSuiteEspion";', m3.sb);
  vm.runInContext('stAccordCommChoisi({aiIds:["martiens"]}, "jupiteriens")', m3.sb);
  if (accords(m3, 'jupiteriens', 'martiens') && !accords(m3, 'jupiteriens', 'terriens') && suites(m3) === 1) ok('liste d\'un seul élément : un accord, une suite'); else ko('liste d\'un élément cassée');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ Accords à plusieurs partenaires : tenus.');
