/* ============================================================================
   TEST — L'ÉTIQUETTE DE LA CEINTURE PRINCIPALE : DEUX LIGNES, DÉPART CALCULÉ
   ----------------------------------------------------------------------------
   POURQUOI. Marc, le 22/09 puis le 26/09 : « le texte ceinture d'astéroïde principale est
   toujours pas aligné à gauche de l'écran, et le texte je t'avais demandé de le mettre sur
   deux lignes ».

   CE QUI SE PASSAIT. Le nom suivait un `textPath` le long de l'arc de la ceinture, ce qui
   interdit une deuxième ligne — d'où l'abréviation « CEINTURE AST. PRINCIP. ». Et le départ
   n'était pas choisi : l'arc commençait à 88° (juste avant la verticale) avec un
   `startOffset` de 2 %, ce qui posait le premier caractère où l'arc voulait bien, soit
   x ≈ 83 sur un plateau de 1920.

   LA SOLUTION RETENUE (Marc, sur maquette : « la solution B mais à 24 pixels du bord »).
   Deux arcs concentriques, une ligne chacun, et un départ RÉSOLU au lieu d'être deviné :
   pour un rayon r, l'angle où l'arc croise l'abscisse voulue vaut acos((x − Soleil.x) / r).
   Chaque rayon a donc son propre angle de départ — c'est ce qui garde les deux lignes
   alignées à gauche — et `startOffset` revient à 0.

   CE QUE CE BANC VERROUILLE :
     · le nom est écrit EN ENTIER, sur deux lignes, et l'abréviation a disparu ;
     · les deux lignes commencent à x = 24, au même endroit, à un demi-pixel près ;
     · elles sont bien à deux hauteurs différentes (sinon elles se superposeraient) ;
     · la ceinture de Kuiper garde son arc unique — on ne touche qu'à ce qui était en cause ;
     · CONTRE-ÉPREUVE : le banc sait lire l'abscisse de départ d'un arc (il en mesure un faux) ;
     · CONTRE-ÉPREUVE : les étiquettes partent avec le bouton ⤳, comme les distances.

   Usage : node test_etiquette_ceinture.js
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

const CIBLE_X = 24;      // ce que Marc a demandé
const TOLERANCE = 0.5;   // les coordonnées sont écrites avec une décimale

function montage(sansDeco) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  /* Le bouton ⤳ masque distances, champs d'astéroïdes ET étiquettes de ceinture. */
  vm.runInContext('_mapDistOff = function(){ return ' + (sansDeco ? 'true' : 'false') + '; };', sb);
  return { sb, G };
}

function svgPlateau(sb) {
  try { sb.drawConnections(); } catch (e) { note('(le dessin s\'interrompt : ' + e.message + ')'); }
  const el = sb.document.getElementById('connections');
  return String((el && el.innerHTML) || '');
}

/* L'abscisse de départ d'un chemin d'arc, lue dans son attribut `d` (« M x y A … »). */
function departDesArcs(svg) {
  const out = [];
  const re = /<path\b[^>]*\bid="([^"]+)"[^>]*\bd="M\s+([\d.-]+)\s+([\d.-]+)\s+A/g;
  let m;
  while ((m = re.exec(svg))) out.push({ id: m[1], x: Number(m[2]), y: Number(m[3]) });
  return out;
}
/* Le texte d'une étiquette, par l'id du chemin qu'elle suit. */
function texteDuChemin(svg, id) {
  const re = new RegExp('<textPath[^>]*href="#' + id + '"[^>]*>([^<]*)</textPath>');
  const m = svg.match(re);
  return m ? m[1] : null;
}

console.log('═'.repeat(84));
console.log('ÉTIQUETTE DE LA CEINTURE — DEUX LIGNES, ALIGNÉES À 24 DU BORD');
console.log('═'.repeat(84) + '\n');

const svg = svgPlateau(montage(false).sb);
const arcs = departDesArcs(svg);
const principaux = arcs.filter(a => /^mapLab1/.test(a.id));
const kuiper = arcs.filter(a => /^mapLab2/.test(a.id));

console.log('1. Le nom est écrit en entier, sur deux lignes');
{
  note('arcs d\'étiquette trouvés : ' + arcs.map(a => a.id).join(', '));
  if (/AST\.\s*PRINCIP/i.test(svg)) ko('l\'abréviation « AST. PRINCIP. » est toujours là');
  else ok('l\'abréviation a disparu');
  if (principaux.length !== 2) {
    ko('la ceinture principale porte ' + principaux.length + ' arc(s) d\'étiquette au lieu de 2');
  } else {
    const l1 = texteDuChemin(svg, principaux[0].id), l2 = texteDuChemin(svg, principaux[1].id);
    note('ligne 1 : « ' + l1 +' »  ·  ligne 2 : « ' + l2 + ' »');
    const ensemble = String(l1) + ' ' + String(l2);
    if (/CEINTURE/i.test(ensemble) && /AST[ÉE]RO[ÏI]DES/i.test(ensemble) && /PRINCIPALE/i.test(ensemble))
      ok('« CEINTURE D\'ASTÉROÏDES » puis « PRINCIPALE »');
    else ko('les deux lignes ne disent pas le nom entier : ' + ensemble);
  }
}

console.log('\n2. Les deux lignes commencent à x = ' + CIBLE_X);
{
  if (principaux.length !== 2) {
    ko('pas deux arcs à mesurer — le point ne prouve rien');
  } else {
    principaux.forEach(a => note(a.id + ' : départ x=' + a.x + ' y=' + a.y));
    const hors = principaux.filter(a => Math.abs(a.x - CIBLE_X) > TOLERANCE);
    if (hors.length) ko(hors.length + ' ligne(s) ne partent pas de x=' + CIBLE_X + ' (mesuré : ' + hors.map(a => a.x).join(', ') + ')');
    else ok('les deux départs valent ' + CIBLE_X + ' à ' + TOLERANCE + ' près');
    if (Math.abs(principaux[0].x - principaux[1].x) > TOLERANCE)
      ko('les deux lignes ne partent pas du même x — elles ne sont pas alignées entre elles');
    else ok('et elles sont alignées l\'une sur l\'autre');
  }
}

console.log('\n3. Les deux lignes sont à deux hauteurs distinctes');
{
  if (principaux.length !== 2) {
    ko('pas deux arcs à mesurer');
  } else {
    const ecart = Math.abs(principaux[0].y - principaux[1].y);
    note('écart vertical au départ : ' + ecart.toFixed(1) + ' unités');
    if (ecart < 20) ko('écart de ' + ecart.toFixed(1) + ' seulement — les lignes se chevauchent');
    else if (ecart > 90) ko('écart de ' + ecart.toFixed(1) + ' — les deux lignes ne se lisent plus comme un bloc');
    else ok('écart lisible, les lignes forment un bloc de deux');
  }
}

console.log('\n4. La ceinture de Kuiper garde son arc unique');
{
  note('arcs Kuiper : ' + kuiper.length);
  if (kuiper.length !== 1) ko('la ceinture de Kuiper porte ' + kuiper.length + ' arc(s) au lieu d\'un');
  else {
    const txt = texteDuChemin(svg, kuiper[0].id);
    note('texte : « ' + txt + ' »');
    if (txt && /KUIPER/i.test(txt)) ok('un seul arc, son nom inchangé');
    else ko('le nom de la ceinture de Kuiper a changé : ' + txt);
  }
}

console.log('\n5. CONTRE-ÉPREUVE — le banc sait lire une abscisse de départ');
{
  const faux = '<path id="mapLabTest" d="M 83.4 951.2 A 921.0 921.0 0 0 1 962.0 1742.0"/>';
  const lu = departDesArcs(faux);
  if (lu.length === 1 && lu[0].x === 83.4) ok('un départ à x=83,4 est bien lu comme tel (c\'était la valeur d\'avant)');
  else ko('la lecture des chemins ne fonctionne pas — les points ci-dessus ne prouvent rien');
}

console.log('\n6. CONTRE-ÉPREUVE — le bouton ⤳ emporte les étiquettes');
{
  /* Sans ce point, on pourrait « corriger » en dessinant les étiquettes en dehors du groupe
     que ⤳ masque, et elles resteraient à l'écran quand Marc dégage la carte. */
  const svgNu = svgPlateau(montage(true).sb);
  const arcsNus = departDesArcs(svgNu).filter(a => /^mapLab/.test(a.id));
  note('arcs d\'étiquette avec ⤳ actif : ' + arcsNus.length);
  if (arcsNus.length === 0) ok('aucune étiquette de ceinture quand la carte est dégagée');
  else ko(arcsNus.length + ' étiquette(s) subsistent alors que ⤳ devrait les masquer');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le nom entier, sur deux lignes, démarrant à 24 unités du bord gauche.');
console.log('═'.repeat(84));
