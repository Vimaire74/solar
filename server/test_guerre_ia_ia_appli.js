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

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ guerre IA–IA dans l\'appli : tout est vert');
process.exit(ecarts.length ? 1 : 0);
