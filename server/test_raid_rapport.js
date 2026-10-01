/* ============================================================================
   TEST — LE RAID DU JOUEUR AU RAPPORT : LA COLONIE VISÉE ET LES JETONS (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Rapport de la partie téléphone de Marc (30/09) : « [Jupitériens] Raid 🔴 — 1 AC →
   Volé : +1 énergie+2 matériaux ». Ni la colonie pillée, ni les 2 jetons Force — pourtant bien
   prélevés (trajectoire : 4 jetons → 2). Les raids des IA, eux, s'écrivaient « Raid sur Phobos —
   1 AC, 2 jetons Force ».
   §1 la ligne du joueur nomme la colonie et compte les jetons ; le butin est lisible.
   §2 contre-épreuve : les jetons sont prélevés une seule fois (réserve −2).
   Usage : node test_raid_rapport.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
sb.initGame('jupiteriens', ['terriens', 'martiens']);
const G = sb.__G; G.turn = 3; G.phase = 'actions';
G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
const run = c => vm.runInContext(c, sb);
run(`G.player.forceTokens=6; G.player.acLeft=3; G.player.res.energy=10; G._humanActive=true; G._journal=[];
     var M_=G.ais.find(a=>a.civ.id==="martiens"); M_.colonies.forEach(c=>{ c.level=2; });`);
const avant = run('G.player.forceTokens');
const col = run('M_.colonies[0].nodeId'), nomCol = run('NODES[M_.colonies[0].nodeId].name');
run('doRaidTarget("martiens",' + JSON.stringify(col) + ',G.player)');
const e = JSON.parse(run('JSON.stringify((G._journal||[]).filter(x=>/Raid/.test(x.name)).pop()||null)'));
console.log('§1 ligne du rapport');
if (!e) ko('aucune ligne de raid au journal (montage : le raid a-t-il eu lieu ? réserve ' + run('G.player.forceTokens') + ')');
else {
  const ligne = e.name + ' — ' + e.ac + ' AC ' + JSON.stringify(e.cost) + ' → ' + e.gain;
  if (e.name.includes(nomCol)) ok('colonie nommée : ' + e.name); else ko('colonie absente : ' + ligne);
  if ((e.cost && e.cost.force) === 2) ok('2 jetons Force au coût'); else ko('jetons absents du coût : ' + ligne);
  if (!/[a-zé]\+\d/.test(e.gain)) ok('butin lisible : ' + e.gain);
  else ko('butin collé : ' + e.gain);
}
console.log('\n§2 contre-épreuve');
{ const apres = run('G.player.forceTokens');
  if (avant - apres === 2) ok('réserve ' + avant + ' → ' + apres); else ko('réserve ' + avant + ' → ' + apres); }
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ raid au rapport : tout est vert');
process.exit(ecarts.length ? 1 : 0);
