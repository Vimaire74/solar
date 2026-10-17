/* ============================================================================
   TEST — VP DE REVENUS SUR LES VRAIS REVENUS ; AGENDA SECRET INVISIBLE JUSQU'À LA FIN
   ----------------------------------------------------------------------------
   Marc et Laurent, 997D (06/09) : « vérifie les points gagnés en fin de partie grâce au revenu
   dans chaque ressource, on pense que ça compte pas énergie et matériel. » Ils avaient raison :
   `calcVP` lisait `p.rpt`, qui ne contient que les BONUS DE CARTES (Universités, Ordinateur
   Quantique…) — jamais la production des colonies. L'énergie et les matériaux, qui viennent
   surtout des colonies, ne franchissaient presque jamais 5/tour. La règle écrite (§14) dit
   « revenus par tour, par ressource ».
   Et : « les points d'agenda secret ne doivent pas être comptés pendant la partie, seulement à la
   fin, pour le suspense. » Dans 09A0, Marc passait de 13 à 44 VP au tour 5 sous les yeux de tous.

   RÈGLES VERROUILLÉES ICI :
     1. les VP de revenus lisent `revenusBruts` (colonies + cartes + tout) : une nation à 6🪨/tour
        de colonies touche +2, à 11 elle touche +5 ;
     2. CONTRE-ÉPREUVE — le détail de `calcVP` nomme la ressource et le montant réel ;
     3. `vpAffiche(p)` (ce que voient les joueurs pendant la partie) exclut l'agenda tant que la
        partie n'est pas finie, et l'inclut une fois `G.phase==='over'` ;
     4. CONTRE-ÉPREUVE — `calcVP(p).total` (les règles : draft, IA, fin) ne change pas.

   Usage : node test_vp_revenus_agenda.js
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
  sb.initGame('ceinturiens', ['jupiteriens']);
  const G = sb.__G;
  G.turn = 9; G.phase = 'actions';
  const p = G.player;
  p.res.morale = 8;
  return { sb, G, p };
}

console.log('═'.repeat(84));
console.log('VP DE REVENUS — LES VRAIS ; AGENDA — CACHÉ JUSQU\'À LA FIN');
console.log('═'.repeat(84) + '\n');

console.log('1. Une nation dont les COLONIES produisent 6🪨/tour touche +2 ; à 11, +5');
{
  const m = montage();
  /* Aucune carte de revenu : tout vient des colonies. Titan Nv.3 + Triton Nv.3 rapportent des
     matériaux ; on lit le brut officiel pour connaître le vrai chiffre. */
  m.p.colonies.push({ nodeId: 'titan', level: 3, connected: true });
  m.p.colonies.push({ nodeId: 'triton', level: 3, connected: true });
  m.p.colonies.push({ nodeId: 'pluto', level: 3, connected: true });
  const brut = m.sb.revenusBruts(m.p);
  const attendu = r => { const v = brut[r] || 0; return v > 10 ? 5 : v > 5 ? 2 : 0; };
  const v = m.sb.calcVP(m.p);
  note('brut : ' + JSON.stringify(brut) + ' · rpt (cartes seules) : ' + JSON.stringify(m.p.rpt) + ' · rptVP rendu : ' + v.rptVP);
  const att = ['energy', 'materials', 'science', 'morale'].reduce((s, r) => s + attendu(r), 0);
  note('attendu d\'après la règle écrite (par ressource, sur le brut) : ' + att);
  if (att > 0 && v.rptVP === att) ok('les VP de revenus suivent les VRAIS revenus (' + att + ')');
  else if (att === 0) ko('montage insuffisant : aucun revenu > 5 — le banc ne prouve rien');
  else ko('rptVP = ' + v.rptVP + ' au lieu de ' + att + ' : les colonies ne comptent pas');
  const d = (v.det && v.det.rpt) || [];
  note('détail : ' + d.join(' · '));
  if (d.some(t => /mat/i.test(t) && new RegExp((brut.materials || 0) + '/tour').test(t))) ok('CONTRE-ÉPREUVE : le détail nomme les matériaux et le montant réel');
  else ko('le détail ne dit pas le vrai montant');
}

console.log('\n2. L\'agenda secret ne paraît pas dans les VP affichés avant la fin');
{
  const m = montage();
  /* Un agenda dont la condition est remplie : on le force à 12 pour ne pas dépendre du tirage. */
  m.p.agenda = { id: 'test', name: 'Test', emoji: '🎯', desc: 'banc', score: function () { return 12; } };
  const total = m.sb.calcVP(m.p).total;
  const aff = m.sb.vpAffiche(m.p);
  note('phase actions : calcVP.total ' + total + ' · vpAffiche ' + aff);
  if (aff === total - 12) ok('pendant la partie : affiché = total − agenda');
  else ko('vpAffiche = ' + aff + ' (total ' + total + ') : l\'agenda se voit');
  m.G.phase = 'over';
  const aff2 = m.sb.vpAffiche(m.p);
  note('phase over : vpAffiche ' + aff2);
  if (aff2 === total) ok('partie finie : l\'agenda est révélé et compté');
  else ko('à la fin, vpAffiche = ' + aff2 + ' au lieu de ' + total);
  if (m.sb.calcVP(m.p).total === total) ok('CONTRE-ÉPREUVE : `calcVP().total` (règles, IA, draft) inchangé');
  else ko('calcVP.total a changé');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Les revenus comptent pour ce qu\'ils sont ; l\'agenda garde son suspense.');
console.log('═'.repeat(84));
