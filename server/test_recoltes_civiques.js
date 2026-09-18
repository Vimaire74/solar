/* ============================================================================
   TEST — UNE RÉCOLTE PAR TOUR, EN PÉNURIE SEULEMENT, POUR LES DEUX CERVEAUX
   ----------------------------------------------------------------------------
   POURQUOI. Partie 20C9 (Marc, 18/09). Les Martiens achètent « Extraction d'He3 » CINQ fois
   (2× au tour 6, 3× au tour 7) et finissent à 4⚡ pour 20🪨 et 10🔬, troisièmes à 76 VP.
   Marc, prudent, a demandé de vérifier avant de corriger : « vérifie que ce n'était pas nécessaire
   parce qu'on est souvent en pénurie, ça peut se justifier pour acquérir une tech ou pour
   augmenter une colonie ou pour pouvoir se protéger en cas de guerre. » Il avait raison sur le
   fond : ils convertissaient un surplus (🪨/🔬) vers leur goulot (⚡), et ce +6⚡ du tour 7 a payé le
   Réseau Empathique et la Surtension. Le défaut n'est pas la conversion, c'est le PRIX — 1 AC pour
   +2⚡, trois AC d'un tour qui en comptait six.

   ET LE GARDE-FOU EXISTAIT DÉJÀ. `tryCivic` limitait les récoltes à une par tour, en pénurie
   seulement (ressource ≤ 2), jamais en payant dans la ressource manquante. Mais `coupsPossibles`,
   le générateur du TACTICIEN — celui qui joue réellement —, proposait chaque carte abordable sans
   compteur ni condition. Deux règles pour la même question ; aucune règle nouvelle n'est créée ici,
   on fait voir au tacticien celle que l'heuristique appliquait déjà.
   Usage : node test_recoltes_civiques.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 7; G.phase = 'actions';
  const jup = G.player, mar = G.ais[1];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup].concat(G.ais)) { n.res.morale = 8; n.acLeft = 6; n._recoltesTour = 0; }
  sb.setDecisionSink(() => {});
  return { sb, G, jup, mar };
}
const carte = (m, id) => vm.runInContext('CIVIC_MARKET.find(c=>c.id==="' + id + '")', m.sb);
const autorisee = (m, id) => vm.runInContext('_recolteAutorisee(G.ais[1],CIVIC_MARKET.find(c=>c.id==="' + id + '"))', m.sb);
const coupsCiv = (m, id) => vm.runInContext(
  '(coupsPossibles(G.ais[1])||[]).filter(c=>c&&c.type==="civique"&&c.card==="' + id + '").length', m.sb);

console.log('§1 La situation des Martiens au tour 7 : énergie au plus bas, matériaux en surplus');
{
  const m = montage();
  m.mar.res.energy = 1; m.mar.res.materials = 20; m.mar.res.science = 10;
  if (autorisee(m, 'cm_explore')) ok('Extraction d\'He3 reste permise : la pénurie d\'énergie est réelle');
  else ko('la conversion légitime est refusée — c\'est exactement ce que Marc voulait préserver');
  vm.runInContext('aiBuyCivic(G.ais[1],CIVIC_MARKET.find(c=>c.id==="cm_explore"))', m.sb);
  note('après un achat : énergie ' + m.mar.res.energy + ' · récoltes du tour ' + m.mar._recoltesTour);
  if (m.mar._recoltesTour === 1) ok('le compteur est tenu par l\'achat lui-même');
  else ko('compteur à ' + m.mar._recoltesTour + ' après un achat');
  if (!autorisee(m, 'cm_explore')) ok('la deuxième du tour est refusée');
  else ko('une deuxième récolte reste permise dans le même tour');
}

console.log('§2 Le TACTICIEN ne propose plus la carte une fois la récolte faite');
{
  const m = montage();
  m.mar.res.energy = 1; m.mar.res.materials = 20; m.mar.res.science = 10;
  const avant = coupsCiv(m, 'cm_explore');
  vm.runInContext('appliquerCoup(G.ais[1],{type:"civique",card:"cm_explore"})', m.sb);
  const apres = coupsCiv(m, 'cm_explore');
  note('coups « He3 » proposés : ' + avant + ' avant, ' + apres + ' après');
  if (avant === 1) ok('en pénurie, le tacticien voit bien le coup'); else ko('coup absent en pénurie');
  if (apres === 0) ok('après l\'achat, il ne le voit plus de ce tour');
  else ko('le tacticien propose encore la récolte — c\'est le spam de la partie 20C9');
  if (m.mar._recoltesTour === 1) ok('un achat par `appliquerCoup` compte aussi');
  else ko('le chemin du tacticien ne compte pas (' + m.mar._recoltesTour + ')');
}

console.log('§3 Hors pénurie, aucune récolte — même la première');
{
  const m = montage();
  m.mar.res.energy = 9; m.mar.res.materials = 9; m.mar.res.science = 9;
  if (!autorisee(m, 'cm_explore')) ok('énergie à 9 : la conversion n\'a pas lieu d\'être');
  else ko('récolte permise sans pénurie');
  if (coupsCiv(m, 'cm_explore') === 0) ok('le tacticien ne la propose pas non plus');
  else ko('le tacticien la propose hors pénurie');
}

console.log('§4 On ne paie pas une récolte avec la ressource qui manque');
{
  const m = montage();
  /* Capture d'astéroïdes rend 2🪨 et coûte 1⚡ 1🔬. En panne de matériaux ET d'énergie, elle reste
     interdite : elle creuserait l'autre trou. */
  m.mar.res.materials = 1; m.mar.res.energy = 1; m.mar.res.science = 9;
  if (autorisee(m, 'cm_forages')) ok('matériaux à 1, énergie payable : la récolte passe');
  else ko('récolte de matériaux refusée alors qu\'elle est justifiée');
  /* Investissement dans la Recherche rend 2🔬 et coûte 2🪨 : en panne de science ET de matériaux,
     l'heuristique la refusait déjà. */
  m.mar.res.science = 1; m.mar.res.materials = 1;
  const c = carte(m, 'cm_research');
  note('cm_research : rend ' + JSON.stringify(c.resGain) + ', coûte ' + JSON.stringify(c.cost));
  if (autorisee(m, 'cm_research')) ok('science à 1 : la récolte de science est permise');
  else ko('récolte de science refusée');
}

console.log('§5 Les cartes à usage unique ne sont pas touchées par la limite');
{
  const m = montage();
  m.mar.res.energy = 9; m.mar.res.materials = 9; m.mar.res.science = 9;
  /* Programmes Sociaux rend 2🙂 +1🔬, une fois par partie : la limiter reviendrait à l'interdire. */
  if (autorisee(m, 'cm_social')) ok('Programmes Sociaux (1×/partie) reste libre');
  else ko('une carte à usage unique est bloquée par la limite des récoltes');
  if (autorisee(m, 'cm_culture')) ok('Campagne Culturelle (moral) reste libre');
  else ko('une carte de moral est bloquée par la limite des récoltes');
}

console.log('§6 Le compteur repart à zéro au tour suivant');
{
  const m = montage();
  m.mar.res.energy = 1; m.mar.res.materials = 20; m.mar.res.science = 10;
  vm.runInContext('appliquerCoup(G.ais[1],{type:"civique",card:"cm_explore"})', m.sb);
  if (!autorisee(m, 'cm_explore')) ok('bloquée dans le tour');
  else ko('non bloquée dans le tour');
  m.mar._recoltesTour = 0;                 // ce que fait l'ouverture du tour (voir `startTurn`)
  m.mar.res.energy = 1;
  if (autorisee(m, 'cm_explore')) ok('permise à nouveau au tour suivant');
  else ko('encore bloquée après remise à zéro');
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_recoltes_civiques : une récolte par tour, en pénurie seulement, sur les deux chemins.');
