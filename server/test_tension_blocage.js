/* ============================================================================
   TEST — « ON ME BARRE LE CHEMIN » NE FRAPPE QUE LES PETITES NATIONS, ET UN SEUL COUPABLE
   ----------------------------------------------------------------------------
   POURQUOI. Partie 20C9 (Marc, 18/09), tour 8. Il mène à 108 PV avec cinq colonies. Le journal :
       😡 Ta tension vs Terriens    +4 → 10/10
       😡 Ta tension vs Martiens    +4 →  4/10
       😡 Ta tension vs Ceinturiens +4 →  5/10
   Trois fois +4, le même tour, vers les trois autres nations. Sa guerre populaire contre les
   Terriens tombe dans la foulée (6 de l'assaut repoussé + 4 = 10). Or il n'avait menacé personne,
   et ce sont DEUX NATIONS TIERCES qui, en se prenant Titan et Pluton ce tour-là, ont fermé ses
   deux dernières sorties. Le grief « y barre le chemin de x » s'était mué en « la carte s'est
   remplie », facturé à tout le monde à la fois.

   TROIS DÉFAUTS, TROIS CORRECTIONS :
     1. `_ouverturesLibres` comptait comme « pris » les colonies de TOUTES les nations, la sienne
        comprise : plus on colonise, plus on est déclaré à l'étroit. Un nœud à soi est maintenant
        sauté — ni ouverture, ni blocage.
     2. Aucune porte d'entrée. Règle de Marc, 18/09 : « on considérait l'expansion comme bloquée
        quand on a MOINS de trois colonies, pas quand on en a plus. » Seuil identique à
        l'étouffement : au plus deux colonies (`BLOCAGE_COLONIES_MAX`).
     3. La charge visait toutes les nations occupant une sortie. « Y barre le chemin » désigne
        quelqu'un : seule `principalBloqueur(x)` est facturée.
   Usage : node test_tension_blocage.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  const jup = G.player, ter = G.ais[0], mar = G.ais[1], cei = G.ais[2];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup, ter, mar, cei]) {
    n.res.morale = 8; n.forceTokens = 4; n.res.materials = 8; n.res.energy = 8;
    n.cards = []; n.routes = []; n._blocageVu = {}; n._etouffeDepuis = null;
  }
  sb.setDecisionSink(() => {});
  return { sb, G, jup, ter, mar, cei };
}
/* On POSE les colonies nommément : ce test parle de géographie, pas de hasard. */
const poser = (nat, ids) => { nat.colonies = ids.map(id => ({ nodeId: id, level: 1, connected: true })); };
const tens = (m, a, b) => vm.runInContext('getTens("' + a + '","' + b + '")', m.sb);
const bloque = (m, a, b) => vm.runInContext('bloqueLExpansion(' + a + ',' + b + ')', m.sb);

console.log('§1 La position exacte de Marc au tour 8 : plus aucune charge de blocage');
{
  /* Ses cinq colonies, et les nœuds que les autres occupaient à la fin du tour 8. Sa seule sortie
     libre était Triton — c'est ce qui déclenchait l'ancienne règle. */
  const m = montage();
  poser(m.jup, ['io', 'ganymede', 'europe', 'callisto', 'ceres']);
  poser(m.ter, ['lune']);
  poser(m.mar, ['phobos', 'vesta', 'encelade', 'titan']);
  poser(m.cei, ['eris', 'pluto']);
  const libres = vm.runInContext('_ouverturesLibres(G.player)', m.sb);
  note('ouvertures libres du Jupitérien : ' + libres + ' (Triton)');
  let charge = false;
  for (const a of [m.ter, m.mar, m.cei]) if (bloque(m, 'G.player', 'G.ais.find(x=>x.civ.id==="' + a.civ.id + '")')) charge = true;
  if (!charge) ok('cinq colonies : aucune nation ne « barre le chemin » du leader');
  else ko('le leader à cinq colonies est encore déclaré bloqué');

  vm.runInContext('updateTension()', m.sb);
  const t = [tens(m, 'jupiteriens', 'terriens'), tens(m, 'jupiteriens', 'martiens'), tens(m, 'jupiteriens', 'ceinturiens')];
  note('tensions après un tour complet : ter ' + t[0] + ' · mar ' + t[1] + ' · cei ' + t[2]);
  if (t.every(v => v < 4)) ok('aucun +4 vers qui que ce soit');
  else ko('une charge de +4 subsiste : ' + t.join(' / '));
}

console.log('§2 Une nation à DEUX colonies, réellement enfermée, garde son grief');
{
  const m = montage();
  poser(m.jup, ['callisto', 'ganymede']);            // deux colonies, voisins tous pris
  poser(m.ter, ['io', 'europe', 'titan', 'lune']);
  poser(m.mar, ['vesta', 'encelade', 'phobos']);
  poser(m.cei, ['triton', 'eris', 'pluto']);
  const libres = vm.runInContext('_ouverturesLibres(G.player)', m.sb);
  note('ouvertures libres : ' + libres);
  if (libres <= 1) ok('deux colonies, plus aucune sortie : la situation est bien un blocage');
  else ko('le montage ne produit pas de blocage (' + libres + ' ouvertures)');
  vm.runInContext('updateTension()', m.sb);
  const t = { ter: tens(m, 'jupiteriens', 'terriens'), mar: tens(m, 'jupiteriens', 'martiens'), cei: tens(m, 'jupiteriens', 'ceinturiens') };
  note('ter ' + t.ter + ' · mar ' + t.mar + ' · cei ' + t.cei);
  const charges = Object.values(t).filter(v => v >= 4).length;
  if (charges === 1) ok('la charge existe encore, et ne vise QU\'UNE nation');
  else ko(charges + ' nation(s) chargée(s) au lieu d\'une seule');
}

console.log('§3 Un nœud à soi n\'est pas une sortie bouchée');
{
  const m = montage();
  /* Deux colonies voisines l'une de l'autre : Io et Ganymède sont adjacents. Chacune apparaît dans
     la liste des voisins de l'autre. L'ancienne version les comptait comme « prises ». */
  poser(m.jup, ['io', 'ganymede']);
  poser(m.ter, ['lune']); poser(m.mar, ['phobos']); poser(m.cei, ['eris']);
  const libres = vm.runInContext('_ouverturesLibres(G.player)', m.sb);
  note('ouvertures libres avec Vesta, Cérès, Europe, Callisto, Titan, Triton libres : ' + libres);
  if (libres >= 4) ok('ses propres colonies ne comptent plus dans ses sorties bouchées');
  else ko('seulement ' + libres + ' ouvertures : les nœuds à soi comptent encore');
}

console.log('§4 La charge ne se paie qu\'UNE fois par couple dans la partie');
{
  const m = montage();
  poser(m.jup, ['callisto', 'ganymede']);
  poser(m.ter, ['io', 'europe', 'titan', 'lune']);
  poser(m.mar, ['vesta', 'encelade', 'phobos']);
  poser(m.cei, ['triton', 'eris', 'pluto']);
  vm.runInContext('updateTension()', m.sb);
  const t1 = Math.max(tens(m, 'jupiteriens', 'terriens'), tens(m, 'jupiteriens', 'martiens'), tens(m, 'jupiteriens', 'ceinturiens'));
  m.G.turn = 9;
  vm.runInContext('updateTension()', m.sb);
  const t2 = Math.max(tens(m, 'jupiteriens', 'terriens'), tens(m, 'jupiteriens', 'martiens'), tens(m, 'jupiteriens', 'ceinturiens'));
  note('tour 8 : ' + t1 + ' · tour 9 : ' + t2);
  if (t2 <= t1 + 1) ok('pas de refacturation du +4 au tour suivant');
  else ko('le +4 se represente : ' + t1 + ' → ' + t2);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_tension_blocage : le blocage ne frappe que les nations à deux colonies au plus, et un seul coupable.');
