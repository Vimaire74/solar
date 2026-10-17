/* TEST — après une attaque de pirates, SEULE la nation pillée voit monter sa tension envers les
   Ceinturiens (Marc, 21/09). Avant : +1 pour TOUTES les nations non ceinturiennes, pillées ou non.
   Usage : node test_pirates_tension_pillee.js */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('terriens', ['martiens', 'ceinturiens']);
const G = sb.__G; G.turn = 9; require('vm').runInContext('Math.random=function(){return 0;}', sb);   // tirage forcé : chaque jet réussit
const ter = G.player, mar = G.ais.find(a => a.civ.id === 'martiens'), cei = G.ais.find(a => a.civ.id === 'ceinturiens');
ter.routes = [{ from: 'lune', to: 'deimos', tokens: 0 }];         // nue : sera pillée
mar.routes = [{ from: 'titan', to: 'encelade', tokens: 0 }];     // hors de portée des repaires : rien
for (const a of [ter, mar]) sb.setTens(a.civ.id, 'ceinturiens', 0);
ter.res.energy = 5; ter.res.materials = 5; ter.res.science = 5; const stockT = 15;
sb.advancePirates();
const tT = sb.getTens('terriens', 'ceinturiens'), tM = sb.getTens('martiens', 'ceinturiens');
if (ter.res.energy + ter.res.materials + ter.res.science < stockT) ok('la route nue des Terriens a été pillée'); else ko('le montage ne prouve rien : aucune attaque');
if (tT === 1) ok('Terriens (pillés) → Ceinturiens : +1'); else ko('Terriens : ' + tT + ' au lieu de 1');
if (tM === 0) ok('Martiens (épargnés) → Ceinturiens : 0'); else ko('Martiens, qui n\'ont rien perdu : ' + tM + ' au lieu de 0');
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
