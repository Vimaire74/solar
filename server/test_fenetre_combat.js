/* ============================================================================
   TEST — LA FENÊTRE DE COMBAT NE PROPOSE PLUS UN ENGAGEMENT IMPAYABLE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie 7CFF, tour 10, assaut sur Ganymède : « j'ai attaqué à 7 + supercroiseur à
   5, ça me faisait 12 et après tout à coup je suis à 9 contre 9 et je perds… Bizarre. »

   Reconstitution depuis son journal : il avait 9🪨 et 9⚡. Le Supercroiseur en réserve 5 et 5. Il ne
   pouvait donc payer que 4 jetons (1🪨 +1⚡ chacun). La fenêtre a laissé le curseur sur 7 et annoncé
   « Ta puissance : 12 ». `resolveWarCombat` a rogné à 4 au moment de résoudre — 4 + 5 = 9 — et le
   Martien alignait 3 jetons + 5 (croiseur) + 1 (garnison) = 9. Égalité.

   LA CAUSE. Le plafond du curseur n'était calculé QU'À L'OUVERTURE de la fenêtre, croiseur non
   déployé. `toggleCruiser` ne recalculait que l'AFFICHAGE (puissance, coût), jamais le maximum.
   Déployer le croiseur ne rabaissait donc rien, et le seul avertissement était une ligne de coût qui
   passait au rouge au milieu de six lignes de texte gris.

   CE QUE MARC A DEMANDÉ (03/09), et ce que ce banc verrouille :
     · le curseur monte jusqu'à ce qu'on POSSÈDE, et vire au ROUGE quand c'est trop cher ;
     · en le redescendant on revient au jaune ;
     · « tu peux pas valider en rouge, ça doit bloquer » ;
     · trois lignes d'information au lieu de six (les décomptes entre parenthèses supprimés).

   ⚠️ CE QUE CE BANC PEUT ET NE PEUT PAS FAIRE. Le bac à sable a un DOM simulé : on peut poser une
   valeur de curseur et appeler les fonctions, mais la COULEUR réelle à l'écran ne se vérifie pas
   ici. On mesure donc ce qui est vérifiable et qui compte : le plafond payable, le refus de valider
   au-delà, et le texte effectivement écrit dans la fenêtre.

   Usage : node test_fenetre_combat.js
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

/* Le montage reproduit la situation exacte de Marc au tour 10 de la partie 7CFF. */
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['martiens']);
  const G = sb.__G;
  G.turn = 10; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 9; moi.res.energy = 9; moi.res.science = 10; moi.res.morale = 10;
  moi.forceTokens = 9;
  moi.hasCruiser = true;
  ia.forceTokens = 4; ia.res.materials = 20; ia.res.energy = 12; ia.res.morale = 9;
  G.warWith = ia.civ.id;
  return { sb, G, moi, ia };
}

console.log('═'.repeat(84));
console.log('FENÊTRE DE COMBAT — LE CHIFFRE CHOISI EST LE CHIFFRE QUI SE BAT');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le plafond payable tient compte du Supercroiseur ───────────────────── */
console.log('1. Avec le croiseur déployé, le plafond payable tombe à 4 (chiffres de la partie 7CFF)');
{
  const m = montage();
  const sans = m.sb.maxAffordableTokens(m.moi, null);
  const avec = m.sb.maxAffordableTokens(m.moi, m.sb.reserveCroiseur(m.moi, true));
  note('9🪨 9⚡ · sans croiseur : ' + sans + ' jeton(s) · croiseur déployé : ' + avec);
  if (avec === 4) ok('4 jetons payables croiseur compris — exactement ce que le moteur a retenu');
  else ko('plafond avec croiseur = ' + avec + ' au lieu de 4');
  if (sans === 9) ok('et 9 sans le croiseur — c\'est bien lui qui coûte la différence');
  else ko('plafond sans croiseur = ' + sans + ' au lieu de 9');
}

/* ── 2. Valider au-delà du payable est REFUSÉ ──────────────────────────────── */
console.log('\n2. On ne peut pas valider un engagement qu\'on ne peut pas payer');
{
  /* ⚠️ LE POINT CENTRAL. Avant, le moteur acceptait puis rognait en silence : Marc partait au
     combat avec 7 et se battait avec 4. Maintenant la validation est refusée — le joueur reste
     devant sa fenêtre et corrige lui-même. */
  const m = montage();
  const el = m.sb.document.getElementById('wcm-slider');
  el.value = 7;                                   // ce que Marc avait choisi
  m.G._cruiserDeployTemp = true;                  // croiseur déployé
  m.G._cruiserDeployed = false;
  let suiteAppelee = false;
  try { vm.runInContext('_combatSuiteLire = function(){ return function(){ globalThis.__suite=true; }; };', m.sb); } catch (e) {}
  try { vm.runInContext('globalThis.__suite=false;', m.sb); } catch (e) {}
  m.sb.confirmWarCombat();
  try { suiteAppelee = vm.runInContext('globalThis.__suite===true', m.sb); } catch (e) {}
  note('engagement 7 avec croiseur (payable : 4) → combat lancé : ' + suiteAppelee);
  if (!suiteAppelee) ok('la validation est bloquée — plus de combat à un chiffre qu\'on n\'a pas choisi');
  else ko('le combat est parti quand même : le joueur se bat encore avec un autre nombre');
}

/* ── 3. CONTRE-ÉPREUVE — un engagement payable passe normalement ───────────── */
console.log('\n3. CONTRE-ÉPREUVE — à 4 jetons, la validation fonctionne');
{
  /* Sans ce point, on « corrigerait » en bloquant TOUS les combats : le §2 serait vert et le jeu
     n'aurait plus de guerre. */
  const m = montage();
  const el = m.sb.document.getElementById('wcm-slider');
  el.value = 4;
  m.G._cruiserDeployTemp = true;
  let suiteAppelee = false;
  try { vm.runInContext('_combatSuiteLire = function(){ return function(){ globalThis.__suite=true; }; };', m.sb); } catch (e) {}
  try { vm.runInContext('globalThis.__suite=false;', m.sb); } catch (e) {}
  m.sb.confirmWarCombat();
  try { suiteAppelee = vm.runInContext('globalThis.__suite===true', m.sb); } catch (e) {}
  note('engagement 4 avec croiseur → combat lancé : ' + suiteAppelee);
  if (suiteAppelee) ok('le combat part normalement quand on peut payer');
  else ko('même un engagement payable est refusé — le verrou est trop large');
}

/* ── 4. CONTRE-ÉPREUVE — sans croiseur, 7 jetons passent ───────────────────── */
console.log('\n4. CONTRE-ÉPREUVE — sans le croiseur, les 7 jetons de Marc étaient payables');
{
  /* C'est ce qui rend l'erreur si naturelle : 7 était un choix valide jusqu'à ce qu'il déploie le
     croiseur. Le verrou ne doit pas punir le joueur qui ne le déploie pas. */
  const m = montage();
  const el = m.sb.document.getElementById('wcm-slider');
  el.value = 7;
  m.G._cruiserDeployTemp = false;
  let suiteAppelee = false;
  try { vm.runInContext('_combatSuiteLire = function(){ return function(){ globalThis.__suite=true; }; };', m.sb); } catch (e) {}
  try { vm.runInContext('globalThis.__suite=false;', m.sb); } catch (e) {}
  m.sb.confirmWarCombat();
  try { suiteAppelee = vm.runInContext('globalThis.__suite===true', m.sb); } catch (e) {}
  note('engagement 7 sans croiseur (payable : 9) → combat lancé : ' + suiteAppelee);
  if (suiteAppelee) ok('7 jetons sans croiseur : accepté, comme il se doit');
  else ko('un engagement parfaitement payable est refusé');
}

/* ── 5. La fenêtre a bien maigri ───────────────────────────────────────────── */
console.log('\n5. Trois lignes d\'information, plus six');
{
  /* Marc : « y a trop de blabla dans cette fenêtre, ça saoûle, on a pas envie de tout lire, surtout
     dans un petit écran. » On vérifie que les trois retraits demandés sont faits ET que les deux
     chiffres qui restent y sont toujours — retirer l'information utile serait une autre faute. */
  const m = montage();
  m.moi.colonies.push({ nodeId: 'pluto', level: 1, connected: true });
  /* ⚠️ SANS ÉCRAN, LA FENÊTRE N'EST PAS DESSINÉE — ET MON PREMIER JET MESURAIT DONC LE VIDE.
     `_warShowAttackSlider` commence par `if(!_aUnEcran())return;` : dans le bac à sable le drapeau
     `SOLAR_SANS_ECRAN` est posé, la fonction sort aussitôt, et `innerHTML` reste à ''. Les trois
     motifs interdits étaient alors « absents » — un vert qui ne prouvait rien, exactement le piège
     du 03/09. On simule donc un écran le temps de ce point. */
  try { vm.runInContext('_aUnEcran = function(){ return true; };', m.sb); } catch (e) {}
  try { m.sb._warSelectColonyTarget((m.ia.colonies[0] || {}).nodeId); } catch (e) {}
  const html = String((m.sb.document.getElementById('wcm-info') || {}).innerHTML || '');
  note('longueur du texte affiché : ' + html.length + ' caractères');
  if (!html.length) { ko('la fenêtre n\'a rien écrit — ce point ne mesure rien'); }
  const retires = [
    ['le décompte « au total · réservé(s) en garnison »', /au total/],
    ['le détail « jeton(s) payable(s) + 1 garnison »', /payable\(s\) \+ 1 garnison/],
    ['la ligne « réservés pour la défense de tes colonies »', /réservés pour la défense/]
  ];
  let restants = 0;
  for (const [nom, re] of retires) {
    if (re.test(html)) { ko('encore présent : ' + nom); restants++; }
  }
  if (!restants) ok('les trois détails demandés ont bien disparu');
  if (/jetons engageables/i.test(html)) ok('« Tes jetons engageables » est toujours là');
  else ko('le nombre de jetons engageables a disparu — on a coupé trop large');
  /* Libellé changé le 24/09 : « Défense ennemie totale : n » est devenu « Défense possible : … »,
     qui détaille ce qui est public au lieu d'annoncer un total que le joueur n'a pas le droit de
     connaître (voir test_fenetre_assaut_brouillard.js). L'exigence est la même : la défense doit
     être annoncée. */
  if (/D[ée]fense possible|ennemie totale|Force ennemie/i.test(html)) ok('la défense adverse est toujours annoncée');
  else ko('la défense ennemie a disparu — on a coupé trop large');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le plafond tient compte du croiseur, on ne peut plus valider l\'impayable,');
console.log('   et la fenêtre tient en trois lignes.');
console.log('═'.repeat(84));
