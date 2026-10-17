/* ============================================================================
   TEST — LA FENÊTRE D'ASSAUT NE LIT PAS LES COFFRES DE L'ADVERSAIRE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, rapport de bug de la partie C062 (23/09) : « Quand je fais une attaque le
   jeu me donne à l'avance les jetons misés par l'autre nation, c'est pas logique. Trop
   facile. » Et sa règle, telle qu'il la pose : attaquer une colonie est hasardeux, il faut
   estimer ; le chiffre affiché n'est qu'une aide à la réflexion, pas une réponse.

   CE QUE DIT DÉJÀ `regles.html` §14.7 : « Sans 🔍 Réseau Orbital : estimation à ±3 de la
   force des rivaux, économie et moral cachés, DÉFENSE ADVERSE INCONNUE AU MOMENT D'ENGAGER. »

   LES DEUX FUITES.
     · La fenêtre appelait `defenseIA(ai, p, cible)`, qui calcule ce que l'ordinateur va
       RÉELLEMENT engager à partir de ses ressources payables. Elle lisait donc son économie,
       et annonçait sa décision avant qu'il la prenne.
     · La branche brouillard affichait `aiTok`, le nombre EXACT de jetons, sous l'étiquette
       « ~n (±1) ». `perceivedForce` existe pourtant et rend ±3 sans renseignement.

   CE QUI RESTE PUBLIC, et doit donc être annoncé : la garnison (10 pour une capitale tenue
   par sa nation, 1 pour une colonie — voir `garrisonOf`), et la POSSESSION du supercroiseur
   (« même sans Réseau Orbital, on ne cache pas un supercroiseur, c'est trop gros », Marc,
   07/09 — son état de réparation, lui, reste secret).

   CE QUE CE BANC VERROUILLE :
     · le texte affiché NE CHANGE PAS quand seule l'économie du défenseur change ;
     · la garnison annoncée vaut 10 sur une capitale et 1 sur une colonie ordinaire ;
     · sans renseignement, l'estimation des jetons est marquée ±3 ;
     · CONTRE-ÉPREUVE : avec le Réseau Orbital, le chiffre des jetons est exact ;
     · CONTRE-ÉPREUVE : le banc sait lire le texte (il détecte un texte vide).

   Usage : node test_fenetre_assaut_brouillard.js
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

function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 20; moi.res.energy = 20; moi.forceTokens = 12;
  ia.forceTokens = (opts.jetons === undefined) ? 4 : opts.jetons;
  ia.res.materials = (opts.iaMat === undefined) ? 10 : opts.iaMat;
  ia.res.energy = (opts.iaEn === undefined) ? 10 : opts.iaEn;
  ia.hasCruiser = !!opts.croiseur;
  G.warWith = ia.civ.id;
  vm.runInContext(`_aUnEcran = function(){ return true; };`, sb);
  vm.runInContext(`getIntelLevel = function(){ return ${opts.intel ? 2 : 0}; };`, sb);
  return { sb, G, moi, ia };
}

/* Le texte réellement écrit dans la fenêtre, balises retirées. */
function texte(sb, cible) {
  try { sb._warSelectColonyTarget(cible); } catch (e) { /* le dessin s'interrompt après le texte */ }
  const el = sb.document.getElementById('wcm-info');
  return String((el && el.innerHTML) || '').replace(/<[^>]+>/g, '');
}

console.log('═'.repeat(84));
console.log("FENÊTRE D'ASSAUT — CE QU'ON A LE DROIT DE SAVOIR");
console.log('═'.repeat(84) + '\n');

console.log("1. L'économie du défenseur ne doit rien changer à ce qui s'affiche");
{
  /* Deux montages identiques, sauf les coffres de l'adversaire. Tant que la fenêtre passe par
     `defenseIA`, elle lit ces coffres et les deux textes diffèrent. On se place AVEC le Réseau
     Orbital : sans lui la fenêtre n'affiche pas la défense du tout, et le point serait vert sans
     rien prouver — c'est le piège où ce banc est tombé à son premier jet. */
  const a = montage({ iaMat: 0,  iaEn: 0,  intel: true });
  const b = montage({ iaMat: 30, iaEn: 30, intel: true });
  const ta = texte(a.sb, a.ia.civ.home);
  const tb = texte(b.sb, b.ia.civ.home);
  if (!ta.length) ko("la fenêtre n'a rien écrit — ce point ne mesure rien");
  note('adversaire à sec  : ' + ta.trim().replace(/\s+/g, ' '));
  note('adversaire riche  : ' + tb.trim().replace(/\s+/g, ' '));
  if (ta === tb) ok("le texte est le même : l'économie adverse n'est pas lue");
  else ko("le texte change avec les coffres de l'adversaire — la fenêtre lit son économie");
}

console.log('\n2. La garnison annoncée : 10 sur une capitale, 1 sur une colonie ordinaire');
{
  const m = montage({});
  const tCap = texte(m.sb, m.ia.civ.home);
  if (/\b10\b/.test(tCap)) ok('la capitale annonce bien 10');
  else ko('la capitale n\'annonce pas 10 — texte : ' + tCap.trim().replace(/\s+/g, ' '));

  const m2 = montage({});
  m2.ia.colonies.push({ nodeId: 'ceres', level: 1, connected: true });
  const tCol = texte(m2.sb, 'ceres');
  if (/\b1\b/.test(tCol) && !/\b10\b/.test(tCol)) ok('une colonie ordinaire annonce 1, pas 10');
  else ko('la colonie ordinaire n\'annonce pas 1 — texte : ' + tCol.trim().replace(/\s+/g, ' '));
}

console.log('\n3. Sans Réseau Orbital : les jetons sont une estimation à ±3');
{
  const m = montage({ intel: false, jetons: 5 });
  const t = texte(m.sb, m.ia.civ.home);
  note('texte : ' + t.trim().replace(/\s+/g, ' '));
  if (/±\s*3/.test(t)) ok("l'incertitude ±3 est annoncée");
  else ko("l'incertitude ±3 n'apparaît pas — le joueur croit lire un chiffre sûr");
}

console.log('\n4. CONTRE-ÉPREUVE — avec le Réseau Orbital, les jetons sont exacts');
{
  /* Sans ce point, on « corrigerait » en floutant tout, et la technologie n'apporterait rien. */
  const m = montage({ intel: true, jetons: 5 });
  const t = texte(m.sb, m.ia.civ.home);
  note('texte : ' + t.trim().replace(/\s+/g, ' '));
  if (/±\s*3/.test(t)) ko("l'incertitude ±3 subsiste malgré le Réseau Orbital");
  else if (/\b5\b/.test(t)) ok('les 5 jetons sont annoncés exactement');
  else ko("le nombre exact de jetons n'apparaît pas — texte : " + t.trim().replace(/\s+/g, ' '));
}

console.log('\n5. CONTRE-ÉPREUVE — le banc sait voir un texte vide');
{
  const m = montage({});
  const el = m.sb.document.getElementById('wcm-info');
  if (el) { el.innerHTML = ''; }
  const vide = String((el && el.innerHTML) || '').replace(/<[^>]+>/g, '');
  if (!vide.length) ok('un texte vide est bien détecté comme vide');
  else ko('la lecture rend quelque chose sur une fenêtre vide — les points ci-dessus ne prouvent rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log("✅ La fenêtre annonce ce qui est public, estime ce qui ne l'est pas, et ne lit");
console.log('   jamais les coffres d\'en face.');
console.log('═'.repeat(84));
