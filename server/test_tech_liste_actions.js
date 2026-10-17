/* TEST — ÉCO & SOCIÉTÉ ET MILITAIRE EN LISTE D'ACTIONS (Marc, 22/09, maquette validée)
   « La présentation des actions sociales, éco et militaires est par raccroc, donc c'est pas beau. »
   Ces cartes empruntaient la mise en page des technologies : en mode compact, deux colonnes de
   tuiles aux noms coupés sur téléphone, de grands rectangles vides sur ordinateur.
   RÈGLES : en mode COMPACT, une ligne par action, rangée par famille (répétables · une fois par
   partie · gouvernement ; renforts · une fois par partie côté militaire), avec le nom ENTIER, le
   coût et l'effet — ou le prérequis en clair. En mode DÉTAILLÉ, les cartes illustrées d'origine.
   Usage : node test_tech_liste_actions.js */
'use strict';
const fs = require('fs'); const path = require('path');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('terriens', ['martiens']); sb.__G.phase = 'actions';
const vm = require('vm');
function rendu(compact) {
  /* Le mode compact est un choix rangé dans le navigateur ; sans `localStorage` dans le bac à sable,
     on remplace la question posée par le rendu. */
  vm.runInContext('techCompactChoisi=function(){return ' + (compact ? 'true' : 'false') + ';}', sb);
  sb.renderTechTree();
  return String((sb.document.getElementById('tech-body') || {}).innerHTML || '');
}
const cpt = (s, re) => (s.match(re) || []).length;

console.log('1. Mode compact : des lignes d\'action, plus des tuiles');
const C = rendu(true);
(/class="act-fam-titre"/.test(C) ? ok : ko)('les familles sont titrées');
(cpt(C, /class="act-l/g) >= 16 ? ok : ko)(cpt(C, /class="act-l/g) + ' lignes d\'action (marché civique + militaire)');
(!/gcard gc-compact/.test(C) ? ok : ko)('plus une seule tuile « gcard gc-compact »');
(/act-fam-titre">Répétables/.test(C) && /act-fam-titre">Gouvernement/.test(C) ? ok : ko)('familles nommées : répétables, gouvernement');
(/act-fam-titre">Renforts/.test(C) ? ok : ko)('famille militaire : renforts');

console.log('2. Chaque action est nommée en entier, avec son coût');
const noms = vm.runInContext('CIVIC_MARKET.map(c=>c.name)', sb);
const manquants = noms.filter(n => C.indexOf('>' + n) < 0 && C.indexOf(n) < 0);
(manquants.length === 0 ? ok : ko)(manquants.length ? 'noms absents : ' + manquants.join(', ') : noms.length + ' actions civiques, toutes nommées en entier');
(/class="al-ac">1 AC<\/span>/.test(C) || /class="al-ac">1 AP<\/span>/.test(C) ? ok : ko)('le coût en actions est écrit sur la ligne');

console.log('3. Une carte militaire bloquée dit son prérequis');
const drones = C.slice(Math.max(0, C.indexOf('showGeneralDetail(\'mil1\')') - 400), C.indexOf('showGeneralDetail(\'mil1\')') + 500);
(/🔒/.test(drones) && /Drones Surveillance/.test(drones) ? ok : ko)('Drones de Combat : « 🔒 demande Drones Surveillance »');

console.log('4. CONTRE-ÉPREUVE — le mode détaillé garde ses cartes illustrées');
const D = rendu(false);
(!/class="act-l/.test(D) ? ok : ko)('aucune ligne d\'action en mode détaillé');
(/class="gcard/.test(D) && /gc-art/.test(D) ? ok : ko)('les cartes illustrées sont toujours là');
(/id="sec-civ"/.test(C) && /id="sec-mil"/.test(C) ? ok : ko)('les ancres du tutoriel (sec-civ, sec-mil) survivent au mode compact');

console.log('5. Les TECHNOLOGIES ont le même habillage (Marc, 22/09, 2e essai)');
(cpt(C, /class="act-l/g) >= 34 ? ok : ko)(cpt(C, /class="act-l/g) + ' lignes en tout — les filières aussi sont en lignes');
(!/class="tcard/.test(C) ? ok : ko)('plus une seule tuile « tcard » en compact');
(/showTechDetail\('bio1'\)/.test(C) && /act-fam-titre/.test(C) ? ok : ko)('chaque filière est un bloc titré, ses rangs dessous');

console.log('6. Le CSS de la liste');
const css = fs.readFileSync(path.join(__dirname, '..', 'play.html'), 'utf8');
(/\.act-l\{display:grid/.test(css) ? ok : ko)('.act-l : une grille emoji · nom · coût');
(/-webkit-line-clamp:2/.test(css) ? ok : ko)('l\'effet tient sur deux lignes au plus');
(/#tech-body\.tech-compact #riv-civ \.act-liste,#tech-body\.tech-compact #riv-mil \.act-liste\{display:grid;grid-template-columns:1fr 1fr/.test(css) ? ok : ko)('actions : une colonne sur téléphone, deux sur ordinateur');
(/\.act-l\{[^}]*min-height:44px/.test(css.replace(/\n/g,'')) ? ok : ko)('les lignes font au moins 44 px — la taille d\'une cible au doigt');
(/@media \(min-width:600px\)\{\s*#tech-body\.tech-compact #riv-tech\{display:grid;grid-template-columns:1fr 1fr/.test(css) ? ok : ko)('filières : une colonne sur téléphone, deux sur ordinateur');
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
