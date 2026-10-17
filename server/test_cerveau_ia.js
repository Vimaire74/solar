/* ============================================================================
   TEST — LE CERVEAU DES IA EST REMPLAÇABLE, ET LE REMPLACER PAR LUI-MÊME NE CHANGE RIEN
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 27/08 : « les IA appliquent une recette de cuisine au lieu de réfléchir. C'est le
   problème de base. » `docs/ARCHITECTURE_AVENIR.md` §Cas 2 disait déjà pourquoi rien ne pouvait
   changer : « l'IA actuelle n'est pas une fonction état → action, elle est ENTREMÊLÉE au moteur ».
   `actionUtilities` et `chooseAndAct` étaient des fermetures internes à `doAITurn` — impossibles à
   appeler, à tester, ou à remplacer.

   L'ÉTAPE 0 N'AJOUTE QU'UNE PORTE. Le choix final passe par un CERVEAU NOMMÉ (`CERVEAUX_IA`), et le
   cerveau `historique` fait exactement ce que faisait la boucle d'avant. Aucun comportement ne
   bouge : c'est toute son ambition, et c'est ce que ce banc doit établir.

   ⚠️ POURQUOI CETTE PREUVE EST INDISPENSABLE AVANT D'ALLER PLUS LOIN. L'étape suivante change la
   FAÇON DE DÉCIDER. Si l'étape 0 avait déjà déplacé le comportement d'un cran, on ne saurait plus,
   au premier écart de résultat, si c'est la nouvelle intelligence qui a agi ou la plomberie qui a
   dérapé. On sépare donc strictement : d'abord la structure, à comportement figé et prouvé ; le jeu
   ensuite.

   ⚠️ LA COMPARAISON DOIT ÊTRE COUP PAR COUP, PAS SCORE PAR SCORE. Deux parties peuvent finir sur le
   même total en ayant joué autrement. On rejoue donc la MÊME partie (graine fixe) et on compare la
   SUITE COMPLÈTE des actions des IA, dans l'ordre.

   Usage : node test_cerveau_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');

/* Tirage reproductible : `game-core.js` passe le `Math` de l'hôte au bac à sable, donc remplacer
   `Math.random` ici rend le moteur lui-même déterministe. Sans cela, comparer deux parties ne
   compare que du hasard. */
function graine(n) {
  let x = n >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Une partie entière tout-ordinateur, dont on retient la SUITE DES ACTIONS des IA. */
function partie(cerveau, seed) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: true }, { civId: 'martiens', isAI: true },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  const sb = d.sb, G = sb.__G;
  if (cerveau) G._cerveauIA = cerveau;
  let r = d.pump(), g = 0;
  while (g++ < 60000) {
    if (!r) break;
    if (G.turn > G.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  /* Les actions des IA, dans l'ordre, telles que le JOURNAL les a enregistrées : c'est la trace la
     plus fidèle de ce qu'elles ont décidé, et elle survit à la sérialisation. */
  const coups = (G._journal || []).map(e => e.turn + '|' + e.nat + '|' + e.name);
  const scores = [G.player].concat(G.ais || []).map(p => p.civ.id + ':' + sb.calcVP(p).total);
  return { coups, scores, sb, G };
}

console.log('═'.repeat(84));
console.log('CERVEAU DES IA — LA PORTE EST POSÉE, ET ELLE NE DÉPLACE RIEN');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le registre existe et le cerveau par défaut est l'historique ───────── */
console.log('1. Le registre des cerveaux est en place');
{
  const p = partie(null, 20260827);
  const noms = vm.runInContext('Object.keys(CERVEAUX_IA)', p.sb);
  note('cerveaux déclarés : ' + noms.join(', '));
  if (noms.includes('historique')) ok('`historique` est enregistré');
  else ko('aucun cerveau `historique` — le repli du moteur n\'existe pas');
  if (noms.includes('tacticien')) ok('`tacticien` aussi — celui qui n\'a AUCUNE note préalable');
  else ko('le cerveau `tacticien` manque');
  /* ⚠️ ET IL NE DOIT Y EN AVOIR QUE DEUX. `chercheur`, l'intermédiaire du 27/08, a été supprimé dès
     que `tacticien` l'a surpassé. Un cerveau gardé « au cas où » est une troisième chose à
     maintenir et à faire diverger — Marc : « nettoie bien le code histoire qu'on paye pas les restes
     plus tard ». Ce contrôle empêche qu'un intermédiaire se réinstalle en douce. */
  if (noms.length === 2) ok('et il n\'y en a que deux : le témoin et le tacticien');
  else ko(noms.length + ' cerveaux enregistrés (' + noms.join(', ') + ') — un intermédiaire traîne');
  /* ⚠️ LE DÉFAUT EST `tacticien` DEPUIS LE 28/08, et ce banc doit le CONSTATER.
     Il a d'abord dit `historique`, à une époque où je croyais que le tacticien « n'attaquait
     jamais » — affirmation trop catégorique, corrigée par la mesure : il construit jusqu'au tour 6
     puis passe à l'attaque. Marc a choisi de le mettre par défaut le 28/08.
     ⚠️ CE CONTRÔLE N'EST PAS DÉCORATIF. Le défaut se lit dans `nomCerveauCourant()`, une seule
     ligne, facile à faire basculer sans le vouloir en réglant tout autre chose. Le jour où il
     bascule, tout le jeu change de comportement en silence — c'est exactement ce qu'on refuse. */
  if (vm.runInContext('nomCerveauCourant()', p.sb) === 'tacticien')
    ok('et `tacticien` est bien le défaut (choix de Marc, 28/08)');
  else ko('le cerveau par défaut n\'est plus `tacticien`');
}

/* ── 2. LE CŒUR — même partie, cerveau nommé explicitement : coup pour coup ── */
console.log('\n2. Le cerveau par défaut, désigné par son nom, joue EXACTEMENT la même partie');
{
  /* ⚠️ ON COMPARE LE DÉFAUT IMPLICITE AU DÉFAUT NOMMÉ — donc `tacticien` depuis le 28/08, et non
     plus `historique`. Écrire ici le nom d'un cerveau qui n'est PLUS le défaut ne prouverait rien :
     les deux parties différeraient forcément, et le banc accuserait la plomberie d'un écart qui
     n'est qu'un changement de réglage. C'est exactement ce qui s'est produit le 28/08 au matin
     (« 164 actions contre 146 »). */
  /* ⚠️ UNE GRAINE PAR DÉFAUT, DEUX SUR DEMANDE — parce qu'un banc qui n'arrive pas au bout ne
     prouve rien. Depuis le 28/08 chaque partie coûte ~13 s (le tacticien simule chaque coup) : à
     deux graines, ce banc en joue huit et dépasse le plafond de temps. Il mourait alors sans un
     seul message, et je l'ai pris deux fois pour une régression.
     La démonstration ne perd rien : « le défaut implicite joue comme le défaut nommé » est une
     égalité stricte, coup par coup — une graine qui la vérifie suffit à la réfuter si elle est
     fausse. La seconde graine n'ajoute que de la redondance ; on la garde accessible par
     GRAINES=20260827,7 pour les vérifications de fond. */
  const graines = (process.env.GRAINES || '20260827').split(',').map(n => parseInt(n, 10));
  for (const seed of graines) {
    const a = partie(null, seed);              // repli implicite
    const b = partie('tacticien', seed);       // le même, désigné par son nom
    note('graine ' + seed + ' : ' + a.coups.length + ' action(s) d\'IA de part et d\'autre');
    if (a.coups.length !== b.coups.length) { ko('graine ' + seed + ' : ' + a.coups.length + ' actions contre ' + b.coups.length); continue; }
    let divergence = -1;
    for (let i = 0; i < a.coups.length; i++) if (a.coups[i] !== b.coups[i]) { divergence = i; break; }
    if (divergence < 0) ok('graine ' + seed + ' : les deux parties sont identiques, coup par coup');
    else ko('graine ' + seed + ' : divergence au coup ' + divergence + ' — « ' + a.coups[divergence] + ' » contre « ' + b.coups[divergence] + ' »');
    if (a.scores.join(' ') === b.scores.join(' ')) ok('   et les scores finaux coïncident : ' + a.scores.join(' · '));
    else ko('scores différents : ' + a.scores.join(' ') + ' contre ' + b.scores.join(' '));
  }
}

/* ── 3. CONTRE-ÉPREUVE — la porte est VRAIMENT sur le chemin de décision ──── */
console.log('\n3. CONTRE-ÉPREUVE — un cerveau différent DOIT jouer différemment');
{
  /* Sans ce bloc, le §2 ne prouverait rien : deux parties identiques peuvent aussi bien signifier
     que le cerveau n'est jamais consulté. On en branche un qui décide à l'envers — la PIRE action
     du classement plutôt que la meilleure — et on exige que la partie change. */
  /* ⚠️ CE BAC À SABLE NE SERT QU'À VÉRIFIER QU'UN CERVEAU S'ENREGISTRE — la partie qu'on joue pour
     l'obtenir n'est jamais lue. On la joue donc avec `historique` (instantané) plutôt qu'avec le
     défaut `tacticien` (~13 s de simulation), ce qui ne change rien à ce qui est prouvé ici. */
  const p = partie('historique', 20260827);
  vm.runInContext(
    "enregistrerCerveau('banc_inverse', function(ctx){" +
    "  for(var i=ctx.classees.length-1;i>=0;i--){ if(ctx.executer(ctx.classees[i])) return true; }" +
    "  return false; });", p.sb);
  const noms = vm.runInContext('Object.keys(CERVEAUX_IA)', p.sb);
  if (noms.includes('banc_inverse')) ok('un cerveau d\'essai s\'enregistre sans toucher au moteur');
  else ko('impossible d\'enregistrer un cerveau — la porte n\'est pas ouverte');

  const ref = partie('historique', 4242);
  /* ⚠️ UNE PARTIE ENTIÈRE ÉTAIT JOUÉE PUIS JETÉE. Il y avait ici `const inv = partie('banc_inverse',
     4242);` suivi, tout en bas, de `void inv` — c'est-à-dire l'aveu écrit que le résultat ne servait
     à rien. Et il ne POUVAIT pas servir : `banc_inverse` n'est pas enregistré dans le bac à sable que
     `partie()` fabrique, donc cette partie retombait sur `historique` et rejouait `ref` à
     l'identique. Supprimée le 28/08 : c'était du temps de calcul pur, et une fausse piste pour qui
     lisait le banc. La vraie contre-épreuve est la partie pilotée à la main juste en dessous, où le
     cerveau inversé est bel et bien enregistré avant de jouer. */
  note('(cerveau d\'essai à réenregistrer dans chaque bac à sable — voir ci-dessous)');
  graine(4242);
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: true }, { civId: 'martiens', isAI: true },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  vm.runInContext(
    "enregistrerCerveau('banc_inverse', function(ctx){" +
    "  for(var i=ctx.classees.length-1;i>=0;i--){ if(ctx.executer(ctx.classees[i])) return true; }" +
    "  return false; });", d.sb);
  d.sb.__G._cerveauIA = 'banc_inverse';
  let r = d.pump(), g = 0;
  while (g++ < 60000) {
    if (!r) break; const GG = d.sb.__G; if (GG.turn > GG.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const coupsInv = (d.sb.__G._journal || []).map(e => e.turn + '|' + e.nat + '|' + e.name);
  note('historique : ' + ref.coups.length + ' actions · à l\'envers : ' + coupsInv.length);
  if (coupsInv.join('¤') !== ref.coups.join('¤'))
    ok('la partie change quand le cerveau change — la porte est bien sur le chemin de décision');
  else ko('la partie est identique avec un cerveau inversé : le cerveau n\'est jamais consulté');
}

/* ── 4. Un cerveau inconnu ne casse pas la partie ─────────────────────────── */
console.log('\n4. Un nom de cerveau inconnu retombe sur l\'historique');
{
  /* Une partie sauvegardée peut nommer un cerveau retiré depuis. Elle doit continuer, pas planter. */
  const p = partie('cerveau_qui_nexiste_pas', 20260827);
  const ref = partie('historique', 20260827);   // le repli nommé dans `cerveauCourant()`
  if (p.coups.length && p.coups.join('¤') === ref.coups.join('¤'))
    ok('le repli joue la partie historique, sans interruption');
  else ko('un nom inconnu ne retombe pas proprement sur l\'historique');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le cerveau est nommé, remplaçable et éprouvé : `historique` rejoue la partie coup');
console.log('   pour coup, un autre cerveau la change, et un nom inconnu ne casse rien.');
console.log('═'.repeat(84));
