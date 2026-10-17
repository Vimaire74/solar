/* MESURE — UNE partie tout-ordinateur à 4 nations : les pirates font-ils tomber les routes non
   protégées, à quel taux, et épargnent-ils les Ceinturiens ? (Marc, 21/09)
   Chaque passage de `advancePirates` est encadré : routes exposées par nation AVANT, détruites APRÈS,
   chance théorique du tour. Usage : node mesure_pirates_partie.js [graine] */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');
const SEED = parseInt(process.argv[2] || '7', 10);
let x = (SEED + 1) >>> 0;
if (process.argv[2] !== 'hasard') Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
const d = new GameDriver(HTML);
d.boot(['terriens', 'martiens', 'jupiteriens', 'ceinturiens'].map(c => ({ civId: c, isAI: true })), () => {});
const sb = d.sb, G = sb.__G;
const trace = [];
sb.__trace = trace;
vm.runInContext(`advancePirates=(function(orig){ return function(){
  const avant={}, info={};
  for(const p of allPlayers()){
    const rs=(p.routes||[]);
    info[p.civ.id]={routes:rs.length, nues:rs.filter(r=>chancePillagePirates(p,r)>=0.7).length, jeton:rs.filter(r=>chancePillagePirates(p,r)>0&&chancePillagePirates(p,r)<0.7).length, tech:routesProtegeesParTech(p)};
    avant[p.civ.id]=(p.res.energy||0)+(p.res.materials||0)+(p.res.science||0);
  }
  const deja=G._piratesTour===G.turn;
  const res=orig.apply(this,arguments);
  if(!deja) for(const p of allPlayers()){ const ap=(p.res.energy||0)+(p.res.materials||0)+(p.res.science||0);
    __trace.push(Object.assign({tour:G.turn,nation:p.civ.id,pris:avant[p.civ.id]-ap},info[p.civ.id])); }
  return res; }; })(advancePirates);`, sb);
let r = d.pump(), garde = 0;
while (garde++ < 120000 && r && G.turn <= G.maxTurns) {
  try {
    if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
    if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
    if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
  } catch (e) { console.log('arrêt : ' + e.message); break; }
  break;
}
console.log('Partie graine ' + SEED + ' — terminée au tour ' + G.turn);
console.log('tour  nation        routes  nues(70%) jeton(30%) tech  ressources prises');
for (const t of trace) if (t.routes) console.log(String(t.tour).padStart(4) + '  ' + t.nation.padEnd(12) + String(t.routes).padStart(6) + String(t.nues).padStart(10) + String(t.jeton).padStart(10) + (t.tech ? '   oui' : '   —  ') + String(t.pris).padStart(8));
const par = {}; for (const t of trace) { const p = par[t.nation] = par[t.nation] || { pris: 0, att: 0 }; p.pris += t.pris; p.att += t.nues * 0.7 + t.jeton * 0.3; }
console.log('\nTotal par nation (pris / attendu) : ' + Object.entries(par).map(([n, v]) => n + ' ' + v.pris + ' / ' + v.att.toFixed(1)).join(' · '));
const lignes = (G.log || []).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, '')).filter(l => /Pirates !/.test(l));
console.log('Journal : ' + lignes.length + ' pillage(s) écrit(s)');
const tens = ['terriens', 'martiens', 'jupiteriens'].map(n => n + '→ceinturiens ' + sb.getTens(n, 'ceinturiens')).join(' · ');
console.log('Tension finale : ' + tens + ' · guerres déclarées : ' + (G.log || []).filter(e => /GUERRE DÉCLARÉE/.test(String((e && e.msg) || e))).length);
