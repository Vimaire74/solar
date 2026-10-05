/* ============================================================================
   TEST — DANS LE SOLO DE L'APPLI, UNE GUERRE ENTRE DEUX IA N'EST PAS LA GUERRE DU JOUEUR (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Partie téléphone de Marc (30/09) : au T4 il ACCEPTE la Sphère de Dyson des Terriens ; les
   Martiens la refusent → guerre Terriens–Martiens. Au décompte final : « T4 — Combat gagné contre
   Terriens : +2 » chez… les Jupitériens. Cause : `_focusWar` (qui prend le point de vue d'un
   belligérant) ne fait rien sans émetteur de décisions (`_decisionActive()`, vrai sur le serveur
   seulement). Dans l'appli, la fin de tour traitait donc la guerre Terriens–Martiens avec les
   fenêtres et les ressources du JOUEUR : il combattait à leur place, et le VP lui revenait.
   Sur le serveur, cette guerre est jouée du point de vue d'un belligérant et les questions vont
   aux IA (le pilote du serveur répond) ; l'appli a le même pilote, en local (§170).
   §1 guerre IA–IA, solo local : la file des guerres se termine sans aucune question ni fenêtre au
      joueur, le joueur n'a gagné aucun VP de combat, la perspective lui est rendue.
   §2 contre-épreuve : la guerre du JOUEUR reste la sienne (fenêtres locales, pas d'émetteur).
   §4 une guerre IA–IA puis celle du joueur : la seconde se joue vue du joueur.
   §3 contre-épreuve : hors pilote local (décor serveur sans émetteur), rien ne change.
   Usage : node test_guerre_ia_ia_appli.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage(pilote, a, b) {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('jupiteriens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(x => x._isAI = true);
  for (const n of [G.player].concat(G.ais)) { n.res.materials = 10; n.res.energy = 10; n.res.morale = 8; n.forceTokens = 6; n.tempVP = 0; n._vpDetail = []; }
  const run = c => vm.runInContext(c, sb);
  if (pilote) run('_piloteLocalActif=function(){ return true; };');
  run(`var N_=id=>allPlayers().find(n=>n.civ.id===id); G._pendings=[]; G._pending=null;
       declarerGuerre(N_("${a}"),N_("${b}"),"dyson","${a}");`);
  return { sb, G, run };
}
/* Fait tourner la fin de tour des guerres et répond comme le pilote local : IA → réponse du moteur ;
   avis au joueur → acquitté ; QUESTION au joueur → comptée (le joueur ne doit pas en recevoir). */
function derouler(m) {
  m.run('var __qJoueur=[]; stGuerres();');
  for (let i = 0; i < 300; i++) {
    const n = m.run(`(function(){ const l=(G._pendings||[]).slice(); if(!l.length) return 0;
      for(const q of l){ const nat=allPlayers().find(x=>x.civ.id===q.nation);
        if(nat&&nat._isAI){ resolveDecision(q.id, q.notice?{}:_reponseSimulee(q)); return 1; }
        if(q.notice){ resolveDecision(q.id,{}); return 1; }
        __qJoueur.push(q.kind); resolveDecision(q.id, _reponseSimulee(q)); return 1; }
      return 0; })()`);
    if (!n) break;
  }
}
const vpCombat = (m, id) => m.run('JSON.stringify((N_("' + id + '")._vpDetail||[]).filter(e=>/Combat/.test(e.raison)).map(e=>e.raison))');

console.log('§1 guerre Terriens–Martiens, solo local de l\'appli');
{ const m = montage(true, 'terriens', 'martiens'); derouler(m);
  const fini = m.run('guerreCourante()===null'), moi = m.run('G.player.civ.id'), q = m.run('JSON.stringify(__qJoueur)');
  const vj = JSON.parse(vpCombat(m, 'jupiteriens'));
  if (fini) ok('la file des guerres est allée au bout'); else ko('la file s\'est arrêtée (guerre ' + m.run('JSON.stringify(guerreCourante())') + ', vue de ' + moi + ', guerre affichée contre ' + m.run('G.warWith') + ') — une fenêtre attend le joueur');
  if (q === '[]') ok('aucune question au joueur'); else ko('questions au joueur : ' + q);
  if (!vj.length) ok('aucun VP de combat pour les Jupitériens'); else ko('VP de combat aux Jupitériens : ' + vj.join(', '));
  const vb = JSON.parse(vpCombat(m, 'terriens')).concat(JSON.parse(vpCombat(m, 'martiens')));
  if (vb.length) ok('le combat a eu lieu entre les belligérants : ' + vb.join(', ')); else ko('aucun combat résolu entre Terriens et Martiens');
  if (moi === 'jupiteriens') ok('perspective rendue au joueur'); else ko('perspective restée sur ' + moi);
  if (!m.run('_decisionActive()')) ok('aucun émetteur laissé derrière'); else ko('un émetteur de décisions est resté installé'); }

console.log('\n§9 joueur ÉLIMINÉ en solo : la guerre IA–IA de fin de tour se joue quand même (04/10, v11.52)');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('G.player.colonies=[]; updateConnections&&updateConnections(G.player);');
  if (m.run('estEliminee(G.player)')) ok('le joueur est bien éliminé'); else ko('montage : le joueur n\'est pas éliminé');
  derouler(m);
  const fini = m.run('guerreCourante()===null');
  const vb = JSON.parse(vpCombat(m, 'terriens')).concat(JSON.parse(vpCombat(m, 'martiens')));
  if (fini) ok('la file des guerres est allée au bout'); else ko('la file s\'est arrêtée');
  if (vb.length) ok('le combat a eu lieu entre les belligérants : ' + vb.join(', ')); else ko('aucun combat résolu : la file a été vidée (joueur éliminé)');
  if (m.run('JSON.stringify(__qJoueur)') === '[]') ok('aucune question au joueur éliminé'); else ko('questions au joueur éliminé'); }

console.log('\n§2 contre-épreuve : la guerre du joueur');
{ const m = montage(true, 'terriens', 'jupiteriens'); m.run('stGuerres()');
  const moi = m.run('G.player.civ.id'), contre = m.run('G.warWith'), em = m.run('_decisionActive()');
  if (moi === 'jupiteriens' && contre === 'terriens' && !em) ok('vue du joueur, contre les Terriens, fenêtres locales'); else ko('vue ' + moi + ', contre ' + contre + ', émetteur ' + em); }

console.log('\n§3 contre-épreuve : décor serveur sans émetteur ni pilote');
{ const m = montage(false, 'terriens', 'martiens'); m.run('stGuerres()');
  if (!m.run('_decisionActive()')) ok('aucun émetteur installé'); else ko('émetteur installé hors pilote local'); }

console.log('\n§4 une guerre IA–IA PUIS la guerre du joueur, dans la même fin de tour');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('declarerGuerre(N_("jupiteriens"),N_("terriens"),"test","jupiteriens");');
  derouler(m);
  const c = m.run('JSON.stringify(guerreCourante())'), moi = m.run('G.player.civ.id'), contre = m.run('G.warWith'), em = m.run('_decisionActive()');
  if (/jupiteriens/.test(c) && moi === 'jupiteriens' && contre === 'terriens' && !em) ok('la guerre du joueur s\'ouvre vue du joueur, fenêtres locales');
  else ko('guerre ' + c + ', vue ' + moi + ', contre ' + contre + ', émetteur ' + em); }

/* ── §5–§8 (03/10) : rapports de Marc — « T7 terriens → coloniser Deimos » alors qu'il jouait les
   Terriens : la perspective était restée sur une autre nation APRÈS une fin de tour. On rejoue les
   formes de guerre IA–IA possibles et on regarde l'état laissé derrière : vue du joueur, émetteur. */
function etatApres(m, nom) {
  const moi = m.run('G.player.civ.id'), em = m.run('_decisionActive()'), fin = m.run('guerreCourante()===null'), q = m.run('JSON.stringify(__qJoueur)');
  if (moi === 'jupiteriens' && !em && fin) ok(nom + ' : file finie, vue rendue au joueur, aucun émetteur (questions au joueur : ' + q + ')');
  else ko(nom + ' : vue ' + moi + ', émetteur ' + em + ', file finie ' + fin + ', questions ' + q);
}
console.log('\n§5 guerre IA–IA dont le perdant n\'a plus AUCUNE colonie (Jovians, log du 03/10)');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('N_("martiens").colonies=[]; N_("martiens")._sansColonieDit=false;'); derouler(m); etatApres(m, '§5'); }
console.log('\n§6 guerre IA–IA en cours (pas fraîche) : ordre de bataille, assauts des deux côtés');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('const w=_warBetween("terriens","martiens"); w.justDeclared=false; w.live=true; N_("terriens").forceTokens=8; N_("martiens").forceTokens=8; N_("martiens").colonies.push({nodeId:"ceres",level:1,connected:true});');
  derouler(m); etatApres(m, '§6'); }
console.log('\n§7 guerre IA–IA sur un nœud où le JOUEUR cohabite (question de renfort au joueur)');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('const w=_warBetween("terriens","martiens"); w.justDeclared=false; w.live=true; N_("terriens").forceTokens=8; N_("martiens").colonies.push({nodeId:"titan",level:1,connected:true}); G.player.colonies.push({nodeId:"titan",level:1,connected:true,noUpgrade:true});');
  derouler(m); etatApres(m, '§7'); }
console.log('\n§8 deux guerres IA–IA dans la même fin de tour, puis rien');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('const ce=N_("martiens"); declarerGuerre(N_("terriens"),N_("martiens"),"x","terriens");');
  m.run('allPlayers().forEach(n=>{ if(n.civ.id!=="jupiteriens"&&!(n.colonies||[]).length) n.colonies.push({nodeId:"vesta",level:1,connected:true}); });');
  derouler(m); etatApres(m, '§8'); }

console.log('\n§9 garde : vue restée sur une IA + émetteur oublié → rendus au pas de jeu suivant');
{ const m = montage(true, 'terriens', 'martiens');
  m.run('_decisionSink=function(){}; _emetteurGuerreIA=true; _activateNation(N_("martiens"));');
  const avant = m.run('G.player.civ.id');
  m.run('_perspectiveSoloGarde("test")');
  const apres = m.run('G.player.civ.id'), em = m.run('_decisionActive()');
  if (avant === 'martiens' && apres === 'jupiteriens' && !em) ok('vue martiens → jupiteriens (le joueur), émetteur retiré'); else ko('avant ' + avant + ', après ' + apres + ', émetteur ' + em);
  const ais = m.run('G.ais.map(a=>a.civ.id).join(",")');
  if (!/jupiteriens/.test(ais)) ok('le joueur n\'est plus dans la liste des ordinateurs (' + ais + ')'); else ko('le joueur est dans G.ais : ' + ais); }
console.log('\n§10 contre-épreuve : un vrai émetteur de serveur n\'est pas touché');
{ const m = montage(false, 'terriens', 'martiens');
  m.run('setDecisionSink(function(){}); _activateNation(N_("martiens"));');
  m.run('_perspectiveSoloGarde("test")');
  if (m.run('G.player.civ.id') === 'martiens' && m.run('_decisionActive()')) ok('serveur : vue et émetteur laissés tels quels'); else ko('la garde a touché un serveur'); }

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ guerre IA–IA dans l\'appli : tout est vert');
process.exit(ecarts.length ? 1 : 0);
