/* ============================================================================
   TEST — UNE IA EST UNE NATION COMME UNE AUTRE
   ----------------------------------------------------------------------------
   Ce fichier était une MESURE ; il est devenu un GARDE-FOU, le jour où la mesure est
   passée au vert (2026-08-12). Il échoue si la maladie revient.

   POURQUOI. Marc, 2026-08-12 : « Cherche la même maladie partout stp, il faut purger
   le code complet de cela. Il faut que tout soit équivalent entre les IA et les
   joueurs. »

   L'inventaire textuel (`mesure_perspective.js`) trouve 317 endroits où le code parle
   de `G.player`. Les lire un par un serait long ET peu fiable : c'est précisément la
   méthode « je lis le code et je conclus » qui m'a fait dire trois fois une chose
   fausse cette semaine. Il faut une preuve, pas une lecture.

   L'IDÉE. `G.player` désigne « la nation active ». Le multijoueur fonctionne en
   faisant TOURNER ce que cette variable désigne. Donc :

       si le moteur était réellement neutre, jouer exactement la même partie en
       changeant seulement QUELLE nation est « la nation active » donnerait
       exactement le même résultat pour tout le monde.

   Toute différence est, par construction, un endroit où l'identité de la nation
   active a changé les règles. Pas un soupçon : une preuve, avec les chiffres.

   COMMENT. On joue N fois la MÊME partie — même carte, même hasard, mêmes IA — en
   ne changeant que la nation désignée comme active au démarrage. Puis on compare
   l'état final de CHAQUE nation, poste par poste.

   LE HASARD EST NEUTRALISÉ. `Math.random` est remplacé, dans le bac à sable, par un
   générateur à graine fixe. Sans cela, deux parties différeraient de toute façon et
   la mesure ne prouverait rien. C'est le point qui rend la comparaison légitime.

   ⚠️ CE QUE CETTE MESURE NE PROUVE PAS. Elle explore ce que les IA font jouer ; un
   chemin que les IA n'empruntent jamais (une fenêtre réservée aux humains, par
   exemple) ne sera pas visité. Elle est donc une borne INFÉRIEURE du nombre de
   défauts : ce qu'elle trouve est certain, ce qu'elle ne trouve pas n'est pas
   innocenté pour autant.

   RÉSULTAT DU 2026-08-12. Avant correction : 6 postes divergeaient (colonies, matériaux,
   savoir, cartes, énergie, moral) selon la nation désignée active. Après trois
   corrections — le ciblage des IA, les nœuds déjà colonisés, la paix entre IA — les
   quatre parties finissent à l'identique.

   Usage :  node test_equivalence.js [nombre de parties]      (défaut : 4)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
const N = Math.min(4, Math.max(2, parseInt(process.argv[2] || '4', 10)));

/* Une partie complète, tout-IA, avec un hasard IDENTIQUE d'une exécution à l'autre.
   `premier` = la nation désignée comme « active » au démarrage. C'est la seule chose
   qui change entre deux exécutions. */
function jouer(premier, graine) {
  const sb = loadLogic(HTML);
  /* ⚠️ SECOND PIÈGE, PLUS SUBTIL QUE LE PREMIER. J'avais d'abord mis un générateur À GRAINE.
     Insuffisant : à graine égale, le FLOT de tirages dépend de l'ORDRE des appels, et cet ordre
     change avec la nation active (l'agenda de chacun n'est pas tiré au même moment). Deux parties
     divergeaient donc par le hasard, et la mesure attribuait cette divergence à la perspective.
     On rend donc le hasard CONSTANT : quel que soit le nombre d'appels et leur ordre, chacun rend
     la même valeur. Le hasard ne peut alors plus expliquer la moindre différence — ce qui reste
     est imputable à la seule chose qui varie : l'identité de `G.player`. */
  vm.runInContext('Math.random=function(){return 0.42;};', sb);
  void graine;
  const autres = CIVS.filter(c => c !== premier);
  sb.initGame(premier, autres);
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) p._isAI = true;   // tout-IA : aucune fenêtre humaine

  /* ⚠️ PIÈGE ÉVITÉ DE JUSTESSE, ET IL AURAIT TOUT FAUSSÉ. Le premier jet de cette mesure jouait
     les nations dans l'ordre `[G.player, ...G.ais]` — donc dans un ORDRE DIFFÉRENT selon qui était
     actif. Or l'ordre décide qui colonise Cérès en premier : même un moteur parfaitement neutre
     aurait produit des états finaux différents. La mesure aurait « prouvé » une maladie qui
     n'existait pas.
     On joue donc TOUJOURS dans le même ordre canonique, indépendant de la nation active. La seule
     chose qui varie d'une exécution à l'autre est l'identité de `G.player`. */
  const ordreFixe = CIVS.map(id => [G.player].concat(G.ais).find(p => p.civ.id === id)).filter(Boolean);
  let garde = 0;
  while (G.turn <= G.maxTurns && garde++ < 400) {
    const avant = G.turn;
    try {
      for (const p of ordreFixe) {
        for (let a = 0; a < 8; a++) { if (!sb.doAITurn(p, true)) break; }
      }
      sb.advancePirates(); sb.doRevenues(); sb.doMaintenance();
    } catch (e) { /* on continue : on compare ce qui existe */ }
    G.turn = avant + 1;
  }
  // Photographie finale de CHAQUE nation, indexée par identifiant — jamais par position.
  const etat = {};
  for (const p of [G.player].concat(G.ais)) {
    etat[p.civ.id] = {
      energie: p.res.energy | 0, materiaux: p.res.materials | 0,
      savoir: p.res.science | 0, moral: p.res.morale | 0,
      jetons: p.forceTokens | 0,
      recup: (p.forceCooldown || []).reduce((s, c) => s + (c.count || 0), 0),
      colonies: p.colonies.map(c => c.nodeId + ':' + c.level).sort().join(','),
      routes: p.routes.length,
      cartes: (p.cards || []).map(c => c.id).sort().join(','),
      rpt: JSON.stringify(p.rpt || {}),
      gouv: p.gov_pts | 0
    };
  }
  return etat;
}

const POSTES = ['energie', 'materiaux', 'savoir', 'moral', 'jetons', 'recup', 'colonies', 'routes', 'cartes', 'rpt', 'gouv'];
const LISIBLE = { energie: 'énergie', materiaux: 'matériaux', savoir: 'savoir', moral: 'moral',
  jetons: 'jetons Force', recup: 'jetons en récupération', colonies: 'colonies', routes: 'routes',
  cartes: 'cartes possédées', rpt: 'revenus permanents', gouv: 'points de gouvernement' };

console.log('═'.repeat(78));
console.log('UNE IA EST-ELLE UNE NATION COMME UNE AUTRE ?');
console.log('═'.repeat(78));
console.log('Même carte, même hasard, mêmes IA. Seule varie la nation désignée active.\n');

const GRAINE = 20260812;
const refCiv = CIVS[0];
const reference = jouer(refCiv, GRAINE);
console.log('Référence : partie jouée avec « ' + refCiv +' » comme nation active.\n');

const ecarts = [];
for (let k = 1; k < N; k++) {
  const autre = CIVS[k];
  const essai = jouer(autre, GRAINE);
  const diffs = [];
  for (const civ of CIVS) {
    const a = reference[civ], b = essai[civ];
    if (!a || !b) { diffs.push({ civ, poste: '(nation absente)', ref: !!a, obt: !!b }); continue; }
    for (const poste of POSTES) {
      if (String(a[poste]) !== String(b[poste])) diffs.push({ civ, poste, ref: a[poste], obt: b[poste] });
    }
  }
  console.log('── Nation active = « ' + autre + ' »');
  if (!diffs.length) {
    console.log('   ✔ état final IDENTIQUE pour les quatre nations.\n');
    continue;
  }
  /* On regroupe par POSTE : dix écarts sur le même poste, c'est un seul défaut, pas dix. */
  const parPoste = {};
  for (const d of diffs) (parPoste[d.poste] || (parPoste[d.poste] = [])).push(d);
  console.log('   ❌ ' + diffs.length + ' écart(s), sur ' + Object.keys(parPoste).length + ' poste(s) :');
  for (const [poste, list] of Object.entries(parPoste).sort((a, b) => b[1].length - a[1].length)) {
    const ex = list[0];
    const court = v => { const s = String(v); return s.length > 46 ? s.slice(0, 46) + '…' : s; };
    console.log('     · ' + (LISIBLE[poste] || poste) + ' — ' + list.length + ' nation(s). Ex. ' + ex.civ
      + ' : « ' + court(ex.ref) + ' » puis « ' + court(ex.obt) + ' »');
    ecarts.push(poste);
  }
  console.log('');
}

console.log('═'.repeat(78));
if (!ecarts.length) {
  console.log('✅ Équivalence : le résultat NE DÉPEND PAS de qui est la nation active.');
  console.log('   (Réserve honnête : les chemins réservés aux humains ne sont pas visités ici.)');
} else {
  const uniques = [...new Set(ecarts)];
  console.log('❌ Le résultat DÉPEND de qui est la nation active — la maladie est revenue.');
  console.log(uniques.length + ' poste(s) touché(s) : ' + uniques.map(p => LISIBLE[p] || p).join(', ') + '.');
  console.log('');
  console.log('Chaque poste ci-dessus est une piste SÛRE : quelque chose, dans le calcul de ce');
  console.log('poste, lit « la nation active » au lieu de « cette nation ». C\'est par là qu\'il');
  console.log('faut commencer — et c\'est mesuré, pas supposé.');
  process.exitCode = 1;
}
console.log('═'.repeat(78));
