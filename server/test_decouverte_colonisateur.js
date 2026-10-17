/* TEST — la tuile Découverte d'une colonie va à la nation qui colonise, jamais au joueur
   (partie 29BD, 22/09 : Marc encaissait les Reliques d'Aliens des colonies terriennes, et
   recevait leur fenêtre « Colonisation réussie »).
   Usage : node test_decouverte_colonisateur.js */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('martiens', ['terriens', 'jupiteriens']);
const G = sb.__G; G.turn = 2;
const mar = G.player, ter = G.ais.find(a => a.civ.id === 'terriens');
const relique = sb.DISCOVERY_TILES ? null : null;
// Tuile forcée : +1 VP et +2🔬 (on la pose dans le cache du nœud avant la colonisation).
const tuile = require('vm').runInContext("DISCOVERY_TILES.find(d=>d.vp)||DISCOVERY_TILES[0]", sb);
G._discCache = { titan: tuile };
ter.res.materials = 10; ter.res.energy = 10; ter.acLeft = 3;
ter.routes.push({ from: 'lune', to: 'titan', tokens: 0 });
const vpM0 = mar.tempVP || 0, vpT0 = ter.tempVP || 0, sciM0 = mar.res.science || 0;
const ok1 = sb.appliquerCoup(ter, { type: 'coloniser', node: 'titan' });
if (ok1 && ter.colonies.some(c => c.nodeId === 'titan')) ok('les Terriens ont colonisé Titan'); else ko('le montage ne prouve rien : pas de colonisation');
if (!G._decouverteEnAttente) ok('aucune tuile laissée en attente'); else ko('tuile en attente : ' + JSON.stringify(G._decouverteEnAttente.nodeId) + ' — le prochain dismissDiscovery la versera au joueur');
// Ce que faisait le serveur à la prochaine action du joueur :
try { sb.dismissDiscovery(); } catch (e) {}
if (tuile.vp) {
  if ((mar.tempVP || 0) === vpM0) ok('le joueur (Martiens) ne gagne pas les VP de la tuile'); else ko('le joueur a encaissé ' + ((mar.tempVP || 0) - vpM0) + ' VP de la tuile terrienne');
  if ((ter.tempVP || 0) > vpT0) ok('les Terriens gagnent les VP de leur tuile'); else ko('les Terriens n\'ont rien reçu');
}
if ((mar.res.science || 0) === sciM0) ok('la science du joueur est intacte'); else ko('science du joueur modifiée : ' + sciM0 + ' → ' + mar.res.science);
// Contre-épreuve : le joueur colonise lui-même → la tuile attend sa fenêtre, puis lui revient.
G._discCache.ceres = tuile; mar.res.materials = 10; mar.res.energy = 10; mar.acLeft = 3;
mar.routes.push({ from: 'phobos', to: 'ceres', tokens: 0 });
const vpM1 = mar.tempVP || 0;
sb.doColonize('ceres');
if (G._decouverteEnAttente && G._decouverteEnAttente.civ === 'martiens') ok('contre-épreuve : la tuile du joueur attend sa fenêtre'); else ko('contre-épreuve : la tuile du joueur ne l\'attend pas');
sb.dismissDiscovery();
if (!tuile.vp || (mar.tempVP || 0) > vpM1) ok('contre-épreuve : le joueur reçoit sa propre tuile'); else ko('contre-épreuve : le joueur n\'a rien reçu');
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
