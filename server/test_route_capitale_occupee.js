/* ============================================================================
   TEST — UNE ROUTE QUI PART DE SA CAPITALE OCCUPÉE EST ROMPUE COMME LES AUTRES (Marc, 21/09)
   ----------------------------------------------------------------------------
   Partie 997D (06/09), tour 8. Éris, capitale de Marc, vient d'être prise. Marc contre-attaque :
   `declarerGuerre` rompt « les routes en territoire ennemi » — toute route dont AUCUNE extrémité
   n'est à lui et dont UNE est à l'ennemi. Sa route Éris→Triton (Triton pas encore colonisée)
   n'avait plus d'extrémité à lui : « 1 route(s) en territoire Jupitériens rompue(s) ». Une route
   qui part de SA capitale, même occupée, n'est pas une incursion chez l'ennemi : c'est le chemin
   du retour.

   ⚠️ INVERSÉ LE 21/09. L'exception « chemin du retour » n'avait pas été demandée par Marc :
   « La route est perdue selon les règles normales ». Une capitale occupée n'est plus à toi.

   RÈGLES VERROUILLÉES ICI :
     1. à la déclaration de guerre, une route touchant SA capitale (occupée par l'ennemi) est rompue ;
     2. CONTRE-ÉPREUVE — une route vraiment en territoire ennemi (aucune extrémité à soi, pas de
        capitale) est toujours rompue, jeton rendu.

   Usage : node test_route_capitale_occupee.js
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
  G.turn = 8; G.phase = 'actions';
  const marc = G.player, jup = G.ais[0];
  marc._isAI = false; jup._isAI = true;
  for (const n of [marc, jup]) { n.res.energy = 20; n.res.materials = 20; n.res.morale = 8; }
  /* Marc : Titan ; Éris (sa capitale) vient d'être prise par le Jupitérien (`capturerNoeud`). */
  marc.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  sb.capturerNoeud(jup, 'eris');
  marc.routes = [{ from: 'eris', to: 'triton', tokens: 1 }, { from: 'titan', to: 'triton', tokens: 0 }];
  sb.setDecisionSink(function () {});
  return { sb, G, marc, jup };
}
const aRoute = (p, a, b) => p.routes.some(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));

console.log('═'.repeat(84));
console.log('ROUTE DE LA CAPITALE OCCUPÉE — ROMPUE À LA DÉCLARATION DE GUERRE, COMME LES AUTRES');
console.log('═'.repeat(84) + '\n');

console.log('1. Éris (capitale, occupée) → Triton : la route est rompue à la déclaration de guerre');
{
  const m = montage();
  note('Éris tenue par : ' + m.sb.occupantsDuNoeud('eris').map(n => n.civ.name).join(', ') + ' · routes de Marc : ' + m.marc.routes.map(r => r.from + '→' + r.to).join(', '));
  const av = (m.G.log || []).length;
  m.sb.declarerGuerre(m.marc, m.jup, 'Assaut sur Éris !', 'player');
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  note('routes après : ' + m.marc.routes.map(r => r.from + '→' + r.to).join(', ') + ' · journal : ' + (j.find(t => /rompue/.test(t)) || '—').slice(0, 80));
  if (!aRoute(m.marc, 'eris', 'triton')) ok('Éris→Triton rompue : aucune extrémité à lui, pas d\'exception pour la capitale');
  else ko('Éris→Triton tient encore — l\'ancienne exception est toujours là');
  if (aRoute(m.marc, 'titan', 'triton')) ok('Titan→Triton tient (une extrémité à lui)');
  else ko('Titan→Triton rompue');
}

console.log('\n2. CONTRE-ÉPREUVE — une route vraiment chez l\'ennemi (Io→Europe, rien à Marc) est rompue');
{
  const m = montage();
  m.jup.colonies.push({ nodeId: 'europe', level: 1, connected: true });
  m.marc.routes.push({ from: 'io', to: 'europe', tokens: 1 });
  const jet = m.marc.forceTokens;
  m.sb.declarerGuerre(m.marc, m.jup, 'Assaut !', 'player');
  note('Io→Europe présente : ' + aRoute(m.marc, 'io', 'europe') + ' · jetons ' + jet + ' → ' + m.marc.forceTokens);
  if (!aRoute(m.marc, 'io', 'europe')) ok('rompue : aucune extrémité à lui, pas de capitale');
  else ko('une route en plein territoire ennemi n\'est plus rompue');
  if (m.marc.forceTokens === jet + 2) ok('ses jetons lui sont rendus (Io→Europe + Éris→Triton)');
  else ko('jeton non rendu (' + jet + ' → ' + m.marc.forceTokens + ')');
  if (!aRoute(m.marc, 'eris', 'triton')) ok('et Éris→Triton est rompue dans le même passage');
  else ko('Éris→Triton tient encore');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Pas d\'exception pour la capitale occupée ; les routes sans extrémité à soi tombent.');
console.log('═'.repeat(84));
