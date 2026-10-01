/* ============================================================================
   TEST — LE RAID D'UN ORDINATEUR SUR LE JOUEUR : LA VICTIME DOIT LE SAVOIR (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, appli v11.09 : « on m'a raidé et je n'ai pas vu d'avertissement, par contre
   je suis passé à −1 en revenu d'énergie sans explication ». `doRaidTarget` (la porte du
   tacticien depuis §174) ne prévenait la victime QUE sur le serveur (`_decisionActive`) : en solo
   local, ni avis « X te pille », ni section « Pillage subi » au bilan (`_raidsThisTurn` jamais
   rempli). L'avis vivait dans l'ancienne enveloppe de raid de l'IA — motif 2 de §7.2, sixième fois.
   §1 solo : raid d'un ordinateur sur le joueur → avis `coup` dans G._ilPlayerHits, nommant le pillard
   §2 solo : G.player._raidsThisTurn porte le raid, avec la colonie
   §3 le bilan de fin de tour montre « Pillage subi », la colonie et « −1⚡ » (pas « −+1 »)
   §4 contre-épreuve : le joueur raide un ordinateur → aucun avis pour lui, rien dans SON pillage subi
   §5 contre-épreuve : avec émetteur (serveur) → pas d'avis local, un avis émis à la victime
   Usage : node test_raid_victime_solo.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function monter() {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('jupiteriens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 3; G.phase = 'actions'; G._il = true;
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  const run = c => vm.runInContext(c, sb);
  run(`G._ilPlayerHits=[]; G._humanActive=false; G.player._raidsThisTurn=[]; G.ais.forEach(a=>a._raidsThisTurn=[]);
       var T_=G.ais.find(a=>a.civ.id==="terriens"); T_.forceTokens=6; T_.acLeft=3; T_.res.energy=10;
       G.player.colonies.forEach(c=>{ c.level=2; c.connected=true; }); G.player.forceTokens=6; G.player.acLeft=3; G.player.res.energy=10;`);
  return { sb, G, run };
}

console.log('§1 solo : avis à la victime');
{
  const { run } = monter();
  const col = run('G.player.colonies[0].nodeId'), nomCol = run('NODES[G.player.colonies[0].nodeId].name');
  run('doRaidTarget("jupiteriens",' + JSON.stringify(col) + ',T_)');
  const hits = JSON.parse(run('JSON.stringify(G._ilPlayerHits||[])'));
  const coup = hits.find(h => h.genre === 'coup');
  if (coup) ok('avis « coup » : ' + coup.title); else ko('aucun avis « coup » pour la victime (' + hits.length + ' avis)');
  if (coup && /Terriens/.test(coup.title)) ok('le pillard est nommé'); else if (coup) ko('pillard absent du titre : ' + coup.title);
  if (coup && /pille/i.test(coup.title)) ok('titre « te pille »'); else if (coup) ko('titre inattendu : ' + coup.title);
  console.log('\n§2 solo : pillage subi retenu');
  const r = JSON.parse(run('JSON.stringify(G.player._raidsThisTurn||[])'));
  if (r.length === 1) ok('1 raid retenu chez la victime'); else ko(r.length + ' raid(s) retenus chez la victime');
  const colTxt = r[0] && r[0].col ? run('_i18nParam(' + JSON.stringify(r[0].col) + ')') : null;
  if (colTxt === nomCol) ok('colonie : ' + colTxt); else ko('colonie absente ou non traduite : ' + JSON.stringify(r[0] && r[0].col));
  console.log('\n§3 bilan de fin de tour');
  const html = run('buildEOTBody({}, {energy:3}, null, null)');
  if (/Pillage subi/.test(html)) ok('section « Pillage subi »'); else ko('pas de section « Pillage subi »');
  const sect = html.slice(html.indexOf('Pillage subi'));
  if (sect.indexOf('Production pillée') >= 0 && sect.indexOf(nomCol) >= 0) ok('« Production pillée : ' + nomCol + ' »'); else ko('la colonie pillée manque dans la section');
  if (!/−\+/.test(html)) ok('pas de « −+ »'); else ko('« −+ » dans le bilan');
}
console.log('\n§4 contre-épreuve : le joueur raide');
{
  const { run } = monter();
  run('var M_=G.ais.find(a=>a.civ.id==="martiens"); M_.colonies.forEach(c=>{ c.level=2; c.connected=true; }); G._humanActive=true;');
  const col = run('M_.colonies[0].nodeId');
  run('doRaidTarget("martiens",' + JSON.stringify(col) + ',G.player)');
  const hits = JSON.parse(run('JSON.stringify(G._ilPlayerHits||[])'));
  if (!hits.some(h => h.genre === 'coup')) ok('aucun avis « coup » pour le pillard'); else ko('le pillard reçoit un avis « coup »');
  if (run('(G.player._raidsThisTurn||[]).length') === 0) ok('rien dans le pillage subi du joueur'); else ko('le raid du joueur compte comme subi');
  if (run('(M_._raidsThisTurn||[]).length') === 1) ok('la victime (ordinateur) le retient'); else ko('la victime ordinateur ne le retient pas');
}
console.log('\n§5 contre-épreuve : serveur (émetteur installé)');
{
  const { sb, run } = monter();
  const emis = [];
  sb.setDecisionSink(p => { emis.push(p); });
  const col = run('G.player.colonies[0].nodeId');
  run('doRaidTarget("jupiteriens",' + JSON.stringify(col) + ',T_)');
  const hits = JSON.parse(run('JSON.stringify(G._ilPlayerHits||[])'));
  if (hits.length === 0) ok('aucun avis local'); else ko(hits.length + ' avis local(aux) sur le serveur');
  const v = emis.filter(p => p && /raid/.test(p.kind) && p.nation === 'jupiteriens');
  if (v.length >= 1) ok('avis émis à la victime : ' + v.map(p => p.kind).join(',')); else ko('aucun avis émis à la victime (' + emis.map(p => p && p.kind + '→' + p.nation).join(', ') + ')');
}
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ raid : la victime est prévenue, en solo comme en ligne');
process.exit(ecarts.length ? 1 : 0);
