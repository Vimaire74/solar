/* ============================================================================
   TEST — LES CARTES MILITAIRES SE LIMITENT PAR JOUEUR, PAS PAR PARTIE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie 140A du 23/08 : « Supercroiseur est limité à un joueur, ça ne devrait pas
   être le cas. Flottes de chasseur devrait être limité à une prise par partie mais accessible à
   tous les joueurs aussi. »

   LA CAUSE. `isTechExclusive` rendait `true` pour toute carte non répétable SANS BRANCHE :

       if(card.repeatable) return false;
       if(card.type==='civique') return false;
       return !card.branch || card.tier>=3;      // ← le Supercroiseur passe par ici

   Son commentaire disait « Militaires = répétables » — vrai à l'écriture, faux depuis que le
   Supercroiseur est passé en `repeatable:false`. Le premier acheteur le versait dans `G.techTaken`,
   registre GLOBAL prévu pour l'exclusivité des technologies de branche de rang 3, et les autres
   nations lisaient « déjà prise par une autre faction ».

   CE QU'ON VÉRIFIE :
     · deux nations différentes peuvent acheter le Supercroiseur ;
     · une même nation ne peut pas l'acheter deux fois ;
     · les Flottes de Chasseurs suivent la même règle (Marc les voulait non répétables) ;
     · l'exclusivité des T3 de branche, elle, n'a PAS bougé — c'est la contre-épreuve : on aurait pu
       ouvrir tout le catalogue en croyant ne toucher qu'au militaire.

   Usage : node test_cartes_militaires.js
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

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  G.turn = 9; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) {
    n.acLeft = 6; n.res.materials = 20; n.res.energy = 12; n.res.science = 10; n.res.morale = 8;
    n._milBoughtThisTurn = new Set();
  }
  return { sb, G };
}
/* Acheter en se plaçant du point de vue de la nation voulue : le moteur agit toujours pour
   `G.player`, c'est la rotation qui désigne qui joue. */
function achete(m, civId, cardId) {
  const G = m.G;
  const tous = [G.player].concat(G.ais);
  const cible = tous.find(n => n.civ.id === civId);
  const avant = G.player;
  G.player = cible; G.ais = tous.filter(n => n !== cible);
  let msg = null;
  const n0 = (G.log || []).length;
  try { m.sb.buyCivicOrMil ? m.sb.buyCivicOrMil(cardId) : m.sb.buyGeneral(cardId); } catch (e) { msg = e.message; }
  const nouvelles = (G.log || []).slice(0, Math.max(0, (G.log || []).length - n0)).map(l => String((l && l.msg) || l));
  const pris = cible.cards.some(c => c.id === cardId);
  G.player = avant; G.ais = tous.filter(n => n !== avant);
  return { pris, refus: nouvelles.find(t => /⚠️/.test(t)) || msg || null };
}

console.log('═'.repeat(80));
console.log('CARTES MILITAIRES — UNE PAR JOUEUR, PAS UNE PAR PARTIE');
console.log('═'.repeat(80) + '\n');

/* ── 1. Le Supercroiseur, pour tout le monde ──────────────────────────────── */
console.log('1. SUPERCROISEUR — deux nations doivent pouvoir l\'acheter');
{
  const m = partie();
  const a = achete(m, 'martiens', 'mil3');
  const b = achete(m, 'ceinturiens', 'mil3');
  note('martiens : ' + (a.pris ? 'acheté' : 'refusé — ' + a.refus));
  note('ceinturiens : ' + (b.pris ? 'acheté' : 'refusé — ' + b.refus));
  if (a.pris) ok('le premier acheteur l\'obtient');
  else ko('même le premier ne peut pas l\'acheter : le montage est faux');
  if (b.pris) ok('le second aussi — il n\'est plus réservé à une seule nation');
  else ko('le second est refusé : « ' + b.refus +' »');
  /* Les deux mains ne doivent pas partager le MÊME objet : une mutation de l'un se lirait chez
     l'autre, et la sauvegarde le dédoublerait au rechargement. */
  const c1 = m.G.player.cards.find(c => c.id === 'mil3');
  const c2 = m.G.ais.find(n => n.civ.id === 'ceinturiens').cards.find(c => c.id === 'mil3');
  if (c1 && c2 && c1 !== c2) ok('chacun possède sa PROPRE instance de la carte');
  else if (c1 && c2) ko('les deux nations partagent le même objet carte');
}

/* ── 2. Mais une seule fois par nation ────────────────────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — une même nation ne l\'achète pas deux fois');
{
  const m = partie();
  achete(m, 'martiens', 'mil3');
  m.G.player._milBoughtThisTurn = new Set();       // on lève la limite « 1×/tour » pour isoler la règle
  const r = achete(m, 'martiens', 'mil3');
  const combien = m.G.player.cards.filter(c => c.id === 'mil3').length;
  note('exemplaires détenus : ' + combien + (r.refus ? ' · refus : ' + r.refus : ''));
  if (combien === 1) ok('un seul exemplaire — la limite par joueur tient');
  else ko(combien + ' exemplaires : la carte est devenue répétable');
}

/* ── 3. Flottes de Chasseurs : même règle ─────────────────────────────────── */
console.log('\n3. FLOTTES DE CHASSEURS — une par partie, pour chaque joueur');
{
  const m = partie();
  /* Elle exige Robotisation Avancée : on la donne aux deux nations. */
  const robo = vm.runInContext("CARDS_POOL.find(c=>c.id==='robo2')", m.sb);
  for (const n of [m.G.player].concat(m.G.ais)) n.cards.push(Object.assign({}, robo));
  const a = achete(m, 'martiens', 'mil2');
  const b = achete(m, 'ceinturiens', 'mil2');
  m.G.player._milBoughtThisTurn = new Set();
  const encore = achete(m, 'martiens', 'mil2');
  const combien = m.G.player.cards.filter(c => c.id === 'mil2').length;
  note('martiens : ' + (a.pris ? 'acheté' : 'refusé') + ' · ceinturiens : ' + (b.pris ? 'acheté' : 'refusé')
    + ' · exemplaires martiens après 2e tentative : ' + combien);
  if (a.pris && b.pris) ok('les deux nations peuvent la prendre');
  else ko('une des deux est refusée');
  if (combien === 1) ok('et pas deux fois pour la même');
  else ko(combien + ' exemplaires pour les martiens');
}

/* ── 4. L'exclusivité des T3 de branche ne doit PAS avoir bougé ───────────── */
console.log('\n4. CONTRE-ÉPREUVE — les technologies T3 de branche restent exclusives');
{
  /* Sans ce cas, on aurait pu ouvrir tout le catalogue en croyant ne toucher qu'au militaire :
     l'exclusivité des T3 est ce qui fait de l'arbre technologique une course. */
  const m = partie();
  const t3 = vm.runInContext("CARDS_POOL.filter(c=>c.branch&&c.tier===3).map(c=>c.id)", m.sb);
  const exclusif = vm.runInContext("(function(){var c=CARDS_POOL.find(x=>x.branch&&x.tier===3);return isTechExclusive(c);})()", m.sb);
  const milExclusif = vm.runInContext("(function(){var c=CARDS_POOL.find(x=>x.id==='mil3');return isTechExclusive(c);})()", m.sb);
  note('T3 de branche exclusive : ' + exclusif + ' · Supercroiseur exclusif : ' + milExclusif + ' (T3 dispo : ' + t3.length + ')');
  if (exclusif) ok('une T3 de branche reste exclusive à sa première acheteuse');
  else ko('l\'exclusivité des T3 a été perdue — la course technologique n\'existe plus');
  if (!milExclusif) ok('le Supercroiseur, lui, ne l\'est plus');
  else ko('le Supercroiseur est encore exclusif');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ Militaire : une par joueur. Branche T3 : une par partie. Les deux règles cohabitent.');
