/* ============================================================================
   TEST — L'AVANCE TECHNOLOGIQUE SE JUGE EN RELATIF, TOUS LES DEUX TOURS, APRÈS L'ÉVÉNEMENT
   ----------------------------------------------------------------------------
   POURQUOI. Partie 66C3 (Marc, 17/09). Tour 7 : trois guerres populaires déclarées contre les
   Terriens le même soir. La cause tenait en une ligne de `_tensionVers` :
       if (y.cards.filter(c => c.tier === 3).length >= 2) add += 4;   // « y prend une avance technologique »
   +4 par tour, forfaitaire, de la part de TOUTES les nations à la fois, dès deux rangs 3. Les Terriens
   en avaient trois ; le journal de Marc lit « Ta tension vs Terriens +4 » aux tours 5, 6, 7, 9, 10.
   Tout le monde atteignait 10 au même rythme, et se liguait le même tour. « Ça tue trop le Terrien. »

   LA RÈGLE (Marc, 17/09) : « par tech de niveau 3 en plus qu'une autre nation +2, évalué tous les
   deux tours après l'évaluation de l'événement. »
     · RELATIF : x en veut à y de 2 par rang 3 que y possède EN PLUS de x. Une nation qui suit le
       rythme n'est plus punie ; l'écart seul compte.
     · TOUS LES DEUX TOURS : aux tours pairs, ceux des événements (2, 4, 6, 8, 10).
     · APRÈS L'ÉVÉNEMENT : dans `stFinDeTour`, une fois l'événement résolu — donc APRÈS le jugement
       du seuil de 10 (`updateTension`). Une tension qui monte grâce aux techs ne déclenche la
       guerre qu'à la fin du tour SUIVANT. Décalage d'un tour accepté par Marc : les guerres
       technologiques cessent de tomber le même soir que les autres griefs.
   Sur 66C3, les Martiens auraient accumulé +6 contre les Terriens en quatre tours, au lieu de +16.
   ═══ 21/09 — UNE FOIS PAR PARTIE, DÈS LE TOUR 7 (Marc) ═══
   « Avance technologique on va changer aussi à 1x/partie mais seulement à partir du tour 7. »
   Le montant reste +2 par rang 3 d'écart ; il est facturé UNE fois par couple (le premier tour où
   l'écart existe, à partir du tour 7), plus jamais ensuite. Plus de condition de tour pair.
   Usage : node test_tension_technologique.js
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

function montage(tour) {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = tour === undefined ? 4 : tour; G.phase = 'actions';
  const jup = G.player, ter = G.ais[0], mar = G.ais[1], cei = G.ais[2];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup, ter, mar, cei]) { n.res.morale = 8; n.forceTokens = 4; n.res.materials = 8; n.res.energy = 8; n.cards = []; }
  sb.setDecisionSink(() => {});
  return { sb, G, jup, ter, mar, cei };
}
const rang3 = (nat, n) => { for (let i = 0; i < n; i++) nat.cards.push({ id: 'r3_' + i, tier: 3, name: 'Rang 3 n°' + i }); };
const tens = (m, a, b) => vm.runInContext('getTens("' + a + '","' + b + '")', m.sb);
/* Le grief est posé dans `stFinDeTour`, après l'événement. On l'appelle tel quel : c'est la fonction
   nommée de la fin de tour, pas une porte de banc. */
const finDeTour = m => { try { vm.runInContext('stFinDeTour()', m.sb); } catch (e) { note('stFinDeTour : ' + e.message.split('\n')[0]); } };

console.log('§1 Un rang 3 d\'écart : +2, au tour 7, après l\'événement');
{
  const m = montage(7);
  rang3(m.ter, 1);
  const av = tens(m, 'martiens', 'terriens');
  finDeTour(m);
  const ap = tens(m, 'martiens', 'terriens');
  note('Martiens → Terriens : ' + av + ' → ' + ap);
  if (ap - av === 2) ok('+2 pour un rang 3 d\'écart'); else ko('écart 1 → +' + (ap - av) + ' au lieu de +2');
  if (tens(m, 'terriens', 'martiens') === 0) ok('la nation en avance n\'en veut pas à la nation en retard'); else ko('la nation avancée gagne de la tension : ' + tens(m, 'terriens', 'martiens'));
}

console.log('§2 Trois rangs 3 d\'écart : +6 — proportionnel, sans forfait');
{
  const m = montage(8);
  rang3(m.ter, 3);
  finDeTour(m);
  const v = tens(m, 'jupiteriens', 'terriens');
  if (v === 6) ok('écart 3 → +6'); else ko('écart 3 → +' + v);
}

console.log('§3 Avant le tour 7 : rien, même avec un écart');
{
  const m = montage(6);
  rang3(m.ter, 3);
  finDeTour(m);
  const v = tens(m, 'martiens', 'terriens');
  if (v === 0) ok('tour 6 : aucun grief technologique'); else ko('tour 6 : +' + v);
}

console.log('§3 bis Une seule fois par couple : l\'écart qui grandit ensuite ne refacture rien');
{
  const m = montage(7);
  rang3(m.ter, 1);
  finDeTour(m);
  const t7 = tens(m, 'martiens', 'terriens');
  rang3(m.ter, 2);                                   // l'écart passe à 3
  m.G.turn = 8; finDeTour(m);
  const t8 = tens(m, 'martiens', 'terriens');
  m.G.turn = 9; finDeTour(m);
  const t9 = tens(m, 'martiens', 'terriens');
  note('tour 7 : ' + t7 + ' · tour 8 : ' + t8 + ' · tour 9 : ' + t9);
  if (t7 === 2 && t8 === 2 && t9 === 2) ok('+2 au tour 7, puis plus rien'); else ko('facturé plusieurs fois : ' + t7 + ' → ' + t8 + ' → ' + t9);
}

console.log('§4 Relatif : deux nations à égalité ne s\'en veulent pas, l\'écart seul compte');
{
  const m = montage(8);
  rang3(m.ter, 3); rang3(m.jup, 3); rang3(m.mar, 1);
  finDeTour(m);
  note('jup→ter ' + tens(m, 'jupiteriens', 'terriens') + ' · ter→jup ' + tens(m, 'terriens', 'jupiteriens') + ' · mar→ter ' + tens(m, 'martiens', 'terriens') + ' · mar→jup ' + tens(m, 'martiens', 'jupiteriens'));
  if (tens(m, 'jupiteriens', 'terriens') === 0 && tens(m, 'terriens', 'jupiteriens') === 0) ok('3 contre 3 : aucune tension entre les deux nations avancées');
  else ko('égalité 3/3 mais tension : ' + tens(m, 'jupiteriens', 'terriens') + ' / ' + tens(m, 'terriens', 'jupiteriens'));
  if (tens(m, 'martiens', 'terriens') === 4 && tens(m, 'martiens', 'jupiteriens') === 4) ok('la nation à 1 rang 3 en veut de 4 à chacune des deux nations à 3');
  else ko('Martiens : ' + tens(m, 'martiens', 'terriens') + ' / ' + tens(m, 'martiens', 'jupiteriens') + ' au lieu de 4 / 4');
}

console.log('§5 L\'ancien forfait a disparu du jugement de chaque tour');
{
  const m = montage(5);
  rang3(m.ter, 2);                                   // « dès deux rangs 3 » : l'ancien +4
  m.sb.updateTension();
  const v = tens(m, 'martiens', 'terriens');
  if (v === 0) ok('updateTension n\'ajoute plus +4 par tour pour deux rangs 3'); else ko('updateTension ajoute encore ' + v);
}

console.log('§6 Deux nations en guerre : pas de grief technologique (la tension est déjà à 10)');
{
  const m = montage(8);
  rang3(m.ter, 3);
  m.sb.declarerGuerre(m.mar, m.ter, 'banc', 'other');
  const av = tens(m, 'martiens', 'terriens');
  finDeTour(m);
  if (tens(m, 'martiens', 'terriens') === av) ok('en guerre : inchangé (' + av + ')'); else ko('en guerre : ' + av + ' → ' + tens(m, 'martiens', 'terriens'));
}

console.log('§7 Le journal dit au joueur ce qui s\'est passé');
{
  const m = montage(7);
  rang3(m.ter, 2);
  finDeTour(m);
  const l = (m.G.log || []).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, '')).find(x => /avance technologique/i.test(x) && /Terriens/.test(x));
  if (l) ok('« ' + l.slice(0, 100) + ' »'); else ko('rien au journal sur l\'avance technologique');
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_tension_technologique : l\'avance se juge en relatif, une fois par couple, dès le tour 7.');
