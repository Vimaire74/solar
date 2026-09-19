/* ============================================================================
   TEST — UN COUP SIMULÉ PAR LE TACTICIEN NE TOUCHE PAS L'ÉCRAN
   ----------------------------------------------------------------------------
   POURQUOI. 19/09, parties de test en navigateur (solo, Martiens contre trois IA) : au tour 1,
   4 parties sur 12 ouvraient « attaqué par TERRANS — Assaut surprise sur Phobos », 2 jetons contre
   une garnison de 10 — un coup que le tacticien n'a jamais RETENU (sa trace ne le mentionne pas).
   C'était la SIMULATION du coup : `simulerCoup` joue chaque coup possible pour de faux, assaut
   compris ; en ligne la question de défense passe par `_emitDecision` et reçoit une réponse
   simulée, mais en SOLO `showAiAssaultDefenseModal` construisait la vraie fenêtre dans le DOM, que
   la remise du plateau ne retire pas. Même fuite pour les toasts « raid sur … » des raids simulés.

   RÈGLE. Pendant `G._simulationIA`, aucune fonction d'affichage ne touche l'écran : la défense
   de l'humain est estimée comme en ligne (`defenseIA`) et le combat se résout en silence ;
   `gainToast`, `notifyNationHit`, `showWarModal`, `showDiscoveryModal`, `showEventModal` et
   `render` rendent la main immédiatement.

   Usage : node test_simulation_sans_fenetre.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['terriens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 1; G.phase = 'actions';
  const hum = G.player, ter = G.ais[0];
  hum._isAI = false; G.ais.forEach(a => a._isAI = true);
  ter.forceTokens = 5; ter.res.materials = 6; ter.res.energy = 6; ter.res.morale = 5;
  hum.forceTokens = 5; hum.res.materials = 6; hum.res.energy = 6;
  return { sb, G, hum, ter };
}
/* Compte les écritures dans le DOM du décor (`document.body.insertAdjacentHTML`). */
function espionDom(sb) {
  const body = sb.document.body; let n = 0;
  const orig = body.insertAdjacentHTML;
  body.insertAdjacentHTML = function () { n++; return orig ? orig.apply(this, arguments) : undefined; };
  return () => n;
}

console.log('═'.repeat(84));
console.log('UN COUP SIMULÉ NE TOUCHE PAS L\'ÉCRAN');
console.log('═'.repeat(84));

console.log('\n1. Assaut d\'une IA sur l\'humain PENDANT une simulation : pas de fenêtre, combat résolu');
{
  const { sb, G, hum, ter } = montage();
  const compte = espionDom(sb);
  const cible = { type: 'colony', obj: hum.colonies.find(c => c.nodeId === hum.civ.home), name: 'Phobos' };
  const jetonsAvant = ter.forceTokens;
  G._simulationIA = true;
  let err = null;
  try { sb.showAiAssaultDefenseModal(ter, cible, 2, null, hum); } catch (e) { err = e; }
  G._simulationIA = false;
  if (err) ko('exception : ' + err.message);
  else ok('aucune exception');
  if (compte() === 0) ok('rien n\'a été inséré dans le DOM'); else ko(compte() + ' insertion(s) dans le DOM pendant la simulation');
  if (G._aiAssaultCtx == null) ok('aucun contexte de fenêtre laissé derrière (`G._aiAssaultCtx`)'); else ko('`G._aiAssaultCtx` est resté posé : une confirmation tardive rejouerait un combat imaginaire');
  if (ter.forceTokens < jetonsAvant) ok('le combat a eu lieu : l\'assaillant a engagé ses jetons (' + jetonsAvant + ' → ' + ter.forceTokens + ')');
  else ko('le combat n\'a pas eu lieu (jetons de l\'assaillant inchangés : ' + ter.forceTokens + ')');
}

console.log('\n2. Le même assaut HORS simulation ouvre bien la fenêtre (le correctif ne l\'a pas supprimée)');
{
  const { sb, G, hum, ter } = montage();
  const compte = espionDom(sb);
  const cible = { type: 'colony', obj: hum.colonies.find(c => c.nodeId === hum.civ.home), name: 'Phobos' };
  let err = null;
  try { sb.showAiAssaultDefenseModal(ter, cible, 2, null, hum); } catch (e) { err = e; }
  if (err) ko('exception hors simulation : ' + err.message);
  else if (compte() >= 1 && G._aiAssaultCtx && G._aiAssaultCtx.aiId === 'terriens') ok('fenêtre construite, contexte posé pour la confirmation du joueur');
  else ko('hors simulation la fenêtre n\'est pas construite (insertions : ' + compte() + ')');
}

console.log('\n3. Les autres fonctions d\'écran se taisent en simulation (garde en tête de fonction)');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  for (const f of ['gainToast', 'notifyNationHit', 'showWarModal', 'showDiscoveryModal', 'showEventModal', 'render']) {
    const i = src.indexOf('function ' + f + '(');
    const tete = i >= 0 ? src.slice(i, i + 400) : '';
    if (/G\._simulationIA\)return;/.test(tete)) ok(f + ' : garde présente');
    else ko(f + ' : pas de garde `_simulationIA` en tête');
  }
}

console.log('\n' + '═'.repeat(84));
if (!ecarts.length) console.log('✅ Un coup simulé par le tacticien ne laisse rien à l\'écran : ni fenêtre de défense, ni toast, ni résultat.');
else { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
console.log('═'.repeat(84));
