/* ============================================================================
   TEST — LA CARTE DIPLOMATIE APAISE UNE NATION NOMMÉE, DANS LE BON SENS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 03/09 : « l'action bonus diplomatie, ça dit que ça améliore les rapports avec les
   autres nations mais on sait pas qui ni de combien de point ». C'était exact, et pour une raison de
   fond : son effet était `warRisk:-3`, une jauge d'AMBIANCE GLOBALE (`G.warRisk`) qui ne concerne
   aucune nation en particulier. Il n'y avait personne à nommer.

   CE QU'ELLE DEVIENT. Le miroir de « Calmer les tensions » (st9), sur sa demande : même fenêtre de
   choix, mais on baisse la tension de la nation choisie ENVERS TOI, là où st9 baisse la TIENNE
   envers elle.

   ⚠️ LE SENS EST TOUTE LA CARTE. `G.tensions` est rangé par COUPLE ORIENTÉ : `getTens(a,b)` n'est
   pas `getTens(b,a)`. Se tromper de sens donne une carte qui a l'air de marcher — la fenêtre
   s'ouvre, un chiffre baisse, le journal parle — et qui ne protège de rien, puisque c'est la
   tension de l'AUTRE qui déclenche sa guerre populaire contre toi. Le §2 et le §3 tiennent les deux
   sens en face l'un de l'autre pour que l'un ne puisse pas être pris pour l'autre.

   Usage : node test_diplomatie.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  return { sb, G, moi: G.player, m: G.ais[0], j: G.ais[1] };
}
const carte = (sb, id) => vm.runInContext("STRATEGY_CARDS.find(c=>c.id==='" + id + "')", sb);

console.log('═'.repeat(84));
console.log('DIPLOMATIE — QUI, ET DE COMBIEN');
console.log('═'.repeat(84) + '\n');

/* ── 1. La carte annonce une nation et un nombre ───────────────────────────── */
console.log('1. La carte ouvre une sous-décision (elle ne s\'applique plus en silence)');
{
  const m = montage();
  const c = carte(m.sb, 'st5');
  note('libellé : « ' + (c && c.desc) + ' » · calmTheirs = ' + (c && c.calmTheirs) + ' · warRisk = ' + (c && c.warRisk));
  if (!c) { ko('carte st5 introuvable'); }
  else {
    if (c.calmTheirs > 0) ok('elle porte un montant explicite (−' + c.calmTheirs + ')');
    else ko('aucun montant : on ne sait toujours pas de combien');
    if (!c.warRisk) ok('l\'ancien effet global `warRisk` a bien disparu de cette carte');
    else ko('elle garde `warRisk` : elle serait strictement meilleure que « Calmer les tensions »');
    const besoin = m.sb._applyStratTo(m.moi, c);
    if (besoin === true) ok('le moteur réclame le choix d\'une nation');
    else ko('le moteur l\'applique sans rien demander — aucune nation nommée');
  }
}

/* ── 2. LE SENS — c'est SA tension envers moi qui baisse ───────────────────── */
console.log('\n2. Diplomatie baisse la tension de l\'AUTRE envers moi');
{
  const m = montage();
  const moiId = m.moi.civ.id, mId = m.m.civ.id;
  m.sb.setTens(mId, moiId, 8);      // les Martiens m'en veulent beaucoup
  m.sb.setTens(moiId, mId, 6);      // et je leur en veux un peu moins
  m.sb.applyCalmTension(mId, 'diplomatie', 3);
  const leur = m.sb.getTens(mId, moiId), mienne = m.sb.getTens(moiId, mId);
  note('leur tension envers moi : 8 → ' + leur + ' · la mienne envers eux : 6 → ' + mienne);
  if (leur === 5) ok('leur tension envers moi baisse de 3 — c\'est celle qui déclenche leur guerre');
  else ko('leur tension est à ' + leur + ' au lieu de 5');
  if (mienne === 6) ok('la mienne n\'a pas bougé — le sens est le bon');
  else ko('c\'est MA tension qui a bougé (' + mienne + ') : la carte est à l\'envers');
}

/* ── 3. CONTRE-ÉPREUVE — « Calmer les tensions » garde SON sens ────────────── */
console.log('\n3. CONTRE-ÉPREUVE — st9 continue de baisser MA tension, pas la leur');
{
  /* ⚠️ SANS CE POINT, ON POURRAIT AVOIR INVERSÉ LES DEUX CARTES et voir le §2 passer au vert. Les
     deux sens doivent coexister, chacun sur sa carte. */
  const m = montage();
  const moiId = m.moi.civ.id, mId = m.m.civ.id;
  m.sb.setTens(mId, moiId, 8);
  m.sb.setTens(moiId, mId, 6);
  m.sb.applyCalmTension(mId, 'strategy', 3);
  const leur = m.sb.getTens(mId, moiId), mienne = m.sb.getTens(moiId, mId);
  note('leur tension : 8 → ' + leur + ' · la mienne : 6 → ' + mienne);
  if (mienne === 3 && leur === 8) ok('st9 baisse bien la mienne et laisse la leur intacte');
  else ko('st9 a changé de sens (mienne=' + mienne + ', leur=' + leur + ')');
}

/* ── 4. Une IA joue Diplomatie : elle apaise qui lui en veut le plus ───────── */
console.log('\n4. Une IA apaise la nation la plus tendue envers elle');
{
  const m = montage();
  const mId = m.m.civ.id, jId = m.j.civ.id, moiId = m.moi.civ.id;
  /* Les Jupitériens détestent les Martiens ; moi beaucoup moins. L'IA martienne doit choisir
     les Jupitériens — et surtout PAS moi, ce que l'ancien `aiEnnemi()` aurait fait. */
  m.sb.setTens(jId, mId, 9);
  m.sb.setTens(moiId, mId, 2);
  /* ⚠️ ON PASSE PAR LA PORTE DE L'IA, PAS PAR CELLE DU JOUEUR. `_applyStratTo` rend `true` et sort
     aussitôt dès qu'une carte demande de choisir une nation : c'est la sous-décision du joueur.
     L'ordinateur, lui, applique sa carte dans `aiApplyStrat`, qui la lit dans `ai._draftedStrat`.
     Mon premier jet appelait `_applyStratTo` et mesurait donc un chemin qui, par construction, ne
     fait rien — troisième fois cette semaine qu'un banc interroge la mauvaise entrée. */
  m.m._draftedStrat = carte(m.sb, 'st5');
  m.m.res.energy = 20; m.m.res.materials = 20; m.m.res.science = 20; m.m.res.morale = 8;
  m.sb.doAITurn(m.m, {});
  const dj = m.sb.getTens(jId, mId), dmoi = m.sb.getTens(moiId, mId);
  note('Jupitériens → Martiens : 9 → ' + dj + ' · Terriens → Martiens : 2 → ' + dmoi);
  if (dj === 6) ok('elle a apaisé la nation qui lui en voulait le plus');
  else ko('la tension jupitérienne est à ' + dj + ' au lieu de 6');
  if (dmoi === 2) ok('elle n\'a pas touché aux autres');
  else ko('elle a aussi modifié la tension terrienne (' + dmoi + ')');
}

/* ── 5. CONTRE-ÉPREUVE — sans rancune nulle part, elle ne fabrique rien ───── */
console.log('\n5. CONTRE-ÉPREUVE — aucune tension à apaiser : elle ne crée pas de valeur négative');
{
  /* Sans ce point, une soustraction non bornée pourrait descendre sous zéro et fausser tous les
     seuils de guerre populaire, qui comparent à 10. */
  const m = montage();
  const mId = m.m.civ.id, jId = m.j.civ.id, moiId = m.moi.civ.id;
  m.sb.setTens(jId, mId, 0); m.sb.setTens(moiId, mId, 0);
  m.m._draftedStrat = carte(m.sb, 'st5');
  m.m.res.energy = 20; m.m.res.materials = 20; m.m.res.science = 20; m.m.res.morale = 8;
  m.sb.doAITurn(m.m, {});
  const a = m.sb.getTens(jId, mId), b = m.sb.getTens(moiId, mId);
  note('tensions après : jupitérienne ' + a + ' · terrienne ' + b);
  if (a >= 0 && b >= 0) ok('aucune tension négative');
  else ko('tension négative produite (' + a + ', ' + b + ')');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Diplomatie nomme une nation, annonce son montant, et baisse la tension de CETTE');
console.log('   nation envers toi — « Calmer les tensions » gardant le sens inverse.');
console.log('═'.repeat(84));
