/* ============================================================================
   TEST — PAS DE BONUS DE REVENU SUR UN MORAL QU'ON NE PEUT PAS GARDER
   ----------------------------------------------------------------------------
   POURQUOI. Partie B285 (26/09). Les Terriens ont adopté 👑 Tyrannie au tour 2, qui plafonne
   leur moral à 6. Leur revenu de moral valait 12/tour : ils n'en gardaient que 6, le reste
   était perdu à la source CHAQUE TOUR — et le rapport final leur comptait quand même
   « Moral : 12/tour → +5 VP », le maximum. Marc, qui n'avait aucun revenu de moral, avait 0
   sur ce poste.

   LA RÈGLE, posée par Marc (26/09) : « pas de bonus de moral pour une nation dont le maximum
   est 6 ou 7 ». Adopter une forme de gouvernement qui bride le moral fait donc renoncer à ce
   poste de points — on ne paie pas pour ce qu'on ne peut pas thésauriser.

   ⚠️ CE QUE LE CALCUL LISAIT. `revenusBruts(p).morale`, c'est-à-dire le revenu AVANT
   plafonnement. Or `doRevenues` plafonne le moral À LA SOURCE (règle du 04/09) : le nombre lu
   pour les VP n'était donc pas celui qui était crédité. Les trois autres ressources ne
   connaissent pas ce décalage — leur plafond s'applique à la frontière de tour, et le revenu
   entre en entier.

   CE QUE CE BANC VERROUILLE :
     · plafond de moral à 6 → aucun bonus de moral, quel que soit le revenu ;
     · plafond à 7 → aucun bonus non plus (la borne est « 6 ou 7 ») ;
     · le rapport DIT pourquoi : une ligne sans explication passe pour un oubli ;
     · CONTRE-ÉPREUVE : plafond normal (10) → le bonus revient, inchangé ;
     · CONTRE-ÉPREUVE : plafond à 8 → le bonus revient (la borne est bien à 7) ;
     · CONTRE-ÉPREUVE : les trois autres ressources ne bougent pas d'un point ;
     · CONTRE-ÉPREUVE : le banc sait lire le poste (il détecte une valeur différente).

   Usage : node test_vp_moral_plafonne.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Un revenu brut FIXÉ, pour que ce banc mesure la règle de score et rien d'autre : d'où vient le
   revenu est l'affaire de `revenusBruts`, déjà couverte par `mesure_revenus` et `test_entretien`. */
const REVENU = { energy: 16, materials: 17, science: 14, morale: 12 };

function montage(plafondMoral) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 10;
  const p = G.player;
  if (plafondMoral !== null) p.govFormMoraleCap = plafondMoral;   // 0/absent = plafond normal de 10
  vm.runInContext('revenusBruts = function(){ return ' + JSON.stringify(REVENU) + '; };', sb);
  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  return { sb, G, p };
}

/* Le poste « Revenus par tour » tel que le rapport le calcule, et ses lignes de détail. */
function poste(m) {
  let v = null;
  try { v = m.sb.calcVP(m.p); } catch (e) { note('(calcVP s\'interrompt : ' + e.message + ')'); }
  const det = (v && v.det && v.det.rpt) || [];
  return { vp: v ? v.rptVP : null, lignes: det.map(x => String(m.sb._i18nTexte ? m.sb._i18nTexte(x) : x)) };
}
const parleDuMoral = lignes => lignes.some(l => /moral/i.test(l));

console.log('═'.repeat(84));
console.log('VP — LE MORAL QU\'ON NE PEUT PAS GARDER NE RAPPORTE RIEN');
console.log('═'.repeat(84) + '\n');

console.log('0. Le montage : un revenu brut de ' + REVENU.morale + ' de moral par tour');
{
  const m = montage(null);
  const r = poste(m);
  note('plafond normal · poste = ' + r.vp);
  if (r.vp === null) ko('calcVP n\'a rien rendu — rien n\'est mesuré');
  else if (r.vp === 20) ok('20 VP : les quatre ressources au maximum (référence d\'avant la règle)');
  else ko('le montage ne donne pas 20 VP mais ' + r.vp + ' — les points suivants seraient faussés');
}

console.log('\n1. Plafond de moral à 6 (Tyrannie) : aucun bonus de moral');
{
  const m = montage(6);
  const r = poste(m);
  note('poste = ' + r.vp + ' · lignes : ' + r.lignes.join(' | '));
  if (r.vp === 15) ok('15 VP : les trois autres ressources seules');
  else ko('poste = ' + r.vp + ' au lieu de 15 — le moral compte encore');
  if (parleDuMoral(r.lignes)) {
    if (/plafond|bride|bridé|thésauris/i.test(r.lignes.filter(l => /moral/i.test(l)).join(' ')))
      ok('et le rapport dit pourquoi');
    else ko('le rapport parle du moral sans expliquer — on croira à un oubli');
  } else ko('le rapport ne mentionne plus le moral du tout : le joueur ne saura pas ce qu\'il perd');
}

console.log('\n2. Plafond à 7 : exclu aussi — la borne est « 6 ou 7 »');
{
  const r = poste(montage(7));
  note('poste = ' + r.vp);
  if (r.vp === 15) ok('exclu');
  else ko('poste = ' + r.vp + ' au lieu de 15');
}

console.log('\n3. CONTRE-ÉPREUVE — plafond à 8 : le bonus revient');
{
  /* Sans ce point, on aurait pu exclure le moral pour tout le monde. La borne doit être là où
     Marc l'a posée, pas plus haut. */
  const r = poste(montage(8));
  note('poste = ' + r.vp);
  if (r.vp === 20) ok('inclus dès 8 : la borne est bien à 7');
  else ko('poste = ' + r.vp + ' au lieu de 20 — la borne est trop haute');
}

console.log('\n4. CONTRE-ÉPREUVE — plafond normal : rien n\'a changé pour personne d\'autre');
{
  const r = poste(montage(null));
  note('poste = ' + r.vp + ' · lignes : ' + r.lignes.length);
  if (r.vp === 20) ok('20 VP, comme avant la règle');
  else ko('poste = ' + r.vp + ' — la règle touche des nations qu\'elle ne devait pas toucher');
}

console.log('\n5. CONTRE-ÉPREUVE — les trois autres ressources ne bougent pas');
{
  const m = montage(6);
  const r = poste(m);
  const autres = r.lignes.filter(l => !/moral/i.test(l));
  note('lignes hors moral : ' + autres.length);
  if (autres.length === 3) ok('Énergie, Matériaux et Savoir sont toujours comptés');
  else ko(autres.length + ' ligne(s) au lieu de 3 — la règle a débordé sur les autres ressources');
}

console.log('\n6. CONTRE-ÉPREUVE — le banc sait voir une valeur différente');
{
  const a = poste(montage(6)).vp, b = poste(montage(null)).vp;
  if (a !== null && b !== null && a !== b) ok('le poste change bien selon le plafond (' + a + ' vs ' + b + ')');
  else ko('le banc lit la même valeur dans les deux cas — les points ci-dessus ne prouvent rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une nation qui bride son moral ne touche plus de points pour un revenu qu\'elle jette.');
console.log('═'.repeat(84));
