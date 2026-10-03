/* ============================================================================
   MESURE — TECHNOLOGIES DE NIVEAU 3 ET COLONIES ISOLÉES (03/10/2026, chantier « corriger les IA », §207-208)
   Marc : pondération de levier des T3 (IA Défensive 10, Hyperpropulsion 8, Dyson 8, Télépathie 8, Terraformation 6,
   Éveil 6, Extra-Solaire 4) et « empêcher qu'elles colonisent à tout va des colonies lointaines difficiles à connecter ».
   Parties entières, 4 sièges ordinateur (tacticien). Relève : chaque T3 prise (qui, quand), colonies totales et
   isolées en fin de partie, VP. Usage : PARTIES=1 DEPART=k node mesure_t3_colonies.js  (une partie par appel : VM lente)
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'index.html');
const PARTIES = parseInt(process.env.PARTIES || '1', 10), DEPART = parseInt(process.env.DEPART || '0', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
function graine(n) { let x = (n + 1) >>> 0; Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function partie(seed) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  const t3 = []; const vu = new Set();
  const origine = sb.doAITurn;
  sb.doAITurn = function (nat, oneShot) {
    const r = origine.call(null, nat, oneShot);
    try { for (const c of (nat.cards || [])) if (c && c.tier === 3 && !c.espCopy && !c._empathCopy && !vu.has(c.id)) { vu.add(c.id); t3.push(c.id + '@T' + G.turn + ':' + nat.civ.id.slice(0, 4)); } } catch (e) {}
    return r;
  };
  let r = d.pump(), garde = 0;
  while (garde++ < 120000) {
    if (!r || G.turn > G.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const nat = [G.player].concat(G.ais || []);
  return { t3, colonies: nat.reduce((s, p) => s + (p.colonies || []).length, 0), isolees: nat.reduce((s, p) => s + (p.colonies || []).filter(c => !c.connected).length, 0),
           vp: nat.map(p => p.civ.id.slice(0, 4) + ' ' + sb.calcVP(p).total).join(' · ') };
}
for (let k = 0; k < PARTIES; k++) { const t0 = Date.now(); const o = partie(DEPART + k); console.log('PARTIE ' + (DEPART + k) + ' ' + Math.round((Date.now() - t0) / 1000) + 's ' + JSON.stringify(o)); }
