/* ============================================================================
   TEST — LE RAPPEL DU POUVOIR GRATUIT ARRIVE AU DERNIER AC, EN SOLO COMME EN LIGNE (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, appli : « le rappel du pouvoir de nation arrive maintenant à 0 action au lieu de
   l'avant-dernière action, tu peux rétablir comme avant ? ». « Avant » = le site, où online.js propose
   le pouvoir quand il reste 1 AC, une fois par tour. Le solo (`interleaveStep`) ne le proposait qu'à
   0 AC — depuis toujours (témoin v9.69) ; l'appli joue en solo, d'où la différence.
   §1 la main revient au joueur avec 1 AC et le pouvoir disponible → rappel ouvert, la main reste à lui
   §2 « Plus tard » → fenêtre fermée, 1 AC toujours là, pas de passe
   §3 à 0 AC, déjà proposé ce tour → plus de rappel, le tour passe
   §4 contre-épreuves : à 2 AC rien ; pouvoir déjà utilisé → rien ; une seule fois par tour
   Usage : node test_rappel_pouvoir_solo.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function monter(ac) {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G; G.turn = 2; G.phase = 'actions'; G._il = true;
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  const run = c => vm.runInContext(c, sb);
  /* Décor : un vrai « document » minimal pour la fenêtre du rappel (insertAdjacentHTML + getElementById). */
  run(`var _RAP_=null;
       _scAbilityReminderOpen=function(){ return !!_RAP_; };
       _scShowAbilityReminder=function(){ if(_RAP_)return; _RAP_={ouvert:true}; G._rappels=(G._rappels||0)+1; };
       _scCloseAbilityReminder=function(){ _RAP_=null; };
       G.player.abilityUsed=false; G.player.res.materials=10; G.player.acLeft=${ac}; G.player._passedRound=false;
       G._order=[G.player].concat(G.ais); G._ilIdx=0; G._humanActive=false; G._rappels=0;
       G.ais.forEach(a=>a._passedRound=true);`);
  return { G, run };
}

console.log('§1 à 1 AC : rappel, la main reste au joueur');
{
  const { G, run } = monter(1);
  run('interleaveStep()');
  if (run('G._rappels') === 1 && run('_scAbilityReminderOpen()')) ok('rappel ouvert à 1 AC'); else ko('pas de rappel à 1 AC (rappels=' + run('G._rappels') + ')');
  if (run('G._humanActive') && !run('G.player._passedRound')) ok('la main est au joueur, rien n\'est passé'); else ko('main ou tour passés');
  console.log('\n§2 « Plus tard » : on continue à jouer');
  run('_scAbilityReminderSkip()');
  if (!run('_scAbilityReminderOpen()') && run('G.player.acLeft') === 1 && !run('G.player._passedRound')) ok('fenêtre fermée, 1 AC conservé, tour non passé'); else ko('« Plus tard » a passé le tour ou perdu l\'AC');
  console.log('\n§3 à 0 AC, déjà proposé : le tour passe sans redemander');
  run('G.player.acLeft=0; G._humanActive=false; interleaveStep()');
  if (run('G._rappels') === 1 && run('G.player._passedRound')) ok('pas de second rappel, tour passé'); else ko('second rappel à 0 AC (rappels=' + run('G._rappels') + ') ou tour non passé (' + run('G.player._passedRound') + ')');
}
console.log('\n§4 contre-épreuves');
{
  const { run } = monter(2);
  run('interleaveStep()');
  if (run('G._rappels') === 0) ok('à 2 AC : aucun rappel'); else ko('rappel à 2 AC');
}
{
  const { run } = monter(1);
  run('G.player.abilityUsed=true; interleaveStep()');
  if (run('G._rappels') === 0) ok('pouvoir déjà utilisé : aucun rappel'); else ko('rappel alors que le pouvoir est utilisé');
}
{
  const { run } = monter(1);
  run('interleaveStep(); _scAbilityReminderSkip(); G._humanActive=false; interleaveStep()');
  if (run('G._rappels') === 1) ok('une seule fois par tour à 1 AC'); else ko('rappel répété à 1 AC (' + run('G._rappels') + ')');
}
{
  const { run } = monter(0);
  run('interleaveStep()');
  if (run('G._rappels') === 1) ok('jamais proposé ce tour et 0 AC : rappel quand même (filet)'); else ko('à 0 AC sans proposition préalable : pas de rappel');
}
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ rappel du pouvoir : au dernier AC, une fois par tour');
process.exit(ecarts.length ? 1 : 0);
