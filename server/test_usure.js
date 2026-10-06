/* TEST — L'ATTAQUE D'USURE (06/10/2026, v11.63, tactique de Marc). Usage : node test_usure.js */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const HTML = path.join(__dirname, '..', 'index.html');
function montage(ecartVP, rapide) {
  const sb = loadLogic(HTML); sb.initGame('jupiteriens', ['martiens']); const G = sb.__G; const run = c => vm.runInContext(c, sb);
  G.turn = 6; G.phase = 'actions';
  run(`var M=allPlayers().find(p=>p.civ.id==="martiens"), J_=allPlayers().find(p=>p.civ.id==="jupiteriens");
    M.forceTokens=6; M.res.materials=12; M.res.energy=12; J_.forceTokens=10; J_.res.materials=12; J_.res.energy=12;
    J_.colonies.push({nodeId:"europe",level:1,connected:true}); G.warWith="jupiteriens";
    J_.tempVP=${ecartVP}; ${rapide ? 'M.investBonus2={fastCooldown:true,turnsLeft:4};' : ''}`);
  return { sb, G, run };
}
const choix = m => JSON.parse(m.run('JSON.stringify(iaChoixDeCombat(M))'));
console.log('1. Jupitériens à égalité de score, Martiens 6 jetons contre 10 : pas d\'attaque (règle E5)');
{ const m = montage(0, true); const c = choix(m); if (c.action !== 'attack') ok(JSON.stringify(c)); else ko('attaque : ' + JSON.stringify(c)); }
console.log('2. Jupitériens +30 VP, Martiens avec Stratégie Guerrière : attaque d\'usure, plan noté');
{ const m = montage(30, true); const ev = m.run('vpAffiche(J_)-vpAffiche(M)'); const c = choix(m); const pl = m.run('JSON.stringify(M._planUsure||null)');
  if (c.action === 'attack' && c.usure && /europe/.test(pl)) ok('écart ' + ev + ' VP → ' + JSON.stringify(c) + ' plan ' + pl); else ko('écart ' + ev + ' : ' + JSON.stringify(c) + ' plan ' + pl);
  const c2 = choix(m); if (c2.action !== 'attack') ok('une seule usure par tour : ' + c2.action); else ko('deuxième usure le même tour');
  m.G.turn = 7; m.run('J_.forceTokens=0;'); const c3 = choix(m);
  if (c3.action === 'attack' && c3.node === 'europe' && !c3.usure) ok('tour suivant, défense affaiblie : second assaut sur Europe'); else ko('tour suivant : ' + JSON.stringify(c3)); }
console.log('3. Jupitériens +30 VP, SANS Stratégie Guerrière : bilan d\'échange défavorable → pas d\'attaque');
{ const m = montage(30, false); const b = m.run('bilanUsure(M,J_,6,10)'); const c = choix(m);
  if (c.action !== 'attack') ok('bilan ' + b.toFixed(1) + ' → ' + c.action); else ko('attaque malgré bilan ' + b); }
console.log('4. Réserve du second assaut : le tour suivant, dépenser les ressources est pénalisé');
{ const m = montage(30, true); m.run('noterPlanUsure(M,J_,"europe")'); m.G.turn = 7;
  const p1 = m.run('penaliteReserveUsure(M,{type:"tech"})'); m.run('M.res.materials=1;M.res.energy=1;'); const p2 = m.run('penaliteReserveUsure(M,{type:"tech"})'); const p3 = m.run('penaliteReserveUsure(M,{type:"assaut"})');
  if (p1 === 0 && p2 > 0 && p3 === 0) ok('ressources pleines 0 · à sec ' + p2 + ' · l\'assaut lui-même 0'); else ko(p1 + ' / ' + p2 + ' / ' + p3); }
console.log('5. Conquérant : Stratégie Guerrière, sauf si Colonies Avancées rapporte ≥ 25 VP');
{ const m = montage(0, false); m.run('M._profil="guerrier"; M.res.materials=20; M.res.energy=20; M.colonies=M.colonies.filter(c=>c.nodeId===M.civ.home);');
  const a = m.run('chooseInvestmentForAI(M,2)');
  m.run('for(const id of ["ceres","vesta","deimos","lune","titan","pluto"]) if(!allPlayers().some(p=>p.colonies.some(c=>c.nodeId===id))) M.colonies.push({nodeId:id,level:1,connected:true});');
  const gain = m.run('(function(){const a=calcVP(M).total,n=M.colonies.map(c=>c.level);M.colonies.forEach(c=>c.level=(NODES[c.nodeId].maxLv||3));const b=calcVP(M).total;M.colonies.forEach((c,i)=>c.level=n[i]);return b-a;})()');
  const b = m.run('chooseInvestmentForAI(M,2)');
  if (a === 'inv2_war') ok('peu de colonies → ' + a); else ko('peu de colonies → ' + a);
  if (gain >= 25 ? b === 'inv2_colonies' : b === 'inv2_war') ok('gain Colonies Avancées ' + gain + ' VP → ' + b); else ko('gain ' + gain + ' → ' + b); }
console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Attaque d\'usure conforme à la tactique de Marc.');
