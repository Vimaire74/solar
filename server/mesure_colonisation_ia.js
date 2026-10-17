/* ============================================================================
   MESURE — LES ORDINATEURS COLONISENT-ILS ASSEZ ?
   ----------------------------------------------------------------------------
   POURQUOI. Partie 96F6 (15/09) : les Jupitériens, tenus par le `tacticien`, finissent avec
   19 cartes et 2 colonies, après être restés à UNE SEULE colonie du tour 1 au tour 8. Mesure des
   notes au tour 1 : la meilleure carte vaut 37,6, la meilleure colonisation 16,4 — 21,2 points
   d'écart, rang 13 sur 39. Le tacticien note la position après UN SEUL coup ; une colonie arrive
   non connectée (×0,5 VP, aucun revenu avant le tour suivant) et ne prend sa valeur qu'au coup
   SUIVANT, la route qui la relie. Le demi-pas de profondeur existe pour les cartes
   (`valeurDeblocage`, `valeurDeni`) et pour l'assaut (`valeurAssaut`), pas pour la colonisation.

   CE QUE CE FICHIER MESURE, ET CE QU'IL NE MESURE PAS. Il ne corrige rien. Il donne le chiffre de
   RÉFÉRENCE avant tout changement : sur des parties entières, combien de colonies, de routes et de
   cartes chaque cerveau accumule-t-il, et avec quel score. On compare le `tacticien` (cerveau par
   défaut) à l'`historique` (la recette d'origine) pour savoir si la faible expansion est un trait
   du tacticien ou du jeu lui-même.

   ⚠️ PAS DE TÊTE-À-TÊTE ICI, ET C'EST VOULU. Le tête-à-tête (`mesure_cerveaux.js`) répond à « qui
   gagne » ; il ne répond pas à « combien de colonies ». Ici chaque partie est jouée par UN SEUL
   cerveau aux quatre sièges : les quantités relevées (colonies, routes, cartes) sont absolues et
   se comparent d'une exécution à l'autre. Le VP, lui, est relatif et n'est donné que pour mémoire.

   Usage : node mesure_colonisation_ia.js        (PARTIES=<n>, défaut 6 ; DEPART=<n> décale les graines)
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const PARTIES = parseInt(process.env.PARTIES || '6', 10);
const DEPART = parseInt(process.env.DEPART || '0', 10);
const CERVEAUX = (process.env.CERVEAUX || 'tacticien,historique').split(',');
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

function graine(n) {
  let x = (n + 1) >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/* Une partie entière, les quatre sièges tenus par le même cerveau. Rend, par nation, ce qu'elle a
   bâti à la fin — plus le tour de sa PREMIÈRE colonisation, qui dit à lui seul si elle s'étend. */
function partie(seed, cerveau) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  G._cerveauIA = cerveau;
  const depart = {};                       // colonies au départ, pour ne pas compter la capitale
  for (const p of [G.player].concat(G.ais || [])) depart[p.civ.id] = (p.colonies || []).length;
  const premiere = {};                     // civId → tour de la première colonisation en plus
  const origine = sb.doAITurn;
  sb.doAITurn = function (nat, oneShot) {
    G._cerveauIA = cerveau;
    const r = origine.call(null, nat, oneShot);
    try {
      const id = nat && nat.civ && nat.civ.id;
      if (id && premiere[id] === undefined && (nat.colonies || []).length > depart[id]) premiere[id] = G.turn;
    } catch (e) {}
    return r;
  };
  let r = d.pump(), garde = 0;
  while (garde++ < 120000) {
    if (!r) break;
    if (G.turn > G.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const out = [];
  for (const p of [G.player].concat(G.ais || [])) {
    const cols = p.colonies || [];
    out.push({
      civ: p.civ.id,
      colonies: cols.length,
      reliees: cols.filter(c => c.connected).length,
      niveauTotal: cols.reduce((s, c) => s + (c.level || 1), 0),
      routes: (p.routes || []).length,
      cartes: (p.cards || []).length,
      vp: sb.calcVP(p).total,
      premiere: premiere[p.civ.id] || null      // null = n'a JAMAIS colonisé de la partie
    });
  }
  return out;
}

const moy = (a) => a.length ? (a.reduce((s, x) => s + x, 0) / a.length) : 0;
const f = (x, n) => x.toFixed(n === undefined ? 2 : n);

console.log('═'.repeat(80));
console.log('COLONISATION DES ORDINATEURS — ' + PARTIES + ' partie(s) par cerveau, 4 sièges tenus par le même');
console.log('═'.repeat(80));

const bilan = {};
for (const cerveau of CERVEAUX) {
  const lignes = [];
  const t0 = Date.now();
  for (let k = 0; k < PARTIES; k++) {
    try { lignes.push(...partie(DEPART + k, cerveau)); }
    catch (e) { console.log('   ⚠ partie ' + k + ' (' + cerveau + ') : ' + e.message.split('\n')[0]); }
  }
  if (!lignes.length) { console.log('\n' + cerveau + ' : aucune partie jouée'); continue; }
  const jamais = lignes.filter(l => l.premiere === null).length;
  const b = {
    colonies: moy(lignes.map(l => l.colonies)),
    reliees: moy(lignes.map(l => l.reliees)),
    niveau: moy(lignes.map(l => l.niveauTotal)),
    routes: moy(lignes.map(l => l.routes)),
    cartes: moy(lignes.map(l => l.cartes)),
    vp: moy(lignes.map(l => l.vp)),
    premiere: moy(lignes.filter(l => l.premiere !== null).map(l => l.premiere)),
    jamais: jamais, n: lignes.length, sec: Math.round((Date.now() - t0) / 1000)
  };
  bilan[cerveau] = b;
  console.log('\n── ' + cerveau + ' ── ' + b.n + ' nations observées, ' + b.sec + ' s');
  console.log('   colonies en fin de partie ......... ' + f(b.colonies));
  console.log('     dont reliées .................... ' + f(b.reliees));
  console.log('   niveaux cumulés des colonies ...... ' + f(b.niveau));
  console.log('   routes ............................ ' + f(b.routes));
  console.log('   cartes ............................ ' + f(b.cartes));
  console.log('   1re colonisation au tour .......... ' + (b.premiere ? f(b.premiere, 1) : '—'));
  console.log('   n\'a JAMAIS colonisé ............... ' + b.jamais + ' / ' + b.n
    + ' (' + f(100 * b.jamais / b.n, 0) + ' %)');
  console.log('   VP moyen (relatif, pour mémoire) .. ' + f(b.vp, 1));
}

const [A, B] = CERVEAUX;
if (bilan[A] && bilan[B]) {
  console.log('\n' + '═'.repeat(80));
  console.log('ÉCART ' + A + ' − ' + B);
  for (const k of ['colonies', 'reliees', 'routes', 'cartes']) {
    const d = bilan[A][k] - bilan[B][k];
    console.log('   ' + k.padEnd(12) + (d >= 0 ? '+' : '') + f(d) + '   (' + f(bilan[A][k]) + ' contre ' + f(bilan[B][k]) + ')');
  }
  console.log('═'.repeat(80));
  console.log('LECTURE. Les colonies, routes et cartes sont des quantités ABSOLUES : elles se comparent');
  console.log('d\'une exécution à l\'autre. Le VP est relatif à la partie et ne dit rien ici. Un écart');
  console.log('faible sur ' + PARTIES + ' parties ne prouve rien — élargir avec PARTIES=<n>.');
}
