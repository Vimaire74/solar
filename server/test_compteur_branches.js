/* ============================================================================
   TEST — LE COMPTEUR DE BRANCHES NE PEUT PAS DÉPASSER SON TOTAL
   ----------------------------------------------------------------------------
   POURQUOI. Marc, captures d'écran du 26/09 : l'en-tête des technologies affichait
   « 7/6 BRANCHES ». Le dénominateur était écrit en dur (`'{n}/6 branches'`) alors que
   `TECH_BRANCHES` en compte SEPT.

   POURQUOI 6 ÉTAIT JUSTE, PRESQUE TOUJOURS. La septième branche, 🔮 Empathes, n'est pas
   accessible au départ : il faut l'Union Sacrée (`isEmpathesAvailableFor`, qui lit
   `G.empathesFounder`). Dans une partie ordinaire, le joueur ne peut donc en ouvrir que six,
   et « n/6 » ne se trahit jamais. Mais dès que l'Union Sacrée ouvre la branche ET qu'on y
   prend une carte, le numérateur peut valoir 7 pour un total de 6.

   LA RÈGLE POSÉE : on compte les branches réellement OUVERTES à ce joueur, et le numérateur
   sur le MÊME ensemble. Numérateur et dénominateur ne peuvent alors plus se contredire,
   quelle que soit la suite de la partie.

   CE QUE CE BANC VERROUILLE :
     · sans Union Sacrée, le total affiché est 6 (rien ne change pour une partie ordinaire) ;
     · avec l'Union Sacrée, le total devient 7 ;
     · les sept branches ouvertes affichent 7/7 — jamais « 7/6 » ;
     · CONTRE-ÉPREUVE : le numérateur suit vraiment les branches entamées (0, puis 2) ;
     · CONTRE-ÉPREUVE : le banc sait lire un en-tête vide.

   Usage : node test_compteur_branches.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  G.player._isAI = false;
  (opts.branches || []).forEach(function (b) { G.branchTiers[b] = opts.rang || 1; });
  if (opts.union) G.empathesFounder = { civIds: new Set([G.player.civ.id]), openAtTurn: G.turn };
  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  return { sb, G };
}

/* Le texte réellement écrit dans l'en-tête. On lit le DOM, pas une reconstruction. */
function entete(sb) {
  try { sb.renderTechTree(); } catch (e) { note('(le dessin s\'interrompt : ' + e.message + ')'); }
  const el = sb.document.getElementById('branch-progress-summary');
  return String((el && el.textContent) || '');
}
const lire = txt => { const m = txt.match(/(\d+)\s*\/\s*(\d+)/); return m ? { n: +m[1], total: +m[2] } : null; };

console.log('═'.repeat(84));
console.log('COMPTEUR DE BRANCHES — LE TOTAL SUIT CE QUI EST OUVERT');
console.log('═'.repeat(84) + '\n');

console.log('1. Partie ordinaire, sans Union Sacrée : total 6');
{
  const m = montage({ branches: ['expansion', 'navigation'] });
  const txt = entete(m.sb), v = lire(txt);
  note('en-tête : « ' + txt + ' »');
  if (!v) ko('aucun « n/total » lisible — le point ne mesure rien');
  else if (v.total === 6) ok('total 6 : rien ne change pour une partie ordinaire');
  else ko('total ' + v.total + ' au lieu de 6 — la branche Empathes est comptée alors qu\'elle est fermée');
}

console.log('\n2. CONTRE-ÉPREUVE — le numérateur suit les branches entamées');
{
  const zero = lire(entete(montage({}).sb));
  const deux = lire(entete(montage({ branches: ['expansion', 'mines_energie'] }).sb));
  note('aucune branche : ' + (zero && zero.n) + ' · deux branches : ' + (deux && deux.n));
  if (!zero || !deux) ko('lecture impossible — le point ne mesure rien');
  else if (zero.n === 0 && deux.n === 2) ok('0 puis 2 : le chiffre n\'est pas décoratif');
  else ko('le numérateur ne suit pas (' + zero.n + ' puis ' + deux.n + ')');
}

console.log('\n3. Avec l\'Union Sacrée, la septième branche entre dans le total');
{
  const m = montage({ union: true, branches: ['expansion'] });
  const txt = entete(m.sb), v = lire(txt);
  note('en-tête : « ' + txt + ' »');
  if (!v) ko('aucun « n/total » lisible');
  else if (v.total === 7) ok('total 7 : la branche Empathes est ouverte, elle compte');
  else ko('total ' + v.total + ' alors que la branche Empathes est ouverte');
}

console.log('\n4. Les sept branches entamées : 7/7, jamais 7/6');
{
  const toutes = ['expansion', 'navigation', 'ia_renseignement', 'sciences_exp', 'spiritualite_nature', 'mines_energie', 'empathes'];
  const m = montage({ union: true, branches: toutes });
  const txt = entete(m.sb), v = lire(txt);
  note('en-tête : « ' + txt + ' »');
  if (!v) ko('aucun « n/total » lisible');
  else if (v.n > v.total) ko('« ' + v.n + '/' + v.total + ' » — c\'est le défaut des captures du 26/09');
  else if (v.n === 7 && v.total === 7) ok('7/7');
  else ko('« ' + v.n + '/' + v.total + ' » au lieu de 7/7');
}

console.log('\n5. Sept branches entamées SANS Union Sacrée : le compte reste cohérent');
{
  /* Cas limite : une sauvegarde d'avant cette correction, ou une carte Empathes obtenue par
     espionnage. Le numérateur ne doit toujours pas dépasser le dénominateur. */
  const toutes = ['expansion', 'navigation', 'ia_renseignement', 'sciences_exp', 'spiritualite_nature', 'mines_energie', 'empathes'];
  const m = montage({ branches: toutes });
  const txt = entete(m.sb), v = lire(txt);
  note('en-tête : « ' + txt + ' »');
  if (!v) ko('aucun « n/total » lisible');
  else if (v.n > v.total) ko('« ' + v.n + '/' + v.total + ' » — le numérateur dépasse encore');
  else ok('« ' + v.n + '/' + v.total + ' » : cohérent');
}

console.log('\n6. CONTRE-ÉPREUVE — le banc sait lire un en-tête vide');
{
  const m = montage({});
  const el = m.sb.document.getElementById('branch-progress-summary');
  if (el) el.textContent = '';
  if (!lire(String((el && el.textContent) || ''))) ok('un en-tête vide ne rend aucun couple de chiffres');
  else ko('la lecture rend quelque chose sur un en-tête vide');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le total annoncé est celui des branches ouvertes, et le compte ne se contredit plus.');
console.log('═'.repeat(84));
