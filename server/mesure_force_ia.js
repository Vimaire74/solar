/* ============================================================================
   MESURE — LES IA SONT-ELLES DEVENUES PLUS FAIBLES ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il compare deux versions du moteur et rend des chiffres.

   POURQUOI. Marc, 2026-08-14, après la partie 0C10 : « les IA semblent plus faibles
   maintenant paradoxalement ». Paradoxalement, parce que le travail de la semaine
   visait justement l'inverse : rendre les IA équivalentes aux joueurs.

   Une impression de partie n'est pas une preuve — une seule partie, c'est un
   échantillon de taille 1, et Marc a pu simplement bien jouer. Il faut mesurer.

   MÉTHODE. On joue N parties TOUT-IA sur DEUX moteurs :
     · la version de référence (lot15_tout, 7 août — avant les corrections) ;
     · la version actuelle.
   Même carte, même nombre de tours, même déroulé. On relève, pour chaque nation,
   ce qu'elle a accumulé : VP, colonies, cartes, ressources, jetons.

   ⚠️ CE QUE CETTE MESURE NE PEUT PAS FAIRE. Elle ne joue pas d'humain. Elle ne dit
   donc pas « l'IA perd contre Marc », elle dit « l'IA construit moins qu'avant ».
   C'est la question intéressante : si l'IA bâtit moins, elle est plus faible face à
   n'importe qui.

   Le hasard est laissé libre et on fait la MOYENNE sur N parties : deux moteurs
   différents ne peuvent pas suivre le même flot de tirages, donc figer la graine ne
   servirait à rien ici (contrairement à `mesure_equivalence.js`, où le code comparé
   est le même). C'est la moyenne qui porte la conclusion, pas une partie.

   Usage :  node mesure_force_ia.js [nombre de parties]      (défaut : 12)
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
/* ⚠️ CHAQUE VERSION EST CHARGÉE PAR SON PROPRE `game-core.js`. Le chargeur actuel EXIGE des
   fonctions qui n'existaient pas le 7 août (`defenseIA`) et refusait donc l'ancien moteur.
   Comparer deux moteurs impose d'utiliser, pour chacun, le chargeur de son époque. */
function chargeurDe(html) {
  const local = path.join(path.dirname(html), 'server', 'game-core.js');
  return require(fs.existsSync(local) ? local : './game-core.js').loadLogic;
}

const RACINE = path.join(__dirname, '..');
const VERSIONS = [
  { nom: 'AVANT (lot15, 7 aout)', html: path.join(RACINE, 'Pour uploader', 'lot15_tout', 'play.html') },
  { nom: 'MAINTENANT', html: path.join(RACINE, 'play.html') }
];
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
const N = Math.max(3, parseInt(process.argv[2] || '12', 10));

function unePartie(html) {
  const sb = chargeurDe(html)(html);
  const ordre = CIVS.slice().sort(() => Math.random() - 0.5);
  sb.initGame(ordre[0], ordre.slice(1));
  const G = sb.__G;
  const nations = [G.player].concat(G.ais);
  for (const p of nations) p._isAI = true;          // tout-IA : aucune fenêtre humaine
  /* ⚠️ MON PREMIER JET DE CETTE MESURE NE FAISAIT PAS JOUER LES IA. Il n'appelait pas `startTurn()`,
     donc les points d'action n'étaient jamais rendus : chaque nation agissait au tour 1 puis restait
     à zéro AC neuf tours durant. Résultat annoncé : 2,2 colonies et 0,5 carte en dix tours — un
     chiffre absurde qui aurait dû sauter aux yeux, et qui aurait servi de base à une conclusion.
     On reprend la conduite de partie de `selftest.js`, qui elle est éprouvée. */
  let garde = 0;
  while (G.turn <= G.maxTurns && garde++ < 200) {
    try { sb.startTurn(); } catch (e) { for (const p of nations) p.acLeft = p.acMax; }
    for (const p of nations) { p._passedRound = false; p._aiSetupDone = false; }
    let idx = 0, tour = 0;
    while (tour++ < 3000) {
      if (nations.every(p => p._passedRound)) break;
      const p = nations[idx % nations.length];
      if (p._passedRound) { idx++; continue; }
      let agi = false;
      try { agi = sb.doAITurn(p, true); } catch (e) { p._passedRound = true; }
      if (!agi || p.acLeft <= 0) p._passedRound = true;
      idx++;
    }
    try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
    let ev = null; try { ev = sb.eventForTurn(G.turn); } catch (e) {}
    if (ev) { try { ev.resolve(G); } catch (e) {} }
    G.turn++;
  }
  return nations.map(p => {
    let vp = 0; try { vp = sb.calcVP(p).total | 0; } catch (e) {}
    return {
      civ: p.civ.id, vp,
      colonies: p.colonies.length,
      niveaux: p.colonies.reduce((s, c) => s + (c.level || 1), 0),
      routes: (p.routes || []).length,
      cartes: (p.cards || []).length,
      jetons: (p.forceTokens || 0),
      energie: p.res.energy | 0, materiaux: p.res.materials | 0,
      savoir: p.res.science | 0, moral: p.res.morale | 0
    };
  });
}

const POSTES = ['vp', 'colonies', 'niveaux', 'routes', 'cartes', 'jetons', 'energie', 'materiaux', 'savoir', 'moral'];
const LISIBLE = { vp: 'points de victoire', colonies: 'colonies', niveaux: 'niveaux cumulés',
  routes: 'routes', cartes: 'cartes possédées', jetons: 'jetons Force', energie: 'énergie',
  materiaux: 'matériaux', savoir: 'savoir', moral: 'moral' };

console.log('═'.repeat(78));
console.log('FORCE DES IA — CE QU\'ELLES CONSTRUISENT, AVANT ET MAINTENANT');
console.log('═'.repeat(78));
console.log(N + ' parties tout-IA par version, moyenne sur les 4 nations.\n');

const resultats = {};
for (const v of VERSIONS) {
  if (!fs.existsSync(path.join(path.dirname(v.html), 'moteur.js'))) {
    console.log('⚠️  version « ' + v.nom + ' » introuvable — ignorée.'); continue;
  }
  const somme = {}; for (const p of POSTES) somme[p] = 0;
  const parCiv = {}; for (const c of CIVS) { parCiv[c] = { vp: 0, n: 0 }; }
  let n = 0;
  for (let i = 0; i < N; i++) {
    for (const e of unePartie(v.html)) {
      n++; for (const p of POSTES) somme[p] += e[p] || 0;
      if (parCiv[e.civ]) { parCiv[e.civ].vp += e.vp; parCiv[e.civ].n++; }
    }
  }
  const moy = {}; for (const p of POSTES) moy[p] = somme[p] / n;
  resultats[v.nom] = { moy, parCiv, n };
  console.log('── ' + v.nom + '  (' + n + ' nations observées)');
  console.log('   ' + POSTES.map(p => LISIBLE[p] + ' ' + moy[p].toFixed(1)).join(' · '));
  console.log('   par nation (VP moyens) : ' + CIVS.map(c => c + ' ' + (parCiv[c].n ? (parCiv[c].vp / parCiv[c].n).toFixed(1) : '—')).join(' · '));
  console.log('');
}

const noms = Object.keys(resultats);
if (noms.length === 2) {
  const a = resultats[noms[0]].moy, b = resultats[noms[1]].moy;
  console.log('═'.repeat(78));
  console.log('ÉCART — « maintenant » par rapport à « avant »');
  console.log('═'.repeat(78));
  let recul = 0;
  for (const p of POSTES) {
    const d = b[p] - a[p];
    const pct = a[p] ? (d / a[p] * 100) : 0;
    const fleche = Math.abs(pct) < 3 ? '  =' : (d > 0 ? ' ↑ ' : ' ↓ ');
    if (pct <= -8) recul++;
    console.log('  ' + fleche + ' ' + (LISIBLE[p] + ' ').padEnd(22, '.') + ' ' + a[p].toFixed(1).padStart(7)
      + ' → ' + b[p].toFixed(1).padStart(7) + '   ' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + ' %');
  }
  console.log('');
  if (recul === 0) console.log('LECTURE : aucun poste ne recule nettement. L\'impression de faiblesse ne se');
  else console.log('LECTURE : ' + recul + ' poste(s) reculent de plus de 8 %. C\'est mesuré, pas supposé.');
  if (recul === 0) console.log('retrouve pas dans ce que les IA construisent — il faut chercher ailleurs.');
  console.log('═'.repeat(78));
}
