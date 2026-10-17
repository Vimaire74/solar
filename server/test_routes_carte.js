/* ============================================================================
   TEST — LE GRAPHE DE LA CARTE (v10.70, plateau en quart de disque)
   ----------------------------------------------------------------------------
   Décisions de Marc du 17/09, prises sur la maquette du plateau (REPRISE §141) :
     · Vesta–Europe SUPPRIMÉE (« elle ne fait pas de sens si y a Vesta–Io et Vesta–Ganymède ») ;
     · Lune–Vesta SUPPRIMÉE (« trop proche de Phobos–Vesta ») ;
     · Europe–Callisto REMPLACÉE par Europe–Ganymède (4 j) : sur l'arc des lunes joviennes, Europe
       et Callisto sont aux deux bouts et le tracé sautait par-dessus Ganymède ;
     · Cérès–Ganymède REMPLACÉE par Cérès–Europe, même durée 58 j (« visuellement depuis Cérès la
       route devrait aller à Europe, les routes se croisent » — sur le plateau le tracé vers
       Ganymède passait entre Io et Europe) ;
     · Encelade–Vesta (125 j), Callisto–Encelade (78 j), Ganymède–Triton (190 j) AJOUTÉES,
       durées posées par cohérence avec les voisines (Callisto–Titan 78, Ganymède–Titan 80,
       Titan–Triton 150) et pour que le raccourci ne batte pas le trajet naturel : à 95 j,
       Lune→Titan passait par Vesta–Encelade en 171 j au lieu de 196 par Ganymède — à revoir avec
       le coût de traversée des ceintures, plus tard.
   Et une règle de prudence : TOUTE arête a sa durée dans DUREES_TRAJET. Trois liaisons n'y
   étaient pas et prenaient la distance à l'écran × 0,26 (Io–Lune 121, Phobos–Vesta 43, Io–Vesta
   49) : déplacer les nœuds pour le nouveau plateau aurait changé ces coûts en silence. Gelées.

   CE QUI EST VÉRIFIÉ : le graphe est symétrique ; les arêtes retirées n'existent plus dans les
   deux sens et une route dessus est refusée ; les nouvelles existent et se construisent ; chaque
   arête a une durée explicite ; le coût en actions des nouvelles routes ; l'effet sur le plus
   court chemin Lune→Triton (346 j → 307 j via Ganymède–Triton, toujours 3 actions) ; Lune→Titan
   197 j par Cérès–Io–Ganymède (le détour par Vesta–Encelade ferait 201).
   Usage : node test_routes_carte.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage(civ) {
  const sb = loadLogic(HTML);
  sb.initGame(civ || 'terriens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  G.player.acLeft = 5; G.player.acMax = 5;
  G.player.res = { energy: 30, materials: 30, science: 8, morale: 9 };
  return { sb, G };
}
const NODES = vm.runInContext('NODES', montage().sb);
const DUR = vm.runInContext('DUREES_TRAJET', montage().sb);
const adj = (a, b) => (NODES[a].conn || []).includes(b);

console.log('§1 Le graphe est symétrique');
{
  let n = 0;
  // Les anneaux joviens décoratifs (jorbital2..7 → jorbital1 sans retour) sont hors jeu : exclus.
  for (const [a, node] of Object.entries(NODES)) { if (node.decorative) continue; for (const b of (node.conn || [])) { if (!NODES[b]) { ko(a + ' → ' + b + ' : nœud inconnu'); continue; } if (NODES[b].decorative) continue; if (!adj(b, a)) ko(a + '→' + b + ' sans retour'); else n++; } }
  if (!ecarts.length) ok(n / 2 + ' arêtes, toutes dans les deux sens');
}

console.log('§2 Les arêtes retirées : Vesta–Europe, Lune–Vesta, Cérès–Ganymède, Europe–Callisto');
for (const [a, b] of [['vesta', 'europe'], ['lune', 'vesta'], ['ceres', 'ganymede'], ['europe', 'callisto']]) {
  if (!adj(a, b) && !adj(b, a)) ok(a + '–' + b + ' absente'); else ko(a + '–' + b + ' encore présente');
}

console.log('§3 Les arêtes ajoutées : Cérès–Europe, Europe–Ganymède, Encelade–Vesta, Callisto–Encelade, Ganymède–Triton');
for (const [a, b] of [['ceres', 'europe'], ['europe', 'ganymede'], ['encelade', 'vesta'], ['callisto', 'encelade'], ['ganymede', 'triton']]) {
  if (adj(a, b) && adj(b, a)) ok(a + '–' + b + ' présente'); else ko(a + '–' + b + ' absente');
}

console.log('§4 Chaque arête a une durée explicite dans DUREES_TRAJET (plus de calcul sur les pixels)');
{
  const vus = new Set(); let manque = 0;
  for (const [a, node] of Object.entries(NODES)) { if (node.decorative) continue; for (const b of (node.conn || [])) { if (!NODES[b] || NODES[b].decorative) continue; const k = [a, b].sort().join('|'); if (vus.has(k)) continue; vus.add(k); if (DUR[k] === undefined) { manque++; ko('durée manquante : ' + k); } } }
  if (!manque) ok(vus.size + ' arêtes, ' + vus.size + ' durées');
  for (const [k, j] of [['io|lune', 121], ['phobos|vesta', 43], ['io|vesta', 49], ['ceres|europe', 58], ['europe|ganymede', 4], ['encelade|vesta', 125], ['callisto|encelade', 78], ['ganymede|triton', 190]]) {
    if (DUR[k] === j) ok(k + ' = ' + j + ' j'); else ko(k + ' = ' + DUR[k] + ' j (attendu ' + j + ')');
  }
  for (const k of ['europe|vesta', 'lune|vesta', 'ceres|ganymede', 'callisto|europe']) if (DUR[k] !== undefined) ko(k + ' a encore une durée');
}

console.log('§5 Construire : refusé sur une arête retirée, accepté sur une ajoutée');
{
  const m = montage('terriens');   // capitale Lune
  const avant = m.G.player.routes.length;
  vm.runInContext('doEstablishRoute("lune","vesta")', m.sb);
  if (m.G.player.routes.length === avant) ok('Lune→Vesta refusée'); else ko('Lune→Vesta construite');
  const m2 = montage('jupiteriens');   // capitale Io
  m2.G.player.colonies.push({ nodeId: 'callisto', level: 1, connected: true });
  const a2 = m2.G.player.routes.length;
  vm.runInContext('doEstablishRoute("callisto","encelade")', m2.sb);
  if (m2.G.player.routes.length === a2 + 1) ok('Callisto→Encelade construite'); else ko('Callisto→Encelade refusée');
}

console.log('§6 Coût en actions des nouvelles liaisons, et Lune→Triton via Ganymède–Triton');
{
  const cout = (m, n) => vm.runInContext('coutAssautAC(G.player,"' + n + '")', m.sb);
  const jours = (m, n) => vm.runInContext('joursVersCible(G.player,"' + n + '")', m.sb);
  const m = montage('jupiteriens');
  m.G.player.colonies.push({ nodeId: 'ganymede', level: 1, connected: true }, { nodeId: 'callisto', level: 1, connected: true });
  for (const [n, j, ac] of [['encelade', 78, 2], ['triton', 190, 3]]) { const jr = jours(m, n), c = cout(m, n); if (jr === j && c === ac) ok('Io+Ganymède+Callisto → ' + n + ' : ' + jr + ' j, ' + c + ' actions'); else ko(n + ' : ' + jr + ' j, ' + c + ' actions (attendu ' + j + ' j, ' + ac + ')'); }
  const t = montage('terriens');
  const jr = jours(t, 'triton'), c = cout(t, 'triton');
  if (jr === 307 && c === 3) ok('Lune → Triton : 307 j (58+55+4+190), 3 actions'); else ko('Lune → Triton : ' + jr + ' j, ' + c + ' actions (attendu 307 j, 3)');
  const jt = jours(t, 'titan');
  if (jt === 197) ok('Lune → Titan : 197 j par Cérès–Io–Ganymède (Vesta–Encelade ferait 201)'); else ko('Lune → Titan : ' + jt + ' j (attendu 197)');
}

console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ tout passe');
process.exit(ecarts.length ? 1 : 0);
