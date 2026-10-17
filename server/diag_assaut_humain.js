/* ============================================================================
   DIAGNOSTIC — LE TACTICIEN SAIT-IL ÉVALUER UN ASSAUT CONTRE UN HUMAIN ?
   ----------------------------------------------------------------------------
   POURQUOI. `test_assaut_surprise` et `test_defense_attendue` restent rouges après la correction du
   28/08 sur `attackColony` : « aucun assaut malgré une cible désarmée ». Or le tacticien assaille
   volontiers quand toutes les nations sont des IA (mesuré : tour 1, ceinturiens → Phobos). La
   différence entre les deux situations tient en un mot : ici la VICTIME EST HUMAINE.

   L'HYPOTHÈSE À ÉPROUVER. `simulerCoup` joue le coup pour de faux et note la position obtenue. Un
   assaut contre un humain ouvre une FENÊTRE DE DÉFENSE — une question posée à quelqu'un qui n'est
   pas là. Si `_reponseSimulee` ne sait pas y répondre, le combat ne se résout jamais pendant la
   simulation : l'assaut est noté sur un plateau où il n'a rien rapporté, donc mal noté, donc jamais
   choisi. Le tacticien serait alors STRUCTURELLEMENT incapable d'attaquer un joueur humain — ce qui
   est précisément la façon dont Marc joue.

   ⚠️ CE N'EST QU'UNE HYPOTHÈSE TANT QU'ON N'A PAS LES CHIFFRES. On imprime donc la note de CHAQUE
   coup, et on regarde où tombe l'assaut dans le classement.

   Usage : node diag_assaut_humain.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

/* Le montage de `test_assaut_surprise`, à l'identique : une colonie humaine de niveau 2, sans
   défense, collée à une IA gorgée de jetons, qui dispose du renseignement complet. */
function montage(humaineEstIA) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const humain = G.player, ia = G.ais[0];
  /* LE SEUL PARAMÈTRE QUI VARIE. Tout le reste est rigoureusement identique : si l'assaut est bien
     noté contre une IA et mal noté contre un humain, la cause ne peut être que là. */
  humain._isAI = !!humaineEstIA; ia._isAI = true;
  for (const n of [humain].concat(G.ais)) { n.routes = []; n.forceCooldown = []; n._attacksThisTurn = 0; }
  const NODES = vm.runInContext('NODES', sb);
  const pris = new Set();
  for (const n of [humain].concat(G.ais)) for (const c of n.colonies) pris.add(c.nodeId);
  const dep = ia.colonies[0].nodeId;
  const voisin = ((NODES[dep] || {}).conn || []).find(a => NODES[a] && !NODES[a].decorative
    && !NODES[a].noColonize && !pris.has(a));
  if (voisin) humain.colonies.push({ nodeId: voisin, level: 2, connected: true });
  ia.forceTokens = 8; ia.res.materials = 12; ia.res.energy = 12; ia.res.morale = 6;
  ia.acLeft = 4; ia._aiSetupDone = false;
  humain.forceTokens = 0; humain.res.materials = 0; humain.res.energy = 0;
  const reseau = vm.runInContext("CARDS_POOL.find(c=>c.spec==='intel_2')", sb);
  ia.cards = (ia.cards || []).concat([reseau]);
  return { sb, G, ia, cible: voisin };
}

function classement(humaineEstIA) {
  const m = montage(humaineEstIA);
  m.sb.setDecisionSink(() => {});
  const coups = m.sb.coupsPossibles(m.ia) || [];
  const notes = [];
  for (const c of coups) {
    let r;
    try { r = m.sb.simulerCoup(m.ia, () => m.sb.appliquerCoup(m.ia, c)); }
    catch (e) { r = { ok: false, valeur: null, question: 'exception : ' + e.message }; }
    /* ⚠️ `simulerCoup` rend `{ok, valeur, question}` — PAS un nombre. Mon premier jet triait sur la
       valeur de retour brute : la comparaison était fausse pour TOUS les coups, le tri ne triait
       rien, et les « rangs » affichés n'étaient que l'ordre d'énumération. J'ai failli conclure
       là-dessus. Et `ok` est faux dès qu'un coup POSE UNE QUESTION — le tacticien l'écarte alors
       purement et simplement (`if(!r.ok)continue`), ce qui est le cœur de ce qu'on cherche ici. */
    notes.push({ c, ok: !!r.ok, v: (typeof r.valeur === 'number' ? r.valeur : null), q: r.question });
  }
  notes.sort((a, b) => (b.ok ? b.v : -1e9) - (a.ok ? a.v : -1e9));
  return { notes, cible: m.cible, coups };
}

console.log('═'.repeat(84));
console.log('LE TACTICIEN FACE À UNE COLONIE SANS DÉFENSE — HUMAINE, PUIS TENUE PAR UNE IA');
console.log('═'.repeat(84) + '\n');

for (const [titre, estIA] of [['VICTIME HUMAINE', false], ['CONTRE-ÉPREUVE — LA MÊME VICTIME, MAIS IA', true]]) {
  const r = classement(estIA);
  console.log(titre + '   (cible : ' + r.cible + ', ' + r.coups.length + ' coups possibles)');
  const assauts = r.notes.filter(n => n.c.type === 'assaut');
  console.log('   les 5 meilleurs :');
  const aff = n => (n.ok ? n.v.toFixed(2) : 'ÉCARTÉ').padStart(9)
    + '  ' + n.c.libelle + (n.ok ? '' : '   ← question : ' + n.q);
  for (const n of r.notes.slice(0, 5)) console.log('      ' + aff(n));
  console.log('   les assauts :');
  if (!assauts.length) console.log('      AUCUN assaut énuméré');
  for (const n of assauts) console.log('      ' + aff(n) + '   (rang ' + (r.notes.indexOf(n) + 1) + '/' + r.notes.length + ')');
  console.log('   coups écartés faute de réponse : ' + r.notes.filter(n => !n.ok).length + '/' + r.notes.length);
  console.log('');
}
console.log('═'.repeat(84));
console.log('LECTURE. Si l\'assaut est bien noté contre une IA et mal noté contre un humain, la');
console.log('simulation ne sait pas résoudre un combat dont le défenseur est absent.');
console.log('═'.repeat(84));
