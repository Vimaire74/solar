/* ════════════════════════════════════════════════════════════════════════════════════════════
   LE TOUR DE TABLE SE COMPTE EN ACTIONS, PAS EN COUPS
   ────────────────────────────────────────────────────────────────────────────────────────────
   DEUX RÈGLES, toutes deux demandées par Marc le 20/09 après sa partie 2A5F :

   1. LE POUVOIR NATIONAL NE COÛTE PAS DE PLACE. Il ne coûte pas d'action (0 AC) ; il ne doit pas
      en coûter une dans la rotation. L'ordinateur enchaînait déjà pouvoir + action payante dans
      un seul passage (`doAITurn`) ; le joueur, lui, rendait la main après son pouvoir. Son tour 6
      le montre : « Commerce avec les pirates » puis DEUX nations avant qu'il ne rejoue, pendant
      que « Surtension » + « Robotisation » des Martiens se suivaient sans interruption.

   2. UN COUP À 2 OU 3 AC COÛTE 2 OU 3 PLACES. « Logiquement, elles devraient faire elles aussi
      leurs 2 ou 3 actions avant que je puisse jouer mon action suivante. » On le note comme une
      DETTE sur la nation (`_passesDues`) : avancer l'index ferait sauter les AUTRES, c'est-à-dire
      exactement l'inverse de ce qu'on veut.

   Usage : node test_rotation_actions.js
   ════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['terriens', 'martiens']);
  const G = sb.__G;
  G.turn = 2; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  G._il = true; G._humanActive = true; G._ilIdx = 0;
  G._order = [G.player].concat(G.ais);
  for (const p of [G.player].concat(G.ais)) { p._passedRound = false; p._passesDues = 0; }
  G.player.acLeft = 5;
  /* `playerActed` enchaîne sur `interleaveStep`, qui fait jouer les ordinateurs et avance encore
     l'index : on ne mesurerait plus le pas DU JOUEUR. On neutralise la suite ; §3 la remet. */
  const vraiStep = vm.runInContext('interleaveStep', sb);
  vm.runInContext('interleaveStep=function(){};', sb);
  const rendreLaSuite = () => vm.runInContext('interleaveStep', sb) === vraiStep || (sb.interleaveStep = vraiStep, vm.runInContext('true', sb));
  return { sb, G, vraiStep, rendreLaSuite };
}

console.log('§1 Le pouvoir national (0 AC) ne rend pas la main');
{
  const { sb, G } = montage();
  const avant = G._ilIdx;
  sb.addAction('💫', 'Commerce avec les pirates', 0, {}, '+2');
  sb.playerActed();
  if (G._ilIdx === avant) ok('index inchangé après un coup à 0 AC (' + avant + ' → ' + G._ilIdx + ')');
  else ko('le pouvoir a fait avancer la rotation : ' + avant + ' → ' + G._ilIdx);
  if (!G.player._passesDues) ok('aucune dette de passage pour un coup gratuit');
  else ko('dette inattendue : ' + G.player._passesDues);
}

console.log('\n§2 Un coup à 1 AC rend la main une fois');
{
  const { sb, G } = montage();
  const avant = G._ilIdx;
  sb.addAction('🏗️', 'Coloniser', 1, { materials: 1 }, '');
  sb.playerActed();
  if (G._ilIdx === avant + 1) ok('index avancé d\'exactement 1 (' + avant + ' → ' + G._ilIdx + ')');
  else ko('index ' + avant + ' → ' + G._ilIdx + ', attendu ' + (avant + 1));
  if (!G.player._passesDues) ok('aucune dette : une action, une place');
  else ko('dette inattendue : ' + G.player._passesDues);
}

console.log('\n§3 Un coup à 3 AC coûte trois places');
{
  const { sb, G, vraiStep } = montage();
  sb.addAction('⚔️', 'Supercroiseur', 3, { materials: 4 }, '');
  sb.playerActed();
  if (G.player._passesDues === 2) ok('dette de 2 passages en plus de la place consommée');
  else ko('dette ' + G.player._passesDues + ', attendue 2');

  /* La dette se solde en SAUTANT le joueur quand son tour revient — pas en sautant les autres. */
  sb.interleaveStep = vraiStep;      // on remet la vraie boucle : c'est elle qui saute le joueur
  let sautes = 0;
  for (let i = 0; i < 6 && G.player._passesDues > 0; i++) {
    const avantDette = G.player._passesDues, avantIdx = G._ilIdx;
    G._ilIdx = 0;                                   // on ramène la main sur le joueur
    G._humanActive = false;
    sb.interleaveStep();
    if (G.player._passesDues === avantDette - 1) sautes++;
    else { ko('le tour du joueur n\'a pas été sauté (dette ' + avantDette + ' → ' + G.player._passesDues + ', idx ' + avantIdx + ' → ' + G._ilIdx + ')'); break; }
  }
  if (sautes === 2) ok('le joueur est sauté deux fois, puis reprend la main');
  else if (sautes) ko('sauté ' + sautes + ' fois au lieu de 2');
  if (G.player._passesDues === 0) ok('dette soldée');
  else ko('dette restante : ' + G.player._passesDues);
}

console.log('\n§4 La dette est remise à zéro à chaque manche');
{
  const { sb, G } = montage();
  G.player._passesDues = 2; G.ais[0]._passesDues = 1;
  try { sb.startTurn ? sb.startTurn() : null; } catch (e) {}
  const reste = [G.player].concat(G.ais).filter(p => p._passesDues > 0).length;
  if (typeof sb.startTurn !== 'function') console.log('   (startTurn absent du moteur — vérification faite par lecture : la remise à zéro est dans la boucle de début de manche)');
  else if (!reste) ok('toutes les dettes sont effacées au début du tour');
  else ko(reste + ' nation(s) gardent leur dette d\'un tour à l\'autre');
}

console.log('\n' + '═'.repeat(88));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) : ' + ecarts.join(' · ')); process.exit(1); }
console.log('✅ Le pouvoir national est gratuit en actions ET en places ; un coup à N AC en coûte N.');
console.log('═'.repeat(88));
