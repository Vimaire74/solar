/* ============================================================================
   TEST — LES +10 VP D'UNE CAPITALE SAUTENT QUAND ELLE ÉCHAPPE À SON CONQUÉRANT (règle B, 06/09)
   ----------------------------------------------------------------------------
   Partie 997D : le Jupitérien prend Éris (T8, +10), Marc la reprend (T8), le Jupitérien la reprend
   (T10, +10), Marc la reprend (T10). Fin : le Jupitérien garde +20 pour une capitale qu'il ne
   tient pas. Marc : « si la capitale est reprise, les 10 points doivent sauter immédiatement ».
   Règle B choisie par Marc : seul le PREMIER conquérant (celui qui la prend à sa nation d'origine)
   reçoit +10 ; il les perd dès qu'elle lui échappe — reprise par le propriétaire ou prise par un
   tiers ; ce tiers ne touche rien.

   RÈGLES VERROUILLÉES ICI :
     1. prise à sa nation d'origine : +10 chez le conquérant ;
     2. reprise par le propriétaire : −10 chez le conquérant, tout de suite (net 0), et le détail
        des VP le dit ;
     3. reprise puis reperdue : +10 de nouveau (prise à la nation d'origine), puis −10 de nouveau ;
     4. CONTRE-ÉPREUVE — prise par un TIERS au conquérant : le conquérant perd ses 10, le tiers ne
        gagne rien ;
     5. CONTRE-ÉPREUVE — le propriétaire d'origine ne perd ni ne gagne rien dans tout cela.

   Usage : node test_vp_capitale_reprise.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['jupiteriens', 'terriens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const marc = G.player, jup = G.ais[0], lau = G.ais[1];
  for (const n of [marc, jup, lau]) { n.res.morale = 8; n.tempVP = 0; n._vpDetail = []; }
  marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });   // Marc garde une colonie : il joue encore
  sb.setDecisionSink(function () {});
  return { sb, G, marc, jup, lau };
}
const vp = p => p.tempVP || 0;

console.log('═'.repeat(84));
console.log('+10 VP DE CAPITALE — VERSÉS AU PREMIER CONQUÉRANT, REPRIS DÈS QU\'ELLE LUI ÉCHAPPE');
console.log('═'.repeat(84) + '\n');

console.log('1-3. Le cycle de 997D : prise, reprise, reprise, reprise');
{
  const m = montage();
  m.sb.capturerNoeud(m.jup, 'eris');
  note('T8 Jupitériens prend Éris : Jup ' + vp(m.jup) + ' VP · Marc ' + vp(m.marc));
  if (vp(m.jup) === 10) ok('+10 au conquérant'); else ko('conquérant à ' + vp(m.jup));
  m.sb.capturerNoeud(m.marc, 'eris');
  note('T8 Marc reprend : Jup ' + vp(m.jup) + ' · Marc ' + vp(m.marc));
  if (vp(m.jup) === 0) ok('reprise : les 10 sautent tout de suite (net 0)'); else ko('après reprise, le conquérant garde ' + vp(m.jup));
  const det = (m.jup._vpDetail || []).map(e => (e.n >= 0 ? '+' : '') + e.n + ' ' + e.raison);
  note('détail Jupitériens : ' + det.join(' · '));
  if (det.some(t => /^-10/.test(t) && /Éris|capitale/i.test(t))) ok('le détail des VP dit la reprise (−10)'); else ko('le détail ne trace pas la reprise');
  m.G.turn = 10;
  m.sb.capturerNoeud(m.jup, 'eris');
  if (vp(m.jup) === 10) ok('T10 reprise à la nation d\'origine : +10 de nouveau'); else ko('T10 : ' + vp(m.jup));
  m.sb.capturerNoeud(m.marc, 'eris');
  if (vp(m.jup) === 0) ok('T10 reprise par Marc : −10 de nouveau — fin de partie à 0, pas à 20'); else ko('fin : ' + vp(m.jup));
  if (vp(m.marc) === 0) ok('CONTRE-ÉPREUVE : le propriétaire d\'origine n\'a rien gagné ni perdu'); else ko('Marc à ' + vp(m.marc));
  /* Le compte doit aussi se lire dans calcVP (evtVP = tempVP). */
  const c = m.sb.calcVP(m.jup);
  if (c.evtVP === 0) ok('et `calcVP` le reflète (evtVP 0)'); else ko('calcVP.evtVP = ' + c.evtVP);
}

console.log('\n4. CONTRE-ÉPREUVE — un tiers prend la capitale au conquérant : −10 chez lui, 0 chez le tiers');
{
  const m = montage();
  m.sb.capturerNoeud(m.jup, 'eris');
  m.sb.capturerNoeud(m.lau, 'eris');
  note('Jup ' + vp(m.jup) + ' · Terriens ' + vp(m.lau) + ' · Marc ' + vp(m.marc));
  if (vp(m.jup) === 0) ok('le conquérant perd ses 10 quand un tiers la lui prend'); else ko('conquérant à ' + vp(m.jup));
  if (vp(m.lau) === 0) ok('le tiers ne touche rien : « un jeton comme les autres colonies »'); else ko('tiers à ' + vp(m.lau));
  /* Et si Marc la reprend au tiers : rien ne bouge (le tiers n'avait rien). */
  m.sb.capturerNoeud(m.marc, 'eris');
  if (vp(m.lau) === 0 && vp(m.jup) === 0 && vp(m.marc) === 0) ok('reprise au tiers : personne ne bouge'); else ko('reprise au tiers : Jup ' + vp(m.jup) + ' Lau ' + vp(m.lau) + ' Marc ' + vp(m.marc));
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Les +10 d\'une capitale ne se gardent que tant qu\'on la tient.');
console.log('═'.repeat(84));
