/* ============================================================================
   MESURE — LE PROJET EN CHAÎNE FAIT-IL GAGNER DES PARTIES ?
   ----------------------------------------------------------------------------
   POURQUOI. `reviserProjet` / `valeurProjet` donnent à l'IA un objectif à plusieurs tours (rang 3
   d'une branche, conquête préparée). Le banc `test_projet_ia.js` prouve que la mécanique fait ce
   qu'elle dit. Il ne dit RIEN sur le fait qu'elle fasse mieux jouer — le déni (§74) était juste et
   n'a rien changé. C'est ce que mesure ce banc-ci, et si c'est neutre, le bloc sort.

   PROTOCOLE — le même que `mesure_deni.js` : tête-à-tête dans la même partie (deux nations avec
   projet, deux sans), sièges permutés (chaque graine jouée dans les deux sens), mêmes graines.

   ⚠️ LA BIDOUILLE RESTE ICI. Les nations privées de projet sont marquées `_sansProjet` et
   `reviserProjet` / `valeurProjet` sont enveloppées DANS LE BAC À SABLE. Le moteur ne connaît pas
   ce drapeau.

   Usage : node mesure_projet.js          (PARTIES=<n> ; DEPART=<n> décale les graines ; POIDS=<k> multiplie la prime)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const PARTIES = parseInt(process.env.PARTIES || '3', 10);
const DEPART = parseInt(process.env.DEPART || '0', 10);   // décale les graines : permet d'élargir l'échantillon en plusieurs lancements
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

function graine(n) {
  let x = n >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

function partie(seed, avecProjet) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  vm.runInContext(
    '(function(){ var _r = reviserProjet, _v = valeurProjet, _k = ' + (parseFloat(process.env.POIDS || '1') || 1) + ';' +
    '  reviserProjet = function(nat){ if(nat && nat._sansProjet){ nat._projet = null; return; } return _r(nat); };' +
    '  valeurProjet = function(c, nat){ if(nat && nat._sansProjet) return 0; return _v(c, nat) * _k; }; })();',
    sb);
  for (const p of [G.player].concat(G.ais || [])) {
    if (p && p.civ) p._sansProjet = !avecProjet[p.civ.id];
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
  const res = {};
  for (const p of [G.player].concat(G.ais || [])) res[p.civ.id] = sb.calcVP(p).total;
  /* Témoins de mécanisme : projets accomplis, et assauts primés (chaînes de conquête menées au bout). */
  const trace = G._traceProjet || [];
  const accomplis = { avec: 0, sans: 0 }, conquetes = { avec: 0, sans: 0 };
  for (const t of trace) {
    const p = [G.player].concat(G.ais || []).find(x => x.civ.id === t.nat);
    const camp = (p && p._sansProjet) ? 'sans' : 'avec';
    if (t.acte === 'accompli') { accomplis[camp]++; if (/^prendre /.test(t.projet || '')) conquetes[camp]++; }
  }
  return { res, accomplis, conquetes };
}

console.log('═'.repeat(80));
console.log('PROJET EN CHAÎNE, TÊTE-À-TÊTE — ' + (PARTIES * 2) + ' parties (chaque graine jouée dans les deux sens)');
console.log('═'.repeat(80) + '\n');

let vict = { avec: 0, sans: 0, egal: 0 };
let somme = { avec: 0, sans: 0 }, n = { avec: 0, sans: 0 };
let acc = { avec: 0, sans: 0 }, conq = { avec: 0, sans: 0 };
const t0 = Date.now();

for (let k = 0; k < PARTIES; k++) {
  const seed = 1000 + (k + DEPART) * 7717;
  for (const sens of [0, 1]) {
    const avecProjet = {};
    CIVS.forEach((c, i) => { avecProjet[c] = ((i % 2) === sens); });
    let out;
    try { out = partie(seed, avecProjet); }
    catch (e) { console.log('  graine ' + seed + '/' + sens + ' interrompue : ' + e.message); continue; }
    const sc = out.res;
    let meilleurA = -1, meilleurS = -1;
    for (const c of CIVS) {
      const v = sc[c]; if (v === undefined) continue;
      if (avecProjet[c]) { somme.avec += v; n.avec++; if (v > meilleurA) meilleurA = v; }
      else { somme.sans += v; n.sans++; if (v > meilleurS) meilleurS = v; }
    }
    if (meilleurA > meilleurS) vict.avec++;
    else if (meilleurS > meilleurA) vict.sans++;
    else vict.egal++;
    acc.avec += out.accomplis.avec; acc.sans += out.accomplis.sans;
    conq.avec += out.conquetes.avec; conq.sans += out.conquetes.sans;
    console.log('  graine ' + seed + ' sens ' + sens + ' — '
      + CIVS.map(c => c.slice(0, 4) + ' ' + (sc[c] === undefined ? '?' : sc[c]) + (avecProjet[c] ? '*' : ' ')).join(' · ')
      + '   (* = avec projet)');
  }
}

const moy = (s, c) => c ? (s / c).toFixed(1) : '—';
console.log('\n' + '═'.repeat(80));
console.log('BILAN — ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log('═'.repeat(80));
console.log('   parties gagnées AVEC projet ....... ' + vict.avec);
console.log('   parties gagnées SANS projet ....... ' + vict.sans);
console.log('   égalités .......................... ' + vict.egal);
console.log('   VP moyen — avec ' + moy(somme.avec, n.avec) + '  ·  sans ' + moy(somme.sans, n.sans));
console.log('   projets accomplis — avec ' + acc.avec + ' (dont conquêtes ' + conq.avec + ')  ·  sans ' + acc.sans);
console.log('');
console.log('   ⚠️ LECTURE. « projets accomplis » est le TÉMOIN DE MÉCANISME : s\'il est à zéro côté');
console.log('      « avec », la règle n\'a rien fait et l\'écart de victoires est du bruit.');
console.log('═'.repeat(80));
