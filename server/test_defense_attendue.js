/* ============================================================================
   TEST — L'IA DOIT ÉVALUER LA DÉFENSE COMME LE COMBAT LA CALCULE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie DF6A, 2026-08-25 : « au lieu de conquérir une colonie le système les
   bloque et elles ne peuvent pas, du coup je ne vois pas de fenêtre de combat pour me défendre et
   entre IA pareil. »

   LA CAUSE. `defenseAttendue()` comptait TOUS les jetons Force du défenseur. Le combat, lui, n'en
   retient que ce qu'il peut PAYER — un jeton coûte 1🪨 + 1⚡, d'où `dCommit = min(jetons, 🪨, ⚡)`.
   Une nation avec huit jetons et zéro énergie défend donc avec sa seule garnison, mais elle était
   estimée à neuf. La garde « ne jamais lancer un assaut perdu d'avance » — juste dans son principe —
   s'appuyait sur une addition fausse et interdisait des victoires certaines.

   MESURÉ AVANT CORRECTION, 8 parties tout-ordinateur :
     · 54 cibles évaluées, 40 défenses surestimées, écart moyen +3,4 ;
     · 26 assauts refusés que l'IA aurait GAGNÉS, contre 21 autorisés.
   Plus d'une conquête possible sur deux était annulée par le calcul. À l'écran : des IA qui
   renoncent, aucune fenêtre de défense, et un joueur qui n'a jamais rien à défendre.

   ⚠️ CE BANC NE VÉRIFIE PAS QUE L'IA ATTAQUE PLUS. Ce serait mesurer une conséquence. Il vérifie
   que l'ESTIMATION ÉGALE LE CALCUL DU COMBAT — la seule propriété qui doive rester vraie quels que
   soient les réglages futurs. Et il porte la contre-épreuve inverse : face à un défenseur bien
   pourvu, la prudence doit demeurer, sinon on aurait simplement supprimé la garde.

   Usage : node test_defense_attendue.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Donner le renseignement complet à une nation : `Réseau Orbital` (spec `intel_2`) rend
   `perceivedForce` EXACTE. Sans lui, le brouillard tire ±3 autour de la vérité — c'est voulu, et
   c'est ce qui empêche de comparer une estimation à une réalité au jeton près. */
function renseigner(sb, nat) {
  const carte = vm.runInContext("CARDS_POOL.find(c=>c.spec==='intel_2')", sb);
  nat.cards = (nat.cards || []).concat([carte]);
}
function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  /* ⚠️ CERVEAU ÉPINGLÉ — CE BANC MESURE UN MÉCANISME, PAS UNE ENVIE D'ATTAQUER.
     Le 28/08, `tacticien` est devenu le défaut et ce banc est passé au rouge (« aucun assaut malgré
     une cible désarmée »). Ce n'était pas une régression : `diag_assaut_humain.js` a montré que le
     tacticien note l'assaut d'une colonie sans défense à 5,03 — la même note que si la victime était
     une IA, donc sans le moindre blocage — mais lui préfère une technologie à 10,29. Il construit
     d'abord, il attaque à partir du tour 6.
     Ce que ce banc doit garantir, lui, ne dépend pas du cerveau : qu'une IA capable de voir une place
     vide SACHE la prendre, et que la défense attendue soit calculée juste. On le sollicite donc avec
     le cerveau qui attaque volontiers. Le jour où le tacticien devra être jugé sur son AGRESSIVITÉ,
     ce sera dans une mesure dédiée, pas ici. */
  G._cerveauIA = 'historique';
  G.turn = 5; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) { n.routes = []; n.cards = []; n.forceCooldown = []; }
  return { sb, G, A: G.ais[0], B: G.ais[1], C: G.ais[2] };
}
/* La défense telle que le COMBAT la calcule — recopiée depuis `resoudreAssautIA` : jetons payables du
   défenseur + son bonus de cartes + la GARNISON + les cohabitants. C'est la référence.
   ⚠️ 05/09 : la garnison n'est plus « 1 » écrit en dur mais `garrisonOf` — 10 pour une capitale
   tenue par sa nation d'origine (règle B628). Ce banc vise `colonies[0]`, c'est-à-dire la capitale :
   avec le « +1 » d'avant il aurait continué de décrire un combat qui n'existe plus. */
function defenseReelle(sb, ai, cible, nodeId) {
  const dCommit = Math.max(0, Math.min(cible.forceTokens || 0, cible.res.materials || 0, cible.res.energy || 0));
  let renfort = 0;
  try {
    for (const co of sb.defenseursDuNoeud(nodeId, ai)) {
      if (co === cible) continue;
      renfort += Math.max(0, Math.min(co.forceTokens || 0, co.res.materials || 0, co.res.energy || 0))
        + sb.bonusCombatCartes(co);
    }
  } catch (e) {}
  return dCommit + sb.bonusCombatCartes(cible) + sb.garrisonOf(cible, nodeId) + renfort;
}

console.log('═'.repeat(80));
console.log('DÉFENSE ATTENDUE — L\'ESTIMATION CONTRE LE COMBAT');
console.log('═'.repeat(80) + '\n');

/* ── 1. LE CAS DE MARC — un défenseur à sec n'a que sa garnison ────────────── */
console.log('1. Un défenseur riche en jetons mais sans ressources ne défend pas');
{
  const m = partie();
  const cible = m.B, col = cible.colonies[0];
  cible.forceTokens = 8; cible.res.materials = 0; cible.res.energy = 0;
  renseigner(m.sb, m.A);                    // §14.7 : les coffres adverses ne se voient qu'au Réseau Orbital
  const est = m.sb.defenseAttendue(m.A, cible, col.nodeId);
  const reel = defenseReelle(m.sb, m.A, cible, col.nodeId);
  note('8 jetons, 0🪨 0⚡ — estimation : ' + est + ' · défense réelle au combat : ' + reel);
  if (est === reel) ok('l\'estimation vaut exactement la défense du combat');
  else ko('estimation ' + est + ' pour une défense réelle de ' + reel
    + ' — l\'IA refusera un assaut qu\'elle gagnerait (le défaut de la partie DF6A)');
}

/* ── 1bis. CONTRE-ÉPREUVE — sans renseignement, les coffres restent cachés ─── */
console.log('\n1bis. CONTRE-ÉPREUVE — sans Réseau Orbital, elle ne PEUT pas savoir');
{
  /* ⚠️ CE CAS DÉFEND UNE RÈGLE, PAS UNE PRUDENCE. Les stocks d'une rivale sont cachés (§14.7).
     La première version du correctif plafonnait sans condition : toutes les IA voyaient les coffres
     de tout le monde, le Réseau Orbital ne servait plus à rien, et `test_equivalence.js` a montré
     une partie dont l'issue changeait selon la nation active. Une correction qui fait tricher n'est
     pas une correction — ce cas est là pour empêcher qu'on la « re-corrige » ainsi. */
  const m = partie();
  const cible = m.B, col = cible.colonies[0];
  cible.forceTokens = 8; cible.res.materials = 0; cible.res.energy = 0;
  const est = m.sb.defenseAttendue(m.A, cible, col.nodeId);
  note('mêmes coffres vides, attaquant NON renseigné — estimation : ' + est);
  if (est > 2) ok('elle surestime, faute d\'information : c\'est la règle du brouillard, pas un défaut');
  else ko('elle voit des coffres qu\'aucune règle ne lui montre — l\'IA triche');
}

/* ── 2. CONTRE-ÉPREUVE — un défenseur qui PEUT payer est compté en entier ──── */
console.log('\n2. CONTRE-ÉPREUVE — une nation capable d\'armer ses jetons est comptée en entier');
{
  /* Le risque de ce correctif serait de réparer la garde en la supprimant : si le plafond mordait
     toujours, l'IA croirait tout le monde sans défense et se jetterait partout.
     ⚠️ ON COMPARE AVEC LE RENSEIGNEMENT COMPLET, ET C'EST INDISPENSABLE. Sans `intel_2`,
     `perceivedForce` tire ±3 autour de la vérité : comparer une estimation brouillée à une défense
     réelle au jeton près ne mesurerait que le hasard du tirage. Le brouillard est une RÈGLE du jeu,
     pas un défaut — c'est lui qui permet à une IA d'être surprise, donc à un défenseur de gagner. */
  const m = partie();
  const cible = m.B, col = cible.colonies[0];
  cible.forceTokens = 4; cible.res.materials = 10; cible.res.energy = 10;
  renseigner(m.sb, m.A);
  const est = m.sb.defenseAttendue(m.A, cible, col.nodeId);
  const reel = defenseReelle(m.sb, m.A, cible, col.nodeId);
  note('4 jetons, 10🪨 10⚡, attaquant renseigné — estimation : ' + est + ' · défense réelle : ' + reel);
  if (est === reel) ok('le plafond ne mord pas : les quatre jetons sont bien comptés');
  else ko('estimation ' + est + ' pour une défense réelle de ' + reel
    + ' — le plafond de payabilité mord à tort, ou la garnison a disparu');
}

/* ── 2bis. LE BROUILLARD RESTE UN BROUILLARD ──────────────────────────────── */
console.log('\n2bis. Sans renseignement, l\'estimation reste incertaine — et c\'est la règle');
{
  /* Une IA omnisciente gagnerait tous ses assauts et la fenêtre de défense n\'aurait plus d\'enjeu.
     On vérifie donc que l\'incertitude survit au correctif, bornée par le brouillard (±3, plus le
     jeton de prudence). */
  const m = partie();
  const cible = m.B, col = cible.colonies[0];
  cible.forceTokens = 4; cible.res.materials = 10; cible.res.energy = 10;
  const est = m.sb.defenseAttendue(m.A, cible, col.nodeId);
  const reel = defenseReelle(m.sb, m.A, cible, col.nodeId);
  note('même position, attaquant NON renseigné — estimation : ' + est + ' · réelle : ' + reel);
  if (Math.abs(est - reel) <= 4) ok('l\'écart reste dans la fenêtre du brouillard (±3 plus un jeton)');
  else ko('écart de ' + (est - reel) + ' : l\'estimation ne vient plus du brouillard mais d\'une erreur');
}

/* ── 3. Les cohabitants comptent des deux côtés ────────────────────────────── */
console.log('\n3. Un cohabitant qui peut payer renforce la défense, dans les deux calculs');
{
  const m = partie();
  const cible = m.B, col = cible.colonies[0];
  cible.forceTokens = 2; cible.res.materials = 5; cible.res.energy = 5;
  renseigner(m.sb, m.A);                    // au jeton près, sinon on mesure le brouillard
  const sans = m.sb.defenseAttendue(m.A, cible, col.nodeId);
  /* Un troisième occupant du même nœud (cohabitation extra-solaire). */
  m.C.colonies.push({ nodeId: col.nodeId, level: 1, connected: true });
  m.C.forceTokens = 3; m.C.res.materials = 5; m.C.res.energy = 5;
  const avec = m.sb.defenseAttendue(m.A, cible, col.nodeId);
  const reel = defenseReelle(m.sb, m.A, cible, col.nodeId);
  note('sans cohabitant : ' + sans + ' · avec : ' + avec + ' · défense réelle : ' + reel);
  if (avec > sans) ok('le cohabitant est bien compté dans l\'estimation');
  else ko('le cohabitant n\'est pas vu : l\'IA attaquera une colonie mieux gardée qu\'elle ne croit');
  if (avec === reel) ok('et l\'estimation renseignée vaut exactement la défense du combat');
  else ko('estimation ' + avec + ' pour une défense réelle de ' + reel + ' avec cohabitant');
}

/* ── 4. BOUT EN BOUT — une colonie sans défense est effectivement assaillie ── */
console.log('\n4. BOUT EN BOUT — l\'IA passe enfin à l\'acte contre une colonie sans défense');
{
  const m = partie();
  const N = vm.runInContext('NODES', m.sb);
  const attaquant = m.A, victime = m.B;
  /* On place la victime juste à côté, désarmée et sans le sou ; l'attaquant a de quoi frapper. */
  const dep = attaquant.colonies[0].nodeId;
  const voisin = ((N[dep] || {}).conn || []).find(a => N[a] && !N[a].decorative && !N[a].noColonize
    && ![m.G.player].concat(m.G.ais).some(n => n.colonies.some(c => c.nodeId === a)));
  if (!voisin) { ko('aucun nœud libre voisin — scénario invalide'); }
  else {
    victime.colonies = [victime.colonies[0], { nodeId: voisin, level: 1, connected: true }];
    victime.forceTokens = 6; victime.res.materials = 0; victime.res.energy = 0; victime.cards = [];
    attaquant.forceTokens = 4; attaquant.res.materials = 8; attaquant.res.energy = 8;
    /* 14/09 : ouvrir une guerre coûte l'usure (−4🙂) et l'assaut exige ensuite un moral ≥ 1 ; la
       vérification se fait désormais AVANT de déclarer (test_assaut_sans_moyens.js). Les Martiens
       partent à 4 de moral : ce banc mesure la détection d'une place vide, pas le moral. */
    attaquant.res.morale = 8;
    renseigner(m.sb, attaquant);            // c'est le renseignement qui autorise à voir la faiblesse
    attaquant.acLeft = 4; attaquant._attacksThisTurn = 0; attaquant._aiSetupDone = false;
    attaquant._profil = 'guerrier';
    const avant = victime.colonies.length;
    m.sb.setDecisionSink(() => {});
    for (let i = 0; i < 4; i++) { try { m.sb.doAITurn(attaquant, true); } catch (e) {} }
    const apres = victime.colonies.length;
    const journal = (m.G.log || []).map(l => String((l && (l.msg || l.t)) || l));
    const capture = journal.some(x => /capture/.test(x));
    note('colonies de la victime ' + avant + ' → ' + apres + (capture ? ' · capture journalisée' : ' · aucune capture'));
    if (apres < avant || capture) ok('l\'assaut a lieu : une colonie sans défense finit par tomber');
    else ko('aucun assaut malgré une cible désarmée — le blocage signalé par Marc persiste');
  }
}

/* ── 5. CONTRE-ÉPREUVE — une forteresse n'est toujours pas attaquée ────────── */
console.log('\n5. CONTRE-ÉPREUVE — devant une place forte, l\'IA renonce encore');
{
  /* Sans ce cas, le test 4 passerait au vert même si on avait purement et simplement retiré la
     garde. Ce qu'on veut, c'est une IA qui sait distinguer les deux situations. */
  const m = partie();
  const N = vm.runInContext('NODES', m.sb);
  const attaquant = m.A, victime = m.B;
  const dep = attaquant.colonies[0].nodeId;
  const voisin = ((N[dep] || {}).conn || []).find(a => N[a] && !N[a].decorative && !N[a].noColonize
    && ![m.G.player].concat(m.G.ais).some(n => n.colonies.some(c => c.nodeId === a)));
  if (!voisin) { ko('aucun nœud libre voisin — scénario invalide'); }
  else {
    victime.colonies = [victime.colonies[0], { nodeId: voisin, level: 1, connected: true }];
    victime.forceTokens = 12; victime.res.materials = 20; victime.res.energy = 20;
    attaquant.forceTokens = 2; attaquant.res.materials = 3; attaquant.res.energy = 3;
    attaquant.acLeft = 4; attaquant._attacksThisTurn = 0; attaquant._aiSetupDone = false;
    attaquant._profil = 'guerrier';
    const avant = victime.colonies.length;
    m.sb.setDecisionSink(() => {});
    for (let i = 0; i < 4; i++) { try { m.sb.doAITurn(attaquant, true); } catch (e) {} }
    note('victime à 12 jetons armés — colonies ' + avant + ' → ' + victime.colonies.length);
    if (victime.colonies.length === avant) ok('l\'IA ne se jette pas sur une place mieux défendue qu\'elle');
    else ko('l\'IA a attaqué une forteresse : la garde a été supprimée au lieu d\'être corrigée');
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ L\'IA évalue la défense comme le combat la calcule : elle voit les colonies sans');
console.log('   défense et les prend, et continue de renoncer devant une place forte.');
console.log('═'.repeat(80));
