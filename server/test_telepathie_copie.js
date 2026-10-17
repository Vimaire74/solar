/* TEST — LA TÉLÉPATHIE COPIE COMME L'ESPIONNAGE (06/10/2026, v11.61, règle §166.3) + en-tête de l'achat militaire d'un ordinateur.
   Partie 9bcb76 : IA Défensive copiée par Télépathie → immunité oui, +4 jetons non. Usage : node test_telepathie_copie.js */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html')); sb.initGame('jupiteriens', ['martiens']);
const G = sb.__G; const run = c => vm.runInContext(c, sb); G.phase = 'actions'; G.turn = 9;
run('var J_=G.player, M_=allPlayers().find(p=>p.civ.id==="martiens"); var iad=CARDS_POOL.find(c=>c.id==="iadef3"); M_.cards.push({...iad}); J_.forceTokens=16;');
console.log('1. Copie de l\'IA Défensive par Télépathie');
{ run('copieEmpathe(J_,"iadef3")');
  const jet = run('J_.forceTokens'), imm = run('hasSpec(J_,"ia_immune")');
  if (jet === 20) ok('16 → 20 jetons'); else ko('jetons après copie : ' + jet + ' (attendu 20)');
  if (imm) ok('immunité aux raids copiée'); else ko('immunité absente'); }
console.log('2. Un ordinateur qui achète une carte militaire a sa ligne de titre au journal');
{ run('G.milRiver=G.milRiver||[]; var cru=CARDS_POOL.find(c=>c.warForce)||CARDS_POOL.find(c=>c.type==="militaire"); if(!G.milRiver.some(c=>c.id===cru.id))G.milRiver.push(cru); M_.res.energy=10;M_.res.materials=10;M_.res.science=10;M_.acLeft=5; var av=G.log.length; buyGeneral(cru.id,M_);');
  const l = run('G.log.slice(0,G.log.length-av).map(e=>(e.entete?"[T] ":"")+String(e.msg||"").replace(/<[^>]+>/g,"")).join(" | ")');
  if (/\[T\].*(achète|buys)/.test(l)) ok(l.slice(0, 120)); else ko('pas d\'en-tête : ' + l.slice(0, 160)); }
console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Télépathie = espionnage ; achat militaire titré.');
