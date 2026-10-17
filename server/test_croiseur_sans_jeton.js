/* ============================================================================
   TEST — LE SUPERCROISEUR DÉFEND MÊME SANS JETON ENGAGÉ (Marc, 21/09, partie BCE3)
   ----------------------------------------------------------------------------
   « J'ai bien investi le supercroiseur et j'ai cliqué sur défendre, sans jeton, et il n'a pas été
   compté. » Europe tombe à 1🛡️ contre 7⚔️ au tour 9 : la garnison seule.
   Marc : « cette règle solo est fausse, supprime-la » — la règle « +5 seulement si tu engages au
   moins 1 jeton ». Décision : le croiseur COCHÉ compte partout, avec ou sans jeton, quel que soit
   le bouton, en solo comme en ligne.

   RÈGLES VERROUILLÉES ICI :
     1. réponse {defTokens:0, cruiser:true} → le croiseur défend (+5) ;
     2. réponse SANS le champ `cruiser` (vieux client en cache, réponse automatique) → il défend
        s'il est disponible et payable : ne pas répondre ne doit pas désarmer ;
     3. CONTRE-ÉPREUVE : {defTokens:0, cruiser:false} → il reste au port (sinon on paierait sans
        l'avoir demandé) ;
     4. le client en ligne : « Ne rien engager » ne jette plus la case cochée ;
     5. la fenêtre solo n'annonce plus « dès 1 jeton », elle a sa case, et la réponse la lit.
   Usage : node test_croiseur_sans_jeton.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function defendre(reponse) {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['terriens']);
  const G = sb.__G; G.turn = 7; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 20; moi.res.energy = 20; moi.forceTokens = 6; moi.hasCruiser = true; moi.cruiserPower = 5;
  moi.colonies.push({ nodeId: 'triton', level: 2, connected: true });
  ia.res.materials = 20; ia.res.energy = 20; ia.forceTokens = 12;
  G.wars = [{ a: ia.civ.id, b: moi.civ.id, winsBy: {}, turnsLeft: 99, live: true, declaredBy: 'ai' }];
  sb.setDecisionSink(function () {});
  const cible = { type: 'colony', obj: moi.colonies.find(c => c.nodeId === 'triton'), name: 'Triton' };
  G._pendings = []; const n0 = G.log.length;
  sb.showAiAssaultDefenseModal(ia, cible, 4, 'stRien', moi);
  const q = (G._pendings || [])[0];
  if (!q) return { question: false };
  sb.resolveDecision(q.id, reponse);
  const j = G.log.slice(0, G.log.length - n0).map(l => (l && l.msg) || String(l)).join(' | ');
  return { question: true, journal: j, deploye: /Supercroiseur en défense/.test(j), tient: /repoussé/.test(j) };
}

console.log('1. Défendre sans jeton, case cochée');
{ const r = defendre({ defTokens: 0, cruiser: true });
  if (!r.question) ko('aucune question de défense posée');
  else if (r.deploye && r.tient) ok('+5 compté : 1 garnison + 5 croiseur contre 4 — la colonie tient');
  else ko('croiseur ignoré : ' + r.journal); }

console.log('2. Réponse sans le champ « cruiser » (vieux client, réponse automatique)');
{ const r = defendre({ defTokens: 0 });
  if (r.deploye) ok('le croiseur disponible et payable défend quand même');
  else ko('ne pas répondre sur la case désarme le croiseur : ' + r.journal); }

console.log('3. CONTRE-ÉPREUVE — case décochée');
{ const r = defendre({ defTokens: 0, cruiser: false });
  if (!r.deploye) ok('le croiseur reste au port, rien n\'est payé');
  else ko('croiseur déployé et payé sans avoir été demandé'); }

console.log('4. Client en ligne : « Ne rien engager » garde la case');
{ const src = fs.readFileSync(path.join(__dirname, '..', 'online.js'), 'utf8');
  const n = (src.match(/sc-none'\)\.onclick=\(\)=>done\(\{defTokens:0, cruiser:false\}\)/g) || []).length;
  if (n === 0) ok('plus aucun bouton qui jette la case cochée');
  else ko(n + ' bouton(s) « Ne rien engager » envoient encore cruiser:false en dur'); }

console.log('5. Fenêtre solo : plus de « dès 1 jeton », une case, lue à la réponse');
{ const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const i = src.indexOf('function showAiAssaultDefenseModal('), fin = src.indexOf('function resolveAiAssaultOnPlayer(');
  const bloc = src.slice(i, fin);
  if (!/croiseur_auto/.test(bloc) && !/dès 1 jeton|≥1 jeton/.test(bloc)) ok('la règle « au moins 1 jeton » a disparu de la fenêtre');
  else ko('la fenêtre solo annonce encore le croiseur « dès 1 jeton »');
  if (/id="aad-cru"/.test(bloc) && /aad-cru/.test(bloc.slice(bloc.indexOf('function confirmAiAssaultDefense')))) ok('case « Déployer le Supercroiseur » présente et lue par la validation');
  else ko('pas de case, ou la validation ne la lit pas');
  const r = src.slice(src.indexOf('function _resolveAiAssaultOnPlayer('), src.indexOf('function _resolveAiAssaultOnPlayer(') + 1500);
  if (!/\(defTokens>0\)/.test(r)) ok('le moteur ne subordonne plus le croiseur à un jeton engagé');
  else ko('le moteur exige encore defTokens>0 pour le croiseur'); }

console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert'));
process.exit(ecarts.length ? 1 : 0);
