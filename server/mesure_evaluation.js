/* ============================================================================
   MESURE — QUE RÉCOMPENSE VRAIMENT `evaluerPosition` ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 28/08, après la partie 6D02 perdue 195 à 20 par l'IA :
   « viser les points de victoire dès le début est une erreur. D'abord on établit un système pour
   gagner des ressources, ensuite on améliore le système et on réagit à l'autre […] et à partir du
   milieu de la partie on veut plus de points de victoire. »

   C'est une thèse sur le JEU. On ne la code pas avant de l'avoir confrontée aux chiffres : ce banc
   ne corrige RIEN, il ouvre la boîte. Il décompose la note que l'IA attribue à sa propre position,
   terme par terme, tour par tour, et dit d'où vient la décision.

   `evaluerPosition` = acquis + production + trésorerie + potentiel + périlMoral + force
     · acquis     = calcVP().total          — les VP DÉJÀ marqués, à plein poids, dès le tour 1
     · production = revenus × tours restants × 0,30
     · trésorerie = stocks × ~0,15 × horizon
     · potentiel  = marge d'amélioration des colonies × horizon
     · périlMoral = 0 / −4 / −11 / −18 selon le moral
     · force      = jetons × 0,45 × horizon

   ⚠️ CE QUE CE BANC NE PEUT PAS DIRE. Il mesure ce que l'évaluation VALORISE, pas si le jeu est
   bien équilibré. Une conclusion du type « il faut pondérer autrement » demande ensuite un
   tête-à-tête mesuré (`mesure_cerveaux.js`) — sans quoi on remplace une intuition par une autre.

   Usage : node mesure_evaluation.js            (SEED=<n> pour rejouer la même partie)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const SEED = parseInt(process.env.SEED || '20260828', 10);
function graine(n) {
  let x = n >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/* La même décomposition que `evaluerPosition`, recalculée ICI pour pouvoir l'AFFICHER poste par
   poste. ⚠️ C'est une COPIE de la formule, et une copie diverge : elle ne sert qu'à observer, jamais
   à décider, et le banc VÉRIFIE que sa somme retombe sur la valeur rendue par le moteur (sans quoi
   il décrirait une fonction qui n'existe pas). */
function decomposer(sb, nat) {
  const G = sb.__G;
  const total = G.maxTurns || 10;
  const restants = Math.max(0, total - (G.turn || 1) + 1);
  const horizon = restants / total;
  const NODES = vm.runInContext('NODES', sb);
  const acquis = sb.calcVP(nat).total * (0.45 + 0.55 * (1 - horizon));
  let rev = {}; try { rev = sb.revenusBruts(nat) || {}; } catch (e) { rev = {}; }
  const parTour = (rev.materials || 0) * 0.55 + (rev.energy || 0) * 0.40 + (rev.science || 0) * 0.85;
  const production = parTour * restants * 0.36;
  const tresorerie = ((nat.res.materials || 0) * 0.14 + (nat.res.energy || 0) * 0.12 + (nat.res.science || 0) * 0.22) * horizon;
  let potentiel = 0;
  for (const c of (nat.colonies || [])) {
    const n = NODES[c.nodeId]; if (!n || n.decorative) continue;
    potentiel += Math.max(0, (n.maxLv || 3) - (c.level || 1)) * (n.baseVP || 1) * 0.45 * horizon;
    if (!c.connected) potentiel -= (n.baseVP || 1) * 0.5;
  }
  const moral = nat.res.morale || 0;
  const perilMoral = moral <= 0 ? -18 : moral <= 1 ? -11 : moral <= 3 ? -4 : 0;
  const payables = Math.min(nat.res.materials || 0, nat.res.energy || 0);
  const perilRes = payables <= 0 ? -12 : payables <= 1 ? -6 : payables <= 2 ? -2 : 0;
  const force = Math.min(12, nat.forceTokens || 0) * 0.45 * horizon;
  return { acquis, production, tresorerie, potentiel, perilMoral, perilRes, payables, force,
           somme: acquis + production + tresorerie + potentiel + perilMoral + perilRes + force };
}

console.log('═'.repeat(92));
console.log('CE QUE L\'IA VALORISE — décomposition de sa propre note, tour par tour (graine ' + SEED + ')');
console.log('═'.repeat(92) + '\n');

graine(SEED);
const d = new GameDriver(HTML);
d.boot([{ civId: 'terriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
const G = d.sb.__G;
const ia = G.ais[0];
const releve = [];
let coherenceKO = 0, coherenceOK = 0;

const orig = d.sb.doAITurn;
d.sb.doAITurn = function (nat, os) {
  const r = orig(nat, os);
  if (nat === ia && !releve.some(x => x.t === G.turn)) {
    const dec = decomposer(d.sb, nat);
    let vraie = null;
    try { vraie = d.sb.evaluerPosition(nat); } catch (e) {}
    if (vraie !== null) { if (Math.abs(vraie - dec.somme) < 0.05) coherenceOK++; else coherenceKO++; }
    releve.push(Object.assign({ t: G.turn, e: nat.res.energy | 0, m: nat.res.materials | 0, j: nat.forceTokens | 0 }, dec));
  }
  return r;
};

let r = d.pump(), g = 0;
while (g++ < 9000 && r) {
  if (G.turn > 10) break;
  try {
    if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
    if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
    if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
  } catch (e) { break; }
  break;
}

/* ── Contrôle de fidélité AVANT toute lecture ─────────────────────────────── */
console.log('FIDÉLITÉ DE LA DÉCOMPOSITION (elle doit retomber sur la note du moteur)');
if (coherenceKO === 0 && coherenceOK > 0) console.log('   ✔ ' + coherenceOK + ' relevé(s), somme identique à `evaluerPosition` — on décrit bien la vraie fonction\n');
else { console.log('   ❌ ' + coherenceKO + ' écart(s) : la décomposition ne décrit PAS la fonction du moteur.'); console.log('      Tout ce qui suit serait faux. On s\'arrête.\n'); process.exit(1); }

console.log('  tour │   note │ acquis(VP) │ product. │ trésor. │ potent. │ moral │ àSec │ force │  ⚡  🪨  ⚔');
console.log('  ─────┼────────┼────────────┼──────────┼─────────┼─────────┼───────┼───────┼───────────');
for (const x of releve) {
  const f = (v, n) => (v >= 0 ? ' ' : '') + v.toFixed(1).padStart(n);
  console.log('   T' + String(x.t).padEnd(2) + ' │' + f(x.somme, 6) + ' │' + f(x.acquis, 10)
    + ' │' + f(x.production, 8) + ' │' + f(x.tresorerie, 7) + ' │' + f(x.potentiel, 7)
    + ' │' + f(x.perilMoral, 5) + ' │' + f(x.perilRes, 4) + ' │' + f(x.force, 5) + ' │ ' + String(x.e).padStart(2) + ' ' + String(x.m).padStart(3) + ' ' + String(x.j).padStart(2));
}

/* ── Ce que ça dit, en chiffres ───────────────────────────────────────────── */
const debut = releve.filter(x => x.t <= 3), fin = releve.filter(x => x.t >= 8);
const part = (l, k) => { const s = l.reduce((a, x) => a + Math.abs(x.acquis) + Math.abs(x.production) + Math.abs(x.tresorerie) + Math.abs(x.potentiel) + Math.abs(x.force), 0); return s ? (l.reduce((a, x) => a + Math.abs(x[k]), 0) / s * 100) : 0; };
console.log('\n' + '─'.repeat(92));
console.log('PART DE CHAQUE TERME DANS LA NOTE (valeur absolue, hors moral)');
console.log('                     début de partie (T1-T3)      fin de partie (T8-T10)');
for (const k of ['acquis', 'production', 'tresorerie', 'potentiel', 'force'])
  console.log(('   ' + k).padEnd(22) + part(debut, k).toFixed(0).padStart(10) + ' %' + part(fin, k).toFixed(0).padStart(22) + ' %');

console.log('\n' + '─'.repeat(92));
console.log('LECTURE — ce que Marc affirme, et ce que les chiffres en disent');
console.log('  · « viser les VP dès le début est une erreur » : regarder la part d\'`acquis` en T1-T3.');
console.log('    Si elle domine déjà, l\'IA joue le score avant d\'avoir une économie — c\'est sa thèse.');
console.log('  · L\'ASPHYXIE N\'EST PAS PUNIE : le seul terme négatif est `périlMoral`. Tomber à 0⚡');
console.log('    ne coûte que le petit terme de trésorerie, alors qu\'à 0⚡ on ne peut plus engager un');
console.log('    seul jeton (1🪨+1⚡ chacun) : ni défendre, ni conquérir.');
console.log('  · ⚠️ LES INVESTISSEMENTS NE SONT PAS DES COUPS DU TACTICIEN. `coupsPossibles` n\'en');
console.log('    propose aucun : ils restent choisis par `chooseInvestmentForAI`, l\'ancienne');
console.log('    heuristique. « Colonies Avancées » y vaut `belowMax * 1.5` — un poids parmi d\'autres,');
console.log('    sans rapport avec le fait qu\'elle peut emporter la partie à elle seule.');
console.log('═'.repeat(92));
