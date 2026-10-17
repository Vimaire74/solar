/* ============================================================================
   TEST — UNE CARTE NON RÉPÉTABLE DÉJÀ POSSÉDÉE APPARAÎT PRISE, PAS ACHETABLE
   ----------------------------------------------------------------------------
   Partie BCE3 (Marc, 21/09), tour 10 : « ⚠️ Supercroiseur — tu la possèdes déjà (une seule par
   partie) ». Marc l'a recliqué exprès : la carte restait affichée achetable, seul l'achat était
   refusé. Le marché ne grisait une carte militaire que si elle avait été achetée CE tour-ci.
   RÈGLES :
     1. Supercroiseur possédé → la tuile du marché est « prise » (gc-corne / no-buy, marque ✗) ;
     2. CONTRE-ÉPREUVE : Drones de Combat (répétable) possédés → toujours achetables ;
     3. la fiche détaillée (`showGeneralDetail`) calcule la même chose.
   Usage : node test_carte_possedee_grisee.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');

const i = src.indexOf('function renderNonBranchRow(');
const bloc = src.slice(i, i + 1500);
console.log('1. Marché : une carte non répétable possédée est « prise »');
if (/const taken=milThisTurn\|\|\(card\.repeatable\?false:\(G\.techTaken\.has\(card\.id\)\|\|mine\)\)/.test(bloc)) ok('taken inclut « déjà à moi » pour les cartes non répétables');
else ko('le marché ne regarde encore que les achats de ce tour et les cartes exclusives');

console.log('2. Fiche détaillée : même calcul');
const j = src.indexOf('function showGeneralDetail('); const bd = src.slice(j, j + 1200);
if (/card\.repeatable\?false:\(G\.techTaken\.has\(cardId\)\|\|G\.player\.cards\.some\(c=>c\.id===cardId\)\)/.test(bd)) ok('la fiche dit « prise » elle aussi');
else ko('la fiche détaillée propose encore l\'achat');

console.log('3. Fonctionnel : Supercroiseur possédé grisé, Drones de Combat possédés achetables');
{ const sb = loadLogic(HTML); sb.initGame('jupiteriens', ['martiens']);
  const G = sb.__G; G.phase = 'actions'; const p = G.player; p.acLeft = 5;
  p.res = { energy: 30, materials: 30, science: 30, morale: 8 };
  const pool = require('vm').runInContext('CARDS_POOL', sb);
  for (const id of ['mil3', 'mil1', 'robo2', 'drones1']) { const c = pool.find(x => x.id === id); if (c) p.cards.push(c); }
  p.hasCruiser = true;
  let html = '';
  try { sb.renderTechTree(); html = String((sb.document.getElementById('tech-body') || {}).innerHTML || ''); } catch (e) { ko('renderTechTree : ' + e.message); }
  if (!html) console.log('     (rendu indisponible hors navigateur — contrôle statique seulement)');
  else {
    const tuile = id => { const k = html.indexOf("showGeneralDetail('" + id + "')"); return k < 0 ? '' : html.slice(html.lastIndexOf('<div class="gcard', k), k); };
    if (/no-buy/.test(tuile('mil3'))) ok('Supercroiseur : tuile grisée'); else ko('Supercroiseur possédé encore affiché achetable');
    if (!/gc-corne/.test(tuile('mil1'))) ok('CONTRE-ÉPREUVE : Drones de Combat (répétables) non enroulés'); else ko('les Drones de Combat répétables sont grisés à tort');
  } }
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert'));
process.exit(ecarts.length ? 1 : 0);
