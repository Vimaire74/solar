/* ============================================================================
   TEST — LE DÉFENSEUR VOIT L'ARMADA ARRIVER
   ----------------------------------------------------------------------------
   POURQUOI. La règle telle que Marc la pose (23/09) : « Quand on attaque une colonie, ce
   n'est pas une totale surprise. Avec les télescopes, senseurs etc. on voit arriver une
   armada de loin, donc le défenseur a une connaissance exacte du niveau d'attaque quand il
   doit défendre. À l'inverse attaquer une colonie ou une capitale est hasardeux. »
   (Un raid, lui, reste souple : un ou deux pillards ne se voient pas venir.)

   L'ÉTAT AVANT. La fenêtre de défense annonçait la cible, tes jetons disponibles, et un
   conseil — jamais la force de l'attaque. `G._aiWarCommitted` était pourtant déjà fixé deux
   lignes plus haut : le chiffre existait, on ne le montrait simplement pas. Le joueur
   choisissait donc ses jetons à l'aveugle, exactement à l'envers de la règle.

   CE QUE CE BANC VERROUILLE :
     · la fenêtre annonce le nombre EXACT de jetons engagés par l'attaquant ;
     · ce nombre suit la réalité : deux attaques différentes donnent deux textes différents ;
     · CONTRE-ÉPREUVE : le banc sait voir un texte vide, sinon il ne prouverait rien.

   Usage : node test_fenetre_defense_armada.js
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

function montage(jetonsAttaquant) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 20; moi.res.energy = 20; moi.forceTokens = 10;
  moi.colonies.push({ nodeId: 'ceres', level: 1, connected: true });
  ia.forceTokens = jetonsAttaquant;
  G.warWith = ia.civ.id;
  G._aiWarTarget = { type: 'colony', nodeId: 'ceres', name: 'Cérès' };
  vm.runInContext(`_aUnEcran = function(){ return true; };`, sb);
  return { sb, G, moi, ia };
}

function ouvrir(sb) {
  try { sb.warDefendTarget(); } catch (e) { note('(le dessin s\'interrompt après le texte : ' + e.message + ')'); }
  const el = sb.document.getElementById('wcm-info');
  return String((el && el.innerHTML) || '').replace(/<[^>]+>/g, '');
}

console.log('═'.repeat(84));
console.log("FENÊTRE DE DÉFENSE — ON VOIT L'ARMADA ARRIVER");
console.log('═'.repeat(84) + '\n');

console.log("1. Le nombre exact de jetons de l'attaquant est annoncé");
const a = montage(8);
{
  const txt = ouvrir(a.sb);
  const engages = a.G._aiWarCommitted;
  note('jetons réellement engagés par l\'attaquant : ' + engages);
  note('texte : ' + txt.trim().replace(/\s+/g, ' '));
  if (!txt.length) ko("la fenêtre n'a rien écrit — ce point ne mesure rien");
  else if (engages === undefined || engages === null) ko('aucun engagement fixé — le montage ne mesure rien');
  else if (new RegExp('\\b' + engages + '\\b').test(txt)) ok('les ' + engages + ' jetons de l\'attaquant sont annoncés');
  else ko('les ' + engages + ' jetons de l\'attaquant n\'apparaissent pas — le joueur défend à l\'aveugle');
}

console.log('\n2. Le chiffre suit la réalité, il n\'est pas décoratif');
{
  /* Deux attaques de tailles très différentes doivent produire deux textes différents.
     Sans ce point, écrire un nombre fixe suffirait à faire passer le §1. */
  const petite = montage(2);
  const grosse = montage(20);
  const tp = ouvrir(petite.sb), tg = ouvrir(grosse.sb);
  note('petite attaque (' + petite.G._aiWarCommitted + ' jetons) · grosse attaque (' + grosse.G._aiWarCommitted + ' jetons)');
  if (petite.G._aiWarCommitted === grosse.G._aiWarCommitted) note('(les deux engagements sont égaux par hasard — point non concluant)');
  else if (tp !== tg) ok('les deux fenêtres affichent des textes différents');
  else ko('le texte est identique alors que les deux attaques diffèrent — le chiffre est décoratif');
}

console.log('\n3. CONTRE-ÉPREUVE — le banc sait voir un texte vide');
{
  const m = montage(5);
  const el = m.sb.document.getElementById('wcm-info');
  if (el) el.innerHTML = '';
  const vide = String((el && el.innerHTML) || '').replace(/<[^>]+>/g, '');
  if (!vide.length) ok('un texte vide est bien détecté comme vide');
  else ko('la lecture rend quelque chose sur une fenêtre vide');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log("✅ Le défenseur sait ce qui lui arrive dessus avant de choisir ses jetons.");
console.log('═'.repeat(84));
