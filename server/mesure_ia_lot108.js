/* ============================================================================
   MESURE — LOT 108 (13/09) : routes protégées, IA Défensive, Extra-Solaire, colonies Nv.3
   ----------------------------------------------------------------------------
   Compare le moteur d'AVANT le lot (copie) et celui du dossier, sur N parties tout-ordinateur
   (même boucle réduite que `mesure_economie_ia.js` : pas de guerres de fin de tour, pas
   d'événements — on mesure l'ÉCONOMIE et les choix, pas la guerre).
   Ce n'est PAS un test : c'est une mesure. Elle dit si les règles de Marc ont changé ce que
   les IA font, et dans quel sens.

   Usage : MOTEUR=avant|apres N=3 DEPART=0 node mesure_ia_lot108.js   (~45 s par partie : 3 par appel)
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const N = parseInt(process.env.N || '3', 10);
const DEPART = parseInt(process.env.DEPART || '0', 10);
const MOTEURS = (process.env.MOTEUR === 'avant')
  ? [{ nom: 'AVANT', html: process.env.AVANT || path.join('/tmp', 'avant_lot108', 'play.html') }]
  : [{ nom: 'APRÈS', html: path.join(__dirname, '..', 'play.html') }];

function unePartie(html, graine) {
  /* La VRAIE partie : le pilote du serveur, quatre sièges ordinateur, guerres, événements,
     investissements — tout. ~45 s par partie. */
  const { GameDriver } = require('./driver.js');
  const d = new GameDriver(html);
  try { require('vm').runInContext('(function(){ var s=' + (graine >>> 0) + '; Math.random=function(){ s+=0x6D2B79F5; var t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; })()', d.sb); } catch (e) {}
  d.boot([{ civId: 'terriens', isAI: true }, { civId: 'martiens', isAI: true }, { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  let r = d.pump(), n = 0;
  while (r.kind !== 'over' && n++ < 5000) {
    if (r.kind === 'decision') r = d.answer(r.pending.id, {});
    else if (r.kind === 'action') r = d.actAuto(r.civId);
    else break;
  }
  const sb = d.sb, G = d.state();
  const tous = () => [G.player].concat(G.ais);
  const c = { vp: 0, colonies: 0, nv3: 0, isolees: 0, routes: 0, protegees: 0, pirates: 0, jetonsRoute: 0, iadefNations: 0, extraNations: 0, extraT: [], fin: r.kind + '/T' + G.turn };
  for (const l of (G.log || [])) {
    const m = String((l && (l.msg || l.t || l.text)) || l);
    if (/Pirates ! Route/.test(m)) c.pirates++;
    if (/pose un jeton sur la route/.test(m)) c.jetonsRoute++;
    if (/achète (🚀 )?Exploration Extra-Solaire/.test(m)) c.extraT.push('T' + (l.turn || '?'));
  }
  for (const nat of tous()) {
    try { c.vp += sb.calcVP(nat).total; } catch (e) {}
    for (const col of (nat.colonies || [])) { c.colonies++; if ((col.level || 1) >= 3) c.nv3++; if (!col.connected && col.nodeId !== nat.civ.home) c.isolees++; }
    for (const rt of (nat.routes || [])) { c.routes++; if ((rt.tokens || 0) > 0) c.protegees++; }
    if ((nat.cards || []).some(x => x.id === 'iadef3')) c.iadefNations++;
    if ((nat.cards || []).some(x => x.id === 'extra3')) c.extraNations++;
  }
  return c;
}

console.log('═'.repeat(78));
console.log('LOT 108 — ' + N + ' partie(s) tout-ordinateur par moteur, graines ' + DEPART + '…' + (DEPART + N - 1));
console.log('═'.repeat(78));
for (const M of MOTEURS) {
  const tot = { vp: 0, colonies: 0, nv3: 0, isolees: 0, routes: 0, protegees: 0, pirates: 0, jetonsRoute: 0, iadefNations: 0, extraNations: 0, extraT: [] }; const fins = [];
  const t0 = Date.now();
  for (let k = 0; k < N; k++) {
    const c = unePartie(M.html, 1000 + DEPART + k); fins.push(c.fin);
    for (const key of Object.keys(tot)) { if (key === 'extraT') tot.extraT = tot.extraT.concat(c.extraT); else tot[key] += c[key]; }
  }
  const moy = k => (tot[k] / N).toFixed(1);
  console.log('\n' + M.nom + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s · ' + fins.join(', ') + ')');
  console.log('  VP cumulés des 4 nations / partie : ' + moy('vp'));
  console.log('  colonies / partie : ' + moy('colonies') + ' · dont niveau 3 : ' + moy('nv3') + ' · isolées à la fin : ' + moy('isolees'));
  console.log('  routes à la fin / partie : ' + moy('routes') + ' · protégées : ' + moy('protegees') + ' · détruites par les pirates : ' + moy('pirates') + ' · jetons posés par la règle : ' + moy('jetonsRoute'));
  console.log('  nations avec IA Défensive : ' + moy('iadefNations') + ' · avec Extra-Solaire : ' + moy('extraNations') + (tot.extraT.length ? ' (achetée aux tours ' + tot.extraT.join(', ') + ')' : ''));
}
