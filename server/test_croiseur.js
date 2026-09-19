/* ============================================================================
   TEST — LE SUPERCROISEUR ET LES JETONS SE PAIENT SUR LA MÊME BOURSE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-15, après la partie C071 : « vérifie que j'avais assez de
   ressources pour engager le supercroiseur dans le dernier combat. J'ai des doutes. »

   IL AVAIT RAISON SUR LE PRINCIPE. Deux contrôles existaient, et ils s'ignoraient :
     · `maxAffordableTokens(p)` — combien de jetons la trésorerie permet d'engager ;
     · `cruiserAfford(p)`       — le croiseur est-il payable ;
   chacun regardait la trésorerie ENTIÈRE. Mesuré avant correction : avec 3🪨 3⚡ en
   caisse, le jeu annonçait « 6 jetons engageables » ET « croiseur payable » — alors
   qu'engager 3 jetons vide déjà tout. Comme chaque paiement se termine par un plancher
   à zéro (`Math.max(0, …)`), on pouvait engager au-delà de ses moyens et toucher quand
   même les +5⚔️ du croiseur, sans jamais payer la différence.

   ⚠️ CE N'EST PAS UN CAS THÉORIQUE MAIS CE N'ÉTAIT PAS NON PLUS LE CAS DE MARC : au
   tour 10 il encaissait +29🪨 +13⚡ nets par tour et le tour lui a coûté 8🪨 10⚡. Le
   défaut est réel, sa partie n'en a très probablement pas souffert. On corrige la règle,
   pas le souvenir.

   CE QUE CE TEST VÉRIFIE :
     1. sans croiseur, le plafond de jetons est inchangé (rien n'a été cassé) ;
     2. avec croiseur, le plafond BAISSE exactement du coût du croiseur ;
     3. une trésorerie juste suffisante pour l'un ou l'autre ne permet plus les deux ;
     4. l'IA de Navigation (coût de guerre ÷2) reste prise en compte ;
     5. la défense contre un assaut d'IA applique la même réserve.

   Usage : node test_croiseur.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }

function partie(avecNavigation) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G, p = G.player;
  if (avecNavigation) {
    const nav = vm.runInContext('CARDS_POOL.find(c=>c.spec==="nav2_war"||c.spec2==="nav2_war")', sb);
    if (nav) p.cards.push(nav);
  }
  G.turn = 8; G.phase = 'actions';
  return { sb, G, p };
}
const pose = (p, m, e, j) => { p.res.materials = m; p.res.energy = e; p.forceTokens = j; };

console.log('═'.repeat(74));
console.log('SUPERCROISEUR — IL SE PAIE SUR LA MÊME BOURSE QUE LES JETONS');
console.log('═'.repeat(74) + '\n');

/* ── 1. Sans croiseur : rien n'a changé ───────────────────────────────────── */
console.log('1. Sans croiseur, le plafond est inchangé');
{
  const { sb, p } = partie(false);
  pose(p, 8, 10, 20);
  const sans = sb.maxAffordableTokens(p);
  const nul = sb.maxAffordableTokens(p, null);
  if (sans === 8 && nul === 8) ok('8🪨 10⚡ → 8 jetons engageables (limité par les matériaux), avec ou sans réserve nulle');
  else ko('plafond ' + sans + ' / ' + nul + ' au lieu de 8 — le comportement d\'origine a bougé');
}

/* ── 2. Avec croiseur : le plafond baisse du coût exact ───────────────────── */
console.log('\n2. Avec croiseur, le plafond baisse exactement de son coût');
{
  const { sb, p } = partie(false);
  pose(p, 8, 10, 20);
  const cout = sb.cruiserCost(p);
  const sans = sb.maxAffordableTokens(p);
  const avec = sb.maxAffordableTokens(p, sb.reserveCroiseur(p, true));
  note('coût du croiseur : ' + cout.materials + '🪨 ' + cout.energy + '⚡');
  const attendu = Math.min(8 - cout.materials, 10 - cout.energy);
  if (avec === attendu) ok('plafond ' + sans + ' → ' + avec + ' jetons une fois le croiseur réservé');
  else ko('plafond avec croiseur : ' + avec + ' au lieu de ' + attendu);
  if (avec < sans) ok('la réserve mord bien sur l\'engagement (c\'est tout l\'objet du correctif)');
  else ko('la réserve ne change rien — le défaut est intact');
}

/* ── 3. Une bourse juste suffisante ne permet plus les deux ───────────────── */
console.log('\n3. Une trésorerie juste suffisante ne paie plus les deux');
{
  const { sb, p } = partie(false);
  const cout = sb.cruiserCost(p);
  /* Exactement de quoi payer le croiseur, et rien d'autre. */
  pose(p, cout.materials, cout.energy, 20);
  const avec = sb.maxAffordableTokens(p, sb.reserveCroiseur(p, true));
  if (avec === 0) ok('juste de quoi payer le croiseur → 0 jeton engageable');
  else ko(avec + ' jeton(s) encore proposés alors que le croiseur consomme toute la caisse');

  /* CONTRE-ÉPREUVE : sans croiseur, cette même bourse permet bien d'engager. */
  const sans = sb.maxAffordableTokens(p);
  if (sans > 0) ok('contre-épreuve : sans croiseur, la même bourse permet ' + sans + ' jeton(s)');
  else ko('contre-épreuve ÉCHOUÉE : cette bourse ne permet rien même sans croiseur — le cas ne prouve rien');
}

/* ── 4. L'IA de Navigation reste prise en compte ──────────────────────────── */
console.log('\n4. L\'IA de Navigation (coût de guerre ÷2) est toujours appliquée');
{
  const a = partie(false), b = partie(true);
  pose(a.p, 6, 6, 20); pose(b.p, 6, 6, 20);
  const sans = a.sb.maxAffordableTokens(a.p), avec = b.sb.maxAffordableTokens(b.p);
  if (avec > sans) ok('6🪨 6⚡ : ' + sans + ' jetons sans Navigation, ' + avec + ' avec — le demi-coût joue toujours');
  else ko('Navigation : ' + avec + ' contre ' + sans + ' sans — la remise a disparu');

  const coutB = b.sb.cruiserCost(b.p);
  note('le croiseur coûte aussi moins cher avec Navigation : ' + coutB.materials + '🪨 ' + coutB.energy + '⚡');
  const avecCru = b.sb.maxAffordableTokens(b.p, b.sb.reserveCroiseur(b.p, true));
  if (avecCru < avec) ok('et la réserve s\'applique par-dessus : ' + avec + ' → ' + avecCru + ' jetons');
  else ko('la réserve ne mord pas quand Navigation est là');
}

/* ── 5. Les trois fenêtres de défense, chacune selon ce qu'elle propose ────── */
console.log('\n5. En défense : réserve du croiseur là où il est proposé, source unique partout');
{
  /* ⚠️ MON PREMIER JET VISAIT LE MAUVAIS `maxDef`. Il cherchait la PREMIÈRE occurrence dans le
     fichier — une fenêtre de défense qui n'offre AUCUN croiseur — et exigeait qu'elle le réserve.
     Elle n'avait rien à réserver : le test accusait à tort.
     Il y a TROIS fenêtres de défense, et elles ne proposent pas la même chose :
       · `showAiAssaultDefenseModal` — assaut d'une IA : croiseur proposé → réserve obligatoire ;
       · les deux autres (assaut d'un joueur, ligne de front) — pas de croiseur → aucune réserve,
         mais elles doivent quand même passer par la source unique, sinon la remise de l'IA de
         Navigation est perdue. C'était le cas : elles calculaient `min(matériaux, énergie)` à la
         main. Le banc les a trouvées en cherchant autre chose. */
  const fs = require('fs');
  const brut = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const sansCom = brut.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const i = sansCom.indexOf('function showAiAssaultDefenseModal');
  const bloc = i >= 0 ? sansCom.slice(i, i + 2600) : '';   // 2600 : les libellés passés par t() (v10.77) ont allongé l'en-tête de la fenêtre
  if (i < 0) ko('`showAiAssaultDefenseModal` introuvable');
  else if (/maxDef=[\s\S]{0,200}reserveCroiseur/.test(bloc)) ok('assaut d\'une IA (croiseur proposé) : le croiseur est réservé');
  else ko('assaut d\'une IA : le croiseur n\'est pas réservé dans le calcul de `maxDef`');

  /* Les copies manuelles ne doivent plus exister nulle part. */
  const mains = sansCom.split('\n').filter(l =>
    /const\s+(maxDef|_affD)\s*=/.test(l) && /res\.materials/.test(l) && /res\.energy/.test(l));
  if (!mains.length) ok('plus aucune fenêtre ne recalcule le plafond à la main (source unique respectée)');
  else ko(mains.length + ' copie(s) manuelle(s) subsistent, ex. : ' + mains[0].trim().slice(0, 90));

  /* Et le fond : appelée avec la réserve, la fonction rend bien moins. */
  const { sb, p } = partie(false);
  pose(p, 7, 7, 20);
  if (sb.maxAffordableTokens(p, sb.reserveCroiseur(p, true)) < sb.maxAffordableTokens(p))
    ok('et le calcul sous-jacent rend bien un plafond réduit quand on réserve');
  else ko('le calcul ne rend pas un plafond réduit');
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Supercroiseur : son coût est réservé avant de compter les jetons engageables,\n   en attaque comme en défense, avec ou sans IA de Navigation.');
console.log('═'.repeat(74));
