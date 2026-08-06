/* ============================================================================
   TEST — LA MACHINE À ÉTATS DU JEU (bloc @flux de moteur.js)
   ----------------------------------------------------------------------------
   Ce test interroge la machine LÀ OÙ ELLE VIT : dans le moteur, chargé comme le
   navigateur le charge. Il n'existe plus de copie côté serveur — s'il y en avait
   une, elle finirait par diverger, et on testerait la mauvaise.

   Ce qu'il vérifie :
     1. la carte du flux est cohérente (le contrôle interne s'exécute au chargement) ;
     2. une transition NON DÉCLARÉE est refusée — c'est la garantie qui empêche le
        retour du flux implicite qu'on est en train de supprimer ;
     3. l'état vit dans `G` et SURVIT à un aller-retour JSON : c'est toute la raison
        d'être du chantier. L'ancien flux, lui, tenait dans des fonctions ;
     4. le mode MULTI_ACTIF sait attendre que TOUS aient répondu (quatre joueurs qui
        choisissent leur carte en même temps, au lieu de faire la queue) ;
     5. `fluxPeutAgir` refuse une nation qui n'est pas active (l'équivalent du
        `checkAction` de BGA) ;
     6. le diagnostic sait DIRE pourquoi une partie est figée.

   Usage : node test_flux.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');

const HTML = process.env.GAME_HTML || path.join(__dirname, '..', 'index.html');
const sb = loadLogic(HTML);
const ETATS = sb.fluxTable(), S = sb.fluxNumeros(), T = sb.fluxTypes();

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }

console.log('═'.repeat(72));
console.log('LA MACHINE À ÉTATS — bloc @flux de moteur.js');
console.log('═'.repeat(72));

/* ── 1. la carte ──────────────────────────────────────────────────────────── */
console.log('\n1. La carte du flux');
const nb = Object.keys(ETATS).length;
ok(nb + ' états déclarés, contrôle de cohérence passé au chargement du moteur');
console.log('     (transitions vers le vide, états joueur sans action, états inatteignables :');
console.log('      tout cela fait échouer le CHARGEMENT, donc avant la moindre partie)');

/* ── 2. une partie neuve démarre bien dans la machine ─────────────────────── */
console.log('\n2. Une partie neuve');
sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const G = sb.scGetG();
if (!G._flux) ko('`G._flux` absent : la machine n\'est pas née avec la partie');
else if (G._flux.etat !== S.DEBUT) ko('la partie démarre à l\'état ' + G._flux.etat + ' au lieu de ' + S.DEBUT);
else ok('la machine naît avec la partie, à l\'état « ' + ETATS[S.DEBUT].nom + ' », et vit DANS G');

/* ── 3. transitions déclarées / non déclarées ─────────────────────────────── */
console.log('\n3. Les transitions');
try {
  sb.fluxAller('suite');
  if (sb.fluxEtat() === S.AGENDA) ok('« debut --suite--> agenda » : acceptée');
  else ko('« suite » mène à ' + sb.fluxEtat() + ' au lieu de ' + S.AGENDA);
} catch (e) { ko('une transition DÉCLARÉE a été refusée : ' + e.message); }

let refusee = false;
try { sb.fluxAller('parLaFenetre'); } catch (e) { refusee = /inconnue/.test(e.message); }
if (refusee) ok('« parLaFenetre » : refusée, avec la liste des transitions permises');
else ko('une transition INVENTÉE a été acceptée — le flux implicite peut revenir par là');

/* ── 4. l'état survit à un aller-retour JSON — LE point du chantier ───────── */
console.log('\n4. L\'état du déroulement survit-il à une sauvegarde ?');
sb.fluxActiver(['terriens', 'martiens']);
sb.fluxARepondu('terriens');
G._flux.donnees.guerreEnCours = 2;             // un curseur, rangé dans les données (règle 3)
const avant = JSON.stringify(G._flux);
const apres = JSON.parse(avant);                // ce que fait une sauvegarde, ni plus ni moins
if (JSON.stringify(apres) !== avant) ko('le flux ne survit pas à un aller-retour JSON');
else if (apres.etat !== G._flux.etat || apres.actifs.length !== 2 || apres.repondu[0] !== 'terriens' || apres.donnees.guerreEnCours !== 2)
  ko('le flux revient incomplet');
else {
  ok('état, nations actives, réponses reçues et curseurs : tout revient (' + avant.length + ' caractères)');
  console.log('     ⟶ c\'est ce que l\'ancien flux ne pouvait PAS faire : une continuation est');
  console.log('       une fonction, et JSON n\'écrit pas de fonctions.');
}

/* ── 5. MULTI_ACTIF : attendre TOUT LE MONDE ──────────────────────────────── */
console.log('\n5. Plusieurs joueurs actifs en même temps');
sb.fluxActiver(['terriens', 'martiens', 'jupiteriens']);
const t1 = sb.fluxARepondu('terriens'), t2 = sb.fluxARepondu('martiens'), t3 = sb.fluxARepondu('jupiteriens');
if (t1 || t2) ko('la machine croit tout le monde prêt alors qu\'il manque des réponses');
else if (!t3) ko('la machine n\'a pas vu que tout le monde avait répondu');
else ok('trois joueurs répondent en parallèle ; la machine n\'avance qu\'au dernier');
if (sb.fluxResteARepondre().length) ko('des nations restent marquées en attente après réponse complète');

/* ── 6. le droit d'agir (checkAction) ─────────────────────────────────────── */
console.log('\n6. Le droit d\'agir');
sb.fluxActiver(['terriens']);
if (!sb.fluxPeutAgir('terriens')) ko('la nation active n\'a pas le droit d\'agir');
else if (sb.fluxPeutAgir('ceinturiens')) ko('une nation NON active a le droit d\'agir — une action hors tour passerait');
else ok('seule la nation active peut agir ; les autres sont refusées');

/* ── 7. diagnostic d'une partie figée ─────────────────────────────────────── */
console.log('\n7. Le diagnostic (« pourquoi rien ne bouge ? »)');
sb.fluxActiver([]);                              // état joueur sans personne d'actif = blocage
const d = sb.fluxDiagnostiquer();
if (!d.soucis.length) ko('une partie figée (état joueur, aucune nation active) est déclarée saine');
else ok('blocage détecté et expliqué : « ' + d.soucis[0] + ' »');
if (!d.histoire || !d.histoire.length) ko('le diagnostic ne rend pas l\'historique des transitions');
else ok('les ' + d.histoire.length + ' dernières transitions sont rendues, pour relire le chemin parcouru');

/* ── verdict ──────────────────────────────────────────────────────────────── */
console.log('\n' + '═'.repeat(72));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' problème(s) :');
  ecarts.forEach((e, i) => console.log('  ' + (i + 1) + '. ' + e));
  process.exitCode = 1;
} else {
  console.log('✅ La machine à états tient : carte cohérente, transitions strictes, état sérialisable.');
  console.log('   Les cinq familles de questions (guerre, événements, fin de tour, agenda, investissements)');
  console.log('   reprennent après une sauvegarde — vérifié par `node server/test_reprise.js`.');
  console.log('   Reste à migrer : les flux Sphère de Dyson, guerre populaire et assaut du joueur,');
  console.log('   qui gardent encore leur suite sous forme de fonction (voir docs/LOT17 §16).');
}
