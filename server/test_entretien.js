/* ============================================================================
   TEST — ENTRETIEN DES COLONIES : CE QUI EST ANNONCÉ EST CE QUI EST PRÉLEVÉ
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09 : « la tech biosphère autonome semble ne plus
   fonctionner ». Elle ne fonctionnait effectivement plus, et le défaut est
   toujours le même : le barème d'entretien existe en TROIS exemplaires —
   l'affichage du bilan, `_netIncome` (le revenu net annoncé) et `doMaintenance`
   (le seul qui prélève vraiment). La remise de Biosphère Autonome avait été
   posée dans les deux premiers et oubliée dans le troisième. Le joueur lisait
   donc −2⚡ et payait −3⚡, sans rien pour le lui signaler.

   CE QUE CE TEST VÉRIFIE :
     1. le barème nu : 1⚡ par colonie hors capitale, 0/1/2🪨 selon le niveau ;
     2. Biosphère Autonome retire 1⚡ PAR COLONIE DE NIVEAU 1 (règle fixée par Marc
        le 2026-08-09 : la remise forfaitaire de −1⚡ sur le total était trop faible,
        « sinon ça reste difficile ») — donc les colonies Nv1 ne coûtent plus rien
        en énergie, et les Nv2/Nv3 paient toujours leur 1⚡ ;
     3. elle ne touche pas les matériaux, et ne descend jamais sous zéro ;
     4. Biosphère Avancée supprime tout l'entretien ;
     5. L'INVARIANT QUI COMPTE : l'écart ANNONCÉ par `_netIncome` quand on
        acquiert la technologie est exactement l'écart PRÉLEVÉ par
        `doMaintenance`. C'est le seul point qui aurait attrapé le défaut :
        les deux calculs pris séparément étaient chacun cohérents avec eux-mêmes.

   Usage : node test_entretien.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }

/* Une nation neuve avec les colonies demandées (niveaux hors capitale). */
function nation(niveaux) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G, p = G.player;
  const libres = Object.keys(sb.NODES || {}).filter(id => id !== p.civ.home).slice(0, niveaux.length);
  p.colonies = [{ nodeId: p.civ.home, level: 1 }].concat(niveaux.map((lv, i) => ({ nodeId: libres[i], level: lv })));
  p.routes = [];
  return { sb, p };
}
/* Ce qui est RÉELLEMENT prélevé par doMaintenance (routes neutralisées : p.routes est vide). */
function preleve(sb, p) {
  p.res.energy = 60; p.res.materials = 60; p.res.morale = 5;
  const e0 = p.res.energy, m0 = p.res.materials;
  sb.doMaintenance();
  return { e: e0 - p.res.energy, m: m0 - p.res.materials };
}
/* Les cartes sont réduites à ce que `hasSpec` regarde : leur `spec`. On ne passe pas par
   l'achat réel, qui exigerait des ressources, des prérequis et une rivière — hors sujet ici. */
const CARTE = { bio1: { id: 'bio1', spec: 'upkeep_e_disc' }, bio2: { id: 'bio2', spec: 'bio2_bonus' } };

console.log('═'.repeat(72));
console.log('ENTRETIEN DES COLONIES — ANNONCÉ = PRÉLEVÉ');
console.log('═'.repeat(72) + '\n');

/* ── 1. Le barème nu ──────────────────────────────────────────────────────── */
console.log('1. Le barème');
{
  const cas = [
    { niv: [1], e: 1, m: 0 },
    { niv: [2], e: 1, m: 1 },
    { niv: [3], e: 1, m: 2 },
    { niv: [1, 2, 3], e: 3, m: 3 }
  ];
  for (const c of cas) {
    const { sb, p } = nation(c.niv);
    const r = preleve(sb, p);
    if (r.e === c.e && r.m === c.m) ok('colonies ' + c.niv.join('+') + ' → ' + r.e + '⚡ ' + r.m + '🪨');
    else ko('colonies ' + c.niv.join('+') + ' → ' + r.e + '⚡ ' + r.m + '🪨 (attendu ' + c.e + '/' + c.m + ')');
  }
}

/* ── 2 & 3. Biosphère Autonome ────────────────────────────────────────────── */
console.log('\n2. Biosphère Autonome (−1⚡ par colonie de niveau 1)');
{
  /* Le cas qui distingue la nouvelle règle de l'ancienne : TROIS colonies de niveau 1.
     Ancienne règle (forfait) → 3 − 1 = 2⚡. Nouvelle règle → 0⚡. */
  const trois = nation([1, 1, 1]); trois.p.cards.push(CARTE.bio1);
  const r0 = preleve(trois.sb, trois.p);
  if (r0.e === 0) ok('3 colonies Nv1 : ' + r0.e + '⚡ — la remise est PAR COLONIE, pas un forfait');
  else ko('3 colonies Nv1 : ' + r0.e + '⚡ au lieu de 0 (remise forfaitaire ? ou pas appliquée ?)');

  const { sb, p } = nation([1, 2, 3]);
  p.cards.push(CARTE.bio1);
  const r = preleve(sb, p);
  if (r.e === 2) ok('Nv1+Nv2+Nv3 : ' + r.e + '⚡ — seule la Nv1 est exemptée');
  else ko('Nv1+Nv2+Nv3 : ' + r.e + '⚡ au lieu de 2 (les Nv2/Nv3 doivent toujours payer 1⚡)');
  if (r.m === 3) ok('les matériaux ne bougent pas (' + r.m + '🪨)');
  else ko('les matériaux ont changé : ' + r.m + '🪨 au lieu de 3');

  /* Conséquence assumée de la règle : améliorer une colonie Nv1 lui REDONNE son entretien
     en énergie. On le vérifie, pour que personne ne le prenne plus tard pour un défaut. */
  const av = nation([1, 1]); av.p.cards.push(CARTE.bio1);
  const eAvant = preleve(av.sb, av.p).e;
  const ap = nation([1, 2]); ap.p.cards.push(CARTE.bio1);
  const eApres = preleve(ap.sb, ap.p).e;
  if (eAvant === 0 && eApres === 1) ok('améliorer une Nv1 en Nv2 lui rend son 1⚡ (0⚡ → 1⚡) — voulu');
  else ko('passage Nv1→Nv2 : ' + eAvant + '⚡ puis ' + eApres + '⚡ (attendu 0 puis 1)');

  const seule = nation([2]); seule.p.cards.push(CARTE.bio1);
  const r2 = preleve(seule.sb, seule.p);
  if (r2.e === 1) ok('une seule colonie Nv2 : ' + r2.e + '⚡ — aucune remise, elle n\'est pas Nv1');
  else ko('une seule colonie Nv2 : ' + r2.e + '⚡ au lieu de 1');
}

/* ── 4. Biosphère Avancée ─────────────────────────────────────────────────── */
console.log('\n3. Biosphère Avancée (plus aucun entretien)');
{
  const { sb, p } = nation([1, 2, 3]);
  p.cards.push(CARTE.bio2);
  const r = preleve(sb, p);
  if (r.e === 0 && r.m === 0) ok('3 colonies : ' + r.e + '⚡ ' + r.m + '🪨');
  else ko('3 colonies : ' + r.e + '⚡ ' + r.m + '🪨 au lieu de 0/0');
}

/* ── 5. L'invariant : annoncé = prélevé ───────────────────────────────────── */
console.log('\n4. L\'écart annoncé est l\'écart prélevé');
for (const carte of ['bio1', 'bio2']) {
  const nom = carte === 'bio1' ? 'Biosphère Autonome' : 'Biosphère Avancée';
  // AVANT : sans la carte. On lit l'annonce, puis on prélève — sur DEUX nations identiques,
  // parce que doMaintenance modifie l'état et fausserait la mesure suivante.
  const a1 = nation([1, 1, 2, 3]), a2 = nation([1, 1, 2, 3]);
  const annonceAvant = (a1.sb._netIncome(a1.p) || {}).energy;
  const preleveAvant = preleve(a2.sb, a2.p).e;
  // APRÈS : avec la carte.
  const b1 = nation([1, 1, 2, 3]), b2 = nation([1, 1, 2, 3]);
  b1.p.cards.push(CARTE[carte]); b2.p.cards.push(CARTE[carte]);
  const annonceApres = (b1.sb._netIncome(b1.p) || {}).energy;
  const preleveApres = preleve(b2.sb, b2.p).e;

  const gainAnnonce = annonceApres - annonceAvant;   // le net annoncé s'améliore d'autant
  const gainReel = preleveAvant - preleveApres;      // on paie d'autant moins
  if (gainAnnonce === gainReel)
    ok(nom + ' : le bilan annonce +' + gainAnnonce + '⚡ et on paie bien ' + gainReel + '⚡ de moins');
  else
    ko(nom + ' : le bilan annonce +' + gainAnnonce + '⚡ mais le prélèvement ne baisse que de '
       + gainReel + '⚡ — l\'affichage et la caisse ne disent pas la même chose');
}

console.log('\n' + '═'.repeat(72));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Entretien : barème, remises, et cohérence entre ce qui est annoncé et ce qui est prélevé.');
console.log('═'.repeat(72));
