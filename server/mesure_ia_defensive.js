/* ════════════════════════════════════════════════════════════════════════════════════════════
   MESURE — LE CONQUÉRANT PREND-IL L'IA DÉFENSIVE ?
   ────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI. Marc le redit depuis §139.2 : « il doit chercher à prendre ça en priorité ». Une
   RÈGLE FERME existe dans `reviserProjet` — un Conquérant sans projet en cours adopte d'office la
   chaîne `ia_renseignement` (drones1 → reseau2 → iadef3). Partie 2A5F (20/09) : les Martiens,
   Conquérant, finissent la partie sans une seule carte de cette chaîne.

   CE QUE CE FICHIER MESURE. Sur N parties entières tout-ordinateur, avec UN siège forcé en
   Conquérant : combien de fois la chaîne est entamée, poursuivie, terminée — et, quand elle ne
   l'est pas, ce que la trace des projets (`G._traceProjet`) dit qu'il a fait à la place.
   Il ne corrige rien : il donne le chiffre avant tout changement.

   Usage : node mesure_ia_defensive.js        (PARTIES=<n>, défaut 6 ; DEPART=<n> décale les graines)
   ════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'index.html');

const PARTIES = parseInt(process.env.PARTIES || '6', 10);
const DEPART = parseInt(process.env.DEPART || '0', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
const CHAINE = ['drones1', 'reseau2', 'iadef3'];

function graine(n) {
  let x = (n + 1) >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

function partie(seed) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  G._cerveauIA = 'tacticien';
  /* BUT=0 : mesure de référence, sans le but de jeu. Sans la variable : le réglage du moteur. */
  if (process.env.BUT !== undefined) G._butPrime = Number(process.env.BUT);
  /* UN siège forcé en Conquérant : c'est lui que la règle ferme vise. Les autres gardent leur
     tempérament tiré au sort — on veut une partie normale, pas quatre conquérants. */
  const tous = [G.player].concat(G.ais || []);
  const conq = tous[1];
  /* UN SEUL Conquérant à la table : le rang 3 est EXCLUSIF (premier acheteur seulement), donc
     plusieurs Conquérants se disputeraient la même carte et la mesure ne dirait plus rien sur la
     règle — seulement qui a couru le plus vite. Les autres sièges sont Bâtisseur / Opportuniste. */
  const AUTRES = ['batisseur', 'opportuniste', 'batisseur'];
  let k = 0;
  for (const p of tous) p._profil = (p === conq) ? 'guerrier' : AUTRES[k++ % AUTRES.length];
  const origine = sb.doAITurn;
  sb.doAITurn = function (nat, oneShot) {
    G._cerveauIA = 'tacticien';
    if (nat === conq) nat._profil = 'guerrier'; else if (nat._profil === 'guerrier') nat._profil = 'batisseur';
    return origine.call(null, nat, oneShot);
  };
  /* Qui rafle le rang 3, et à quel tour : c'est une COURSE, pas un achat solitaire. */
  const course = { qui: null, tour: null };
  const origBuy = sb.buyTech;
  if (typeof origBuy === 'function') sb.buyTech = function (nat, id) {
    const r = origBuy.apply(null, arguments);
    try { const cid = (typeof id === 'object' && id) ? id.id : id; if (cid === 'iadef3' && !course.qui && nat && nat.civ) { course.qui = nat.civ.id; course.tour = G.turn; } } catch (e) {}
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
  const aCarte = (p, id) => (p.cards || []).some(c => c && (c.id === id || c.id === id + '_esp'));
  const trace = (G._traceProjet || []).filter(x => x.nat === conq.civ.id);
  return {
    conq: conq.civ.id,
    prises: CHAINE.filter(id => aCarte(conq, id)),
    science: conq.res && conq.res.science,
    cartes: (conq.cards || []).length,
    vp: sb.calcVP(conq).total,
    /* Ce que la règle ferme a fait, ou n'a pas fait : le premier projet adopté, et la liste. */
    premier: trace.length ? (trace[0].acte + ' ' + trace[0].projet) : 'AUCUNE TRACE',
    course: course.qui ? (course.qui + ' au tour ' + course.tour) : 'personne',
    revScience: (function () { try { return Math.round((sb.revenusBruts(conq) || {}).science || 0); } catch (e) { return '?'; } })(),
    projets: [...new Set(trace.filter(x => x.acte === 'choisi' || x.acte === 'adopte' || x.acte === 'change').map(x => x.acte[0] + ':' + x.projet))],
    // les autres nations, pour mémoire
    autres: tous.filter(p => p !== conq).map(p => ({ civ: p.civ.id, profil: p._profil, prises: CHAINE.filter(id => aCarte(p, id)).length }))
  };
}

console.log('═'.repeat(88));
console.log("L'IA DÉFENSIVE ET LE CONQUÉRANT — " + PARTIES + ' partie(s) entières, 4 sièges ordinateur, 1 siège forcé Conquérant');
console.log('═'.repeat(88));
let entamee = 0, finie = 0;
for (let i = 0; i < PARTIES; i++) {
  const r = partie(DEPART + i);
  if (r.prises.length) entamee++;
  if (r.prises.indexOf('iadef3') >= 0) finie++;
  console.log('\nPartie ' + (i + 1) + ' — Conquérant : ' + r.conq + '  ·  ' + r.vp + ' VP, ' + r.cartes + ' cartes');
  console.log('   chaîne ia_renseignement prise : ' + (r.prises.length ? r.prises.join(' › ') : 'RIEN'));
  console.log('   premier projet      : ' + r.premier);
  console.log('   projets de la partie: ' + (r.projets.length ? r.projets.join(' | ') : 'aucun'));
  console.log('   IA Défensive prise par : ' + r.course + '   (revenu science du Conquérant en fin de partie : ' + r.revScience + ')');
  console.log('   autres nations      : ' + r.autres.map(a => a.civ + '(' + a.profil + ') ' + a.prises + '/3').join(' · '));
}
console.log('\n' + '─'.repeat(88));
console.log('Conquérant : chaîne entamée ' + entamee + '/' + PARTIES + ' · IA Défensive obtenue ' + finie + '/' + PARTIES);
console.log('─'.repeat(88));
