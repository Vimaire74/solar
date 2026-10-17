/* ============================================================================
   TEST — UNE NATION DE L'ORDINATEUR DÉFEND AVEC CE QU'ELLE PEUT VRAIMENT PAYER
   ----------------------------------------------------------------------------
   Partie BCE3 (Marc, 21/09) : au tour 7, les Martiens perdent Europe, Cérès et Titan contre des
   assauts à 2 jetons — « 0 jeton engagé » à chaque fois, Supercroiseur « au port ».
   Question de Marc : « bizarre la défense des Martiens, une idée du bug ? »

   Deux défauts dans `defenseIA` (la règle de défense des nations tenues par l'ordinateur) :
     1. elle comptait ses moyens comme `min(jetons, matériaux, énergie)` — sans l'IA de Navigation,
        qui divise le coût par deux. Avec 1⚡ et la Navigation on paie 2 jetons ; elle en voyait 1 ;
     2. « hors de portée, on fait saigner » engageait `⌊moyens/2⌋` : avec 1 seul jeton payable, ça
        fait 0. Le principe (« mieux vaut faire saigner l'assaillant que céder gratuitement ») était
        trahi pile au moment où il servait.
   Et `resolveWarCombat` plafonnait sa défense par défaut sur la même formule brute, en payant le
   Supercroiseur PAR-DESSUS : la trésorerie pouvait être comptée deux fois.

   RÈGLES VERROUILLÉES ICI :
     1. avec la Navigation, 1⚡ suffit à engager des jetons (la source unique `maxAffordableTokens`) ;
     2. un seul jeton payable → 1 jeton engagé, pas 0 ;
     3. le Supercroiseur est réservé AVANT de compter les jetons (jamais de double compte) ;
     4. CONTRE-ÉPREUVE : une nation riche n'engage pas tout contre une petite menace (niveau 1 → 2) ;
     5. `resolveWarCombat` plafonne la défense par défaut avec `maxAffordableTokens` et la réserve
        du croiseur, pas avec `min(jetons, matériaux, énergie)`.
   Usage : node test_defense_ia_moyens.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage(o) {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['martiens']);
  const G = sb.__G; G.turn = 7;
  const atk = G.player, def = G.ais[0];
  atk.forceTokens = o.menace || 12;
  def.forceTokens = o.jetons; def.res.materials = o.mat; def.res.energy = o.en;
  def.colonies = [{ nodeId: def.civ.home, level: 2, connected: true },
    { nodeId: 'europe', level: o.niveau || 2, connected: true },
    { nodeId: 'ceres', level: 2, connected: true }, { nodeId: 'titan', level: 2, connected: true }];
  if (o.nav) def.cards.push({ id: 'nav2', branch: 'navigation', tier: 2, spec: 'nav2_war' });
  if (o.croiseur) { def.hasCruiser = true; def.cruiserPower = 5; }
  return { sb, G, atk, def };
}
const nav = m => m.sb.hasSpec(m.def, 'nav2_war');

console.log('1. Navigation : 1⚡ et 10🪨 paient 2 jetons');
{ const m = montage({ jetons: 5, mat: 10, en: 1, nav: true });
  if (!nav(m)) ko('le montage n\'a pas l\'IA de Navigation — rien n\'est prouvé');
  const n = m.sb.defenseIA(m.def, m.atk, 'europe');
  if (n >= 1) ok('défense engagée : ' + n + ' jeton(s)'); else ko('0 jeton engagé alors que la Navigation en paie 2 (le cas BCE3)'); }

console.log('2. Sans Navigation, un seul jeton payable → 1, pas 0');
{ const m = montage({ jetons: 5, mat: 10, en: 1 });
  const n = m.sb.defenseIA(m.def, m.atk, 'europe');
  if (n === 1) ok('1 jeton engagé : on fait saigner l\'assaillant'); else ko(n + ' jeton(s) au lieu de 1 — ⌊1/2⌋ = 0'); }

console.log('3. Le Supercroiseur est réservé avant les jetons');
{ const m = montage({ jetons: 8, mat: 20, en: 6, croiseur: true, niveau: 3, menace: 20 });
  const n = m.sb.defenseIA(m.def, m.atk, 'europe');
  const plafond = m.sb.maxAffordableTokens(m.def, m.sb.cruiserCost(m.def));   // 6⚡ − 5⚡ = 1
  if (n <= plafond) ok(n + ' jeton(s) ≤ ' + plafond + ' payable(s) une fois le croiseur réservé');
  else ko(n + ' jetons engagés alors que le croiseur (5⚡) ne laisse que ' + plafond + ' jeton payable'); }

console.log('4. CONTRE-ÉPREUVE — nation riche, colonie de niveau 1 : 2 jetons, pas tout');
{ const m = montage({ jetons: 10, mat: 30, en: 30, niveau: 1, nav: true });
  const n = m.sb.defenseIA(m.def, m.atk, 'europe');
  if (n === 2) ok('2 jetons, la règle par niveau tient toujours'); else ko(n + ' jetons au lieu de 2'); }

console.log('5. resolveWarCombat : plafond par la source unique, croiseur réservé');
{ const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const i = src.indexOf('function resolveWarCombat('); const bloc = src.slice(i, i + 9000);
  const brut = /aiEngaged=Math\.min\(aiEngaged,warEnemy\.forceTokens\|\|0,warEnemy\.res\.materials\|\|0,warEnemy\.res\.energy\|\|0\)/.test(bloc);
  if (!brut && /aiEngaged=Math\.min\(aiEngaged,[^;]*maxAffordableTokens\(warEnemy/.test(bloc)) ok('maxAffordableTokens(warEnemy, réserve du croiseur)');
  else ko('la défense par défaut se plafonne encore sur min(jetons, matériaux, énergie)'); }

console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert'));
process.exit(ecarts.length ? 1 : 0);
