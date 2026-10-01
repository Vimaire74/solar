/* ============================================================================
   TEST — UN ACCORD DÉJÀ SIGNÉ NE SE REPAIE PAS (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Partie téléphone de Marc (30/09) : un accord Martiens–Jupitériens au T8, puis
   « [Martiens] Accord Io » au T10. Vérification faite, ce n'était PAS un doublon : l'assaut des
   Jupitériens sur Phobos (T9) avait révoqué le premier (`revoquerAccordsEntre`), le second est
   légitime. Mais l'enquête a montré que le tacticien PROPOSAIT des accords vers une nation déjà
   liée (il ne testait que le nœud) ; `accordAcceptable` les refusait avant paiement, le coup était
   donc perdu. Ce banc verrouille les deux gardes.
   §1 coup de l'IA vers une nation déjà liée : rien n'est prélevé, rien n'est versé, tension intacte.
   §2 le tacticien ne propose plus d'accord à une nation déjà liée.
   §3 le joueur qui retente : refus « ⚠️ » (donc fenêtre « Action impossible »), rien de prélevé.
   §4 contre-épreuve : un accord avec une nation NON liée se conclut toujours, et se paie.
   Usage : node test_accord_double.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('jupiteriens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 10; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [G.player].concat(G.ais)) { n.res.materials = 10; n.res.energy = 10; n.res.morale = 8; n.acLeft = 4; n.tempVP = 0; }
  const run = c => vm.runInContext(c, sb);
  run(`var J_=G.player, M_=G.ais.find(a=>a.civ.id==="martiens"), T_=G.ais.find(a=>a.civ.id==="terriens");
       allPlayers().forEach(a=>allPlayers().forEach(b=>{ if(a!==b) setTens(a.civ.id,b.civ.id,0); }));`);
  return { sb, G, run };
}
const lier = (m, a, b) => m.run(`(function(){ const A=${a}, B=${b}; const col=B.colonies.find(c=>c.nodeId!==B.civ.home)||B.colonies[0]; _accordEnregistrer(col.nodeId,A,B); })()`);

console.log('§1 IA → nation déjà liée');
{ const m = montage(); lier(m, 'M_', 'J_');
  m.run('setTens("martiens","jupiteriens",6); setTens("jupiteriens","martiens",6);');
  const av = m.run('JSON.stringify([M_.acLeft,M_.res.materials,J_.res.materials,getTens("martiens","jupiteriens"),G.commercialAccords.length])');
  m.run('appliquerCoup(M_,{type:"accord",node:J_.civ.home})');
  const ap = m.run('JSON.stringify([M_.acLeft,M_.res.materials,J_.res.materials,getTens("martiens","jupiteriens"),G.commercialAccords.length])');
  if (av === ap) ok('rien de prélevé, rien de versé, tension et accords inchangés ' + ap); else ko('avant ' + av + ' → après ' + ap); }

console.log('\n§2 tacticien');
{ const m = montage(); lier(m, 'M_', 'J_');
  const n = m.run('coupsPossibles(M_).filter(c=>c.type==="accord"&&ownerNation(c.node)===J_).length');
  if (n === 0) ok('aucun accord proposé vers les Jupitériens'); else ko(n + ' accord(s) proposé(s) vers une nation déjà liée');
  const t = m.run('coupsPossibles(M_).filter(c=>c.type==="accord"&&ownerNation(c.node)===T_).length');
  if (t > 0) ok('accords vers les Terriens toujours proposés (' + t + ')'); else ko('plus aucun accord proposé vers les Terriens (contre-épreuve)'); }

console.log('\n§3 le joueur retente');
{ const m = montage(); lier(m, 'J_', 'M_');
  const av = m.run('JSON.stringify([J_.acLeft,J_.res.materials])');
  m.run('G._humanActive=true; proposeAccord(M_.colonies[0].nodeId, J_)');
  const ap = m.run('JSON.stringify([J_.acLeft,J_.res.materials])');
  const refus = m.run('G.log.slice(0,4).map(l=>String(l.msg||l.text||l)).join(" | ")');
  if (av === ap) ok('rien de prélevé'); else ko('prélevé : ' + av + ' → ' + ap);
  if (/⚠️/.test(refus)) ok('refus annoncé'); else ko('aucun refus au journal : ' + refus.slice(0, 160)); }

console.log('\n§4 contre-épreuve : nation non liée');
{ const m = montage();
  const av = m.run('JSON.stringify([M_.acLeft,M_.res.materials])');
  m.run('appliquerCoup(M_,{type:"accord",node:T_.civ.home})');
  const ap = m.run('JSON.stringify([M_.acLeft,M_.res.materials])');
  const lie = m.run('!!accordEntre(M_,T_)');
  if (lie && av !== ap) ok('accord conclu et payé ' + av + ' → ' + ap); else ko('accord ' + (lie ? 'conclu' : 'non conclu') + ', ' + av + ' → ' + ap); }

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ accord en double : tout est vert');
process.exit(ecarts.length ? 1 : 0);
