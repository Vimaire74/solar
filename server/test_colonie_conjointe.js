/* ============================================================================
   TEST — GAGNER UN COMBAT SUR UN NŒUD PARTAGÉ DOIT LE DONNER, ET LA GUERRE DOIT SE CONCLURE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie F8D7 du 25/08 :
     · « Petit problème avec conquérir colonie conjointe : elle revient aux nations dès que
        conquise. »
     · « Vérifie la guerre que j'ai faite. Il manque une annonce à la fin. »

   CE QUE DISAIT SON JOURNAL. Triton était occupée par DEUX nations. Il l'a emportée trois fois —
   T9 après une égalité (5⚔️ contre 3🛡️), puis T10 (10⚔️ contre 3🛡️) — et à chaque fois la ligne
   du journal était « ⚔️ Combat : victoire (…) +2 VP », jamais « 🏴 capturée ». La colonie ne
   changeait pas de main.

   LA CAUSE. `resolveWarCombat` cherchait la colonie visée UNIQUEMENT chez `warEnemy`, la nation
   avec qui la guerre courante est ouverte. Sur un nœud partagé, la garde principale peut appartenir
   à l'AUTRE occupant : la colonie restait introuvable, et la victoire se réduisait à des points.

   ET LA SECONDE. `doEndGame` ne clôturait aucune guerre : celles encore ouvertes au tour 10
   disparaissaient sans un mot. Trois combats gagnés, et la partie se terminait comme s'il ne
   s'était rien passé.

   ⚠️ CHAQUE CAS PORTE SA CONTRE-ÉPREUVE, car les deux correctifs sont du genre à trop en faire :
   capturer un nœud qui ne devait pas l'être, ou annoncer une guerre qui n'a jamais existé.

   Usage : node test_colonie_conjointe.js
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
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) {
    n.routes = []; n.forceCooldown = [];
    n.res.materials = 20; n.res.energy = 20; n.res.science = 10; n.res.morale = 8;
  }
  sb.setDecisionSink(() => {});
  return { sb, G, moi: G.player, A: G.ais[0], B: G.ais[1], C: G.ais[2] };
}
const journal = G => (G.log || []).map(l => String((l && (l.msg || l.t)) || l));

console.log('═'.repeat(80));
console.log('COLONIE CONJOINTE ET FIN DES GUERRES');
console.log('═'.repeat(80) + '\n');

/* ── 1. LE CAS DE MARC — DEUX GUERRES OUVERTES, ET UNE CIBLE PARTAGÉE ──────── */
console.log('1. Deux guerres en cours : le combat doit viser le défenseur du nœud');
{
  /* ⚠️ LE PREMIER SCÉNARIO QUE J'AI ÉCRIT NE REPRODUISAIT RIEN, et sa contre-épreuve est restée
     verte — preuve qu'il ne prouvait rien. Le vrai décor de la partie F8D7 : Marc était en guerre
     contre DEUX nations à la fois (Martiens depuis T8, Ceinturiens depuis T9). En assaillant Triton
     — ceinturienne — `_warOf()` a rendu la PREMIÈRE guerre trouvée, la martienne : le combat s'est
     résolu contre les Martiens, chez qui la colonie visée n'existait pas. D'où « +2 VP » sans
     capture, trois fois de suite. C'est cela qu'on rejoue : deux guerres, et une cible qui
     n'appartient qu'à la SECONDE. */
  const m = partie();
  const NODES = vm.runInContext('NODES', m.sb);
  const pris = new Set();
  for (const n of [m.moi].concat(m.G.ais)) for (const c of n.colonies) pris.add(c.nodeId);
  const noeud = Object.keys(NODES).find(id => !NODES[id].decorative && !NODES[id].noColonize && !pris.has(id));
  if (!noeud) ko('aucun nœud libre — scénario invalide');
  else {
    const premiere = m.A;                       // la guerre ouverte EN PREMIER, sans lien avec la cible
    const proprio = m.B, cohabitant = m.C;      // B tient la place, C cohabite
    proprio.colonies.push({ nodeId: noeud, level: 2, connected: true });
    cohabitant.colonies.push({ nodeId: noeud, level: 1, connected: true });
    for (const n of [premiere, proprio, cohabitant]) { n.forceTokens = 0; n.res.materials = 0; n.res.energy = 0; }
    m.moi.forceTokens = 10;
    m.sb.declarerGuerre(m.moi, premiere, 'banc — guerre antérieure', 'player');
    m.sb.declarerGuerre(m.moi, proprio, 'banc — assaut sur le nœud partagé', 'player');
    m.G.warWith = proprio.civ.id;
    vm.runInContext('_warAttackColonyTarget=' + JSON.stringify(noeud), m.sb);
    note('nœud ' + ((NODES[noeud] || {}).name || noeud) + ' — garde : ' + proprio.civ.name
      + ' · cohabitant : ' + cohabitant.civ.name
      + ' · guerre ouverte EN PREMIER avec : ' + premiere.civ.name);
    const avant = m.moi.colonies.length;
    try { m.sb.resolveWarCombat(6, m.moi); } catch (e) { note('exception : ' + e.message); }
    const j = journal(m.G);
    const aMoi = m.moi.colonies.some(c => c.nodeId === noeud);
    note('mes colonies ' + avant + ' → ' + m.moi.colonies.length
      + ' · le nœud est à moi : ' + (aMoi ? 'oui' : 'non'));
    if (aMoi) ok('le nœud partagé m\'appartient après la victoire');
    else ko('victoire sans capture — « elle revient aux nations dès que conquise » (défaut F8D7)');
    const j2 = journal(m.G);
    if (!j2.some(x => x.indexOf(premiere.civ.name) >= 0 && /puissance/.test(x)))
      ok('le combat n\'a PAS été résolu contre la nation de la première guerre');
    else ko('le compte rendu nomme ' + premiere.civ.name + ' : on s\'est battu contre le mauvais adversaire');
    if (j.some(x => /capturée sur/.test(x))) ok('et le journal nomme la capture');
    else ko('le journal ne dit que « +2 VP » : rien ne signale que la place a changé de main');
    /* `capturerNoeud` doit expulser TOUS les occupants, pas seulement l'ennemi nommé. */
    if (!proprio.colonies.some(c => c.nodeId === noeud)) ok('l\'occupant principal a été expulsé');
    else ko('l\'ancienne garde est toujours sur le nœud : deux propriétaires pour une colonie');
    if (!cohabitant.colonies.some(c => c.nodeId === noeud)) ok('le cohabitant aussi');
    else ko('le cohabitant est resté : la cohabitation survit à la conquête');
  }
}

/* ── 2. CONTRE-ÉPREUVE — on ne capture pas un nœud qu'on ne défendait pas ──── */
console.log('\n2. CONTRE-ÉPREUVE — une victoire sans cible ne prend rien');
{
  /* Le risque du correctif : chercher « n'importe quelle nation qui occupe ce nœud » pourrait
     capturer un nœud VIDE, ou pire, s'attribuer une de ses propres colonies. */
  const m = partie();
  const ennemi = m.A;
  m.moi.forceTokens = 10; ennemi.forceTokens = 0; ennemi.res.materials = 0; ennemi.res.energy = 0;
  m.sb.declarerGuerre(m.moi, ennemi, 'banc — sans cible', 'player');
  m.G.warWith = ennemi.civ.id;
  const aMoiAvant = m.moi.colonies.map(c => c.nodeId).sort().join(',');
  /* On vise une colonie qui est DÉJÀ la mienne : rien ne doit changer de main. */
  const mienne = m.moi.colonies[0].nodeId;
  vm.runInContext('_warAttackColonyTarget=' + JSON.stringify(mienne), m.sb);
  try { m.sb.resolveWarCombat(6, m.moi); } catch (e) { note('exception : ' + e.message); }
  const aMoiApres = m.moi.colonies.map(c => c.nodeId).sort().join(',');
  note('mes colonies avant : ' + aMoiAvant + ' · après : ' + aMoiApres);
  if (aMoiAvant === aMoiApres) ok('viser une de mes propres colonies ne me « capture » rien');
  else ko('le combat a modifié mes propres colonies — la recherche du propriétaire déborde');
}

/* ── 3. LA GUERRE ENCORE OUVERTE À LA FIN EST ANNONCÉE ────────────────────── */
console.log('\n3. Les guerres encore en cours au dernier tour sont conclues au journal');
{
  const m = partie();
  const e1 = m.A, e2 = m.B;
  m.sb.declarerGuerre(m.moi, e1, 'banc — guerre gagnée', 'player');
  m.sb.declarerGuerre(m.moi, e2, 'banc — guerre nulle', 'player');
  const g1 = m.sb._warBetween(m.moi.civ.id, e1.civ.id);
  const g2 = m.sb._warBetween(m.moi.civ.id, e2.civ.id);
  if (!g1 || !g2) ko('les guerres du montage n\'ont pas été créées');
  else {
    g1.winsBy[m.moi.civ.id] = 3; g1.winsBy[e1.civ.id] = 1;   // je l'emporte 3 à 1
    g2.winsBy[m.moi.civ.id] = 0; g2.winsBy[e2.civ.id] = 0;   // aucun combat livré
    const avant = journal(m.G).length;
    m.sb.cloreGuerresEnCours();
    const nouvelles = journal(m.G).slice(0, journal(m.G).length - avant);
    for (const l of nouvelles) note(l.replace(/<[^>]+>/g, ''));
    const fins = nouvelles.filter(x => /Fin de partie — guerre/.test(x));
    if (fins.length === 2) ok('les DEUX guerres sont annoncées');
    else ko(fins.length + ' annonce(s) au lieu de 2 — « il manque une annonce à la fin »');
    if (fins.some(x => /l'emporte \(3 combat/.test(x))) ok('le vainqueur est nommé avec son décompte');
    else ko('le vainqueur n\'est pas nommé, ou le décompte est faux');
    if (fins.some(x => /aucun combat livré/.test(x))) ok('et une guerre sans combat le dit honnêtement');
    else ko('une guerre sans combat est présentée comme si quelqu\'un l\'avait gagnée');
    if (!m.G.wars.length) ok('les guerres closes ne traînent plus dans l\'état');
    else ko(m.G.wars.length + ' guerre(s) encore ouverte(s) après clôture');
  }
}

/* ── 4. CONTRE-ÉPREUVE — sans guerre, aucune annonce inventée ──────────────── */
console.log('\n4. CONTRE-ÉPREUVE — une partie sans guerre ne raconte pas de guerre');
{
  const m = partie();
  const avant = journal(m.G).length;
  m.sb.cloreGuerresEnCours();
  const nouvelles = journal(m.G).length - avant;
  note('lignes ajoutées : ' + nouvelles);
  if (nouvelles === 0) ok('rien n\'est écrit : on n\'annonce que ce qui a eu lieu');
  else ko(nouvelles + ' ligne(s) écrite(s) alors qu\'aucune guerre n\'existait');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un nœud partagé gagné change de main et expulse ses deux occupants ; les guerres');
console.log('   encore ouvertes à la fin sont conclues et nommées au journal.');
console.log('═'.repeat(80));
