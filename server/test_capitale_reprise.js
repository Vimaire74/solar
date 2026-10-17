/* ============================================================================
   TEST — CAPITALE PERDUE, CAPITALE REPRISE, NATION SANS COLONIE
   ----------------------------------------------------------------------------
   Décisions de Marc, 05/09, après la partie B628 :
     « Une nation sans colonie ne joue plus. C'est fini. Elle peut subsister sans capitale.
       Une capitale conquise à quelqu'un d'autre ne bénéficie plus du bonus : un jeton comme les
       autres colonies, donc une nation peut reprendre sa capitale. Si elle la reprend, chaque tour
       la capitale reçoit +1 jeton de défense gratuitement, comme ça elle remonte — et cette règle
       doit être montrée à tous les participants dès que la capitale est reprise. »

   RÈGLES VERROUILLÉES ICI :
     1. une capitale tenue par sa nation d'origine se défend à 10 ; conquise par un tiers, elle se
        défend à 1 — comme une colonie ordinaire — et se reprend donc ;
     2. reprise par sa nation d'origine : garnison 1 le tour de la reprise, 2 le tour d'après,
        …, plafonnée à 10 ;
     3. l'annonce de la reprise part à TOUS les humains, avec la règle (+1 par tour) ;
     4. +10 VP contre la nation D'ORIGINE seulement : reprendre une capitale à son conquérant ne
        rapporte rien de plus (CONTRE-ÉPREUVE) ;
     5. une nation sans aucune colonie ne joue plus : plus aucun coup, `doAITurn` rend la main,
        elle est marquée « passée » à chaque début de tour, et le journal le dit UNE fois ;
     6. CONTRE-ÉPREUVE — une nation qui a perdu sa capitale mais garde une colonie joue toujours ;
     7. le récapitulatif de combat écrit le coût du Supercroiseur sur la même ligne que les jetons.

   Usage : node test_capitale_reprise.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['jupiteriens', 'martiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const hum = G.player, jup = G.ais[0], mar = G.ais[1];
  hum._isAI = false; jup._isAI = true; mar._isAI = true;
  for (const n of [hum, jup, mar]) { n.res.materials = 20; n.res.energy = 20; n.res.morale = 8; n.acLeft = 3; }
  sb.setDecisionSink(function () {});
  return { sb, G, hum, jup, mar };
}
const gar = (m, p) => m.sb.garrisonOf(p, p.civ.home);

console.log('═'.repeat(84));
console.log('CAPITALE — PERDUE À 1, REPRISE À 1 PUIS +1 PAR TOUR ; NATION SANS COLONIE : FINI');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2 & 3 & 4. Le cycle complet d'une capitale ───────────────────────── */
console.log('1. Capitale martienne : 10 chez elle, 1 chez son conquérant, 1 puis +1/tour une fois reprise');
{
  const m = montage();
  const home = m.mar.civ.home;
  note('Martiens chez eux : garnison ' + gar(m, m.mar));
  if (gar(m, m.mar) === 10) ok('10 chez sa nation d\'origine');
  else ko('garnison ' + gar(m, m.mar) + ' au lieu de 10');

  /* Les Jupitériens la prennent (porte unique). */
  const vpAv = m.jup.tempVP || 0;
  m.sb.capturerNoeud(m.jup, home);
  note('prise par Jupitériens : garnison chez eux ' + m.sb.garrisonOf(m.jup, home) + ' · VP +' + ((m.jup.tempVP || 0) - vpAv));
  if (m.sb.garrisonOf(m.jup, home) === 1) ok('chez le conquérant, 1 — comme une colonie ordinaire : elle se reprend');
  else ko('garnison ' + m.sb.garrisonOf(m.jup, home) + ' chez le conquérant');
  if ((m.jup.tempVP || 0) - vpAv === 10) ok('+10 VP pour l\'avoir prise à sa nation d\'origine');
  else ko('bonus ' + ((m.jup.tempVP || 0) - vpAv) + ' au lieu de 10');

  /* Les Martiens la reprennent au tour suivant. Ils ont gardé Titan : ils jouent encore. */
  m.mar.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  m.G.turn = 6;
  m.G._ilPlayerHits = []; m.G._pendings = [];
  const vpMar = m.mar.tempVP || 0;
  const av = (m.G.log || []).length;
  m.sb.capturerNoeud(m.mar, home);
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  note('reprise au tour 6 : garnison ' + gar(m, m.mar) + ' · VP Martiens +' + ((m.mar.tempVP || 0) - vpMar));
  if (gar(m, m.mar) === 1) ok('reprise : garnison 1 le tour même');
  else ko('garnison ' + gar(m, m.mar) + ' à la reprise au lieu de 1');
  if ((m.mar.tempVP || 0) - vpMar === 0) ok('CONTRE-ÉPREUVE : reprendre SA capitale à son conquérant ne rapporte pas +10');
  else ko('+' + ((m.mar.tempVP || 0) - vpMar) + ' VP pour une reprise');
  m.G.turn = 7; note('tour 7 : ' + gar(m, m.mar)); if (gar(m, m.mar) === 2) ok('+1 par tour : 2'); else ko('tour 7 : ' + gar(m, m.mar));
  m.G.turn = 9; note('tour 9 : ' + gar(m, m.mar)); if (gar(m, m.mar) === 4) ok('tour 9 : 4'); else ko('tour 9 : ' + gar(m, m.mar));
  m.G.turn = 30; if (gar(m, m.mar) === 10) ok('plafonnée à 10'); else ko('dépasse 10 : ' + gar(m, m.mar));
  /* En mode routé (`setDecisionSink`), `notifyNationHit` émet une notice `raid_hit` dans la file
     des questions ; en solo elle irait dans `_ilPlayerHits`. On lit les deux. */
  const hits = (m.G._ilPlayerHits || []).map(h => h.title + ' ' + h.body)
    .concat((m.G._pendings || []).filter(p => p.kind === 'raid_hit').map(p => (p.payload.title || '') + ' ' + (p.payload.body || '')));
  note('annonce reçue par l\'humain : ' + (hits.find(h => /Capitale reprise/.test(h)) || 'aucune').slice(0, 110));
  if (hits.some(h => /Capitale reprise/.test(h) && /\+1 par tour/.test(h))) ok('tous les humains sont prévenus, avec la règle du +1 par tour');
  else ko('l\'annonce de la reprise n\'atteint pas les autres participants');
  if (j.some(t => /reprend sa capitale/.test(t))) ok('et le journal le dit');
  else ko('rien au journal');
}

/* ── 5 & 6. Nation sans colonie : fini ; sans capitale : continue ─────────── */
console.log('\n2. Une nation sans aucune colonie ne joue plus ; une nation sans capitale mais avec une colonie joue encore');
{
  const m = montage();
  /* Jupitériens perdent tout : on leur prend Io (leur capitale, seule colonie). */
  const home = m.jup.civ.home;
  m.jup.colonies = m.jup.colonies.filter(c => c.nodeId === home);
  m.sb.capturerNoeud(m.mar, home);
  note('Jupitériens : colonies = ' + m.jup.colonies.length + ' · éliminée = ' + m.sb.estEliminee(m.jup));
  if (m.sb.estEliminee(m.jup)) ok('sans colonie : éliminée');
  else ko('une nation sans colonie n\'est pas vue comme éliminée');
  m.jup.acLeft = 3;
  const coups = m.sb.coupsPossibles(m.jup);
  const joue = m.sb.doAITurn(m.jup, {});
  note('coups proposés : ' + coups.length + ' · doAITurn rend : ' + joue + ' · AC restants : ' + m.jup.acLeft);
  if (coups.length === 0 && joue === false && m.jup.acLeft === 0) ok('plus aucun coup, la main est rendue, les AC tombent à 0');
  else ko('une nation éliminée joue encore');
  /* Début de tour : passée d'office, dit une fois. */
  const av = (m.G.log || []).length;
  m.jup._passedRound = false; m.jup.acLeft = 3;
  m.sb.appliquerEliminations();
  const l1 = (m.G.log || []).length - av;
  m.jup._passedRound = false; m.jup.acLeft = 3;
  m.sb.appliquerEliminations();
  const l2 = (m.G.log || []).length - av;
  note('après deux débuts de tour : passée = ' + m.jup._passedRound + ' · lignes de journal : ' + l1 + ' puis ' + l2);
  if (m.jup._passedRound && m.jup.acLeft === 0) ok('passée d\'office à chaque début de tour');
  else ko('non passée en début de tour');
  if (l1 === 1 && l2 === 1) ok('et « ne joue plus » n\'est dit qu\'une fois');
  else ko('message répété (' + l1 + ' puis ' + l2 + ')');

  /* CONTRE-ÉPREUVE : Martiens sans capitale mais avec Titan. */
  const m2 = montage();
  m2.mar.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  m2.sb.capturerNoeud(m2.jup, m2.mar.civ.home);
  m2.mar.acLeft = 3;
  note('Martiens sans capitale, avec Titan : éliminée = ' + m2.sb.estEliminee(m2.mar) + ' · coups : ' + m2.sb.coupsPossibles(m2.mar).length);
  if (!m2.sb.estEliminee(m2.mar) && m2.sb.coupsPossibles(m2.mar).length > 0) ok('elle subsiste sans capitale et joue toujours');
  else ko('une nation sans capitale (mais avec une colonie) est traitée comme éliminée');
}

/* ── 7. Le récapitulatif de combat dit tout le coût ────────────────────────── */
console.log('\n3. Le récapitulatif de combat inclut le coût du Supercroiseur');
{
  const m = montage();
  m.mar.hasCruiser = true; m.mar.cruiserPower = 5;
  const av = (m.G.log || []).length;
  m.sb.journalCombat(m.mar, 4, true, 23, '+5 supercroiseur +10 garnison de capitale', true);
  const t = String((m.G.log[0] || {}).msg || '').replace(/<[^>]+>/g, '');
  note(t.slice(0, 120));
  if (/Supercroiseur −\d/.test(t)) ok('le coût du croiseur est sur la ligne — plus de « il n\'a payé que ses jetons »');
  else ko('le récapitulatif n\'écrit toujours que le coût des jetons');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Capitale perdue à 1, reprise à 1 puis +1 par tour ; sans colonie, c\'est fini.');
console.log('═'.repeat(84));
