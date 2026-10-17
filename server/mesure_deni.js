/* ============================================================================
   MESURE — LE DÉNI FAIT-IL GAGNER DES PARTIES ?
   ----------------------------------------------------------------------------
   POURQUOI. On vient d'ajouter `valeurDeni` : une prime sur l'ACHAT d'une technologie exclusive
   qu'un rival est en mesure de prendre. Le banc `test_deni_tech.js` prouve que la règle fait ce
   qu'elle dit. Il ne dit RIEN sur le fait qu'elle fasse mieux jouer. C'est ce que mesure ce banc-ci.

   ⚠️ ET CE N'EST PAS UNE FORMALITÉ. La version précédente de cette idée (§63) passait tous ses
   contrôles unitaires et faisait PERDRE l'IA — 8 victoires sur 16, sous la référence. Une règle
   juste peut être une mauvaise règle. Sans cette mesure, on n'en saurait rien.

   PROTOCOLE — repris de `mesure_cerveaux.js`, pour les mêmes raisons :
     · TÊTE-À-TÊTE DANS LA MÊME PARTIE. Comparer « 4 nations avec déni » à « 4 sans » ne prouverait
       rien : les scores d'une partie sont relatifs, et quatre nations également fortes se
       répartissent les mêmes points que quatre nations également faibles.
     · SIÈGES PERMUTÉS. Les civilisations et les positions de départ ne sont pas équivalentes :
       chaque graine est jouée DEUX fois, les rôles échangés.

   ⚠️ LA BIDOUILLE RESTE DANS LA MESURE. Pour priver certaines nations du déni, on enveloppe
   `valeurDeni` DANS LE BAC À SABLE, ici, et on marque les nations concernées d'un `_sansDeni`.
   Le moteur n'a aucune connaissance de ce drapeau : on ne met pas d'échafaudage de test dans le
   code du jeu.

   Usage : node mesure_deni.js            (PARTIES=<n> pour élargir l'échantillon)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const PARTIES = parseInt(process.env.PARTIES || '4', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

function graine(n) {
  let x = n >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/* `avecDeni` : civId → true/false. */
function partie(seed, avecDeni) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  /* On prive du déni les nations marquées — l'enveloppe vit ici, pas dans le moteur. */
  /* POIDS=<n> multiplie la prime : sert à distinguer « le poids est trop faible » de « l'occasion
     ne se présente pas ». Défaut 1 — la mesure porte alors sur la règle telle qu'elle est livrée. */
  vm.runInContext(
    '(function(){ var _vrai = valeurDeni, _k = ' + (parseFloat(process.env.POIDS || '1') || 1) + ';' +
    '  valeurDeni = function(id, nat){ if(nat && nat._sansDeni) return 0; return _vrai(id, nat) * _k; }; })();',
    sb);
  for (const p of [G.player].concat(G.ais || [])) {
    if (p && p.civ) p._sansDeni = !avecDeni[p.civ.id];
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
  /* Combien de technologies de rang 3 exclusives chaque camp a-t-il raflées ? C'est le mécanisme
     que la règle est censée activer : si ce nombre ne bouge pas, le résultat ne vient pas d'elle. */
  const t3 = { avec: 0, sans: 0 };
  for (const p of [G.player].concat(G.ais || [])) {
    const n = (p.cards || []).filter(c => c && c.branch && c.tier === 3 && !c._empathCopy && !c.espCopy).length;
    if (p._sansDeni) t3.sans += n; else t3.avec += n;
  }
  return { res, t3 };
}

console.log('═'.repeat(80));
console.log('DÉNI EN TÊTE-À-TÊTE — ' + (PARTIES * 2) + ' parties (chaque graine jouée dans les deux sens)');
console.log('═'.repeat(80) + '\n');

let vict = { avec: 0, sans: 0, egal: 0 };
let somme = { avec: 0, sans: 0 }, n = { avec: 0, sans: 0 };
let t3tot = { avec: 0, sans: 0 };
const t0 = Date.now();

for (let k = 0; k < PARTIES; k++) {
  const seed = 1000 + k * 7717;
  for (const sens of [0, 1]) {
    const avecDeni = {};
    CIVS.forEach((c, i) => { avecDeni[c] = ((i % 2) === sens); });
    let out;
    try { out = partie(seed, avecDeni); }
    catch (e) { console.log('  graine ' + seed + '/' + sens + ' interrompue : ' + e.message); continue; }
    const sc = out.res;
    let meilleurA = -1, meilleurS = -1;
    for (const c of CIVS) {
      const v = sc[c]; if (v === undefined) continue;
      if (avecDeni[c]) { somme.avec += v; n.avec++; if (v > meilleurA) meilleurA = v; }
      else { somme.sans += v; n.sans++; if (v > meilleurS) meilleurS = v; }
    }
    if (meilleurA > meilleurS) vict.avec++;
    else if (meilleurS > meilleurA) vict.sans++;
    else vict.egal++;
    t3tot.avec += out.t3.avec; t3tot.sans += out.t3.sans;
    console.log('  graine ' + seed + ' sens ' + sens + ' — '
      + CIVS.map(c => c.slice(0, 4) + ' ' + (sc[c] === undefined ? '?' : sc[c]) + (avecDeni[c] ? '*' : ' ')).join(' · ')
      + '   (* = avec déni)');
  }
}

const moy = (s, c) => c ? (s / c).toFixed(1) : '—';
console.log('\n' + '═'.repeat(80));
console.log('BILAN — ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log('═'.repeat(80));
console.log('   parties gagnées AVEC déni ......... ' + vict.avec);
console.log('   parties gagnées SANS déni ......... ' + vict.sans);
console.log('   égalités .......................... ' + vict.egal);
console.log('   VP moyen — avec ' + moy(somme.avec, n.avec) + '  ·  sans ' + moy(somme.sans, n.sans));
console.log('   technologies de rang 3 raflées — avec ' + t3tot.avec + '  ·  sans ' + t3tot.sans);
console.log('');
console.log('   ⚠️ LECTURE. Le nombre de rangs 3 est le TÉMOIN DE MÉCANISME : s\'il ne penche pas du');
console.log('      côté « avec », la règle ne s\'est pas déclenchée et l\'écart de victoires, quel');
console.log('      qu\'il soit, ne vient pas d\'elle. Un écart de victoires sans écart de rangs 3 est');
console.log('      du bruit — sur si peu de parties, il faut le dire plutôt que de le lire.');
console.log('═'.repeat(80));
