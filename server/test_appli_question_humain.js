/* ============================================================================
   TEST — DANS LE SOLO DE L'APPLI, UNE PROPOSITION FAITE AU JOUEUR LUI EST DEMANDÉE (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Partie téléphone de Marc (30/09), T10 : « [Martiens] Accord Io — 1 AC, 2 matériaux →
   avec Jupitériens ». Personne ne lui a rien demandé. Trois chemins ne posaient la question à un
   humain que si un ÉMETTEUR de décisions était installé (`_decisionActive()`, vrai sur le serveur) ;
   dans l'appli, le solo est local, sans émetteur : la règle des IA (`accordAcceptable`) tranchait à
   sa place. Même famille que l'espionnage de §167. Le pilote local (§170) sait pourtant porter la
   question jusqu'au joueur — il suffit de la poser.
   Le décor de Node n'a pas de pilote : on le déclare présent (`_piloteLocalActif`), comme l'appli.
   §1 accord direct d'une IA sur la colonie du joueur : question posée, rien de prélevé ; « oui » →
      accord signé et payé ; « non » → rien.
   §2 pacte de non-agression proposé par une IA au joueur : question posée.
   §3 accord du sommet commercial proposé par une IA au joueur : question posée.
   §4 contre-épreuves : un partenaire IA ne reçoit aucune question ; sans pilote ni émetteur (décor
      serveur), rien ne change.
   Usage : node test_appli_question_humain.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage(pilote) {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('jupiteriens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [G.player].concat(G.ais)) { n.res.materials = 12; n.res.energy = 10; n.res.morale = 8; n.acLeft = 4; n.tempVP = 0; }
  const run = c => vm.runInContext(c, sb);
  run(`var J_=G.player, M_=G.ais.find(a=>a.civ.id==="martiens"), T_=G.ais.find(a=>a.civ.id==="terriens");
       allPlayers().forEach(a=>allPlayers().forEach(b=>{ if(a!==b) setTens(a.civ.id,b.civ.id,0); }));
       G._pendings=[]; G._pending=null;`);
  if (pilote) run('_piloteLocalActif=function(){ return true; };');
  return { sb, G, run };
}
const questions = (m, civ) => m.run('JSON.stringify((G._pendings||[]).filter(q=>q.nation==="' + civ + '").map(q=>({id:q.id,kind:q.kind})))');

console.log('§1 accord direct d\'une IA sur la colonie du joueur');
for (const rep of ['yes', 'no']) {
  const m = montage(true);
  const av = m.run('JSON.stringify([M_.acLeft,M_.res.materials])');
  m.run('proposeAccord(J_.colonies[0].nodeId, M_)');
  const q = JSON.parse(questions(m, 'jupiteriens'));
  const ap = m.run('JSON.stringify([M_.acLeft,M_.res.materials])');
  if (!q.length) { ko('aucune question posée au joueur (réponse « ' + rep + ' »), accord ' + (m.run('!!accordEntre(M_,J_)') ? 'SIGNÉ d\'office' : 'refusé d\'office')); continue; }
  if (av === ap) ok('question « ' + q[0].kind + ' » posée, rien de prélevé'); else ko('prélevé avant la réponse : ' + av + ' → ' + ap);
  m.run('resolveDecision(' + JSON.stringify(q[0].id) + ',{value:"' + rep + '"})');
  const lie = m.run('!!accordEntre(M_,J_)'), fin = m.run('JSON.stringify([M_.acLeft,M_.res.materials])');
  if (rep === 'yes') { if (lie && fin === '[3,10]') ok('« oui » : accord signé et payé ' + fin); else ko('« oui » : lié=' + lie + ' ' + fin); }
  else { if (!lie && fin === av) ok('« non » : rien de signé, rien de payé'); else ko('« non » : lié=' + lie + ' ' + fin); }
}

console.log('\n§2 pacte de non-agression proposé par une IA');
{ const m = montage(true);
  m.run('_evDiploSel={jupiteriens:true}; fluxDonnees().accordsRestants=null; _evDiploConfirm("martiens")');
  const q = JSON.parse(questions(m, 'jupiteriens'));
  const pacte = m.run('typeof pacteEntre==="function"?!!pacteEntre(M_,J_):null');
  if (q.length) ok('question posée (' + q[0].kind + ')'); else ko('aucune question — pacte ' + (pacte ? 'signé d\'office' : 'non signé')); }

console.log('\n§3 accord du sommet proposé par une IA');
{ const m = montage(true);
  m.run('fluxDonnees().accordsRestants=null; _evCommPick("jupiteriens","martiens")');
  const q = JSON.parse(questions(m, 'jupiteriens'));
  if (q.length) ok('question posée (' + q[0].kind + ')'); else ko('aucune question — accord ' + (m.run('!!accordEntre(M_,J_)') ? 'signé d\'office' : 'non signé')); }

console.log('\n§4 contre-épreuves');
{ const m = montage(true);
  m.run('proposeAccord(T_.colonies[0].nodeId, M_)');
  const q = JSON.parse(questions(m, 'terriens'));
  if (!q.length && m.run('!!accordEntre(M_,T_)')) ok('partenaire IA : décidé par la règle, sans question'); else ko('partenaire IA : ' + q.length + ' question(s), lié=' + m.run('!!accordEntre(M_,T_)')); }
{ const m = montage(false);
  m.run('proposeAccord(J_.colonies[0].nodeId, M_)');
  const q = JSON.parse(questions(m, 'jupiteriens'));
  if (!q.length) ok('décor serveur sans émetteur : aucune question (inchangé)'); else ko('décor sans pilote : question posée'); }

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ questions au joueur dans l\'appli : tout est vert');
process.exit(ecarts.length ? 1 : 0);
