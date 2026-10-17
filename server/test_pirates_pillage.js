/* ============================================================================
   TEST — LA RÈGLE DES PIRATES DU 21/09 (Marc)
   « Les routes proches des deux ceintures, à moins de 60 jours de voyage, ont 30 % de chance d'être
   pillées si elles sont protégées, 70 % si elles ne le sont pas. Les routes ne tombent pas mais les
   pirates capturent une ressource au hasard parmi énergie, matériel et savoir. Leur attaque est
   évaluée à chaque début de tour après le choix des cartes stratégies. Si une route a été attaquée
   avec succès, le joueur pillé est averti. » + tension +1 par nation pillée et par tour ;
   substitution de ressource ; rien pour les Ceinturiens ; technologies = immunité totale.
   Usage : node test_pirates_pillage.js
   ========================================================================== */
'use strict';
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const G = sb.__G;
  const ter = G.player, mar = G.ais.find(a => a.civ.id === 'martiens'), cei = G.ais.find(a => a.civ.id === 'ceinturiens');
  for (const n of [ter, mar, cei]) { n.res.energy = 50; n.res.materials = 50; n.res.science = 50; }
  return { sb, G, ter, mar, cei };
}
const stock = p => (p.res.energy || 0) + (p.res.materials || 0) + (p.res.science || 0);

console.log('1. La portée : 60 jours ou moins d\'un repaire');
{ const m = montage(); let f;
  try { f = r => m.sb.routeAPorteeDesPirates(r); f({ from: 'io', to: 'europe' }); } catch (e) { ko('routeAPorteeDesPirates absente'); f = null; }
  if (f) {
    const cas = [['io', 'europe', true], ['lune', 'deimos', true], ['ganymede', 'callisto', true], ['titan', 'triton', true], ['titan', 'encelade', false]];
    for (const [a, b, att] of cas) (f({ from: a, to: b }) === att ? ok : ko)(a + '→' + b + ' : ' + (att ? 'à portée' : 'hors de portée'));
  } }

console.log('2. Les chances, mesurées sur 3000 tours');
{ const m = montage(); const N = 3000; let nue = 0, jet = 0, hors = 0, cei = 0, tech = 0;
  const mar2 = m.mar;
  try {
    for (let i = 0; i < N; i++) {
      m.G.turn = 5; m.G._piratesTour = null;
      m.ter.routes = [{ from: 'lune', to: 'deimos', tokens: 0 }];
      m.mar.routes = [{ from: 'phobos', to: 'ceres', tokens: 1 }, { from: 'titan', to: 'encelade', tokens: 0 }];
      m.cei.routes = [{ from: 'eris', to: 'pluto', tokens: 0 }];
      const a = stock(m.ter), b = stock(m.mar), c = stock(m.cei);
      m.sb.advancePirates();
      if (stock(m.ter) < a) nue++;
      if (stock(m.mar) < b) jet++;           // seule Phobos–Cérès (jeton) est à portée
      if (stock(m.cei) < c) cei++;
      if (m.ter.routes.length !== 1 || m.mar.routes.length !== 2) hors = -9999;
      for (const n of [m.ter, m.mar, m.cei]) { n.res.energy = 50; n.res.materials = 50; n.res.science = 50; }
    }
    note('route nue ' + (100 * nue / N).toFixed(1) + ' % · avec jeton ' + (100 * jet / N).toFixed(1) + ' % · Ceinturiens ' + (100 * cei / N).toFixed(1) + ' %');
    (Math.abs(nue / N - 0.7) < 0.03 ? ok : ko)('route nue à portée : ~70 %');
    (Math.abs(jet / N - 0.3) < 0.03 ? ok : ko)('route avec jeton à portée : ~30 % (Titan–Encelade, hors portée, jamais)');
    (cei === 0 ? ok : ko)('Ceinturiens : jamais');
    (hors === 0 ? ok : ko)('aucune route n\'est jamais tombée');
    m.mar.cards.push({ id: 'reseau2', branch: 'ia_renseignement', tier: 2, spec: 'intel_2' });
    let t = 0; for (let i = 0; i < 500; i++) { m.G._piratesTour = null; m.mar.routes = [{ from: 'phobos', to: 'ceres', tokens: 0 }]; const b = stock(m.mar); m.sb.advancePirates(); if (stock(m.mar) < b) t++; m.mar.res.energy = 50; m.mar.res.materials = 50; m.mar.res.science = 50; }
    (t === 0 ? ok : ko)('Réseau Orbital : immunité totale (' + t + ' pillage sur 500)');
  } catch (e) { ko('mesure impossible : ' + e.message); } }

console.log('3. Une ressource par route, substituée si elle manque ; plusieurs routes le même tour');
{ const m = montage();
  vm.runInContext('Math.random=function(){return 0;}', m.sb);   // tire toujours ⚡, et chaque jet réussit
  m.ter.res = { energy: 0, materials: 5, science: 0, morale: 5 };
  m.ter.routes = [{ from: 'lune', to: 'deimos', tokens: 0 }, { from: 'lune', to: 'phobos', tokens: 0 }, { from: 'lune', to: 'ceres', tokens: 0 }];
  m.G.turn = 4; m.G._piratesTour = null;
  m.sb.setTens('terriens', 'ceinturiens', 0);
  m.G._pendings = []; m.sb.setDecisionSink(function () {}); m.ter._isAI = false;
  m.sb.advancePirates();
  (m.ter.res.materials === 2 ? ok : ko)('⚡ absente → 🪨 prise à la place, 3 routes = −3🪨 (reste ' + m.ter.res.materials + ')');
  (m.ter.routes.length === 3 ? ok : ko)('les 3 routes restent debout');
  const tn = m.sb.getTens('terriens', 'ceinturiens');
  (tn === 1 ? ok : ko)('tension envers les Ceinturiens : +1 pour le tour, pas +3 (' + tn + ')');
  const av = (m.G._pendings || []).find(p => /pirates/i.test(JSON.stringify(p.payload || {})));
  (av ? ok : ko)('le joueur pillé est averti (une fenêtre, routes listées)');
  m.sb.advancePirates();
  (m.ter.res.materials === 2 ? ok : ko)('une seule attaque par tour, même appelée deux fois'); }

console.log('4. Au début du tour, après le draft — plus en fin de tour');
{ const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const si = src.slice(src.indexOf('function startInterleaved('), src.indexOf('function _ilEl('));
  (/advancePirates\(\)/.test(si) ? ok : ko)('startInterleaved (après le draft, solo ET serveur) appelle les pirates');
  const fin = src.slice(src.indexOf('function _runEndOfRound('), src.indexOf('function endTurn('));
  (!/advancePirates\(\)/.test(fin) ? ok : ko)('la fin de manche ne les appelle plus');
  const drv = fs.readFileSync(path.join(__dirname, 'driver.js'), 'utf8');
  (!/sb\.advancePirates\(\)/.test(drv) ? ok : ko)('le pilote serveur non plus'); }

console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
