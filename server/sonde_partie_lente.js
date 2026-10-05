/* SONDE — UNE PARTIE ENTIÈRE, TOUT-ORDINATEUR, OBSERVÉE TOUR PAR TOUR (04/10/2026, après v11.52).
   Usage : NATIONS=2|3|4 DEPART=k node sonde_partie_lente.js — une partie par appel (VM lente).
   Relève par tour : VP, ressources, colonies (isolées), routes, cartes, jetons, PA, guerre ; en fin : T3, agendas, décompte. */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'index.html');
const N = parseInt(process.env.NATIONS || '4', 10), DEPART = parseInt(process.env.DEPART || '0', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'].slice(0, N);
function graine(n) { let x = (n + 1) >>> 0; Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
graine(DEPART);
const d = new GameDriver(HTML);
d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
const sb = d.sb, G = sb.__G;
const nats = () => [G.player].concat(G.ais || []);
const t3 = [], vu = new Set(); const origine = sb.doAITurn;
sb.doAITurn = function (nat, oneShot) {
  if (G.turn !== dernierTour) { dernierTour = G.turn; photo(); }
  const r = origine.call(null, nat, oneShot);
  try { for (const c of (nat.cards || [])) if (c && c.tier === 3 && !c.espCopy && !c._empathCopy && !vu.has(c.id)) { vu.add(c.id); t3.push(c.id + '@T' + G.turn + ':' + nat.civ.id.slice(0, 4)); } } catch (e) {}
  return r; };
const lignes = []; let dernierTour = 0;
function photo() {
  for (const p of nats()) {
    const col = p.colonies || [], iso = col.filter(c => !c.connected).length;
    lignes.push(['T' + G.turn, p.civ.id.slice(0, 4).padEnd(5), 'VP ' + String(sb.calcVP(p).total).padStart(3),
      String(p.res.energy|0).padStart(3) + 'E ' + String(p.res.materials|0).padStart(3) + 'M ' + String(p.res.science|0).padStart(3) + 'S ' + String(p.res.morale|0).padStart(2) + 'Mo',
      col.length + ' col(' + iso + ' iso) ' + (p.routes || []).length + ' rt ' + (p.cards || []).length + ' cartes ' + (p.forceTokens|0) + ' jet ' + (p.gov_pts|0) + ' gov',
      (p._profil || '') + (G.wars && G.wars.some(w => w.a === p.civ.id || w.b === p.civ.id) ? ' GUERRE' : ''),
      (p.agenda ? p.agenda.id : '')].join(' | '));
  }
}
let r = d.pump(), garde = 0;
while (garde++ < 200000) {
  if (!r || G.turn > G.maxTurns || G.phase === 'over') break;
  try {
    if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
    if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
    if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
  } catch (e) { console.log('ERREUR', e && e.message); break; }
  break;
}
lignes.push('--- fin ---'); photo();
console.log(lignes.join('\n'));
console.log('\nT3 :', t3.join(' · ') || 'aucune');
const log = (G.log || []).map(e => (typeof e === 'string' ? e : (e && (e.text || e.t || e.msg || ''))) || '').map(s => String(s).replace(/<[^>]+>/g, ''));
const compte = re => log.filter(s => re.test(s)).length;
console.log('Journal : raids', compte(/[Rr]aid sur|pill/), '· assauts/captures', compte(/capture|assaut|Assaut/), '· guerres déclarées', compte(/GUERRE DÉCLARÉE|WAR DECLARED/), '· paix', compte(/[Pp]aix accept/), '· accords', compte(/[Aa]ccord commercial conclu/));
for (const p of nats()) { const v = sb.calcVP(p); console.log('FIN', p.civ.id.padEnd(12), 'VP', v.total, '= col', v.colVP, 'rt', v.routeVP, 'cartes', v.cardsVP, 'tech', v.techBonusVP, 'revenus', v.rptVP, 'agenda', v.agendasVP, 'evt', v.evtVP, 'divers', v.extraVP, '| agenda', p.agenda && p.agenda.id); }
