/* ════════════════════════════════════════════════════════════════════════════════════════════
   VOLER TROIS TECHNOLOGIES D'UN COUP — LE CHEMIN QUI A FIGÉ DEUX PARTIES DE MARC
   ────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI CE BANC EXISTE. `ESP_TENSION = {1:6, 2:8}` et « au-delà de 2 → 10 ». Voler TROIS
   technologies porte donc la tension à 10 À TOUS LES COUPS, et ouvre une branche que rien
   n'empruntait dans les parties de test : le journal « la population exige la guerre ». La
   traduction de la v10.78 y avait mis un `t(...)` sous une variable locale nommée `t` — la partie
   en ligne se bloquait en fin de tour (parties C4E5 puis celle du 20/09, en français comme en
   anglais : ce chemin ne dépend pas de la langue).

   CE QUE LE BANC VÉRIFIE, sans écran ni serveur :
     1. voler 3 technologies d'une même nation ne lève AUCUNE exception ;
     2. la tension de la victime envers l'espion atteint bien 10 ;
     3. la ligne « tension à 10 » est écrite au journal ;
     4. l'enchaînement de fin de tour qui suit (`stBilanDeTour`) ne lève rien non plus.

   Usage : node test_espionnage_trois_techs.js
   ════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

const sb = loadLogic(HTML);
sb.initGame('martiens', ['terriens', 'jupiteriens', 'ceinturiens']);
const G = sb.__G;
G.turn = 4; G.phase = 'actions';
const espion = G.player, victime = G.ais[0];
espion._isAI = false; G.ais.forEach(a => a._isAI = true);
espion._inv1 = 'inv_esp';

/* On donne à la victime TROIS technologies d'une même branche : c'est le « lot » que la fenêtre
   propose en premier, et celui que Marc prend. */
/* `CARDS_POOL` est un `const` du module : il n'apparaît pas sur l'objet du bac à sable,
   on le lit dans le contexte. */
const CARDS_POOL = vm.runInContext('CARDS_POOL', sb);
const pool = CARDS_POOL.filter(c => c.branch && !sb.possedeCarte(espion, c.id));
const branche = (pool.find(c => pool.filter(x => x.branch === c.branch).length >= 3) || {}).branch;
if (!branche) { console.log('❌ impossible de trouver une branche à 3 technologies dans CARDS_POOL'); process.exit(1); }
const lot = pool.filter(c => c.branch === branche).slice(0, 3);
victime.cards = (victime.cards || []).concat(lot.map(c => ({ ...c })));

console.log('§1 La fenêtre propose bien le lot entier');
const opts = sb._espOptions(espion);
const lotOpt = opts.find(o => o.kind === 'lot' && o.nation === victime.civ.id && o.ids.length >= 3);
if (lotOpt) ok('option « catégorie entière » à ' + lotOpt.ids.length + ' technologies chez ' + victime.civ.name);
else { ko('aucune option de lot à 3 technologies — le montage est faux, pas le jeu'); console.log(JSON.stringify(opts.map(o => ({ k: o.kind, n: o.ids.length })))); process.exit(1); }

console.log('\n§2 Le vol lui-même');
let pris = 0;
try { pris = sb.espPiller(espion, lotOpt); ok('espPiller n\'a levé aucune exception (' + pris + ' technologie(s) prise(s))'); }
catch (e) { ko('espPiller a levé : ' + e.message); console.log('      ' + String(e.stack).split('\n').slice(0, 4).join('\n      ')); }
if (pris >= 3) ok('trois technologies volées en un coup'); else ko('seulement ' + pris + ' technologie(s) volée(s)');

console.log('\n§3 La tension et son journal');
const niveau = sb.getTens(victime.civ.id, espion.civ.id);
if (niveau >= 10) ok('tension ' + victime.civ.name + ' → ' + espion.civ.name + ' = ' + niveau + '/10');
else ko('tension attendue 10, obtenue ' + niveau + ' — la branche « guerre populaire » n\'est pas atteinte, le banc ne prouve rien');
const journal = (G.log || []).map(e => sb._logTexte(e)).join('\n');
if (/exige la guerre|demand war/i.test(journal)) ok('la ligne « la population exige la guerre » est au journal');
else ko('ligne « exige la guerre » absente du journal');

console.log('\n§4 La fin de tour qui suit');
try { if (typeof sb.stBilanDeTour === 'function') sb.stBilanDeTour(); ok('l\'enchaînement de fin de tour n\'a levé aucune exception'); }
catch (e) { ko('la fin de tour a levé : ' + e.message); console.log('      ' + String(e.stack).split('\n').slice(0, 4).join('\n      ')); }

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) : ' + ecarts.join(' · ')); process.exit(1); }
console.log('✅ Voler trois technologies d\'un coup porte la tension à 10 et ne bloque rien.');
console.log('═'.repeat(84));
