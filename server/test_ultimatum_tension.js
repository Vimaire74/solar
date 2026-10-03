/* ============================================================================
   TEST — ULTIMATUM D'UN TOUR AVANT LA GUERRE POPULAIRE (Marc, 02/10)
   ----------------------------------------------------------------------------
   Partie Ceinturiens (02/10) : espionnage subi +6 au T3, blocage de chemin +4 au T4, et la guerre
   populaire tombait DANS LA MÊME FIN DE TOUR que le +4 — « j'aimerais avoir le temps de jouer une
   action qui fait baisser la tension ». Règle de Marc : « ultimatum d'un tour, on peut se préparer,
   valable pour les IA aussi ».

   CE QUE CE BANC VERROUILLE :
     §1 à 10/10 en fin de tour, PAS de guerre : un ultimatum est posé, le journal donne les griefs ;
     §2 fin du tour suivant, tension toujours à 10 : la guerre populaire se déclare ;
     §3 tension ramenée sous 10 pendant l'ultimatum : pas de guerre, ultimatum levé ;
     §4 pendant l'ultimatum, la baisse passive « aucun grief −1 » ne joue pas (sinon il se lèverait seul) ;
     §5 IA contre IA : même règle (ultimatum, puis guerre au tour suivant) ;
     §6 IA offensée par le joueur : même règle ;
     §7 les griefs portent leur cause (espionnage, raid) dans le récapitulatif.
   CONTRE-ÉPREUVE : sur le moteur d'avant, §1 est rouge (guerre immédiate).

   Usage : node test_ultimatum_tension.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const eng = new Engine(HTML);
  const sb = eng.sb;
  sb.initGame('ceinturiens', ['martiens', 'terriens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  const hum = G.player, mar = G.ais[0], ter = G.ais[1];
  hum._isAI = false; mar._isAI = true; ter._isAI = true;
  for (const p of [hum, mar, ter]) { p.res.morale = 8; p.res.materials = 10; p.res.energy = 10; p.forceTokens = 4; p.routes = []; }
  sb.setDecisionSink(function () {});
  /* Un grief RÉCURRENT (+1/tour) : sans grief ce tour-ci, la tension redescend d'elle-même de 1 avant
     d'être jugée — un 10 posé à la main ne vaudrait donc rien. Routes de l'offenseur touchant une
     colonie de l'offensé : +1 par route et par tour. */
  const grief = (offense, offenseur) => { offenseur.routes.push({ from: offense.civ.home, to: 'vesta', tokens: 0 }); };
  return { eng, sb, G, hum, mar, ter, grief };
}
const enGuerre = (m, a, b) => !!m.sb._warBetween(a.civ.id, b.civ.id);
const journal = (m) => (m.G.log || []).map(l => (typeof l === 'string' ? l : (l.text || l.txt || l.msg || JSON.stringify(l)))).join('\n');
const ultimatum = (m, a, b) => (m.G.ultimatums || {})[a.civ.id + '|' + b.civ.id];
function finDeTour(m) { m.sb.updateTension(); }

console.log('═'.repeat(84));
console.log('ULTIMATUM — à 10/10 la guerre attend un tour');
console.log('═'.repeat(84) + '\n');

console.log('§1 joueur à 9 + grief de route (+1) = 10/10 en fin de tour → ultimatum, pas de guerre');
{
  const m = montage(); m.grief(m.hum, m.mar);
  m.sb.setTens(m.hum.civ.id, m.mar.civ.id, 9);
  finDeTour(m);
  if (!enGuerre(m, m.hum, m.mar)) ok('aucune guerre déclarée ce tour'); else ko('guerre déclarée immédiatement');
  if (ultimatum(m, m.hum, m.mar) === 4) ok('ultimatum posé au tour 4'); else ko('pas d\'ultimatum : ' + JSON.stringify(m.G.ultimatums));
  const j = journal(m);
  if (/ultimatum/i.test(j)) ok('le journal annonce l\'ultimatum'); else ko('journal muet sur l\'ultimatum');
  const w = (m.G.wars || []).find(x => x.populaireJoueur);
  if (!w) ok('aucune guerre populaire marquée pour le joueur'); else ko('guerre populaire marquée');
}

console.log('\n§2 tour suivant, toujours à 10 → la guerre populaire se déclare');
{
  const m = montage(); m.grief(m.hum, m.mar);
  m.sb.setTens(m.hum.civ.id, m.mar.civ.id, 9);
  finDeTour(m);
  m.G.turn = 5;
  finDeTour(m);
  if (enGuerre(m, m.hum, m.mar)) ok('guerre déclarée à la fin du tour 5'); else ko('toujours pas de guerre au tour 5');
  if (ultimatum(m, m.hum, m.mar) === undefined) ok('ultimatum consommé'); else ko('ultimatum encore présent');
}

console.log('\n§3 tension ramenée à 7 pendant l\'ultimatum → pas de guerre, ultimatum levé');
{
  const m = montage(); m.grief(m.hum, m.mar);
  m.sb.setTens(m.hum.civ.id, m.mar.civ.id, 9);
  finDeTour(m);
  m.G.turn = 5; m.sb.setTens(m.hum.civ.id, m.mar.civ.id, 6);   // Calmer la population −3, +1 de route → 7
  finDeTour(m);
  if (!enGuerre(m, m.hum, m.mar)) ok('pas de guerre'); else ko('guerre malgré la tension à 7');
  if (ultimatum(m, m.hum, m.mar) === undefined) ok('ultimatum levé'); else ko('ultimatum encore posé');
  m.G.turn = 6; finDeTour(m);
  if (!enGuerre(m, m.hum, m.mar)) ok('et rien au tour d\'après non plus'); else ko('guerre au tour 6');
}

console.log('\n§4 pendant l\'ultimatum, sans nouveau grief, pas de baisse passive −1');
{
  const m = montage();
  m.sb.setTens(m.hum.civ.id, m.mar.civ.id, 10);
  m.G.ultimatums = {}; m.G.ultimatums[m.hum.civ.id + '|' + m.mar.civ.id] = 4;   // ultimatum posé au tour 4
  m.G.turn = 5; finDeTour(m);
  const t = m.sb.getTens(m.hum.civ.id, m.mar.civ.id);
  if (t === 10) ok('tension restée à 10 (pas de −1 passif pendant l\'ultimatum)'); else ko('tension passée à ' + t + ' — l\'ultimatum se lèverait tout seul');
  if (enGuerre(m, m.hum, m.mar)) ok('sans action du joueur, la guerre vient au tour suivant'); else ko('pas de guerre au tour 5 (tension ' + m.sb.getTens(m.hum.civ.id, m.mar.civ.id) + ')');
}

console.log('\n§5 IA contre IA : même règle');
{
  const m = montage(); m.grief(m.mar, m.ter);
  m.sb.setTens(m.mar.civ.id, m.ter.civ.id, 9);
  finDeTour(m);
  if (!enGuerre(m, m.mar, m.ter)) ok('pas de guerre Martiens–Terriens ce tour'); else ko('guerre IA–IA immédiate');
  if (ultimatum(m, m.mar, m.ter) === 4) ok('ultimatum IA–IA posé'); else ko('pas d\'ultimatum IA–IA');
  m.G.turn = 5; finDeTour(m);
  if (enGuerre(m, m.mar, m.ter)) ok('guerre IA–IA au tour suivant'); else ko('pas de guerre IA–IA au tour 5');
}

console.log('\n§6 IA offensée par le joueur : même règle');
{
  const m = montage(); m.grief(m.mar, m.hum);
  m.sb.setTens(m.mar.civ.id, m.hum.civ.id, 9);
  finDeTour(m);
  if (!enGuerre(m, m.hum, m.mar)) ok('pas de guerre ce tour'); else ko('guerre immédiate');
  if (ultimatum(m, m.mar, m.hum) === 4) ok('ultimatum des Martiens envers le joueur'); else ko('pas d\'ultimatum');
  m.G.turn = 5; finDeTour(m);
  if (enGuerre(m, m.hum, m.mar)) ok('guerre au tour suivant'); else ko('pas de guerre au tour 5');
}

console.log('\n§7 les griefs portent leur cause');
{
  const m = montage(); m.grief(m.hum, m.mar);
  m.sb.addTens(m.hum.civ.id, m.mar.civ.id, 6, m.sb.J('grief.espionnage', 'espionnage subi'));
  m.sb.addTens(m.hum.civ.id, m.mar.civ.id, 3, m.sb.J('grief.blocage', 'blocage de chemin'));
  const txt = String(m.sb._griefsTexte(m.hum.civ.id, m.mar.civ.id) || '');
  note('récapitulatif : ' + txt);
  if (/espionnage/.test(txt) && /blocage/.test(txt) && /\+6/.test(txt) && /\+3/.test(txt)) ok('espionnage +6 et blocage +3 récapitulés'); else ko('récapitulatif incomplet');
  finDeTour(m);
  if (/espionnage/.test(journal(m))) ok('le journal de l\'ultimatum cite la cause'); else ko('journal sans la cause');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ Aucun écart'); process.exit(0);
