/* ============================================================================
   TEST — LA SPHÈRE DE DYSON D'UN ORDINATEUR SE DEMANDE TOUT DE SUITE
   ----------------------------------------------------------------------------
   Marc, 04/09 : « pourquoi quand l'IA fait la Sphère de Dyson ça demande pas TOUT de suite au
   joueur s'il est d'accord, pourquoi en fin de tour, c'est ça qui fausse tout ». Avant, un drapeau
   (`_aiDysonBuilt`) reportait la question à la fin du tour, avec les guerres ; le +3⚡ de
   l'acceptation n'arrivait qu'au revenu suivant.

   Ce banc passe par le pilote serveur (`GameDriver`), là où les questions sont routées nation par
   nation :
     1. l'IA achète la Sphère → une question `ai_dyson` est EN ATTENTE pour l'humain, immédiatement,
        et le drapeau de fin de tour n'est pas posé ;
     2. accepter → +3⚡/tour tout de suite (donc dès le revenu de ce tour) ;
     3. refuser → guerre déclarée au bâtisseur, tension 10 ;
     4. les autres IA se prononcent d'elles-mêmes, sans question ;
     5. CONTRE-ÉPREUVE — en simulation (`G._simulationIA`), aucune question n'est posée.

   Usage : node test_dyson_immediat.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(sieges) {
  const d = new GameDriver(HTML);
  d.boot(sieges, () => {});
  const sb = d.sb, G = sb.__G;
  let r = d.pump(), g = 0;
  while (r && r.kind === 'decision' && g++ < 10) r = d.answer(r.pending.id, {});
  G.phase = 'actions';
  const ia = d.nation('terriens');
  ia.acLeft = 3; ia.res.science = 20; ia.res.materials = 20; ia.res.energy = 20;
  G.branchTiers.mines_energie = 3;
  vm.runInContext("allPlayers().find(n=>n.civ.id==='terriens').cards.push(CARDS_POOL.find(c=>c.id==='extract2'))", sb);
  return { d, sb, G, ia };
}

console.log('═'.repeat(84));
console.log('SPHÈRE DE DYSON — LA QUESTION PART AU MOMENT DE L\'ACHAT');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2. Question immédiate, acceptation → +3⚡ tout de suite ─────────────── */
console.log('1. L\'IA achète la Sphère : l\'humain a sa question tout de suite, pas en fin de tour');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true }]);
  const moi = m.d.nation('ceinturiens');
  const rptAvant = moi.rpt.energy || 0;
  m.sb.buyTech('dyson3', m.ia);
  const pend = (m.G._pendings || []).filter(p => p.kind === 'ai_dyson');
  note('Sphère achetée : ' + m.ia.cards.some(c => c.id === 'dyson3') + ' · questions ai_dyson en attente : ' + JSON.stringify(pend.map(p => p.nation)) + ' · drapeau fin de tour : ' + (m.G._aiDysonBuilt || null));
  if (pend.length === 1 && pend[0].nation === 'ceinturiens') ok('une question, adressée à l\'humain, immédiatement');
  else ko('pas de question immédiate pour l\'humain');
  if (!m.G._aiDysonBuilt) ok('le drapeau de fin de tour n\'est plus posé — la question ne sera pas reposée');
  else ko('drapeau `_aiDysonBuilt` encore posé : la question sera reposée en fin de tour');
  if (pend.length) {
    m.sb.resolveDecision(pend[0].id, { war: false });
    note('accepté → +' + ((moi.rpt.energy || 0) - rptAvant) + '⚡/tour');
    if ((moi.rpt.energy || 0) - rptAvant === 3) ok('+3⚡/tour acquis sur-le-champ : il comptera au revenu de CE tour');
    else ko('le +3⚡ n\'est pas arrivé (' + rptAvant + ' → ' + moi.rpt.energy + ')');
  }
}

/* ── 3. Refus → guerre ──────────────────────────────────────────────────────── */
console.log('\n2. Refuser le monopole déclare la guerre au bâtisseur');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true }]);
  m.sb.buyTech('dyson3', m.ia);
  const pend = (m.G._pendings || []).filter(p => p.kind === 'ai_dyson');
  if (pend.length) m.sb.resolveDecision(pend[0].id, { war: true });
  const w = m.sb._warBetween('ceinturiens', 'terriens');
  note('guerre Ceinturiens ↔ Terriens : ' + !!w + (w ? ' · tension ' + m.sb.getTens('ceinturiens', 'terriens') : ''));
  if (w) ok('guerre déclarée au bâtisseur');
  else ko('aucune guerre après le refus');
}

/* ── 4. Les autres IA se prononcent seules ─────────────────────────────────── */
console.log('\n3. À quatre nations, les IA répondent seules et l\'humain seul est interrogé');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true }, { civId: 'martiens', isAI: true }, { civId: 'jupiteriens', isAI: true }]);
  const mart = m.d.nation('martiens'), jup = m.d.nation('jupiteriens');
  const e1 = mart.rpt.energy || 0, e2 = jup.rpt.energy || 0;
  m.sb.buyTech('dyson3', m.ia);
  const pend = (m.G._pendings || []).filter(p => p.kind === 'ai_dyson');
  const repMart = (mart.rpt.energy || 0) > e1 || !!m.sb._warBetween('martiens', 'terriens');
  const repJup = (jup.rpt.energy || 0) > e2 || !!m.sb._warBetween('jupiteriens', 'terriens');
  note('questions : ' + JSON.stringify(pend.map(p => p.nation)) + ' · Martiens ont répondu : ' + repMart + ' · Jupitériens : ' + repJup);
  if (pend.length === 1 && pend[0].nation === 'ceinturiens') ok('une seule question, pour l\'humain');
  else ko('questions : ' + JSON.stringify(pend.map(p => p.nation)));
  if (repMart && repJup) ok('les deux IA ont accepté ou refusé, sans question');
  else ko('une IA n\'a pas répondu au monopole');
}

/* ── 5. CONTRE-ÉPREUVE — en simulation, aucune question ────────────────────── */
console.log('\n4. CONTRE-ÉPREUVE — une Sphère achetée POUR DE FAUX (simulation) ne pose aucune question');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true }]);
  const avant = (m.G._pendings || []).length;
  m.G._simulationIA = true;
  m.sb.buyTech('dyson3', m.ia);
  const apres = (m.G._pendings || []).filter(p => p.kind === 'ai_dyson').length;
  m.G._simulationIA = false;
  note('questions ai_dyson créées en simulation : ' + apres);
  if (apres === 0 && (m.G._pendings || []).length === avant) ok('rien de posé — le tacticien peut évaluer l\'achat sans déranger personne');
  else ko('une question a été posée pendant une simulation');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La Sphère d\'un ordinateur se demande à l\'instant de l\'achat, et le +3⚡ compte dès ce tour.');
console.log('═'.repeat(84));
