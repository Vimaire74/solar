/* ============================================================================
   TEST — PAS D'ACTION PENDANT LE TOUR DES ORDINATEURS, ET ✓/↩ ARRIVE SEUL (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, appli v11.09 : « la fenêtre de validation de l'action qu'on vient de faire est
   souvent interrompue par la fenêtre qui indique ce que les autres ont joué […] la fenêtre pour
   valider ou annuler une action doit arriver juste après l'action, directement après ». En solo,
   rien n'empêchait de jouer PENDANT le tour des ordinateurs (1 s entre deux nations, dépêches à
   l'écran) : l'action s'appliquait, ✓/↩ s'armait, puis la nation suivante jouait et sa dépêche
   recouvrait tout. En ligne ce cas est bloqué (« pas ton tour »), en solo il ne l'était pas.
   §1 solo, tour des ordinateurs (`G._humanActive` faux) : l'achat est REFUSÉ, rien n'est prélevé,
      le journal le dit
   §2 contre-épreuve : pendant TON tour, le même achat passe
   §3 quand ✓/↩ s'arme, la carte des dépêches est fermée (`_ilHide`)
   §4 contre-épreuve : avec émetteur (serveur), la garde ne joue pas — le pilote serveur décide
   §5 contre-épreuve : le raid depuis la carte obéit à la même garde
   Usage : node test_action_hors_tour.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function monter() {
  const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G; G.turn = 2; G.phase = 'actions'; G._il = true;
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  const run = c => vm.runInContext(c, sb);
  run(`G.player.acLeft=3; G.player.res.science=20; G.player.res.energy=20; G.player.res.materials=20; G.player.forceTokens=6;
       var C_=CARDS_POOL.find(c=>c.tier===1&&isTechAvailable(c,G.player)&&!possedeCarte(G.player,c.id));
       G.log=[]; undoStack=[];`);
  return { sb, G, run };
}
const aJournal = (run, re) => run('(G.log||[]).some(e=>' + re + '.test(String(_logTexte(e))))');

console.log('§1 solo : les ordinateurs jouent → refusé');
{
  const { run } = monter();
  run('G._humanActive=false;');
  const ac = run('G.player.acLeft'), n = run('G.player.cards.length');
  run('buyTech(C_.id)');
  if (run('G.player.cards.length') === n) ok('carte non achetée'); else ko('la carte a été achetée hors tour');
  if (run('G.player.acLeft') === ac) ok('aucun AC prélevé'); else ko('AC prélevé hors tour');
  if (aJournal(run, '/autres nations jouent/i')) ok('journal : « les autres nations jouent »'); else ko('rien au journal');
  if (!run('_scConfirmArmed')) ok('✓/↩ pas armé'); else ko('✓/↩ armé hors tour');
}
console.log('\n§2 contre-épreuve : ton tour → l\'achat passe');
{
  const { run } = monter();
  run('G._humanActive=true;');
  const n = run('G.player.cards.length');
  run('buyTech(C_.id)');
  if (run('G.player.cards.length') === n + 1) ok('carte achetée'); else ko('achat refusé pendant ton tour');
}
console.log('\n§3 ✓/↩ ferme les dépêches');
{
  const { run } = monter();
  run('G._humanActive=true; var N_=0; var O_=_ilHide; _ilHide=function(){ N_++; return O_.apply(this,arguments); }; undoStack=[{}];');
  run('scArmConfirm("x",[])');
  if (run('N_') >= 1) ok('_ilHide appelé à l\'armement (' + run('N_') + ')'); else ko('les dépêches restent affichées quand ✓/↩ s\'arme');
  if (run('_scConfirmArmed')) ok('✓/↩ armé'); else ko('✓/↩ non armé (montage)');
}
console.log('\n§4 contre-épreuve : serveur (émetteur) → pas de garde solo');
{
  const { sb, run } = monter();
  sb.setDecisionSink(function () {});
  run('G._humanActive=false; G._il=false;');
  const n = run('G.player.cards.length');
  run('buyTech(C_.id)');
  if (run('G.player.cards.length') === n + 1) ok('achat passé (le pilote serveur décide)'); else ko('achat refusé avec émetteur');
}
console.log('\n§5 le raid obéit à la même garde');
{
  const { run } = monter();
  run('G._humanActive=false; var M_=G.ais.find(a=>a.civ.id==="martiens"); M_.colonies.forEach(c=>{c.connected=true;});');
  const ft = run('G.player.forceTokens');
  run('doRaidTarget("martiens", M_.colonies[0].nodeId, G.player)');
  if (run('G.player.forceTokens') === ft) ok('aucun jeton prélevé hors tour'); else ko('raid joué hors tour');
}
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ hors tour : refusé ; ✓/↩ arrive seul');
process.exit(ecarts.length ? 1 : 0);
