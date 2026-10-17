/* TEST — une nation sans colonie SORT DU JEU (partie 29BD, 22/09).
   Marc, éliminé au tour 9 : « le jeu me laisse continuer alors que j'ai perdu… je dois cliquer sur
   toutes les fenêtres alors que ça n'a plus de sens ». Il restait dans le tirage des Stratégies,
   dans les tensions (+9 « les Terriens te distancent »), dans une guerre déclarée APRÈS son
   élimination, et il encaissait sa surproduction.
   §1 règles (moteur) · §2 serveur : le pilote va jusqu'au décompte sans interroger l'éliminé.
   Usage : node test_elimination_hors_jeu.js */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

console.log('§1 — règles');
{
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['terriens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 9; G.phase = 'actions';
  const mar = G.player, ter = G.ais.find(a => a.civ.id === 'terriens'), jup = G.ais.find(a => a.civ.id === 'jupiteriens');
  mar._isAI = false;
  // Les Terriens ont 7 colonies connectées ; les Martiens n'en ont plus aucune.
  for (const n of ['titan', 'europe', 'callisto', 'ceres', 'deimos', 'encelade']) if (!ter.colonies.some(c => c.nodeId === n)) ter.colonies.push({ nodeId: n, level: 1, connected: true });
  mar.colonies = []; mar.routes = [];
  sb.setTens('martiens', 'terriens', 5); sb.setTens('terriens', 'martiens', 5);
  G.wars = G.wars || []; G.wars.push({ a: 'martiens', b: 'jupiteriens', turnsLeft: 2 });
  if (sb.estEliminee(mar)) ok('montage : les Martiens sont éliminés'); else ko('montage : les Martiens ne sont pas éliminés');
  if (typeof sb.retirerNationsEliminees === 'function') sb.retirerNationsEliminees();
  if (!(G.wars || []).some(w => w.a === 'martiens' || w.b === 'martiens')) ok('ses guerres s\'éteignent'); else ko('une guerre avec la nation éliminée subsiste');
  if (sb.getTens('martiens', 'terriens') === 0 && sb.getTens('terriens', 'martiens') === 0) ok('les tensions envers elle et les siennes retombent à 0'); else ko('tensions : ' + sb.getTens('martiens', 'terriens') + ' / ' + sb.getTens('terriens', 'martiens'));
  sb.updateTension();
  const tMT = sb.getTens('martiens', 'terriens');
  if (tMT === 0) ok('updateTension : aucune tension nouvelle pour l\'éliminé (dominance terrienne ignorée)'); else ko('updateTension : tension Martiens→Terriens = ' + tMT);
  if (!(G.wars || []).some(w => w.a === 'martiens' || w.b === 'martiens')) ok('aucune guerre populaire déclarée à l\'éliminé'); else ko('guerre déclarée à l\'éliminé');
  // Surproduction : figée.
  const vp0 = mar.tempVP || 0; mar.res.energy = 99; mar._surprodTour = null;
  sb.surproductionVP();
  if ((mar.tempVP || 0) === vp0) ok('surproduction : aucun VP pour l\'éliminé'); else ko('surproduction : +' + ((mar.tempVP || 0) - vp0) + ' VP à l\'éliminé');
  // Contre-épreuve : une nation en jeu surproduit toujours.
  const vpT0 = ter.tempVP || 0; ter.res.science = 99; ter._surprodTour = null; sb.surproductionVP();
  if ((ter.tempVP || 0) > vpT0) ok('contre-épreuve : une nation en jeu surproduit toujours'); else ko('contre-épreuve : la surproduction ne marche plus du tout');
  // Tirage des Stratégies : l'éliminé n'y est plus.
  G._stratOrder = null; sb.showEventAnnounce = function (ev, done) { if (typeof done === 'string') sb.fluxAppeler(done); };
  let ordre = null; const _orig = sb._runDraftStep; sb._runDraftStep = function () { ordre = (G._stratOrder || []).slice(); };
  sb._runStrategyDraftAfterAnnounce();
  sb._runDraftStep = _orig;
  if (ordre && ordre.length === 3 && !ordre.includes('martiens')) ok('tirage des Stratégies : 3 nations, sans l\'éliminé'); else ko('tirage des Stratégies : ' + JSON.stringify(ordre));
}

console.log('§2 — serveur : le pilote file jusqu\'au décompte');
{
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'martiens', isAI: false }, { civId: 'terriens', isAI: true }, { civId: 'jupiteriens', isAI: true }], () => {});
  const G = d.sb.__G;
  let r = d.pump(), g = 0, eliminer = false, questionsApres = 0, actionsApres = 0;
  while (g++ < 20000 && r && r.kind !== 'over') {
    if (!eliminer && G.turn >= 3 && r.kind === 'action') {
      // Élimination au milieu du tour 3 : la dernière colonie martienne tombe.
      const mar = d.nation('martiens'); mar.colonies = []; mar.routes = [];
      d.sb.eliminerRendreLaMain(mar); eliminer = true;
      r = d.pump(); continue;
    }
    if (r.kind === 'decision') {
      const civ = (r.pending.nation && r.pending.nation.civ) ? r.pending.nation.civ.id : r.pending.nation;
      if (eliminer && civ === 'martiens') questionsApres++;
      r = d.answer(r.pending.id, {}); continue;
    }
    if (r.kind === 'action') { if (eliminer && r.civId === 'martiens') actionsApres++; r = d.act(r.civId, { type: 'pass' }); continue; }
    if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    break;
  }
  if (eliminer) ok('montage : Martiens éliminés au tour 3'); else ko('montage : l\'élimination n\'a pas eu lieu');
  if (r && r.kind === 'over') ok('la partie va jusqu\'au décompte (tour ' + G.turn + ')'); else ko('la partie s\'arrête avant la fin : ' + (r && r.kind) + ' au tour ' + G.turn);
  if (questionsApres === 0) ok('aucune question posée à l\'éliminé'); else ko(questionsApres + ' question(s) posée(s) à l\'éliminé après son élimination');
  if (actionsApres === 0) ok('aucune action demandée à l\'éliminé'); else ko(actionsApres + ' action(s) demandée(s) à l\'éliminé');
}
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
