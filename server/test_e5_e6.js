/* TEST — E5 (pas d'attaque contre une défense connue plus forte) et E6 (au dernier tour, seuls les points comptent). 05/10/2026, v11.57 */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const HTML = path.join(__dirname, '..', 'index.html');
console.log('E5. Ceinturiens, 4 jetons, contre les Jupitériens réduits à Io (capitale, garnison 10)');
{ const sb = loadLogic(HTML); sb.initGame('jupiteriens', ['ceinturiens']); const G = sb.__G; const run = c => vm.runInContext(c, sb);
  run('var c=allPlayers().find(p=>p.civ.id==="ceinturiens"), j=allPlayers().find(p=>p.civ.id==="jupiteriens"); c.forceTokens=4; c.res.materials=10; c.res.energy=10; j.forceTokens=0; j.colonies=j.colonies.filter(x=>x.nodeId===j.civ.home); G.warWith="jupiteriens";');
  const r = run('JSON.stringify(iaChoixDeCombat(c))');
  if (!/"attack"/.test(r)) ok('pas d\'assaut 4 contre 10 : ' + r); else ko('assaut perdu d\'avance : ' + r);
  run('j.colonies.push({nodeId:"europe",level:1,connected:true});');
  const r2 = run('JSON.stringify(iaChoixDeCombat(c))');
  if (/"attack".*europe|europe.*"attack"/.test(r2)) ok('Europe (garnison 1, 0 jeton) est attaquée : ' + r2); else ko('cible gagnable ignorée : ' + r2);
  run('c.forceTokens=12; c.res.materials=20; c.res.energy=20; j.colonies=j.colonies.filter(x=>x.nodeId===j.civ.home);');
  const r3 = run('JSON.stringify(iaChoixDeCombat(c))');
  if (/"attack"/.test(r3)) ok('12 jetons contre la capitale (10) : l\'assaut redevient possible'); else ko('capitale jamais attaquée même gagnable : ' + r3); }
console.log('\nE6. Au dernier tour, une ressource dépensée sans point ne vaut rien ; une amélioration qui rapporte des points vaut');
{ const sb = loadLogic(HTML); sb.initGame('terriens', ['martiens']); const G = sb.__G; const run = c => vm.runInContext(c, sb);
  G.turn = G.maxTurns; run('var m=allPlayers().find(p=>p.civ.id==="martiens"); m.res.materials=15; m.res.energy=8; m.res.science=6;');
  const a = run('evaluerPosition(m)'); run('m.res.materials-=5'); const b = run('evaluerPosition(m)'); run('m.res.materials+=5');
  const vp = run('calcVP(m).total');
  if (Math.abs(a - vp) < 3 && a - b < 1) ok('note ≈ score (' + a.toFixed(1) + ' / ' + vp + ') ; 5 matériaux perdus ne coûtent que ' + (a - b).toFixed(2)); else ko('note ' + a + ' vs score ' + vp + ', écart stock ' + (a - b));
  G.turn = 5; const c5 = run('evaluerPosition(m)'); run('m.res.materials-=5'); const d5 = run('evaluerPosition(m)'); run('m.res.materials+=5');
  if (c5 - d5 > a - b) ok('au tour 5 le stock vaut davantage (' + (c5 - d5).toFixed(2) + ')'); else ko('stock T5 ' + (c5 - d5)); }
console.log('\n3 sauts. La prime d\'expansion accepte un nœud à 3 sauts, moins qu\'à 1');
{ const sb = loadLogic(HTML); sb.initGame('ceinturiens', ['martiens']); const G = sb.__G; const run = c => vm.runInContext(c, sb); G.turn = 7;
  const res = run('(function(){const n=allPlayers().find(p=>p.civ.id==="ceinturiens");const o=[];for(const id of Object.keys(NODES)){if(NODES[id].decorative||allPlayers().some(p=>p.colonies.some(c=>c.nodeId===id)))continue;const r=_raccordement(n,id);if(!r||r.etrangers)continue;o.push([id,r.sauts,Math.round(valeurExpansion({type:"coloniser",node:id},n)*10)/10]);}return JSON.stringify(o.filter(x=>x[1]>=1&&x[1]<=4).sort((a,b)=>a[1]-b[1]));})()');
  const l = JSON.parse(res); const s3 = l.filter(x => x[1] === 3), s4 = l.filter(x => x[1] === 4);
  if (s3.some(x => x[2] > 0)) ok('à 3 sauts : ' + s3.map(x => x[0] + ' +' + x[2]).join(', ')); else ko('rien de primé à 3 sauts : ' + res);
  if (s4.every(x => x[2] === 0)) ok('à 4 sauts : 0'); else ko('primé à 4 sauts : ' + JSON.stringify(s4)); }
console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ E5, E6 et les 3 sauts tiennent.');
