/* TEST — RAID, RÈGLE B (Marc, 21/09) : le pillard prend la PRODUCTION du tour de la colonie ; la
   victime ne la touche pas en fin de tour, et son STOCK n'est pas entamé. Avant : le butin était
   retiré du stock (plafonné par lui) et la colonie rapportait quand même son revenu en fin de tour.
   Usage : node test_raid_production.js */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('ceinturiens', ['martiens']);
const G = sb.__G; G.turn = 5; G.phase = 'actions';
const moi = G.player, vic = G.ais[0];
moi._isAI = false; vic._isAI = true;
moi.acLeft = 4; moi.forceTokens = 6; moi.res.energy = 10; moi.res.materials = 10; moi.res.science = 10;
vic.res.energy = 20; vic.res.materials = 20; vic.res.science = 20;
const cible = vic.colonies.find(c => c.connected) || vic.colonies[0];
const tot = o => (o.energy || 0) + (o.materials || 0) + (o.science || 0);
const prod = sb.revenuDuneColonie(vic, cible);
const revAvant = tot(sb.revenusBruts(vic)), stockAvant = tot(vic.res), moiAvant = tot(moi.res);
sb.doRaidTarget(vic.civ.id, cible.nodeId);
const revApres = tot(sb.revenusBruts(vic)), stockApres = tot(vic.res), gain = tot(moi.res) - moiAvant;
console.log('     production de ' + cible.nodeId + ' : ' + tot(prod) + ' · gain du pillard ' + gain + ' · stock victime ' + stockAvant + '→' + stockApres + ' · revenu de fin de tour ' + revAvant + '→' + revApres);
(gain > 0 ? ok : ko)('le pillard reçoit la production tout de suite');
(stockApres === stockAvant ? ok : ko)('le stock de la victime n\'est pas entamé');
(revAvant - revApres === gain ? ok : ko)('le revenu de fin de tour de la victime baisse exactement du butin');
G.turn = 6;
(tot(sb.revenusBruts(vic)) === revAvant ? ok : ko)('au tour suivant, la colonie rapporte de nouveau normalement');
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
