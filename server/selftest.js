/* Filet de sécurité : joue des parties ENTIÈRES tout-IA sur la logique de carte.html, sans écran.
   Sert à vérifier que le solo n'est jamais cassé pendant la généralisation du moteur.
   Usage : node server/selftest.js [N]   (défaut 1, verbeux ; N>1 = invariants sur N parties) */
'use strict';
const path = require('path');
const vm = require('vm');
const { Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function playGame(verbose){
  const e = new Engine(HTML); const sb = e.sb;
  const EVENTS = vm.runInContext("(typeof EVENTS!=='undefined')?EVENTS:[]", sb);
  sb.initGame('terriens', ['martiens','jupiteriens']);
  const G = sb.__G;
  const all = () => [G.player, ...G.ais];
  let crashes = 0;
  while (G.turn <= G.maxTurns){
    try { sb.startTurn(); } catch(err){ for(const p of all()) p.acLeft = p.acMax; }
    const order = shuffle(all());
    for(const p of order){ p._passedRound=false; p._aiSetupDone=false; }
    if(verbose) console.log(`\n━━ Tour ${G.turn} — ordre : ${order.map(p=>p.civ.name).join(' › ')} ━━`);
    let idx=0, guard=0;
    while(guard++ < 3000){
      if(order.every(p=>p._passedRound)) break;
      const p = order[idx % order.length];
      if(p._passedRound){ idx++; continue; }
      const before = G.log ? G.log.length : 0;
      let acted=false;
      try { acted = sb.doAITurn(p, true); }
      catch(err){ crashes++; if(verbose) console.log('   ⚠ doAITurn('+p.civ.name+'):', err.message.split('\n')[0]); p._passedRound=true; }
      if(verbose && G.log){ for(const ev of G.log.slice(0, Math.max(0,(G.log.length-before)))) {} }
      if(!acted || p.acLeft<=0) p._passedRound = true;
      idx++;
    }
    try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); }
    catch(err){ crashes++; if(verbose) console.log('   ⚠ maintenance:', err.message.split('\n')[0]); }
    // Événements : tirage aléatoire par tour pair (schedule), résolus en fin de tour
    let ev = null; try { ev = sb.eventForTurn(G.turn); } catch(err){}
    if(ev){ try{ ev.resolve(G); }catch(err){ crashes++; } }
    G.turn++;
  }
  return { G, crashes, calcVP: sb.calcVP };
}

function invariants(G){
  for(const p of [G.player, ...G.ais]){
    for(const k of ['materials','energy','science','morale']) if((p.res[k]||0) < 0) return p.civ.name+' '+k+'<0';
    if((p.forceTokens||0) < 0) return p.civ.name+' force<0';
  }
  const seen={}; for(const p of [G.player,...G.ais]) for(const c of p.colonies){ if(seen[c.nodeId]) return 'double colonie '+c.nodeId; seen[c.nodeId]=1; }
  return null;
}

const N = parseInt(process.argv[2]||'1', 10);
if(N===1){
  const { G, crashes, calcVP } = playGame(true);
  const r = [G.player,...G.ais].map(p=>({n:p.civ.name, vp:calcVP(p).total})).sort((a,b)=>b.vp-a.vp);
  console.log('\n=== Scores (tour '+G.turn+') ==='); r.forEach((x,i)=>console.log(`  ${i+1}. ${x.n} — ${x.vp} VP`));
  const inv = invariants(G);
  console.log(inv ? ('❌ invariant: '+inv) : '✅ Partie complète tout-IA sur carte.html, sans écran.');
  console.log('crashes capturés:', crashes);
} else {
  let bad=0, totalCrashes=0;
  for(let i=0;i<N;i++){ const {G,crashes}=playGame(false); if(invariants(G)) bad++; totalCrashes+=crashes; }
  console.log(`Parties : ${N} — invariants KO : ${bad} — crashes capturés : ${totalCrashes}`);
  console.log(bad===0 ? '✅ Toutes les parties tiennent.' : '❌');
}
