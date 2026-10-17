/* TEST — L'AGENDA SECRET NE COMPTE PAS DANS L'ORDRE DU TIRAGE DES STRATÉGIES
   Marc, 22/09 (partie 29BD) : « il faut enlever l'agenda secret du compte des points, quelqu'un
   pourrait deviner. » Le tri se faisait sur `calcVP().total`, agenda compris, alors que le journal
   affiche le score SANS l'agenda : Marc lisait « Martiens 21 » et se retrouvait classé comme s'il en
   avait 33. Pire, sa place dans le tirage trahissait le fait que son agenda était rempli.
   §1 le tri suit le score VISIBLE · §2 les jetons ne départagent qu'à égalité · §3 la trace de debug.
   Usage : node test_draft_agenda_secret.js */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['terriens', 'jupiteriens']);
  const G = sb.__G; G.turn = 5; G.phase = 'actions'; G.player._isAI = false;
  sb.showEventAnnounce = function (ev, done) { if (typeof done === 'string') sb.fluxAppeler(done); };
  return { sb, G, mar: G.player, ter: G.ais.find(a => a.civ.id === 'terriens'), jup: G.ais.find(a => a.civ.id === 'jupiteriens') };
}
function ordre(m) {
  let vu = null; const orig = m.sb._runDraftStep;
  m.sb._runDraftStep = function () { vu = (m.G._stratOrder || []).slice(); };
  m.sb._runStrategyDraftAfterAnnounce();
  m.sb._runDraftStep = orig;
  return vu;
}

console.log('§1 — un agenda rempli ne recule pas son auteur dans la file');
{
  const m = montage();
  /* Les Martiens : peu de points visibles, mais un agenda ⚡ rempli (+12 cachés).
     Les Terriens : quelques points visibles de plus, aucun agenda. */
  const ag = vm.runInContext('AGENDAS_POOL.find(a=>a.id==="ag13")', m.sb);
  const pool = vm.runInContext('CARDS_POOL', m.sb);
  m.mar.agenda = ag;
  for (const id of ['dyson3', 'extract2']) { const c = pool.find(x => x.id === id); if (c) m.mar.cards.push(c); }
  const vpMar = m.sb.vpAffiche(m.mar), totMar = m.sb.calcVP(m.mar).total;
  // Les Terriens passent juste AU-DESSUS du score visible des Martiens, et sous leur total réel.
  const carteVP = pool.filter(c => c.vp).sort((a, b) => a.vp - b.vp);
  let tot = m.sb.vpAffiche(m.ter), garde = 0;
  while (tot <= vpMar && garde++ < 40) { const c = carteVP[garde % carteVP.length]; if (!m.ter.cards.some(x => x.id === c.id)) m.ter.cards.push(c); tot = m.sb.vpAffiche(m.ter); }
  const vpTer = m.sb.vpAffiche(m.ter);
  console.log('     Martiens : ' + vpMar + ' visibles (' + totMar + ' réels, dont agenda ' + (m.sb.calcVP(m.mar).agendasVP || 0) + ') · Terriens : ' + vpTer + ' visibles');
  if (vpMar < vpTer && totMar > vpTer) ok('montage : les Martiens sont devant en visible, derrière en réel'); else ko('montage raté : ' + vpMar + ' / ' + vpTer + ' / ' + totMar);
  const o = ordre(m);
  if (o && o.indexOf('martiens') < o.indexOf('terriens')) ok('les Martiens choisissent AVANT les Terriens : ' + JSON.stringify(o));
  else ko('ordre : ' + JSON.stringify(o) + ' — l\'agenda secret pèse encore sur le tirage');
}

console.log('§2 — CONTRE-ÉPREUVE : à égalité de score visible, les jetons départagent');
{
  const m = montage();
  const pool = vm.runInContext('CARDS_POOL', m.sb);
  const c = pool.find(x => x.vp === 1) || pool.find(x => x.vp);
  // Même score visible pour tout le monde, mais les Terriens ont moins de jetons.
  m.mar.forceTokens = 9; m.ter.forceTokens = 1; m.jup.forceTokens = 9;
  const vus = [m.sb.vpAffiche(m.mar), m.sb.vpAffiche(m.ter)];
  if (vus[0] === vus[1]) ok('montage : Martiens et Terriens à égalité de score visible (' + vus[0] + ')'); else ko('montage : scores ' + JSON.stringify(vus));
  const o = ordre(m);
  if (o && o.indexOf('terriens') < o.indexOf('martiens')) ok('à égalité, le moins armé choisit avant : ' + JSON.stringify(o)); else ko('ordre : ' + JSON.stringify(o));
}

console.log('§3 — la trace de debug dit sur quoi le tri s\'est fait');
{
  const m = montage();
  const ag = vm.runInContext('AGENDAS_POOL.find(a=>a.id==="ag13")', m.sb);
  const pool = vm.runInContext('CARDS_POOL', m.sb);
  m.mar.agenda = ag; for (const id of ['dyson3', 'extract2']) { const c = pool.find(x => x.id === id); if (c) m.mar.cards.push(c); }
  ordre(m);
  const L = m.sb._analyseTexte();
  const i = L.findIndex(l => /ORDRE DU TIRAGE/.test(l));
  const bloc = i >= 0 ? L.slice(i, i + 8).join('\n') : '';
  if (/VP trié/.test(bloc) && /dont agenda 12/.test(bloc)) ok('le fichier de debug donne le VP trié, le VP réel et la part d\'agenda');
  else ko('trace de debug : ' + (bloc || 'absente'));
}
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
