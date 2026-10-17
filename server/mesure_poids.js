/* ============================================================================
   MESURE — LES NOUVEAUX POIDS DES RESSOURCES FONT-ILS GAGNER DES PARTIES ?
   ----------------------------------------------------------------------------
   Marc, 04/09 : « énergie première, science deuxième, matériaux troisième et moral dernière » et
   « multiplier par deux la pondération pour le manque ». Mon réglage du 28/08 disait l'inverse
   (savoir 0,85 · matériaux 0,55 · énergie 0,40, sans doublement).

   PROTOCOLE — tête-à-tête, sièges permutés, mêmes graines (voir `mesure_projet.js`). Les nations
   « anciennes » sont marquées `_anciensPoids` ; `evaluerPosition` est enveloppée DANS LE BAC À
   SABLE pour leur rendre l'ancien barème le temps de l'appel. Le moteur ne connaît pas ce drapeau.

   Usage : node mesure_poids.js           (PARTIES=<n> ; DEPART=<n> ; SENS=0|1 ; POIDS_JSON='{…}' barème testé ;
                                           ANCIEN_JSON='{…}' barème de référence — par défaut celui d'avant le 04/09)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const PARTIES = parseInt(process.env.PARTIES || '3', 10);
const DEPART = parseInt(process.env.DEPART || '0', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

function graine(n) {
  let x = n >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

function partie(seed, nouveaux) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  vm.runInContext(
    '(function(){ var _e = evaluerPosition;' +
    '  var ANCIEN = ' + (process.env.ANCIEN_JSON || '{ production:{energy:0.40,science:0.85,materials:0.55,morale:0}, tresorerie:{energy:0.12,science:0.22,materials:0.14,morale:0}, doublerManque:false, plafondProduction:9999, auDela:1, action:0, plafondMoral:0 }') + ';' +
    '  var NOUVEAU = ' + (process.env.POIDS_JSON || 'JSON.parse(JSON.stringify(POIDS_EVAL))') + '; poser(NOUVEAU);' +
    '  function poser(src){ for(var k in src){ if(src[k]&&typeof src[k]==="object") Object.assign(POIDS_EVAL[k], src[k]); else POIDS_EVAL[k]=src[k]; } }' +
    '  evaluerPosition = function(nat, obs){ var vieux = !!(nat && nat._anciensPoids); if(!vieux) return _e(nat, obs);' +
    '    poser(ANCIEN); try { return _e(nat, obs); } finally { poser(NOUVEAU); } }; })();',
    sb);
  for (const p of [G.player].concat(G.ais || [])) {
    if (p && p.civ) p._anciensPoids = !nouveaux[p.civ.id];
  }
  let r = d.pump(), g = 0;
  while (g++ < 120000) {
    if (!r) break;
    if (G.turn > G.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const res = {}, energie = {};
  for (const p of [G.player].concat(G.ais || [])) { res[p.civ.id] = sb.calcVP(p).total; energie[p.civ.id] = p.res.energy || 0; }
  return { res, energie };
}

console.log('═'.repeat(80));
console.log('POIDS DES RESSOURCES, TÊTE-À-TÊTE — ' + (PARTIES * 2) + ' parties');
console.log('═'.repeat(80) + '\n');

let vict = { avec: 0, sans: 0, egal: 0 };
let somme = { avec: 0, sans: 0 }, n = { avec: 0, sans: 0 }, en = { avec: 0, sans: 0 };
const t0 = Date.now();
for (let k = 0; k < PARTIES; k++) {
  const seed = 1000 + (k + DEPART) * 7717;
  for (const sens of (process.env.SENS !== undefined ? [parseInt(process.env.SENS, 10)] : [0, 1])) {   // SENS=0|1 : un seul sens (machine lente)
    const nouveaux = {};
    CIVS.forEach((c, i) => { nouveaux[c] = ((i % 2) === sens); });
    let out;
    try { out = partie(seed, nouveaux); }
    catch (e) { console.log('  graine ' + seed + '/' + sens + ' interrompue : ' + e.message); continue; }
    const sc = out.res;
    let mA = -1, mS = -1;
    for (const c of CIVS) {
      const v = sc[c]; if (v === undefined) continue;
      if (nouveaux[c]) { somme.avec += v; n.avec++; en.avec += out.energie[c]; if (v > mA) mA = v; }
      else { somme.sans += v; n.sans++; en.sans += out.energie[c]; if (v > mS) mS = v; }
    }
    if (mA > mS) vict.avec++; else if (mS > mA) vict.sans++; else vict.egal++;
    console.log('  graine ' + seed + ' sens ' + sens + ' — '
      + CIVS.map(c => c.slice(0, 4) + ' ' + (sc[c] === undefined ? '?' : sc[c]) + (nouveaux[c] ? '*' : ' ')).join(' · ')
      + '   (* = nouveaux poids)');
  }
}
const moy = (s, c) => c ? (s / c).toFixed(1) : '—';
console.log('\n' + '═'.repeat(80));
console.log('BILAN — ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log('═'.repeat(80));
console.log('   parties gagnées NOUVEAUX poids ...... ' + vict.avec);
console.log('   parties gagnées ANCIENS poids ....... ' + vict.sans);
console.log('   égalités ............................ ' + vict.egal);
console.log('   VP moyen — nouveaux ' + moy(somme.avec, n.avec) + '  ·  anciens ' + moy(somme.sans, n.sans));
console.log('   énergie en stock au dernier tour — nouveaux ' + moy(en.avec, n.avec) + '  ·  anciens ' + moy(en.sans, n.sans));
console.log('═'.repeat(80));
