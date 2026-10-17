/* ============================================================================
   TEST — LE MORAL SE JUGE EN FIN DE TOUR, APRÈS LE REVENU DE MORAL
   ----------------------------------------------------------------------------
   Marc, partie FD5F (04/09), tour 7 : usure −1, guerre populaire −2, « GUERRE CIVILE ! Moral 0 »
   — avec +4 (Confort) et +1 (Démocratie) de moral en attente dans le revenu. « On n'a pas un tour
   pour remonter son moral, c'est fatal. »
   Puis, en clair : « Si tu es à la fin du tour, APRÈS le revenu y compris de moral, alors tu
   divises par deux. »

   LA RÈGLE (`doRevenues`) : 1) le revenu de moral est versé, jamais puni ; 2) on juge le moral
   OBTENU — après les pertes de guerre de fin de tour et après ce revenu ; 3) 0 → guerre civile
   (aucune énergie/matériaux/savoir ce tour, AC ÷2 au tour suivant) ; 1 → ces trois revenus ÷2.

   HISTORIQUE. v10.15 figeait le moral de fin d'actions (`_moraleRev`) — une règle qui existait
   mais vivait dans un chemin mort (`endTurn`, jamais emprunté en jeu entrelacé). Marc a ensuite
   préféré juger APRÈS le revenu de moral : c'est ce banc.

   Ce banc joue la fin de tour RÉELLE (`runEndOfRound`) avec une perte de moral de guerre simulée
   entre la fin des actions et les revenus.
   Usage : node test_moral_fige.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(moralFinActions, revMoral) {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['terriens']);
  const G = sb.__G;
  G.turn = 7; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.morale = moralFinActions; moi.res.energy = 6; moi.res.materials = 6; moi.res.science = 6;
  moi.rpt = moi.rpt || {}; moi.rpt.morale = (revMoral === undefined ? 3 : revMoral);   // revenu de moral en attente
  for (const p of [moi, ia]) { p._passedRound = true; p.acLeft = 0; }
  /* La guerre de fin de tour, simulée : −3 moral pour le joueur, appliqué là où les guerres
     frappent — entre la fin des actions et les revenus (`updateTension`). */
  vm.runInContext("(function(){ var _u=updateTension; updateTension=function(){ G.player.res.morale=Math.max(0,(G.player.res.morale||0)-3); addLog('⚔️ (banc) guerre de fin de tour : −3 moral','red'); return _u.apply(this,arguments); }; })();", sb);
  return { sb, G, moi, ia };
}
function finDeTour(m) {
  const avantMat = m.moi.res.materials, avantMoral = m.moi.res.morale;
  const avantLog = (m.G.log || []).length;
  try { m.sb.runEndOfRound(); } catch (e) { note('exception : ' + e.message); }
  /* Les questions éventuelles (Dyson, guerres) sont vidées avec les réponses du moteur. */
  for (let g = 0; g < 12; g++) {
    const q = (m.G._pendings || [])[0] || m.G._pending; if (!q) break;
    try { m.sb.resolveDecision(q.id, m.sb._reponseSimulee(q)); } catch (e) { break; }
  }
  /* Les drapeaux `_civilWar` / `_halfResources` sont remis à zéro après les revenus : on lit ce
     que le JOURNAL a dit au joueur (le journal s'écrit en tête : les nouvelles lignes sont devant). */
  const nouv = (m.G.log || []).slice(0, Math.max(0, (m.G.log || []).length - avantLog)).map(l => (l && l.msg) || String(l));
  const civilWar = nouv.some(t => /GUERRE CIVILE ! Moral 0/.test(t));
  const moitie = nouv.some(t => /Moral 1 après revenus/.test(t));
  return { avantMat, avantMoral, civilWar, moitie, mat: m.moi.res.materials, moral: m.moi.res.morale, fige: m.moi._moraleRev };
}

console.log('═'.repeat(84));
console.log('LE MORAL FIGÉ EN FIN D\'ACTIONS DÉCIDE — PAS L\'EFFONDREMENT DE FIN DE TOUR');
console.log('═'.repeat(84) + '\n');

/* ── 1. Moral 2 à la fin des actions, −3 par la guerre : PAS de guerre civile ── */
console.log('1. Moral 2, la guerre retire 3 (plancher 0), le revenu rend 3 → jugé à 3 : pas de guerre civile, revenus pleins');
{
  const m = montage(2, 3);
  const r = finDeTour(m);
  note('figé : ' + r.fige + ' · guerre civile : ' + r.civilWar + ' · revenus ÷2 : ' + r.moitie + ' · matériaux ' + r.avantMat + ' → ' + r.mat + ' · moral → ' + r.moral);
  if (r.fige === 3) ok('le moral jugé est 3 — celui d\'APRÈS le revenu de moral');
  else ko('moral jugé ' + r.fige + ' au lieu de 3 : la règle ne se lit pas après le revenu');
  if (!r.civilWar) ok('pas de guerre civile — la nation a son tour pour remonter');
  else ko('GUERRE CIVILE déclarée sur un moral entamé par la guerre de fin de tour (le défaut de FD5F)');
  if (r.mat > r.avantMat) ok('les revenus sont perçus (' + r.avantMat + ' → ' + r.mat + '🪨)');
  else ko('aucun revenu perçu');
  if (r.moral === 3) ok('et le moral final est 3 (2 − 3 → 0, plancher, + 3)');
  else ko('moral final ' + r.moral + ' au lieu de 3');
}

/* ── 2. CONTRE-ÉPREUVE — moral 0 dès la fin des actions : guerre civile, à bon droit ── */
console.log('\n2. CONTRE-ÉPREUVE — moral 2, la guerre retire 3, AUCUN revenu de moral → 0 : guerre civile');
{
  /* Sans ce point, on « corrigerait » en supprimant la guerre civile. Celui qui n'a rien préparé
     pour remonter son moral se paie ; celui qui a un revenu de moral s'en sort. */
  const m = montage(2, 0);
  const r = finDeTour(m);
  note('jugé : ' + r.fige + ' · guerre civile : ' + r.civilWar + ' · matériaux ' + r.avantMat + ' → ' + r.mat);
  if (r.civilWar && r.mat === r.avantMat) ok('guerre civile, aucune ressource : rien n\'avait été prévu pour remonter');
  else ko('pas de guerre civile (ou des ressources perçues) alors que le moral jugé est 0');
}

/* ── 3. Moral 1 en fin d'actions : revenus ÷2, pas guerre civile, malgré la guerre ── */
console.log('\n3. Moral 2, −3 de guerre (plancher 0), +1 de revenu → jugé à 1 : revenus ÷2, pas de guerre civile');
{
  const m = montage(2, 1);
  const r = finDeTour(m);
  note('jugé : ' + r.fige + ' · guerre civile : ' + r.civilWar + ' · ÷2 : ' + r.moitie + ' · moral final ' + r.moral);
  if (!r.civilWar && r.moitie && r.moral === 1) ok('÷2 et rien de plus — le moral jugé est celui d\'après le revenu');
  else ko('pénalité fausse (guerre civile ' + r.civilWar + ', ÷2 ' + r.moitie + ')');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le moral se juge après son revenu : qui a préparé sa remontée s\'en sort, qui n\'a rien préparé se paie.');
console.log('═'.repeat(84));
