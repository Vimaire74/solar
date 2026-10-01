/* ============================================================================
   TEST — UNE ACTION REFUSÉE EN LIGNE ARRIVE AU JOUEUR EN AVIS « action_refusee » (30/09/2026)
   ----------------------------------------------------------------------------
   Marc : « quand on fait une action impossible et qu'on valide, il ne se passe rien […] il faut une
   fenêtre pour prévenir pourquoi ». En solo local la fenêtre s'ouvre dans le navigateur
   (`_montrerRefus`, vérifié par pw_parcours_appli §F). Sur le serveur, c'est `driver.act` qui envoie
   les refus retenus par le moteur (`G._refusRecents`) au joueur. Ce banc passe par le vrai pilote.
   §1 achat d'une technologie sans AC → un avis `action_refusee` au joueur, avec la raison.
   §2 contre-épreuve : une action qui passe n'envoie aucun avis de refus.
   Usage : node test_refus_en_ligne.js
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const vm = require('vm');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function jusquAMonTour() {
  const d = new GameDriver(HTML);
  const recues = [];
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'ceinturiens', isAI: true }], () => {});
  const orig = d._onDecision.bind(d);
  d._onDecision = p => { recues.push(p); return orig(p); };
  d.sb.setDecisionSink(p => { try { d._onDecision(p); } catch (e) {} });
  let r = d.pump(), g = 0;
  while (g++ < 3000 && r && r.kind !== 'action') r = (r.kind === 'decision') ? d.answer(r.pending.id, {}) : d.pump();
  return { d, r, recues, G: d.sb.__G };
}

console.log('§1 ACHAT SANS AC → AVIS « action_refusee »');
{
  const { d, r, recues, G } = jusquAMonTour();
  if (!r || r.kind !== 'action' || r.civId !== 'terriens') ko('le tour du joueur n\'arrive pas (' + JSON.stringify(r && r.kind) + ')');
  else {
    const moi = d.nation('terriens'); moi.acLeft = 0;
    const carte = vm.runInContext('CARDS_POOL', d.sb).find(c => c.tier === 1 && c.branch);
    const n0 = recues.length;
    try { d.act('terriens', { type: 'buyTech', card: carte.id }); } catch (e) {}
    const avis = recues.slice(n0).find(p => p && p.kind === 'action_refusee');
    if (avis && avis.nation === 'terriens') ok('avis envoyé à terriens'); else ko('aucun avis de refus (' + recues.slice(n0).map(p => p.kind).join(',') + ')');
    const corps = avis ? String(avis.payload && (avis.payload.body && (avis.payload.body.fr || avis.payload.body) || '')) : '';
    if (/AC/.test(corps)) ok('la raison est dans l\'avis : « ' + corps.replace(/<[^>]+>/g, ' ').slice(0, 60) + ' »'); else ko('raison absente de l\'avis : ' + JSON.stringify(avis && avis.payload).slice(0, 120));
    if (!(G._refusRecents || []).length) ok('file des refus vidée'); else ko('file des refus non vidée');
  }
}

console.log('\n§2 CONTRE-ÉPREUVE — une action qui passe');
{
  const { d, r, recues } = jusquAMonTour();
  if (r && r.kind === 'action') {
    const moi = d.nation('terriens'); moi.acLeft = 3; moi.res.materials = 20; moi.res.energy = 20; moi.res.science = 20;
    const carte = vm.runInContext('CARDS_POOL', d.sb).find(c => c.tier === 1 && c.branch && d.sb.isTechAvailable(c, moi));
    const n0 = recues.length;
    try { d.act('terriens', { type: 'buyTech', card: carte.id }); } catch (e) {}
    if (!recues.slice(n0).some(p => p && p.kind === 'action_refusee')) ok('aucun avis de refus pour un achat valide (' + carte.id + ')'); else ko('avis de refus pour une action valide');
  } else ko('tour du joueur non atteint');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ Refus en ligne : l\'avis part au joueur, avec sa raison.');
