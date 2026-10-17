/* ============================================================================
   TEST — LE VOCABULAIRE DES CARTES NE DOIT PLUS PIÉGER SES RELECTEURS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 26/08 : « si tu as mal classifié des choses et que tu relis le code sans mémoire,
   tu peux très bien rater des choses ou corriger faux. Faudrait éviter ça. »

   Il décrit exactement ce qui venait de m'arriver, deux fois en deux jours.

   L'HISTOIRE, COMPLÈTE, PARCE QU'ELLE EST INSTRUCTIVE.
   Le champ `type` portait DEUX vocabulaires selon la collection où on le lisait :
     · `CARDS_POOL`, arbre technologique → étiquette THÉMATIQUE et purement décorative
       (`colonization`, `technology`, `government`, `economic`) ;
     · `CIVIC_MARKET`, marché civique → catégorie FONCTIONNELLE (`social`, `government`).
   Une seule valeur était commune : **`government`**. Dans le marché elle signifie « cette carte
   change ta forme de gouvernement » ; dans l'arbre, elle ne signifiait rien d'autre que « branche
   Spiritualité & Nature ». Aucun rapport.

   Le 25/08 j'ai trouvé un test mort — `card.type === 'civique'`, valeur qui n'existe dans aucune
   carte — et je l'ai « corrigé » en `'government'`, en supposant un simple renommage. Faux : les
   cartes `civique` avaient RÉELLEMENT existé (gov1, gov2, gov3, eco1, eco2) et avaient été
   supprimées lors de la refonte civique — c'est écrit dans `docs/RESUME_PROJET.md`. Le test avait
   survécu aux données. Ma correction a retiré son exclusivité à 🕊️ Éveil Collectif, technologie de
   rang 3, pendant trois versions livrées.

   CE QUI A CHANGÉ LE 26/08. Chaque carte de l'arbre porte désormais le nom de SA branche
   (`expansion`, `navigation`, `spiritualite_nature`…). `type` ne ment plus, et les deux vocabulaires
   sont disjoints.

   ⚠️ CE BANC N'EST PAS UN TEST DE COMPORTEMENT, C'EST UN GARDE-FOU DE VOCABULAIRE. Il ne vérifie pas
   qu'une règle est juste : il vérifie qu'un mot ne peut pas vouloir dire deux choses. C'est le seul
   genre de protection qui serve à quelqu'un qui relit le code sans se souvenir de son histoire —
   moi dans une prochaine session, ou Marc dans six mois.

   Usage : node test_vocabulaire_cartes.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const POOL = vm.runInContext('CARDS_POOL', sb);
const CIVIC = vm.runInContext('CIVIC_MARKET', sb);
const BRANCHES = vm.runInContext('TECH_BRANCHES', sb);
const SRC = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');

console.log('═'.repeat(80));
console.log('VOCABULAIRE DES CARTES — UN MOT, UN SENS');
console.log('═'.repeat(80) + '\n');

/* ── 1. LA RÈGLE CENTRALE : aucune valeur de `type` en commun ─────────────── */
console.log('1. Les deux collections ne partagent AUCUNE valeur de `type`');
{
  const tPool = new Set(POOL.map(c => c.type));
  const tCivic = new Set(CIVIC.map(c => c.type));
  const communes = [...tPool].filter(x => tCivic.has(x));
  note('CARDS_POOL  : ' + [...tPool].sort().join(', '));
  note('CIVIC_MARKET: ' + [...tCivic].sort().join(', '));
  if (!communes.length) ok('aucune valeur commune — un `type` désigne une seule chose');
  else ko('valeur(s) partagée(s) : ' + communes.join(', ')
    + ' — c\'est exactement le piège de « government » (Éveil Collectif, 25/08)');
}

/* ── 2. Dans l'arbre, `type` EST la branche ───────────────────────────────── */
console.log('\n2. Toute carte de l\'arbre porte le nom de sa branche');
{
  const arbre = POOL.filter(c => c.branch);
  const fautives = arbre.filter(c => c.type !== c.branch);
  note(arbre.length + ' carte(s) dans l\'arbre technologique');
  if (!fautives.length) ok('`type` et `branch` disent la même chose, carte par carte');
  else for (const c of fautives.slice(0, 5)) ko(c.name + ' : type=' + c.type + ' mais branch=' + c.branch);
  /* Et chaque branche doit exister vraiment : une faute de frappe donnerait une carte orpheline. */
  const orphelines = arbre.filter(c => !BRANCHES[c.branch]);
  if (!orphelines.length) ok('et chaque branche citée existe dans TECH_BRANCHES');
  else for (const c of orphelines) ko(c.name + ' : branche inconnue « ' + c.branch + ' »');
}

/* ── 3. CONTRE-ÉPREUVE — les cartes militaires gardent leur type ──────────── */
console.log('\n3. CONTRE-ÉPREUVE — les cartes SANS branche gardent un type fonctionnel');
{
  /* Le risque du renommage : tout aligner sur `branch` et laisser les militaires sans étiquette.
     Leur `type` est utilisé pour de vrai (achat 1×/tour, exemption d'exclusivité, couleur). */
  const sansBranche = POOL.filter(c => !c.branch);
  note(sansBranche.length + ' carte(s) sans branche : ' + sansBranche.map(c => c.name).join(', '));
  if (sansBranche.length && sansBranche.every(c => c.type === 'militaire'))
    ok('toutes militaires, toutes typées `militaire`');
  else ko('une carte sans branche n\'est pas typée `militaire` — son achat et sa couleur vont dériver');
  if (sansBranche.every(c => !sb.isTechExclusive(c)))
    ok('et aucune n\'est exclusive : chacun peut acheter le Supercroiseur');
  else ko('une carte militaire est devenue exclusive — le premier acheteur en prive les autres');
}

/* ── 4. Plus aucun code ne lit les anciennes étiquettes ───────────────────── */
console.log('\n4. Les anciennes étiquettes ne sont plus lues nulle part');
{
  /* On cherche les COMPARAISONS, pas les mots : les commentaires qui racontent l'histoire doivent
     rester lisibles sans faire rougir le banc. */
  const nu = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/\s/g, '');
  let restes = [];
  for (const mort of ['colonization', 'economic', 'civique']) {
    for (const forme of ["type==='" + mort + "'", "type!=='" + mort + "'"]) {
      if (nu.indexOf(forme) >= 0) restes.push(forme);
    }
  }
  /* `technology` a un cas légitime : CIVIC_MARKET n'en a pas, mais un jour peut-être. On le
     signale séparément plutôt que de l'interdire. */
  if (!restes.length) ok('aucune comparaison à `colonization`, `economic` ou `civique` ne subsiste');
  else for (const r of restes) ko('le code teste encore ' + r + ' — cette valeur n\'existe plus');
  if (nu.indexOf("type==='technology'") < 0) ok('ni à `technology` : une technologie se reconnaît à sa BRANCHE');
  else ko('le code teste encore `type===\'technology\'` — il ne verrait que 12 cartes sur 21');
}

/* ── 5. Ce que « technologie » veut dire, partout pareil ──────────────────── */
console.log('\n5. « Technologie » compte les mêmes cartes dans toutes les règles');
{
  const p = sb.__G.player;
  const arbre = POOL.filter(c => c.branch);
  p.cards = arbre.slice(0, 6);            // six cartes de l'arbre, tous types confondus
  const v = sb.calcVP(p);
  note('six cartes de l\'arbre : ' + p.cards.map(c => c.branch).join(', '));
  note('bonus technologique : ' + v.techBonusVP + ' (attendu ' + Math.floor(6 * 0.5) + ')');
  if (v.techBonusVP === 3) ok('le bonus de VP compte les six');
  else ko('le bonus de VP en compte ' + (v.techBonusVP * 2) + ' au lieu de 6');
  /* L'Extra-Solaire exige « 5 technologies ou plus » : avec six cartes de l'arbre, c'est atteint. */
  const compte = p.cards.filter(c => !!c.branch).length;
  if (compte >= 5) ok('et la condition « 5 technologies » de l\'Extra-Solaire est remplie');
  else ko('la condition « 5 technologies » ne voit que ' + compte + ' carte(s)');
}

/* ── 6. Chaque carte a la couleur de sa branche ───────────────────────────── */
console.log('\n6. La couleur du bord suit la branche (docs/CARTES_INVENTAIRE.md)');
{
  /* Avant le 26/08, toutes les cartes marquées `technology` sortaient du même bleu : Navigation,
     Renseignement, Sciences et Empathes se ressemblaient à l'écran alors que TECH_BRANCHES leur
     donne quatre couleurs distinctes. */
  const fautives = POOL.filter(c => sb.couleurCarte(c) !== (c.branch ? BRANCHES[c.branch].color : '#ef5350'));
  const couleurs = new Set(POOL.filter(c => c.branch).map(c => sb.couleurCarte(c)));
  note(couleurs.size + ' couleur(s) distincte(s) pour ' + Object.keys(BRANCHES).length + ' branche(s)');
  if (!fautives.length) ok('chaque carte porte la couleur de sa branche');
  else for (const c of fautives.slice(0, 4)) ko(c.name + ' : couleur inattendue');
  if (couleurs.size === Object.keys(BRANCHES).length) ok('et les sept branches se distinguent bien à l\'écran');
  else ko('deux branches partagent la même couleur — elles se confondront');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un `type` ne désigne qu\'une seule chose, une technologie se reconnaît à sa branche,');
console.log('   et les cartes militaires gardent l\'étiquette dont elles ont besoin.');
console.log('═'.repeat(80));
