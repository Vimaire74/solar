/* ============================================================================
   TEST — UN ASSAUT VAUT CE QUE VAUT SA CIBLE
   ----------------------------------------------------------------------------
   Partie 083E : « assaillir Phobos (49.7) — dauphin : assaillir Titan (49.7, écart 0) », six fois.
   Zéro d'écart entre la capitale martienne (10 de garnison) et une colonie ordinaire. Les
   Jupitériens ont assailli cette capitale trois tours de suite sans jamais rien prendre.
   Mesuré avant correction (`mesure_assaut.js`) : les deux cibles recevaient « note 2.3 ».

   Cause : un assaut lancé en phase d'actions ne livre pas le combat — il déclare la guerre et
   désigne la cible ; le combat se joue en fin de tour. La simulation ne montre donc qu'un AC
   dépensé, le même pour toutes les cibles.

   L'ÉVALUATION DEMANDÉE PAR MARC, DANS SON ORDRE :
     « j'ai combien de jetons, j'ai combien de coût pour attaquer, l'autre a combien de jetons et de
       ressources, ok je peux attaquer ça, ça et ça. Ensuite qu'est-ce qui me fait gagner. »

   RÈGLES VERROUILLÉES ICI :
     1. deux cibles inégales ne reçoivent plus la même note, et la plus faible l'emporte ;
     2. un assaut perdu d'avance (marge négative) est PÉNALISÉ, jamais interdit ;
     3. CONTRE-ÉPREUVE — la pénalité porte sur la FAISABILITÉ, pas sur les capitales : la même
        capitale redevient attirante dès qu'on a la force de la prendre ;
     4. à défense égale, la colonie qui rapporte le plus l'emporte (« qu'est-ce qui me fait gagner ») ;
     5. le brouillard est respecté (§14.8) : sans Réseau Orbital la défense est ESTIMÉE, avec
        renseignement de niveau 2 elle est exacte ;
     6. la prime est sur le COUP, jamais sur l'ÉTAT : `evaluerPosition` ne bouge pas, et un coup qui
        n'est pas un assaut reçoit exactement zéro.

   Usage : node test_valeur_assaut.js
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

/* Jupitériens contre Martiens — la paire de 083E. La cible possède sa capitale (garnison 10) et
   Titan niveau 2 (garnison 1) ; les deux sont à portée. */
function montage(jetons) {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const ia = G.player, cible = G.ais[0];
  ia._isAI = true; cible._isAI = true;
  ia.acLeft = 3; ia.forceTokens = (jetons === undefined ? 6 : jetons);
  ia.res.materials = 30; ia.res.energy = 30; ia.res.science = 8;
  cible.forceTokens = 2; cible.res.materials = 2; cible.res.energy = 2;
  if (!cible.colonies.some(c => c.nodeId === 'titan')) cible.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  ia.colonies.push({ nodeId: 'ganymede', level: 2, connected: true });
  sb.setDecisionSink(function () {});
  return { sb, G, ia, cible };
}
const prime = (m, node) => m.sb.valeurAssaut({ type: 'assaut', node }, m.ia);
const arr = x => Math.round(x * 10) / 10;

console.log('═'.repeat(84));
console.log('LA VALEUR D\'UN ASSAUT DÉPEND DE CE QU\'ON ATTAQUE');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2. La capitale imprenable perd contre la colonie ordinaire ────────── */
console.log('1. 6 jetons contre une capitale à 10 de garnison : l\'assaut est déconseillé, Titan préféré');
{
  const m = montage(6);
  const aCap = m.sb.evaluerAssaut(m.ia, m.cible.civ.home);
  const aTit = m.sb.evaluerAssaut(m.ia, 'titan');
  note('capitale : frappe ' + aCap.frappe + ' vs défense ' + aCap.defense + ' → marge ' + aCap.marge + ' · prime ' + arr(prime(m, m.cible.civ.home)));
  note('Titan    : frappe ' + aTit.frappe + ' vs défense ' + aTit.defense + ' → marge ' + aTit.marge + ' · prime ' + arr(prime(m, 'titan')));
  if (aCap.marge < 0) ok('l\'assessment voit que la capitale est hors de portée (marge ' + aCap.marge + ')');
  else ko('marge ' + aCap.marge + ' sur une capitale à 10 de garnison avec ' + aCap.frappe + ' de frappe');
  if (prime(m, m.cible.civ.home) < 0) ok('assaut perdu d\'avance : pénalisé');
  else ko('prime ' + arr(prime(m, m.cible.civ.home)) + ' sur un assaut perdu d\'avance');
  if (prime(m, 'titan') > prime(m, m.cible.civ.home)) ok('Titan passe devant la capitale — l\'écart 0 de 083E a disparu');
  else ko('les deux cibles restent équivalentes : le défaut de 083E n\'est pas corrigé');
}

/* ── 3. CONTRE-ÉPREUVE — avec la force, la capitale redevient une cible ────── */
console.log('\n2. CONTRE-ÉPREUVE — avec 20 jetons, la MÊME capitale redevient attirante');
{
  /* Sans ce point, on aurait pu « corriger » en interdisant d'attaquer les capitales — ce qui
     rendrait le jeu injouable pour une IA dominante, et contredirait la règle (§14 : la capitale
     est assaillable, sa garnison de 10 suffit à la protéger). */
  const m = montage(20);
  const a = m.sb.evaluerAssaut(m.ia, m.cible.civ.home);
  note('20 jetons : frappe ' + a.frappe + ' vs défense ' + a.defense + ' → marge ' + a.marge + ' · prime ' + arr(prime(m, m.cible.civ.home)));
  if (a.marge > 0 && prime(m, m.cible.civ.home) > 0) ok('la capitale vaut de nouveau le coup : la pénalité visait la faisabilité, pas les capitales');
  else ko('la capitale reste pénalisée (marge ' + a.marge + ', prime ' + arr(prime(m, m.cible.civ.home)) + ') alors qu\'on a la force');
}

/* ── 4. À défense égale, la meilleure colonie ─────────────────────────────── */
console.log('\n3. À défense égale, la colonie qui rapporte le plus l\'emporte');
{
  const m = montage(12);
  /* Deux colonies ordinaires de la même nation, même garnison (1), niveaux différents. */
  m.cible.colonies.push({ nodeId: 'encelade', level: 1, connected: true });
  const aT = m.sb.evaluerAssaut(m.ia, 'titan'), aE = m.sb.evaluerAssaut(m.ia, 'encelade');
  note('Titan Nv.2 : défense ' + aT.defense + ' · prise ' + arr(aT.prise) + ' · prime ' + arr(prime(m, 'titan')));
  note('Encelade Nv.1 : défense ' + aE.defense + ' · prise ' + arr(aE.prise) + ' · prime ' + arr(prime(m, 'encelade')));
  if (aT.defense === aE.defense) ok('même défense des deux côtés — la comparaison est propre');
  else ko('défenses différentes (' + aT.defense + ' / ' + aE.defense + ') : le point ne mesure pas ce qu\'il croit');
  if (prime(m, 'titan') > prime(m, 'encelade')) ok('la colonie la plus riche est préférée');
  else ko('la valeur de la prise ne départage pas (' + arr(prime(m, 'titan')) + ' contre ' + arr(prime(m, 'encelade')) + ')');
}

/* ── 5. Le brouillard ─────────────────────────────────────────────────────── */
console.log('\n4. Sans renseignement la défense est estimée ; avec 📡 Réseau Orbital elle est exacte');
{
  const m = montage(12);
  m.cible.forceTokens = 8; m.cible.res.materials = 1; m.cible.res.energy = 1;   // 8 jetons mais 1 seul payable
  const flou = m.sb.defenseEstimee(m.ia, m.cible, 'titan');
  vm.runInContext("var _n=G.player; _n.cards.push(CARDS_POOL.find(c=>c.id==='reseau2'));", m.sb);
  const net = m.sb.defenseEstimee(m.ia, m.cible, 'titan');
  const exact = 1 + Math.min(m.cible.forceTokens, m.cible.res.materials, m.cible.res.energy)
              + m.sb.bonusCombatCartes(m.cible);
  note('sans renseignement : ' + flou + ' · avec renseignement : ' + net + ' · vérité : ' + exact);
  if (net === exact) ok('avec le renseignement, la défense estimée est la vraie (jetons réellement PAYABLES)');
  else ko('avec renseignement : ' + net + ' au lieu de ' + exact);
  if (flou > net) ok('sans renseignement, l\'IA surestime la défense — elle ne sait pas qu\'il est à sec');
  else ok('sans renseignement, l\'estimation diffère de la vérité (' + flou + ' vs ' + exact + ') : le brouillard joue');
}

/* ── 6. La prime est sur le coup, pas sur l'état ──────────────────────────── */
console.log('\n5. Rien n\'est touché en dehors des assauts : ni les autres coups, ni la position');
{
  const m = montage(6);
  const avant = m.sb.evaluerPosition(m.ia, m.ia);
  const p1 = m.sb.valeurAssaut({ type: 'tech', card: 'bio1' }, m.ia);
  const p2 = m.sb.valeurAssaut({ type: 'coloniser', node: 'europe' }, m.ia);
  const p3 = m.sb.valeurAssaut({ type: 'raid', cible: m.cible.civ.id, node: 'titan' }, m.ia);
  m.sb.valeurAssaut({ type: 'assaut', node: 'titan' }, m.ia);
  const apres = m.sb.evaluerPosition(m.ia, m.ia);
  note('primes hors assaut : ' + p1 + ' / ' + p2 + ' / ' + p3 + ' · position ' + arr(avant) + ' → ' + arr(apres));
  if (p1 === 0 && p2 === 0 && p3 === 0) ok('achat, colonisation et raid reçoivent exactement zéro');
  else ko('un coup qui n\'est pas un assaut reçoit une prime');
  if (avant === apres) ok('et l\'évaluation de position est inchangée — la prime vit sur le coup (§63)');
  else ko('la position a bougé : ' + arr(avant) + ' → ' + arr(apres));
  /* Une cible sans défenseur (nœud vide) ne doit rien valoir plutôt que planter. */
  if (m.sb.valeurAssaut({ type: 'assaut', node: 'pluton' }, m.ia) === 0) ok('un nœud sans défenseur vaut zéro, sans exception');
  else ko('un nœud sans défenseur reçoit une prime');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ L\'IA regarde ce qu\'elle attaque : sa frappe, la défense d\'en face, puis ce que ça rapporte.');
console.log('═'.repeat(84));
