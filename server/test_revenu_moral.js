/* ============================================================================
   TEST — LE REVENU DE MORAL N'EST JAMAIS PUNI PAR LE MORAL, ET LE JOUEUR EST PRÉVENU
   ----------------------------------------------------------------------------
   Marc, partie 3CF5 (04/09) : Agriculture Durable +2🙂/tour, moral à 1 → « +1 brut −1 tension → 0
   net » : coincé à 1, revenus ÷2 pour le reste de la partie, et rien à l'écran pour le dire — il a
   conclu à des cartes cassées. « Faut pas diviser le revenu de moral, c'est déjà bien assez
   violent. » Et : « il faudrait un message pop-up pour avertir le joueur ».

   RÈGLES VERROUILLÉES ICI :
     1. le revenu de moral est versé d'abord, à plein ; le jugement (0 / 1) porte sur le moral
        OBTENU : moral 1 sans revenu de moral → ÷2 ; moral 1 avec +2 → 3, rien ;
     2. moral 0 sans revenu de moral → guerre civile, aucune ressource ; moral 0 avec +1 → 1 → ÷2 ;
     3. un humain dont le moral reste ≤ 1 après les revenus reçoit un avertissement (même canal que
        les raids subis : fenêtre à son prochain tour en solo, routée en ligne) ; pas d'avertissement
        quand le moral est remonté (contre-épreuve), jamais pour une IA.

   Usage : node test_revenu_moral.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(moral, revMoral) {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['terriens']);
  const G = sb.__G;
  G.turn = 3; G.phase = 'actions'; G._il = true;
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.morale = moral; moi.res.energy = 6; moi.res.materials = 6; moi.res.science = 6;
  moi.rpt = moi.rpt || {}; moi.rpt.morale = revMoral; moi.rpt.energy = (moi.rpt.energy || 0) + 4;
  for (const p of [moi, ia]) { p._passedRound = true; p.acLeft = 0; }
  return { sb, G, moi, ia };
}
function finDeTour(m) {
  const av = { e: m.moi.res.energy, mo: m.moi.res.morale };
  try { m.sb.runEndOfRound(); } catch (e) { note('exception : ' + e.message); }
  for (let g = 0; g < 12; g++) {
    const q = (m.G._pendings || [])[0] || m.G._pending; if (!q) break;
    try { m.sb.resolveDecision(q.id, m.sb._reponseSimulee(q)); } catch (e) { break; }
  }
  return { av, e: m.moi.res.energy, mo: m.moi.res.morale, avert: (m.G._ilPlayerHits || []).map(h => h.title) };
}

console.log('═'.repeat(84));
console.log('LE REVENU DE MORAL ÉCHAPPE AUX PÉNALITÉS DE MORAL');
console.log('═'.repeat(84) + '\n');

/* ── 1. Moral 1 : ÷2 sur les ressources, plein sur le moral ────────────────── */
console.log('1. Moral 1 sans revenu de moral : ÷2 ; moral 1 avec +2🙂 : jugé à 3, revenus pleins');
{
  const m = montage(1, 0);
  const brut = (m.sb.revenusBruts(m.moi) || {});
  const r = finDeTour(m);
  note('sans revenu de moral : moral ' + r.av.mo + ' → ' + r.mo + ' · énergie ' + r.av.e + ' → ' + r.e + ' (brut ' + brut.energy + '/tour)');
  if (r.e - r.av.e < (brut.energy || 0)) ok('resté à 1 : l\'énergie est divisée par deux');
  else ko('l\'énergie n\'est pas divisée alors que le moral est resté à 1');
  const m2 = montage(1, 2);
  const brut2 = (m2.sb.revenusBruts(m2.moi) || {});
  const r2 = finDeTour(m2);
  note('avec +2 de moral : moral ' + r2.av.mo + ' → ' + r2.mo + ' · énergie ' + r2.av.e + ' → ' + r2.e);
  if (r2.mo === 3) ok('+2 de moral perçus en entier (1 → 3)');
  else ko('moral ' + r2.mo + ' au lieu de 3');
  if (r2.e - r2.av.e === (brut2.energy || 0) || r2.e === 12) ok('jugé à 3 : l\'énergie est perçue en entier');
  else ko('énergie ' + r2.av.e + ' → ' + r2.e + ' : encore divisée alors que le moral jugé est 3');
}

/* ── 2. Moral 0 : guerre civile, mais le moral remonte ─────────────────────── */
console.log('\n2. Moral 0 sans revenu de moral : guerre civile ; moral 0 avec +1🙂 : jugé à 1, ÷2');
{
  const m = montage(0, 0);
  const r = finDeTour(m);
  note('sans revenu de moral : moral ' + r.av.mo + ' → ' + r.mo + ' · énergie ' + r.av.e + ' → ' + r.e);
  if (r.e === r.av.e && r.mo === 0) ok('guerre civile : aucune ressource');
  else ko('des ressources perçues en guerre civile (' + r.av.e + ' → ' + r.e + ')');
  const m2 = montage(0, 1);
  const brut2 = (m2.sb.revenusBruts(m2.moi) || {});
  const r2 = finDeTour(m2);
  note('avec +1 de moral : moral ' + r2.av.mo + ' → ' + r2.mo + ' · énergie ' + r2.av.e + ' → ' + r2.e + ' (brut ' + brut2.energy + ')');
  if (r2.mo === 1 && r2.e > r2.av.e && r2.e - r2.av.e < (brut2.energy || 0)) ok('le moral remonte à 1 — plus de guerre civile, revenus ÷2 : une sortie existe');
  else ko('moral ' + r2.mo + ', énergie ' + r2.av.e + ' → ' + r2.e + ' : la sortie de la guerre civile ne marche pas');
}

/* ── 3. L'avertissement ────────────────────────────────────────────────────── */
console.log('\n3. Un humain encore à 1 après les revenus est averti ; un humain remonté ne l\'est pas ; une IA jamais');
{
  const m = montage(0, 1);          // 0 → 1 : encore critique après les revenus
  const r = finDeTour(m);
  note('avertissements en attente : ' + JSON.stringify(r.avert));
  if (r.avert.some(t => /Moral critique/.test(t))) ok('fenêtre « Moral critique » programmée pour son prochain tour');
  else ko('aucun avertissement : le joueur ne saura pas pourquoi ses revenus sont divisés');
  const m2 = montage(1, 3);         // 1 → 4 : tiré d'affaire
  const r2 = finDeTour(m2);
  if (!r2.avert.some(t => /Moral critique/.test(t))) ok('remonté à ' + r2.mo + ' : pas d\'avertissement inutile');
  else ko('avertissement alors que le moral est remonté à ' + r2.mo);
  const m3 = montage(5, 0);
  m3.ia.res.morale = 0; m3.ia.rpt.morale = 0;
  const r3 = finDeTour(m3);
  if (!r3.avert.length) ok('l\'IA à 0 de moral ne déclenche aucune fenêtre chez le joueur');
  else ko('une fenêtre s\'ouvre chez le joueur pour le moral d\'une IA');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le moral remonte toujours à plein, et le joueur est prévenu quand il reste critique.');
console.log('═'.repeat(84));
