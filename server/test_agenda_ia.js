/* TEST — L'AGENDA D'UN ORDINATEUR : TIRÉ AU HASARD, ATTEIGNABLE, ET POURSUIVI DÈS LE TOUR 5 (05/10/2026, E4, v11.53)
   Usage : node test_agenda_ia.js */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const HTML = path.join(__dirname, '..', 'index.html');

console.log('1. Le tirage varie d\'une partie à l\'autre, le Hub jovien reste aux Jupitériens, le siège ordinateur « joueur » a un agenda');
{ const vus = new Set(); let hubHorsJupiter = 0, sansAgenda = 0;
  for (let i = 0; i < 12; i++) {
    const sb = loadLogic(HTML); sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
    const G = sb.__G; G.player._isAI = true; vm.runInContext('_aiPickAgendas()', sb);
    for (const p of [G.player].concat(G.ais)) { if (!p.agenda) { sansAgenda++; continue; } if (p.civ.id === 'martiens') vus.add(p.agenda.id); if (p.agenda.id === 'ag8' && p.civ.id !== 'jupiteriens') hubHorsJupiter++; }
  }
  if (vus.size >= 3) ok('Martiens : ' + vus.size + ' agendas différents sur 12 tirages'); else ko('tirage figé : ' + [...vus].join(','));
  if (!hubHorsJupiter) ok('Hub jovien jamais hors Jupitériens'); else ko('Hub jovien tiré ' + hubHorsJupiter + '× par une autre nation');
  if (!sansAgenda) ok('toutes les nations ordinateur ont un agenda (siège joueur compris)'); else ko(sansAgenda + ' nation(s) sans agenda'); }

console.log('\n2. Progression et prime d\'état');
{ const sb = loadLogic(HTML); sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; const run = c => vm.runInContext(c, sb); const m = G.ais.find(a => a.civ.id === 'martiens');
  const AG = run('AGENDAS_POOL'); m.agenda = AG.find(a => a.id === 'ag6'); m.gov_level = 2; m.res.morale = 4;
  G.turn = 4; const avant5 = run('valeurAgendaEtat(allPlayers().find(p=>p.civ.id==="martiens"))');
  if (avant5 === 0) ok('T4 : 0'); else ko('prime avant T5 : ' + avant5);
  G.turn = 5; const p0 = run('agendaProgres(allPlayers().find(p=>p.civ.id==="martiens"))'), v5 = run('valeurAgendaEtat(allPlayers().find(p=>p.civ.id==="martiens"))');
  m.res.morale = 8; const p1 = run('agendaProgres(allPlayers().find(p=>p.civ.id==="martiens"))'), v5b = run('valeurAgendaEtat(allPlayers().find(p=>p.civ.id==="martiens"))');
  if (p1 > p0 && v5b > v5) ok('Gouvernance éclairée : moral 4 → 8 fait monter la progression ' + p0.toFixed(2) + ' → ' + p1.toFixed(2) + ' et la prime ' + v5.toFixed(1) + ' → ' + v5b.toFixed(1)); else ko('progression ' + p0 + '→' + p1 + ', prime ' + v5 + '→' + v5b);
  m.res.morale = 5; const vTyr = run('valeurAgendaEtat(allPlayers().find(p=>p.civ.id==="martiens"))');
  if (vTyr < v5b) ok('moral rabattu à 5 (Tyrannie) : la prime retombe à ' + vTyr.toFixed(1) + ' — inciter, pas interdire'); else ko('la prime ne recule pas : ' + vTyr);
  m.res.morale = 8; G.turn = 10; const v10 = run('valeurAgendaEtat(allPlayers().find(p=>p.civ.id==="martiens"))');
  if (v10 > v5b) ok('T10 > T5 à progression égale (rampe) : ' + v10.toFixed(1) + ' > ' + v5b.toFixed(1)); else ko('rampe absente : T10 ' + v10 + ' vs T5 ' + v5b);
  m.agenda = AG.find(a => a.id === 'ag1'); const pe = run('agendaProgres(allPlayers().find(p=>p.civ.id==="martiens"))');
  if (pe >= 0 && pe <= 1) ok('Explorateur : progression ' + pe.toFixed(2) + ' (1 colonie reliée / 5)'); else ko('progression hors bornes : ' + pe);
  G._primeAgenda = 0; const z = run('valeurAgendaEtat(allPlayers().find(p=>p.civ.id==="martiens"))'); if (z === 0) ok('poids 0 → 0'); else ko('poids 0 : ' + z); }

console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Agenda tiré au hasard, atteignable, et poursuivi dès le tour 5.');
