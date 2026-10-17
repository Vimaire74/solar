/* ============================================================================
   TEST — UNE ROUTE SANS EXTRÉMITÉ À SOI TOMBE (début de tour)
   ----------------------------------------------------------------------------
   RÈGLE (Marc, 15/09, partie FE37) : « les routes tombent si l'une d'elles n'est pas au moins connectée
   à une colonie à toi ». Les Martiens gardaient Europe→Titan et Titan→Triton trois tours après avoir
   perdu Titan et Triton, parce que la seule rupture codée était celle de la déclaration de guerre.
   Usage : node test_routes_orphelines.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const dernier = (G, av) => G.log.slice(0, G.log.length - av).map(e => String((e && e.msg) || e));
const has = (p, a, b) => p.routes.some(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['jupiteriens', 'terriens']);
  const G = sb.__G; G.turn = 7; G.phase = 'actions';
  const mar = G.player, jup = G.ais[0];
  mar._isAI = false; G.ais.forEach(a => a._isAI = true);
  /* Martiens : Phobos (capitale) + Vesta. Ses routes : Phobos→Vesta (à lui), Vesta→Europe (une extrémité à
     lui, l'autre à Jupitériens), Europe→Titan et Titan→Triton (AUCUNE extrémité à lui : Titan et Triton
     viennent d'être perdues), la seconde portant 1 jeton. */
  mar.colonies.push({ nodeId: 'vesta', level: 1, connected: true });
  jup.colonies.push({ nodeId: 'europe', level: 1, connected: true }, { nodeId: 'titan', level: 1, connected: false }, { nodeId: 'triton', level: 1, connected: false });
  mar.routes = [{ from: 'phobos', to: 'vesta', tokens: 0 }, { from: 'vesta', to: 'europe', tokens: 0 }, { from: 'europe', to: 'titan', tokens: 0 }, { from: 'titan', to: 'triton', tokens: 1 }];
  mar.forceTokens = 3;
  sb.updateConnections(mar); sb.updateConnections(jup);
  return { sb, G, mar, jup };
}

console.log('§1 Au début du tour, les deux routes sans extrémité martienne tombent, le jeton revient');
{
  const { sb, G, mar } = montage();
  const av = G.log.length; G.turn = 8;
  sb.startTurn();
  if (!has(mar, 'europe', 'titan') && !has(mar, 'titan', 'triton')) ok('Europe→Titan et Titan→Triton abandonnées'); else ko('routes orphelines encore là : ' + JSON.stringify(mar.routes));
  if (has(mar, 'phobos', 'vesta')) ok('Phobos→Vesta (à lui) tient'); else ko('Phobos→Vesta perdue à tort');
  if (has(mar, 'vesta', 'europe')) ok('Vesta→Europe (une extrémité à lui, l\'autre étrangère) tient'); else ko('Vesta→Europe perdue à tort');
  if (mar.forceTokens === 4) ok('jeton de Titan→Triton rendu (3 → 4)'); else ko('jetons : ' + mar.forceTokens);
  const l = dernier(G, av).find(x => /route\(s\) abandonnée/.test(x));
  if (l && /Martiens/.test(l) && /Europe→Titan/.test(l) && /Titan→Triton/.test(l) && /1 jeton/.test(l)) ok('journal : « ' + l + ' »'); else ko('journal absent ou incomplet : ' + JSON.stringify(dernier(G, av)));
}

console.log('§2 Pas d\'exception pour la capitale occupée (Marc, 21/09) : Éris→Pluton tombe pour un Ceinturien qui a perdu Éris');
{
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['jupiteriens']);
  const G = sb.__G; G.turn = 9; G.phase = 'actions';
  const cei = G.player, jup = G.ais[0]; cei._isAI = false; jup._isAI = true;
  cei.colonies = [];                                   // plus aucune colonie
  jup.colonies.push({ nodeId: 'eris', level: 2, connected: false });
  cei.routes = [{ from: 'eris', to: 'pluto', tokens: 0 }, { from: 'pluto', to: 'triton', tokens: 0 }];
  sb.updateConnections(cei); G.turn = 10; sb.startTurn();
  if (!has(cei, 'eris', 'pluto')) ok('Éris→Pluton tombe (Éris, occupée, n\'est plus à lui)'); else ko('Éris→Pluton tient encore — ancienne exception de la capitale');
  if (!has(cei, 'pluto', 'triton')) ok('Pluton→Triton (aucune extrémité à lui) tombe'); else ko('Pluton→Triton encore là');
}

console.log('§3 Rien ne tombe deux fois ni sans raison : un second startTurn ne change plus rien');
{
  const { sb, G, mar } = montage();
  G.turn = 8; sb.startTurn(); const n = mar.routes.length, t = mar.forceTokens; const av = G.log.length;
  G.turn = 9; sb.startTurn();
  if (mar.routes.length === n && mar.forceTokens === t && !dernier(G, av).some(x => /abandonnée/.test(x))) ok('état stable au tour suivant'); else ko('changement inattendu : routes ' + mar.routes.length + '/' + n + ', jetons ' + mar.forceTokens + '/' + t);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_routes_orphelines : une route sans extrémité à soi tombe.');
