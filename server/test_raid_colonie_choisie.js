/* TEST — LE RAID FRAPPE LA COLONIE CHOISIE, JAMAIS UNE AUTRE (Marc, 03/10)
   Avant : un raid sur une colonie non reliée pillait la plus productive de la victime (clic Cérès → Phobos pillée).
   §1 colonie non reliée : raid refusé, aucun AC ni jeton dépensé, rien pris.
   §2 colonie reliée : c'est elle qui est marquée pillée, pas une autre.  Usage : node test_raid_colonie_choisie.js */
'use strict';
const path = require('path'); const { Engine } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
function montage() {
  const eng = new Engine(path.join(__dirname, '..', 'index.html')); const sb = eng.sb;
  sb.initGame('terriens', ['martiens']); const G = sb.__G; G.turn = 3; G.phase = 'actions';
  const moi = G.player, mar = G.ais[0]; moi._isAI = false; mar._isAI = true;
  moi.acLeft = 3; moi.forceTokens = 6; moi.res.energy = 10; moi.res.materials = 10;
  mar.colonies.push({ nodeId: 'ceres', level: 1, connected: false }, { nodeId: 'vesta', level: 2, connected: true });
  sb.setDecisionSink(() => {}); return { sb, G, moi, mar };
}
console.log('§1 Cérès non reliée');
{ const m = montage(); const ac = m.moi.acLeft, tok = m.moi.forceTokens, res = JSON.stringify(m.moi.res);
  m.sb.doRaidTarget('martiens', 'ceres');
  if (m.moi.acLeft === ac && m.moi.forceTokens === tok) ok('raid refusé, rien dépensé'); else ko('AC ' + ac + '→' + m.moi.acLeft + ', jetons ' + tok + '→' + m.moi.forceTokens);
  if (JSON.stringify(m.moi.res) === res) ok('rien pris'); else ko('ressources changées');
  const pil = m.mar.colonies.filter(c => m.sb.coloniePilleeCeTour(c)).map(c => c.nodeId);
  if (!pil.length) ok('aucune colonie martienne pillée'); else ko('pillée à la place : ' + pil.join(',')); }
console.log('§2 Vesta reliée');
{ const m = montage(); m.sb.doRaidTarget('martiens', 'vesta');
  const pil = m.mar.colonies.filter(c => m.sb.coloniePilleeCeTour(c)).map(c => c.nodeId);
  if (pil.join(',') === 'vesta') ok('Vesta pillée, et elle seule'); else ko('pillées : ' + pil.join(',')); }
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ le raid frappe la colonie choisie');
process.exit(ecarts.length ? 1 : 0);
