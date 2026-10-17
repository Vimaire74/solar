/* ============================================================================
   DIAGNOSTIC — QUELLE FAMILLE DE COUPS FAIT DÉPENDRE LA PARTIE DE LA NATION ACTIVE ?
   ----------------------------------------------------------------------------
   POURQUOI. `test_equivalence` est rouge depuis que `tacticien` décide. Le piège posé sur `G.player`
   (`diag_perspective.js`) a montré des dizaines de sites de lecture, presque tous légitimes
   (affichage, journal) ou munis d'un repli documenté. Remonter les 32 appelants de `_moiId` à la
   lecture serait long et faux au premier oubli.

   ON PREND LE PROBLÈME PAR L'AUTRE BOUT. `tacticien` ne diffère d'`historique` que par deux choses :
   il SIMULE chaque coup, et il en joue d'autres — notamment militaires. On rejoue donc la mesure
   d'équivalence en RETIRANT des familles de coups, et on regarde laquelle rend la partie de nouveau
   indépendante de la nation active. La famille qui, retirée, éteint la divergence est celle qui la
   cause. C'est une bissection, pas une lecture.

   ⚠️ LE TÉMOIN EST INDISPENSABLE. Sans la ligne `historique`, un résultat vert ne prouverait rien :
   il pourrait signifier « ce protocole ne détecte rien », et non « cette famille est innocente ».

   Usage : node diag_equivalence_coups.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

/* Une partie tout-IA, hasard CONSTANT (voir test_equivalence : à graine égale le FLOT de tirages
   dépend de l'ordre des appels ; une constante supprime le hasard comme explication possible). */
function jouer(premier, cerveau, retirer) {
  const sb = loadLogic(HTML);
  vm.runInContext('Math.random=function(){return 0.42;};', sb);
  sb.initGame(premier, CIVS.filter(c => c !== premier));
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) p._isAI = true;
  if (cerveau) G._cerveauIA = cerveau;

  /* On filtre l'ÉNUMÉRATION des coups, pas la décision : le cerveau reste intact, il choisit
     simplement dans un catalogue amputé. */
  if (retirer && retirer.length && typeof sb.coupsPossibles === 'function') {
    const originel = sb.coupsPossibles;
    sb.coupsPossibles = function (nat) {
      return (originel(nat) || []).filter(c => retirer.indexOf(c.type) < 0);
    };
  }

  const ordre = CIVS.map(id => [G.player].concat(G.ais).find(p => p.civ.id === id)).filter(Boolean);
  let garde = 0;
  while (G.turn <= G.maxTurns && garde++ < 400) {
    const avant = G.turn;
    try {
      for (const p of ordre) { for (let a = 0; a < 8; a++) { if (!sb.doAITurn(p, true)) break; } }
      sb.advancePirates(); sb.doRevenues(); sb.doMaintenance();
    } catch (e) { /* on compare ce qui existe */ }
    G.turn = avant + 1;
  }
  const etat = {};
  for (const p of [G.player].concat(G.ais)) {
    etat[p.civ.id] = [p.res.energy | 0, p.res.materials | 0, p.res.science | 0, p.res.morale | 0,
      p.forceTokens | 0,
      Object.keys(G.nodes || {}).filter(n => G.nodes[n].owner === p.civ.id)
        .map(n => n + ':' + (G.nodes[n].level || 0)).sort().join(',')].join('|');
  }
  return etat;
}

/* Combien de nations voient leur état final changer quand on change la nation active ? */
function ecarts(cerveau, retirer) {
  const ref = jouer(CIVS[0], cerveau, retirer);
  let n = 0, total = 0;
  for (const premier of CIVS.slice(1)) {
    const autre = jouer(premier, cerveau, retirer);
    for (const id of CIVS) { total++; if (ref[id] !== autre[id]) n++; }
  }
  return { n, total };
}

console.log('═'.repeat(80));
console.log('BISSECTION — QUELLE FAMILLE DE COUPS PORTE LA DÉPENDANCE À LA NATION ACTIVE ?');
console.log('═'.repeat(80) + '\n');

const essais = [
  ['historique — TÉMOIN, doit être à zéro', 'historique', []],
  ['tacticien — tous les coups', 'tacticien', []],
  ['tacticien — sans assaut ni raid', 'tacticien', ['assaut', 'raid']],
  ['tacticien — sans accord', 'tacticien', ['accord']],
  ['tacticien — sans assaut, raid ni accord', 'tacticien', ['assaut', 'raid', 'accord']],
  /* Second tour de bissection, une fois le couple militaire désigné le 28/08 : lequel des deux ? */
  ['tacticien — sans assaut SEUL', 'tacticien', ['assaut']],
  ['tacticien — sans raid SEUL', 'tacticien', ['raid']],
];

for (const [titre, cerveau, retirer] of essais) {
  const t0 = Date.now();
  let r;
  try { r = ecarts(cerveau, retirer); } catch (e) { console.log('  ' + titre.padEnd(44) + ' interrompu : ' + e.message); continue; }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('  ' + titre.padEnd(44) + ' ' + String(r.n).padStart(3) + ' / ' + r.total
    + ' état(s) divergent(s)   (' + s + ' s)');
}

console.log('\n' + '═'.repeat(80));
console.log('LECTURE. La famille dont le RETRAIT ramène le compte à zéro est celle qui porte la');
console.log('dépendance. Si aucun retrait n\'y parvient, la fuite est dans la SIMULATION elle-même.');
console.log('═'.repeat(80));
