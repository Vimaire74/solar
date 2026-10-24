/* TEST — JETONS TEMPORAIRES ENGAGÉS EN PREMIER (Marc, 24/10/2026)
   Rapport du Flip 6 : Military Surge +2 (temporaires), raid avec 2 jetons, puis « jetons temporaires
   expirés (−2) » au tour suivant → 2 jetons PERMANENTS perdus.
   Règle : un engagement puise d'abord dans les temporaires ; un temporaire engagé disparaît (ni
   retour, ni récupération) ; l'expiration ne retire que les temporaires restants.
   Usage : node test_jetons_temporaires.js */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s), ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const eq = (a, b, m) => (a === b ? ok(m + ' = ' + a) : ko(m + ' : ' + a + ' au lieu de ' + b));

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['jupiteriens']);
  const G = sb.__G; G.turn = 3; G.phase = 'actions';
  const p = G.player; p.forceTokens = 6; p.forceCooldown = []; p.stratForceBonus = 2; p.milLoseNext = 0;
  return { sb, G, p };
}
console.log('1. Combat gagné avec 4 jetons dont 2 temporaires');
{ const { sb, p } = montage();
  sb.applyCombatEngage(p, 4, true);
  eq(p.stratForceBonus, 0, 'temporaires restants');
  eq(p.forceTokens, 3, 'réserve (6 − 4 + 1 revenu)');
  eq(p.forceCooldown.reduce((s, c) => s + c.count, 0), 1, 'en récupération');
  eq(p._dernierEngagement.tmp, 2, 'temporaires dissous'); }
console.log('2. Combat perdu avec 2 jetons, tous temporaires');
{ const { sb, p } = montage();
  sb.applyCombatEngage(p, 2, false);
  eq(p.forceTokens, 4, 'réserve'); eq(p.forceCooldown.length, 0, 'aucune récupération'); }
console.log('3. Expiration : seuls les temporaires restants sont retirés');
{ const { sb, G, p } = montage();
  sb.applyCombatEngage(p, 1, true);            // 1 temporaire utilisé, 1 restant
  const avant = p.forceTokens;                  // 5
  G.turn = 4; try { sb._startTurnPrep(); } catch (e) { ko('_startTurnPrep : ' + e.message); }
  eq(avant - p.forceTokens, 1, 'retiré à l\'expiration'); eq(p.stratForceBonus, 0, 'temporaires après expiration'); }
console.log('4. Raid avec les 2 temporaires (doRaidTarget)');
{ const { sb, G, p } = montage();
  p.acLeft = 3; p.res.energy = 9; const ai = G.ais[0];
  const col = (ai.colonies || [])[0];
  try { sb.doRaidTarget(ai.civ.id, col && col.nodeId); } catch (e) { ko('raid : ' + e.message); }
  eq(p.forceTokens, 4, 'réserve après raid'); eq(p.stratForceBonus, 0, 'temporaires consommés');
  eq(p.forceCooldown.reduce((s, c) => s + c.count, 0), 0, 'aucun jeton en récupération'); }
console.log('5. Route : un jeton temporaire ne se pose pas');
{ const { sb, p } = montage();
  p.forceTokens = 2; p.stratForceBonus = 2;                     // 2 jetons, tous temporaires
  const r = { from: 'x', to: 'y', tokens: 0 };
  const garn = (p.colonies || []).filter(c => c.nodeId !== p.civ.home).length; p.forceTokens += garn;
  eq(sb.jetonsPermanentsEngageables(p), 0, 'jetons permanents posables');
  eq(!!sb.deployerJetonSurRoute(p, r), false, 'pose refusée'); eq(r.tokens, 0, 'jeton sur la route'); }
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ jetons temporaires : tout est vert');
process.exit(ecarts.length ? 1 : 0);
