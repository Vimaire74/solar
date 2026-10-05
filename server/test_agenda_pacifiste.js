/* TEST — AGENDAS REMANIÉS DU 05/10 : Pacifiste (drapeaux posés par les règles) et Opulence (tours en surproduction de 🪨). */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'index.html')); sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const G = sb.__G; const run = c => vm.runInContext(c, sb); G.phase = 'actions'; G.turn = 3;
const N = id => run('allPlayers().find(p=>p.civ.id==="' + id + '")');
const AG = run('AGENDAS_POOL'); const pac = AG.find(a => a.id === 'ag15'), opu = AG.find(a => a.id === 'ag14');
console.log('1. Pacifiste : rien fait → 0 ; un apaisement → 12 ; une guerre déclenchée → 0 pour toujours');
{ const m = N('martiens'); m.agenda = pac;
  if (pac.score(m) === 0) ok('sans apaisement : 0'); else ko('score sans apaisement : ' + pac.score(m));
  m.res.materials = 5; m.res.energy = 5; m.acLeft = 3;
  const r = run('calmerPopulation(allPlayers().find(p=>p.civ.id==="martiens"),"terriens")');
  if (r === true && pac.score(m) === 12) ok('Calmer la population → 12 VP'); else ko('calmer : ' + r + ', score ' + pac.score(m));
  run('declarerGuerre(allPlayers().find(p=>p.civ.id==="martiens"),allPlayers().find(p=>p.civ.id==="terriens"),"test","martiens")');
  if (pac.score(m) === 0 && m._pacifismeRompu === 'guerre') ok('guerre déclarée par lui → rompu (' + m._pacifismeRompu + ')'); else ko('score ' + pac.score(m) + ', rompu=' + m._pacifismeRompu);
  const t = N('terriens'); t.agenda = pac; t._apaisements = 1;
  if (pac.score(t) === 12) ok('la victime de cette guerre reste pacifiste'); else ko('victime rompue : ' + t._pacifismeRompu); }
console.log('2. Opulence : 4 tours en surproduction de 🪨');
{ const j = N('jupiteriens'); j.agenda = opu; const cap = run('realResCap(allPlayers().find(p=>p.civ.id==="jupiteriens")).materials');
  for (let k = 0; k < 4; k++) { G.turn = 4 + k; j.res.materials = cap + 2; run('surproductionVP()'); }
  if ((j._surprodMat || 0) === 4 && opu.score(j) === 10) ok('4 tours → 10 VP (compteur ' + j._surprodMat + ')'); else ko('compteur ' + j._surprodMat + ', score ' + opu.score(j));
  const c = N('ceinturiens'); c.agenda = opu; if (opu.score(c) === 0) ok('sans surproduction : 0'); else ko('score ' + opu.score(c)); }
console.log('3. Un Conquérant ne tire jamais Pacifiste');
{ let n = 0; for (let i = 0; i < 12; i++) { const sb2 = loadLogic(path.join(__dirname, '..', 'index.html')); sb2.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
    vm.runInContext('_aiPickAgendas()', sb2); for (const p of sb2.__G.ais) if (p._profil === 'guerrier' && p.agenda && p.agenda.id === 'ag15') n++; }
  if (!n) ok('0 sur 12 tirages'); else ko(n + ' Conquérant(s) pacifiste(s)'); }
console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Pacifiste et Opulence comptent comme Marc l\'a dit.');
