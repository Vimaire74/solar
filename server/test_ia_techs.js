/* ============================================================================
   TEST — IA DÉFENSIVE VAUT QUELQUE CHOSE, EXTRA-SOLAIRE ATTEND LA FIN
   ----------------------------------------------------------------------------
   Marc, 13/09 : « les IA ne cherchent jamais à prendre IA Défensive alors que moi je le
   fais tout le temps. Et elles s'évertuent à prendre Exploration Extra-Solaire, qui est
   moyennement utile — elles font une fixation dessus. »

   CE QUI EST VÉRIFIÉ :
     1. l'évaluation d'une nation qui possède IA Défensive compte son immunité (raids,
        pirates), en plus des VP de la carte — mesuré en coupant le poids `immunite` ;
     2. CONTRE-ÉPREUVE : sans personne pour piller (aucun rival avec un jeton), l'immunité
        ne vaut rien ;
     3. Exploration Extra-Solaire n'est PAS proposée avant le tour 8, même payable ;
        elle l'est au tour 8 ; et pas au tour 8 si l'achat laisse moins de 3 jetons payables ;
     4. CONTRE-ÉPREUVE : une autre technologie de rang 3 (IA Défensive) est proposée au
        tour 5 — on n'a pas bloqué tout le rang 3.

   Usage : node test_ia_techs.js
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

function montage(tour) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = tour; G.phase = 'actions';
  const nat = G.ais.find(a => a.civ.id === 'martiens');
  nat._isAI = true; nat._profil = 'batisseur';
  nat.acLeft = 3; nat.res.materials = 12; nat.res.energy = 12; nat.res.science = 12; nat.forceTokens = 4;
  const carte = id => vm.runInContext('CARDS_POOL.find(c=>c.id==="' + id + '")', sb);
  return { sb, G, nat, carte };
}

console.log('═'.repeat(80));
console.log('TECHNOLOGIES — CE QUE L\'ORDINATEUR EN VOIT');
console.log('═'.repeat(80) + '\n');

console.log('1. IA Défensive : l\'immunité compte dans l\'évaluation');
{
  const m = montage(5);
  m.nat.cards.push(m.carte('iadef3'));
  const avec = m.sb.evaluerPosition(m.nat);
  vm.runInContext('POIDS_EVAL.immunite=0', m.sb);
  const sans = m.sb.evaluerPosition(m.nat);
  note('poids immunité actif ' + avec.toFixed(2) + ' · coupé ' + sans.toFixed(2) + ' · écart ' + (avec - sans).toFixed(2));
  if (avec - sans > 1) ok('l\'immunité vaut ' + (avec - sans).toFixed(1) + ' au tour 5 (6 tours restants)');
  else ko('l\'immunité aux raids et aux pirates ne pèse rien dans l\'évaluation');
}

console.log('\n2. CONTRE-ÉPREUVE — personne à craindre, immunité sans valeur');
{
  const m = montage(5);
  m.nat.cards.push(m.carte('iadef3'));
  for (const o of m.G.ais.concat([m.G.player])) if (o !== m.nat) o.forceTokens = 0;
  const avec = m.sb.evaluerPosition(m.nat);
  vm.runInContext('POIDS_EVAL.immunite=0', m.sb);
  const sans = m.sb.evaluerPosition(m.nat);
  note('écart ' + (avec - sans).toFixed(2));
  if (Math.abs(avec - sans) < 0.01) ok('aucun rival armé : l\'immunité ne rapporte rien'); else ko('l\'immunité est comptée sans pilleur');
}

console.log('\n3. Exploration Extra-Solaire attend le tour 8');
{
  const propose = (tour, energie) => {
    const m = montage(tour);
    if (energie !== undefined) m.nat.res.energy = energie;
    /* Rang 3 = un rang 2 de la même branche possédé, et la branche ouverte jusqu'au rang 2. */
    for (const id of ['quant1', 'robo2']) { const c = m.carte(id); if (c) m.nat.cards.push(c); }
    m.G.branchTiers = m.G.branchTiers || {}; m.G.branchTiers.sciences_exp = 2;
    const coups = m.sb.coupsPossibles(m.nat);
    const c = coups.find(x => x.type === 'tech' && x.card === 'extra3');
    return { oui: !!c, techs: coups.filter(x => x.type === 'tech').length };
  };
  const t5 = propose(5), t8 = propose(8), t8pauvre = propose(8, 5);
  note('tour 5 : ' + (t5.oui ? 'proposée' : 'absente') + ' (' + t5.techs + ' techs proposées) · tour 8 : ' + (t8.oui ? 'proposée' : 'absente')
    + ' · tour 8 avec 5⚡ : ' + (t8pauvre.oui ? 'proposée' : 'absente'));
  if (!t5.oui) ok('pas avant le tour 8'); else ko('proposée au tour 5 : la fixation continue');
  if (t8.oui) ok('proposée au tour 8, économie faite'); else ko('absente au tour 8 alors qu\'elle est payable et ouverte');
  if (!t8pauvre.oui) ok('pas au prix de la falaise : 5⚡ − 3 = 2 payables, refusée'); else ko('achetée au prix de l\'énergie (#81)');
}

console.log('\n4. CONTRE-ÉPREUVE — IA Défensive (rang 3) reste proposée au tour 5');
{
  const m = montage(5);
  for (const id of ['drones1', 'reseau2']) { const c = m.carte(id); if (c) m.nat.cards.push(c); }
  m.G.branchTiers = m.G.branchTiers || {}; m.G.branchTiers.ia_renseignement = 2;
  const coups = m.sb.coupsPossibles(m.nat);
  const c = coups.find(x => x.type === 'tech' && x.card === 'iadef3');
  if (c) ok('IA Défensive proposée au tour 5'); else ko('IA Défensive n\'est plus proposée au tour 5 : on a bloqué plus que l\'Extra-Solaire');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ L\'ordinateur voit l\'immunité, et garde l\'Extra-Solaire pour la fin.');
