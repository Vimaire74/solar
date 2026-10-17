/* ============================================================================
   TEST — L'IA NE VOIT PAS PLUS QUE LE JOUEUR
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 28/08 : « est-ce que les IA connaissent les règles du jeu au début du jeu ? » En
   vérifiant, la réponse était pire que prévu : elles en savaient TROP.

   `evaluerPositionRelative` évalue chaque rival avec `evaluerPosition`, qui lit `res.energy`,
   `res.materials`, `res.science`, `res.morale`, `forceTokens` et `revenusBruts()`. C'est-à-dire
   l'économie exacte, le moral exact, la force exacte et les revenus de tous les adversaires — alors
   que les règles (§14.7) les déclarent CACHÉS sans le 📡 Réseau Orbital. Le joueur humain ne les voit
   pas. L'IA, si.

   ⚠️ C'EST LA MÊME FAUTE QUE LE 25/08, PAR UNE AUTRE PORTE. `defenseAttendue` avait laissé l'IA lire
   les coffres adverses ; `test_equivalence` l'avait attrapée, et la note de l'époque est sans
   ambiguïté : « une correction qui fait tricher n'est pas une correction » (§41.2). Le trou est
   revenu par l'évaluation relative, et **aucun banc ne le surveillait**. Celui-ci comble ce trou.

   CE QU'IL VÉRIFIE, ET POURQUOI CETTE FORME. On ne compte pas des occurrences de `res.` dans le
   code : un renommage passerait au vert sans rien corriger. On MESURE le comportement — on change ce
   qui est censé être caché chez un rival, et on exige que la note ne bouge pas.

   Usage : node test_brouillard_ia.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['ceinturiens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  const moi = G.player, rival = G.ais[0];
  moi._isAI = true; rival._isAI = true;
  return { sb, G, moi, rival };
}
/* Donne le Réseau Orbital à une nation — la carte qui lève le brouillard. */
function renseigner(sb, nat) {
  const carte = vm.runInContext("CARDS_POOL.find(c=>c.spec==='intel_2')", sb);
  if (carte) nat.cards = (nat.cards || []).concat([carte]);
  return !!carte;
}

console.log('═'.repeat(84));
console.log('BROUILLARD — CE QUE L\'IA A LE DROIT DE VOIR CHEZ UN RIVAL');
console.log('═'.repeat(84) + '\n');

/* ── 1. Sans renseignement : l'économie cachée du rival ne doit RIEN changer ── */
console.log('1. Sans le 📡 Réseau Orbital, l\'économie du rival est invisible');
{
  const m = montage();
  const avant = m.sb.evaluerPositionRelative(m.moi);
  /* On bouleverse TOUT ce que les règles déclarent caché. */
  m.rival.res.energy += 40; m.rival.res.materials += 40;
  m.rival.res.science += 40; m.rival.res.morale = 10;
  m.rival.forceTokens += 12;
  const apres = m.sb.evaluerPositionRelative(m.moi);
  note('note avant ' + avant.toFixed(2) + ' · après ' + apres.toFixed(2));
  if (Math.abs(avant - apres) < 0.001) ok('la note ne bouge pas : elle ne lit pas ce qu\'elle ne doit pas voir');
  else ko('la note a changé de ' + (apres - avant).toFixed(2) + ' — l\'IA lit l\'économie cachée du rival');
}

/* ── 2. CONTRE-ÉPREUVE — ce qui est PUBLIC doit, lui, être vu ─────────────── */
console.log('\n2. CONTRE-ÉPREUVE — ce qui est public (score, colonies) DOIT compter');
{
  /* ⚠️ Sans ce point, le §1 passerait au vert avec une évaluation qui ne regarde RIEN du rival.
     On exige donc qu'elle réagisse à ce qui est visible sur la carte et au tableau des scores. */
  const m = montage();
  const avant = m.sb.evaluerPositionRelative(m.moi);
  const NODES = vm.runInContext('NODES', m.sb);
  const libre = Object.keys(NODES).find(id => {
    const n = NODES[id];
    return n && !n.decorative && !n.noColonize
      && ![m.moi, m.rival].some(p => (p.colonies || []).some(c => c.nodeId === id));
  });
  if (libre) m.rival.colonies.push({ nodeId: libre, level: 3, connected: true });
  const apres = m.sb.evaluerPositionRelative(m.moi);
  note('colonie publique ajoutée au rival (' + libre + ' Nv.3) — note ' + avant.toFixed(2) + ' → ' + apres.toFixed(2));
  if (apres < avant - 0.001) ok('ma position relative baisse : le rival visible est bien pris en compte');
  else ko('une colonie adverse VISIBLE ne change rien — l\'évaluation est devenue aveugle à tout');
}

/* ── 3. Avec le Réseau Orbital, elle DOIT voir ────────────────────────────── */
console.log('\n3. Avec le 📡 Réseau Orbital, le brouillard se lève');
{
  /* C'est ce qui donne sa valeur à la technologie : sans ce point, la « correction » consisterait à
     rendre l'IA définitivement aveugle, ce qui est une autre façon de fausser le jeu. */
  const m = montage();
  if (!renseigner(m.sb, m.moi)) { ko('technologie intel_2 introuvable — scénario invalide'); }
  else {
    const avant = m.sb.evaluerPositionRelative(m.moi);
    m.rival.res.energy += 40; m.rival.res.materials += 40; m.rival.forceTokens += 12;
    const apres = m.sb.evaluerPositionRelative(m.moi);
    note('note avant ' + avant.toFixed(2) + ' · après ' + apres.toFixed(2));
    if (Math.abs(avant - apres) > 0.001) ok('renseignée, elle voit l\'économie du rival — la techno sert enfin à ça');
    else ko('même avec le Réseau Orbital elle ne voit rien : la technologie n\'apporte rien');
  }
}

/* ── 4. Sa PROPRE position reste pleinement connue ────────────────────────── */
console.log('\n4. Elle continue de connaître sa propre situation');
{
  /* Le brouillard s\'applique aux AUTRES. Une nation qui ne verrait plus ses propres stocks ne
     pourrait plus jouer du tout — et le correctif serait pire que le défaut. */
  const m = montage();
  const avant = m.sb.evaluerPosition(m.moi);
  m.moi.res.energy += 30; m.moi.res.materials += 30;
  const apres = m.sb.evaluerPosition(m.moi);
  note('ma note ' + avant.toFixed(2) + ' → ' + apres.toFixed(2));
  if (apres > avant + 0.001) ok('ses propres ressources comptent toujours');
  else ko('elle ne voit plus ses PROPRES stocks — le garde-fou est trop large');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ L\'IA ne lit chez un rival que ce qui est public, voit tout avec le Réseau Orbital,');
console.log('   et connaît toujours sa propre situation.');
console.log('═'.repeat(84));
