/* TEST — UN JETON LOUÉ NE VAUT QUELQUE CHOSE QUE SI UN COMBAT EST POSSIBLE CE TOUR (05/10/2026, v11.54)
   Partie 157e79 : six achats de jetons temporaires sans jamais combattre. Usage : node test_jetons_loues.js */
'use strict';
const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html')); sb.initGame('jupiteriens', ['martiens', 'ceinturiens']);
const G = sb.__G; const run = c => vm.runInContext(c, sb); G.turn = 4; G.phase = 'actions';
run('var c=allPlayers().find(p=>p.civ.id==="ceinturiens"); c.forceTokens=4; setTens("jupiteriens","ceinturiens",7);');
const pos = () => run('evaluerPosition(c)');
console.log('1. En paix (tension 7/10 subie), deux jetons loués ne changent pas la note');
{ const a = pos(); run('c.forceTokens+=2; c.milLoseNext=2;'); const b = pos(); run('c.forceTokens-=2; c.milLoseNext=0;');
  if (Math.abs(a - b) < 1e-9) ok('note identique (' + a.toFixed(2) + ')'); else ko('les jetons loués valent ' + (b - a).toFixed(2) + ' en paix'); }
console.log('2. En guerre, ils comptent');
{ run('declarerGuerre(allPlayers().find(p=>p.civ.id==="jupiteriens"),c,"test","jupiteriens")');
  const a = pos(); run('c.forceTokens+=2; c.milLoseNext=2;'); const b = pos(); run('c.forceTokens-=2; c.milLoseNext=0;');
  if (b > a) ok('+' + (b - a).toFixed(2) + ' en guerre'); else ko('aucune valeur en guerre'); }
console.log('3. Les jetons permanents comptent toujours, guerre ou pas');
{ run('G.wars=[]; if(typeof syncWarState==="function")syncWarState();'); const a = pos(); run('c.forceTokens+=2;'); const b = pos(); run('c.forceTokens-=2;');
  if (b > a) ok('+' + (b - a).toFixed(2) + ' pour 2 jetons permanents en paix'); else ko('jetons permanents sans valeur'); }
console.log('\n' + '═'.repeat(70));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); } else console.log('✅ Un jeton loué ne vaut que le combat qu\'il peut livrer.');
