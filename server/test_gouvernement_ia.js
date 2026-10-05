/* TEST — UN PA PERMANENT VAUT LES TOURS QUI RESTENT (05/10/2026, E3, v11.53). Usage : node test_gouvernement_ia.js */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'index.html')); sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const G = sb.__G; const run = c => vm.runInContext(c, sb);
const m = G.ais.find(a => a.civ.id === 'martiens'); const acAvant = run('calcAC(allPlayers().find(p=>p.civ.id==="martiens"))');
const v = (tour) => { G.turn = tour; return run('valeurActionsPermanentes(allPlayers().find(p=>p.civ.id==="martiens"),' + acAvant + ')'); };
console.log('1. Sans changement de PA : 0'); { const a = v(2); if (a === 0) ok('0'); else ko('prime sans PA gagné : ' + a); }
console.log('2. +5 pts de gouvernement (Sénat) au T2 : prime ≈ 1,5 × 1 PA × 8 tours');
run('addGovPts(allPlayers().find(p=>p.civ.id==="martiens"),5)');
{ const a = v(2); const d = run('calcAC(allPlayers().find(p=>p.civ.id==="martiens"))') - acAvant;
  if (d === 1 && Math.abs(a - 12) < 0.01) ok('+1 PA, prime ' + a); else ko('ΔPA ' + d + ', prime ' + a); }
console.log('3. Le même gain au T10 ne vaut plus rien ; au T6 il vaut 4 tours');
{ const a = v(10), b = v(6); if (a === 0 && Math.abs(b - 6) < 0.01) ok('T10 : 0 · T6 : ' + b); else ko('T10 ' + a + ' · T6 ' + b); }
console.log('4. Poids 0 → 0'); { G._primeGouv = 0; const a = v(2); delete G._primeGouv; if (a === 0) ok('0'); else ko(String(a)); }
console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Un PA permanent est noté sur tous les tours restants.');
