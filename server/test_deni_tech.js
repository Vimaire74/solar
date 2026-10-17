/* ============================================================================
   TEST — LE DÉNI : PRENDRE UNE TECHNOLOGIE POUR LA RETIRER À L'AUTRE
   ----------------------------------------------------------------------------
   POURQUOI. Doctrine de Marc, 28/08 : « on essaie d'empêcher l'autre de prendre la tech 3, on la
   prend avant lui si possible ». Et 04/09, après recherche : c'est le principe défensif universel
   des IA de jeu — si je ne peux pas gagner un coup, je bloque celui de l'adversaire — que les
   joueurs de draft appellent le « hate draft ».

   POURQUOI ICI ET PAS AILLEURS. Le déni n'est un FAIT MÉCANIQUE que sur les technologies de branche
   de rang 3 : `isTechExclusive` les réserve à leur premier acheteur (`G.techTaken`). Partout
   ailleurs, « prendre avant l'autre » ne lui retire rien — il pourra l'acheter aussi. Une prime de
   déni sur le reste du jeu serait une superstition coûteuse.

   ⚠️ MON ERREUR PRÉCÉDENTE, ET C'EST TOUT L'ENJEU DE CE BANC. J'avais déjà tenté ce terme (§63) et
   je l'avais posé sur l'ÉTAT — « ma position vaut plus quand une T3 m'est accessible ». Conséquence
   exacte : l'IA était PAYÉE À NE PAS LA PRENDRE, puisque l'acheter faisait disparaître la prime.
   Mesuré à 8 victoires sur 16, sous la référence, et retiré.
   Le déni doit donc être une prime sur le COUP — ajoutée à la valeur simulée d'un achat, jamais à
   l'évaluation d'une position. Le §5 ci-dessous est là uniquement pour attraper ce retour de bâton.

   ⚠️ ET IL NE DOIT RIEN LIRE DE CACHÉ. Les cartes d'une nation sont publiques (l'écran de score les
   affiche, la Télépathie les propose) ; son économie ne l'est pas sans 📡 Réseau Orbital (§14.7).
   Le déni se calcule donc sur `isTechAvailable(carte, rival)` — cartes et paliers de branche, tous
   publics — et le §4 vérifie qu'il ne bouge pas quand on change l'économie cachée d'un rival.

   Usage : node test_deni_tech.js
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
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const moi = G.player, rival = G.ais[0];
  moi._isAI = true; rival._isAI = true;
  for (const p of [moi, rival]) { p.acLeft = 6; p.res.energy = 40; p.res.materials = 40; p.res.science = 40; p.res.morale = 8; }
  return { sb, G, moi, rival };
}
const carte = (sb, id) => vm.runInContext("CARDS_POOL.find(c=>c.id==='" + id + "')", sb);
/* Ouvre une branche jusqu'au rang 3 et donne à `nat` le rang 2 qui lui permet d'acheter le rang 3. */
function prepareT3(m, cardId) {
  const c = carte(m.sb, cardId);
  m.G.branchTiers[c.branch] = 3;
  return c;
}
function donnerT2(m, nat, branche) {
  const t2 = vm.runInContext("CARDS_POOL.find(c=>c.branch==='" + branche + "'&&c.tier===2)", m.sb);
  if (t2) nat.cards = (nat.cards || []).concat([t2]);
  return t2;
}

console.log('═'.repeat(84));
console.log('DÉNI — PRENDRE UNE TECHNOLOGIE AVANT L\'AUTRE');
console.log('═'.repeat(84) + '\n');

const T3 = 'dyson3';   // ⚡ Sphère de Dyson, rang 3 de la branche mines_energie

/* ── 1. Une T3 qu'un rival PEUT prendre vaut davantage ─────────────────────── */
console.log('1. Une technologie qu\'un rival est prêt à prendre vaut plus cher à mes yeux');
{
  const m = montage();
  const c = prepareT3(m, T3);
  donnerT2(m, m.moi, c.branch);        // moi aussi je peux l'acheter
  const sansMenace = m.sb.valeurDeni(T3, m.moi);
  donnerT2(m, m.rival, c.branch);      // le rival devient capable de l'acheter
  const avecMenace = m.sb.valeurDeni(T3, m.moi);
  note('déni sans rival prêt : ' + sansMenace.toFixed(2) + ' · avec rival prêt : ' + avecMenace.toFixed(2));
  if (avecMenace > sansMenace) ok('la menace se paie — l\'IA a une raison de la prendre avant lui');
  else ko('aucune différence : le déni ne voit pas la menace');
}

/* ── 2. CONTRE-ÉPREUVE — sans rival capable, aucune prime ──────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — personne ne peut me la prendre : pas de prime');
{
  /* Sans ce point, on « corrigerait » en primant TOUTES les T3, ce qui n'est plus du déni mais un
     goût général pour le rang 3 — et fausserait toutes les autres décisions. */
  const m = montage();
  const c = prepareT3(m, T3);
  donnerT2(m, m.moi, c.branch);
  const v = m.sb.valeurDeni(T3, m.moi);
  note('aucun rival avec le rang 2 de la branche → déni = ' + v.toFixed(2));
  if (v === 0) ok('rien à dénier, rien à payer');
  else ko('prime de ' + v.toFixed(2) + ' alors que personne ne convoite la carte');
}

/* ── 3. Seules les cartes EXCLUSIVES se dénient ────────────────────────────── */
console.log('\n3. Une carte que tout le monde peut avoir ne se dénie pas');
{
  /* Prendre un rang 1 avant l'autre ne le lui retire pas : il l'achètera aussi. Payer un déni là
     serait payer pour rien. */
  const m = montage();
  const t1 = vm.runInContext("CARDS_POOL.find(c=>c.branch==='mines_energie'&&c.tier===1)", m.sb);
  m.G.branchTiers['mines_energie'] = 3;
  donnerT2(m, m.rival, 'mines_energie');
  const v = t1 ? m.sb.valeurDeni(t1.id, m.moi) : -1;
  note('déni sur ' + (t1 ? t1.name : '?') + ' (rang 1, non exclusive) = ' + v);
  if (v === 0) ok('aucune prime sur une carte non exclusive');
  else ko('prime de ' + v + ' sur une carte que le rival pourra acheter de toute façon');
}

/* ── 4. CONTRE-ÉPREUVE — le déni ne lit rien de caché ──────────────────────── */
console.log('\n4. CONTRE-ÉPREUVE — l\'économie cachée du rival ne change rien');
{
  /* §14.7 : sans 📡 Réseau Orbital, l'économie d'un rival est invisible. Un déni qui regarderait
     « a-t-il de quoi payer ? » serait une triche — exactement celle que `test_brouillard_ia`
     interdit. On ne regarde que ses CARTES, qui sont publiques. */
  const m = montage();
  const c = prepareT3(m, T3);
  donnerT2(m, m.moi, c.branch);
  donnerT2(m, m.rival, c.branch);
  const avant = m.sb.valeurDeni(T3, m.moi);
  m.rival.res.energy = 0; m.rival.res.materials = 0; m.rival.res.science = 0;
  const apres = m.sb.valeurDeni(T3, m.moi);
  note('rival ruiné : déni ' + avant.toFixed(2) + ' → ' + apres.toFixed(2));
  if (Math.abs(avant - apres) < 0.001) ok('le déni ignore l\'économie cachée — aucune triche');
  else ko('le déni a changé de ' + (apres - avant).toFixed(2) + ' : il lit ce qu\'il ne devrait pas voir');
}

/* ── 5. ⚠️ LE DÉNI EST UNE PRIME SUR LE COUP, PAS SUR L'ÉTAT ───────────────── */
console.log('\n5. Prendre la carte ne doit pas faire DISPARAÎTRE la raison de la prendre');
{
  /* ⚠️ LE POINT QUI ATTRAPE MON ERREUR DE §63. Si la prime vivait dans `evaluerPosition`, acheter
     la carte supprimerait la prime : l'IA verrait sa note BAISSER en la prenant, et resterait donc
     assise dessus sans jamais l'acheter. On vérifie que l'évaluation de POSITION est indifférente
     à la menace — c'est le coup, et lui seul, qui porte le déni. */
  const m = montage();
  const c = prepareT3(m, T3);
  donnerT2(m, m.moi, c.branch);
  const posSansMenace = m.sb.evaluerPosition(m.moi);
  donnerT2(m, m.rival, c.branch);
  const posAvecMenace = m.sb.evaluerPosition(m.moi);
  note('ma note de position : ' + posSansMenace.toFixed(2) + ' → ' + posAvecMenace.toFixed(2));
  if (Math.abs(posSansMenace - posAvecMenace) < 0.001)
    ok('la position ne bouge pas — la prime est bien sur le coup, jamais sur l\'état');
  else ko('la position a changé de ' + (posAvecMenace - posSansMenace).toFixed(2)
        + ' : la prime est dans l\'état, et l\'IA sera payée à NE PAS acheter');
}

/* ── 6. Une carte déjà prise ne se dénie plus ──────────────────────────────── */
console.log('\n6. Une technologie déjà prise par quelqu\'un ne vaut plus de déni');
{
  const m = montage();
  const c = prepareT3(m, T3);
  donnerT2(m, m.moi, c.branch);
  donnerT2(m, m.rival, c.branch);
  m.G.techTaken.add(T3);
  const v = m.sb.valeurDeni(T3, m.moi);
  note('carte déjà dans techTaken → déni = ' + v.toFixed(2));
  if (v === 0) ok('plus rien à retirer à personne');
  else ko('prime de ' + v.toFixed(2) + ' sur une carte que plus personne ne peut prendre');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le déni ne se paie que sur l\'exclusif réellement convoité, se lit sur des');
console.log('   informations publiques, et vit sur le COUP — jamais sur l\'état.');
console.log('═'.repeat(84));
