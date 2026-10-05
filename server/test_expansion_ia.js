/* ============================================================================
   TEST — LE BUT « EXPANSION » DES ORDINATEURS (05/10/2026, chantier E1, v11.53)
   Rien avant le tour 6 (la « tortue » reste libre) ; dès le tour 6, un déficit de colonies reliées prime
   « coloniser » un nœud raccordable et rentable, et « route » qui rapproche une colonie isolée.
   Contre-épreuves : objectif atteint → 0 ; nœud derrière une nation étrangère → 0 ; multiplicateur 0 → 0.
   Usage : node test_expansion_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const run = c => vm.runInContext(c, sb);
const G = sb.__G;
const mart = G.ais.find(a => a.civ.id === 'martiens');
const home = mart.civ.home;
const NODES = run('NODES'); const voisins = (NODES[home].conn || []).filter(id => NODES[id] && !NODES[id].decorative && !run('allPlayers()').some(p => (p.colonies || []).some(c => c.nodeId === id)));
const v1 = voisins[0];
console.log('Martiens : capitale ' + home + ', voisin libre ' + v1);
const prime = (tour, coup) => { G.turn = tour; return run('valeurExpansion(' + JSON.stringify(coup) + ', allPlayers().find(p=>p.civ.id==="martiens"))'); };
const col = { type: 'coloniser', node: 'ceres' };   // Cérès : 1⚡ 3🪨, VP 3 — voisine de Phobos

console.log('\n1. Avant le tour 6, aucune prime (tactique tortue libre)');
{ const a = prime(3, col), b = prime(5, col); if (a === 0 && b === 0) ok('T3 et T5 : 0'); else ko('prime avant T6 : ' + a + ' / ' + b); }

console.log('\n2. Au tour 7 avec la capitale seule (déficit 2), coloniser un voisin rentable est primé');
{ const a = prime(7, col); if (a > 0) ok('T7 : +' + a.toFixed(1)); else ko('T7 : prime ' + a); }

console.log('\n3. La prime croît avec le déficit et décroît avec les tours restants');
{ const t6 = prime(6, col), t7 = prime(7, col), t10 = prime(10, col);
  if (t7 > t6) ok('déficit 2 (T7) > déficit 1 (T6) : ' + t7.toFixed(1) + ' > ' + t6.toFixed(1)); else ko('T7 ' + t7 + ' ≤ T6 ' + t6);
  const t9 = prime(9, col);
  if (t10 < t9) ok('T10 < T9 (plus de production à venir) : ' + t10.toFixed(1) + ' < ' + t9.toFixed(1)); else ko('T10 ' + t10 + ' ≥ T9 ' + t9); }

console.log('\n4. Objectif atteint → 0 (4 colonies reliées au T8)');
{ const sauve = mart.colonies.slice();
  for (const id of (NODES[home].conn || []).slice(0, 3)) mart.colonies.push({ nodeId: id, level: 1, connected: true });
  const a = prime(8, col); mart.colonies.length = 0; sauve.forEach(c => mart.colonies.push(c));
  if (a === 0) ok('aucune prime'); else ko('prime malgré l\'objectif atteint : ' + a); }

console.log('\n5. Nœud derrière une nation étrangère (non raccordable) → 0');
{ const loin = Object.keys(NODES).find(id => { const r = run('_raccordement(allPlayers().find(p=>p.civ.id==="martiens"),"' + id + '")'); return r && r.etrangers > 0; });
  if (!loin) ok('(aucun nœud derrière un étranger dans ce montage — point sauté)');
  else { const a = prime(7, { type: 'coloniser', node: loin }); if (a === 0) ok(loin + ' : 0'); else ko(loin + ' : ' + a); } }

console.log('\n6. Une route qui rapproche une colonie isolée est primée ; multiplicateur 0 → 0');
{ mart.colonies.push({ nodeId: 'vesta', level: 1, connected: false });
  const a = prime(7, { type: 'route', from: home, to: 'vesta' });
  if (a > 0) ok('route ' + home + '→vesta (isolée) : +' + a.toFixed(1)); else ko('route non primée : ' + a);
  const b = prime(7, { type: 'route', from: home, to: 'deimos' });
  if (b === 0) ok('route qui ne rapproche rien (→deimos) : 0'); else ko('route inutile primée : ' + b);
  G._primeExpansion = 0; const z = prime(7, col) + prime(7, { type: 'route', from: home, to: 'vesta' }); delete G._primeExpansion;
  if (z === 0) ok('multiplicateur 0 → 0'); else ko('multiplicateur 0 : ' + z);
  mart.colonies.pop(); }

console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Le but « expansion » incite dès le tour 6, jamais avant, et seulement là où ça rapporte.');
