/* ============================================================================
   DIAGNOSTIC — QUI LIT `G.player` PENDANT QU'UNE AUTRE NATION DÉCIDE ?
   ----------------------------------------------------------------------------
   POURQUOI. `test_equivalence` est repassé au ROUGE le 28/08, le jour où `tacticien` est devenu le
   cerveau par défaut : la même partie tout-IA, rejouée en ne changeant QUE l'identité de la nation
   active, ne finit plus au même endroit. C'est la maladie de la perspective, revenue par le nouveau
   chemin de décision.

   ⚠️ POURQUOI UN DIAGNOSTIC ET PAS UNE RELECTURE. J'ai commencé par lire : `simulerCoup`,
   `coupsPossibles`, `appliquerCoup`, `_reponseSimulee`, `evaluerPosition` et `chooseAndAct` ne
   contiennent AUCUNE mention de `G.player`. Conclure « elles sont saines » aurait été faux : la
   fuite est forcément INDIRECTE, dans une fonction qu'elles appellent. Une relecture ne l'aurait
   trouvée qu'au prix d'un parcours exhaustif de l'arbre d'appels — long, et faux au premier oubli.
   On piège donc la lecture elle-même, et on laisse le moteur dénoncer ses propres lignes.

   COMMENT. `G.player` devient un accesseur. Pendant qu'une IA décide, toute lecture qui rend une
   nation AUTRE que celle qui joue est enregistrée avec sa pile d'appels. Dans `test_equivalence` les
   quatre nations sont des IA et `G.player` ne bouge jamais : une telle lecture est donc, par
   construction, une décision prise du point de vue de quelqu'un d'autre.

   Usage : node diag_perspective.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

const sb = loadLogic(HTML);
vm.runInContext('Math.random=function(){return 0.42;};', sb);
sb.initGame('terriens', CIVS.slice(1));
const G = sb.__G;
for (const p of [G.player].concat(G.ais)) p._isAI = true;

/* ── Le piège ──────────────────────────────────────────────────────────────
   On remplace la propriété par un couple lecteur/écrivain. La valeur réelle vit dans `_vraiJoueur`.
   `enregistrer` n'est vrai que pendant la décision d'une IA, et `acteur` dit qui décide. */
let _vraiJoueur = G.player, enregistrer = false, acteur = null;
const captures = new Map();
Object.defineProperty(G, 'player', {
  configurable: true, enumerable: true,
  get() {
    if (enregistrer && acteur && _vraiJoueur !== acteur) {
      /* On ne retient que le premier cadre appartenant à `moteur.js` : c'est la ligne coupable. */
      const pile = (new Error().stack || '').split('\n').slice(2);
      const ligne = pile.find(l => l.includes('play.html') || l.includes('moteur')) || pile[0] || '?';
      const cle = ligne.trim();
      captures.set(cle, (captures.get(cle) || 0) + 1);
    }
    return _vraiJoueur;
  },
  set(v) { _vraiJoueur = v; }
});

/* On n'enregistre QUE pendant `doAITurn` : ailleurs (revenus, entretien, affichage), lire `G.player`
   n'a pas le même sens et noierait le signal. */
const doAITurnOriginel = sb.doAITurn;
sb.doAITurn = function (nat, oneShot) {
  const avant = enregistrer, avantActeur = acteur;
  enregistrer = true; acteur = nat;
  try { return doAITurnOriginel(nat, oneShot); }
  finally { enregistrer = avant; acteur = avantActeur; }
};

console.log('═'.repeat(84));
console.log('DIAGNOSTIC — LECTURES DE `G.player` PENDANT LA DÉCISION D\'UNE AUTRE NATION');
console.log('═'.repeat(84) + '\n');

const ordre = CIVS.map(id => [_vraiJoueur].concat(G.ais).find(p => p.civ.id === id)).filter(Boolean);
let garde = 0;
while (G.turn <= G.maxTurns && garde++ < 400) {
  const avant = G.turn;
  try {
    for (const p of ordre) { for (let a = 0; a < 8; a++) { if (!sb.doAITurn(p, true)) break; } }
    sb.advancePirates(); sb.doRevenues(); sb.doMaintenance();
  } catch (e) { /* on continue : on veut la récolte complète */ }
  G.turn = avant + 1;
}

enregistrer = false;
const lignes = [...captures.entries()].sort((a, b) => b[1] - a[1]);
if (!lignes.length) {
  console.log('   Aucune lecture fautive. La divergence vient d\'ailleurs que de `G.player`.');
} else {
  console.log('   ' + lignes.length + ' site(s) de lecture, '
    + lignes.reduce((s, l) => s + l[1], 0) + ' lecture(s) au total :\n');
  for (const [ligne, n] of lignes) console.log('   ' + String(n).padStart(6) + ' × ' + ligne);
}
console.log('\n' + '═'.repeat(84));
console.log('LECTURE. Chaque ligne est un endroit du moteur qui, pendant que la nation X réfléchit,');
console.log('consulte la nation active Y. En solo Y est toi ; en ligne Y est quelqu\'un d\'autre.');
console.log('═'.repeat(84));
