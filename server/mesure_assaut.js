/* ============================================================================
   MESURE — L'IA VOIT-ELLE QUELLE COLONIE ELLE ATTAQUE ?
   ----------------------------------------------------------------------------
   Partie 083E de Marc, dans le rapport de décisions, six fois de suite :
       assaillir Phobos (49.7)   dauphin : assaillir Titan (49.7, écart 0)
       assaillir Éris  (-20.8)   dauphin : assaillir Déimos (-20.8, écart 0)
   Zéro d'écart entre une CAPITALE (10 jetons de garnison, imprenable) et une colonie ordinaire
   (1 jeton). Hypothèse : la simulation ne distingue pas les cibles.

   Ce fichier NE CORRIGE RIEN. Il met une nation devant deux assauts très inégaux et imprime la note
   de chacun. Si les notes sont égales, l'hypothèse est confirmée et le banc de correction a sa
   cible ; si elles diffèrent, c'est la lecture du rapport qu'il faut refaire.

   Usage : node mesure_assaut.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['martiens']);          // exactement la paire de 083E
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const ia = G.player, cible = G.ais[0];
  ia._isAI = true; cible._isAI = true;
  ia.acLeft = 3; ia.forceTokens = 6; ia.res.materials = 12; ia.res.energy = 12; ia.res.science = 8;
  /* La cible : sa CAPITALE (garnison 10) et une colonie ordinaire de niveau 2 (garnison 1),
     toutes deux à portée. Un joueur humain n'hésiterait pas une seconde. */
  cible.forceTokens = 2; cible.res.materials = 2; cible.res.energy = 2;
  if (!cible.colonies.some(c => c.nodeId === 'titan')) cible.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  ia.colonies.push({ nodeId: 'ganymede', level: 2, connected: true });   // voisinage → les deux à portée
  sb.setDecisionSink(function () {});
  return { sb, G, ia, cible };
}

const m = montage();
const coups = m.sb.coupsPossibles(m.ia).filter(c => c.type === 'assaut');
console.log('═'.repeat(84));
console.log('QUELLE NOTE POUR QUEL ASSAUT ?');
console.log('═'.repeat(84));
console.log('Assaillant : ' + m.ia.civ.name + ' — ' + m.ia.forceTokens + ' jetons, '
  + m.ia.res.materials + '🪨 ' + m.ia.res.energy + '⚡');
console.log('Cible      : ' + m.cible.civ.name + ' — ' + m.cible.forceTokens + ' jetons, '
  + m.cible.res.materials + '🪨 ' + m.cible.res.energy + '⚡');
console.log('Capitale adverse : ' + m.cible.civ.home + ' (garnison ' + m.sb.garrisonOf(m.cible, m.cible.civ.home) + ')');
console.log('');
console.log('assauts proposés : ' + coups.length);
const notes = [];
for (const c of coups) {
  const r = m.sb.simulerCoup(m.ia, function () { return m.sb.appliquerCoup(m.ia, c); });
  /* La note du TACTICIEN = simulation + les termes qu'il ajoute sur le coup (voir `valeurAssaut`). */
  const prime = (typeof m.sb.valeurAssaut === 'function') ? m.sb.valeurAssaut(c, m.ia) : 0;
  if (r.ok) r.valeur += prime;
  const a = (typeof m.sb.evaluerAssaut === 'function') ? m.sb.evaluerAssaut(m.ia, c.node) : null;
  if (a) console.log('    · assessment ' + c.node + ' : frappe ' + a.frappe + ' vs défense ' + a.defense
    + ' → marge ' + a.marge + ' · valeur de la prise ' + (Math.round(a.prise * 10) / 10)
    + ' · prime ' + (Math.round(prime * 10) / 10));
  const gar = m.sb.garrisonOf(m.cible, c.node);
  notes.push({ node: c.node, gar, ok: r.ok, valeur: r.ok ? Math.round(r.valeur * 10) / 10 : null, question: r.question });
  console.log('  ' + String(c.node).padEnd(12) + ' garnison ' + String(gar).padStart(2)
    + ' → ' + (r.ok ? ('note ' + (Math.round(r.valeur * 10) / 10)) : ('NON ÉVALUABLE' + (r.question ? ' (question restée ouverte)' : ''))));
}
const valides = notes.filter(n => n.ok).map(n => n.valeur);
const distinctes = new Set(valides).size;
console.log('');
console.log('notes distinctes : ' + distinctes + ' pour ' + valides.length + ' assauts évalués');
if (valides.length >= 2 && distinctes === 1) {
  console.log('→ CONFIRMÉ : la capitale et une colonie ordinaire reçoivent la MÊME note.');
  console.log('  L\'IA ne choisit donc pas sa cible, elle prend la première de la liste.');
} else if (valides.length >= 2) {
  console.log('→ Les notes diffèrent : la simulation distingue déjà les cibles.');
} else {
  console.log('→ Trop peu d\'assauts évaluables pour conclure.');
}
console.log('═'.repeat(84));
