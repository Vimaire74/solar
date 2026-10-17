/* ============================================================================
   TEST — LA FENÊTRE D'ASSAUT ANNONCE LA VRAIE GARNISON D'UNE CAPITALE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 23/09, capture d'écran de l'assaut sur Io (capitale jupitérienne) :
   « défense 6 seulement pour les jupitériens alors que c'est sa capitale, il devrait être
   à 10 +0 car il avait pas de jetons ou +2 avec empathe ».

   LA CAUSE. `_warShowAttackSlider` compose la ligne « Défense ennemie totale » avec
   `usableDef + 1 + _freeDef` — la garnison y est écrite EN DUR à 1. Or `garrisonOf()` rend
   10 pour la capitale d'une nation qui la tient encore (règle de Marc du 05/09), et c'est
   bien 10 que le combat applique, puisque `resolveWarCombat` lit `garrisonOf`. L'écart ne
   porte donc pas sur le combat mais sur le chiffre affiché AVANT de décider : attaquer une
   capitale annonçait 9 de moins que la défense réelle.

   CE QUE CE BANC VERROUILLE :
     · viser la capitale d'une nation qui la tient → la fenêtre annonce au moins 10 ;
     · CONTRE-ÉPREUVE, viser une colonie ordinaire de la même nation → elle annonce 1,
       sinon on aurait « corrigé » en écrivant 10 partout ;
     · CONTRE-ÉPREUVE, le banc sait lire un chiffre faux (sans quoi un vert ne prouve rien).

   ⚠️ SANS ÉCRAN LA FENÊTRE N'EST PAS DESSINÉE. `_warShowAttackSlider` sort aussitôt sur
   `if(!_aUnEcran())return;` et `innerHTML` resterait vide : un banc qui mesure le vide est
   vert pour rien. On simule donc un écran, comme le fait `test_fenetre_combat.js` §5.

   Usage : node test_defense_capitale_affichee.js
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

/* Une nation adverse SANS rien : pas de jetons, pas de ressources pour en engager, pas de
   croiseur, aucun tempérament empathe. Tout ce qu'elle oppose est donc sa garnison — ce qui
   isole exactement le chiffre que l'on veut mesurer. */
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 20; moi.res.energy = 20; moi.res.science = 10; moi.res.morale = 10;
  moi.forceTokens = 12;
  ia.forceTokens = 0; ia.res.materials = 0; ia.res.energy = 0; ia.res.morale = 5;
  ia.hasCruiser = false;
  G.warWith = ia.civ.id;
  /* Un écran, sinon la fenêtre n'écrit rien. Et un renseignement de niveau 2, sinon la ligne
     affichée est « Force ennemie ~n jetons » (le brouillard) et non la défense chiffrée. */
  try { vm.runInContext('_aUnEcran = function(){ return true; };', sb); } catch (e) {}
  try { vm.runInContext('getIntelLevel = function(){ return 2; };', sb); } catch (e) {}
  return { sb, G, moi, ia };
}

/* Le chiffre tel qu'il est RÉELLEMENT écrit dans la fenêtre — pas tel qu'on le recalcule. */
function defenseAffichee(sb) {
  const html = String((sb.document.getElementById('wcm-info') || {}).innerHTML || '');
  if (!html.length) return { html, n: null };
  /* Le libellé a changé le 24/09 : la fenêtre n'annonce plus un total, mais le détail de ce qui
     est PUBLIC. Le premier nombre en gras est la garnison — c'est lui qu'on mesure ici. */
  const m = html.match(/D[ée]fense possible\s*:\s*<strong>\s*(\d+)\s*<\/strong>/i)
         || html.match(/ennemie totale\s*:\s*<strong>\s*(\d+)\s*<\/strong>/i);
  return { html, n: m ? Number(m[1]) : null };
}

console.log('═'.repeat(84));
console.log("FENÊTRE D'ASSAUT — LA DÉFENSE ANNONCÉE EST CELLE QUI SE BATTRA");
console.log('═'.repeat(84) + '\n');

console.log('1. Viser la capitale adverse : la garnison de capitale vaut 10');
{
  const m = montage();
  const home = m.ia.civ.home;
  note('capitale visée : ' + home + ' · garnison rendue par garrisonOf : ' + m.sb.garrisonOf(m.ia, home));
  if (m.sb.garrisonOf(m.ia, home) !== 10) {
    ko('garrisonOf ne rend pas 10 pour la capitale — le montage ne mesure pas ce qu\'il croit');
  }
  try { m.sb._warSelectColonyTarget(home); } catch (e) { note('(le bac à sable interrompt le dessin après le texte : ' + e.message + ')'); }
  const { html, n } = defenseAffichee(m.sb);
  if (n === null) {
    ko('aucun chiffre de défense lisible dans la fenêtre (texte : ' + html.slice(0, 120) + ')');
  } else {
    note('défense annoncée : ' + n);
    if (n >= 10) ok('la fenêtre annonce ' + n + ' — la garnison de capitale est comptée');
    else ko('la fenêtre annonce ' + n + ' au lieu d\'au moins 10 — la garnison est comptée pour 1');
  }
}

console.log('\n2. CONTRE-ÉPREUVE — une colonie ordinaire ne vaut toujours que 1');
{
  /* Sans ce point, on « corrigerait » en écrivant 10 partout : le §1 serait vert et toutes
     les autres cibles mentiraient dans l\'autre sens. */
  const m = montage();
  const ordinaire = 'ceres';
  m.ia.colonies.push({ nodeId: ordinaire, level: 1, connected: true });
  note('colonie visée : ' + ordinaire + ' · garnison rendue par garrisonOf : ' + m.sb.garrisonOf(m.ia, ordinaire));
  try { m.sb._warSelectColonyTarget(ordinaire); } catch (e) { note('(le bac à sable interrompt le dessin après le texte : ' + e.message + ')'); }
  const { n } = defenseAffichee(m.sb);
  if (n === null) ko('aucun chiffre de défense lisible pour la colonie ordinaire');
  else if (n === 1) ok('la fenêtre annonce 1 — rien n\'a été gonflé au passage');
  else ko('la fenêtre annonce ' + n + ' au lieu de 1 pour une colonie ordinaire');
}

console.log('\n3. CONTRE-ÉPREUVE — le banc sait voir un chiffre faux');
{
  /* On écrit nous-mêmes un chiffre absurde dans la fenêtre et on vérifie que la lecture le
     rapporte tel quel. Sans ce point, un §1 vert pourrait venir d\'une regex qui ne lit rien. */
  const m = montage();
  try { m.sb._warSelectColonyTarget(m.ia.civ.home); } catch (e) {}
  const el = m.sb.document.getElementById('wcm-info');
  if (!el) { ko('pas de wcm-info dans le bac à sable'); }
  else {
    el.innerHTML = 'Défense possible : <strong>77</strong> garnison';
    const { n } = defenseAffichee(m.sb);
    if (n === 77) ok('la lecture rapporte bien 77 — elle mesure vraiment le texte affiché');
    else ko('la lecture rapporte ' + n + ' au lieu de 77 — elle ne mesure pas ce qu\'on croit');
  }
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La défense annoncée avant l\'assaut est celle que le combat appliquera.');
console.log('═'.repeat(84));
