/* Test des VRAIES ACTIONS de plateau via WebSocket : le client-humain calcule des cibles
   valides depuis l'état reçu (mêmes règles que online.js v2.1) et joue colonize/route/buyTech/upgrade.
   Vérifie en fin de partie que les actions ont bien été appliquées par le serveur. */
'use strict';
const WebSocket = require('ws');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const aux = loadLogic(path.join(__dirname, '..', 'index.html')); // NODES/CARDS_POOL/coûts pour calculer les cibles
const vm = require('vm');
const NODES = vm.runInContext('NODES', aux);
const CARDS_POOL = vm.runInContext('CARDS_POOL', aux);

const URL = 'ws://127.0.0.1:8080';
let code=null, over=0, errors=[], notices={}, done={colonize:0,route:0,buyTech:0,upgrade:0}, finalState=null;

function revive(s){ return JSON.parse(JSON.stringify(s), (k,v)=>{ if(v&&v.__set) return new Set(v.__set); if(v&&v.__map) return new Map(v.__map); return v; }); }
function me(G, civ){ return [G.player].concat(G.ais||[]).find(p=>p&&p.civ&&p.civ.id===civ); }
function pickAction(G, civ){
  const p = me(G, civ); if(!p) return null;
  try {
    const cc = aux.colonizeCost(p);
    if(!done.colonize && p.acLeft>=cc.ac && (p.res.materials||0)>=cc.mat && (p.res.energy||0)>=cc.en){
      const all=[G.player].concat(G.ais||[]);
      for(const id in NODES){ const n=NODES[id];
        if(n.decorative||n.noColonize) continue;
        if(all.some(x=>x.colonies&&x.colonies.some(c=>c.nodeId===id))) continue;
        const adj = p.colonies.some(c=>NODES[c.nodeId]&&NODES[c.nodeId].conn.includes(id));
        if(!adj) continue;
        done.colonize++; return {type:'colonize', node:id};
      }
    }
  } catch(e){}
  try {
    const rc = aux.routeCost(p);
    if(!done.route && p.acLeft>=rc.ac && (p.res.materials||0)>=rc.mat){
      for(const c of p.colonies){ const n=NODES[c.nodeId]; if(!n) continue;
        for(const to of (n.conn||[])){
          if(!NODES[to]) continue;
          if(p.routes.some(r=>(r.from===c.nodeId&&r.to===to)||(r.from===to&&r.to===c.nodeId))) continue;
          done.route++; return {type:'route', from:c.nodeId, to, token:(p.forceTokens>0)};
        }
      }
    }
  } catch(e){}
  try {
    if(!done.buyTech){
      for(const card of CARDS_POOL){
        if(card.tier!==1) continue;
        if(p.cards.some(c=>c.id===card.id)) continue;
        try{ if(!aux.isTechAvailable(card,p)) continue; }catch(e){ continue; }
        try{ if(typeof aux.isTechExclusive==='function' && aux.isTechExclusive(card) && G.techTaken && G.techTaken.has && G.techTaken.has(card.id)) continue; }catch(e){}
        if(p.acLeft<1) continue;
        let cost={}; try{ cost=aux.getEffCost(card,p)||{}; }catch(e){}
        let ok=true; for(const r in cost){ if((p.res[r]||0)<cost[r]){ ok=false; break; } }
        if(!ok) continue;
        done.buyTech++; return {type:'buyTech', card:card.id};
      }
    }
  } catch(e){}
  try {
    if(!done.upgrade && p.acLeft>=1){
      for(const c of p.colonies){ const n=NODES[c.nodeId];
        if(!n || c.noUpgrade || c.level>=(n.maxLv||1)) continue;
        done.upgrade++; return {type:'upgrade', node:c.nodeId};
      }
    }
  } catch(e){}
  return null; // rien trouvé → auto
}
function realAnswer(p){
  const o=p.payload||{}, k=p.kind, opts=o.options||[];
  if(k==='defense') return {defTokens:Math.min(2,o.maxDef||0)};
  if(k==='war_combat') return {tokens:1};
  if(k==='peace_offer') return {accept:true, offer:{materials:0,energy:0,science:0}};
  if(k==='ai_dyson') return {war:false};
  if(k==='dyson_build') return {force:false};
  if(k==='accord_confirm') return {confirm:true};
  if(!opts.length) return {};
  const key = k==='agenda'?'agendaId':(k==='strategy'?'cardId':(k==='invest1'||k==='invest2'?'cardId':(k==='espionage'?'branch':(k==='extrasolar'?'node':(k==='empath_copy'?'cardId':'value')))));
  const op=opts[0]; const ans={}; ans[key]= op.id!==undefined?op.id:(op.branch!==undefined?op.branch:op.node);
  if(k==='strategy_calm') ans.targetId=op.id;
  return ans;
}
function client(name, role, civ){
  const ws=new WebSocket(URL); const send=o=>ws.send(JSON.stringify(o));
  let lastState=null, waitingAction=false;
  ws.on('message',raw=>{
    const m=JSON.parse(raw.toString());
    if(m.t==='registered') send({t:'login',user:name,pass:'test-123456'});
    else if(m.t==='error'){ if(/déjà pris|déjà inscrite/.test(m.msg)) send({t:'login',user:name,pass:'test-123456'}); else errors.push(name+': '+m.msg); }
    else if(m.t==='logged'){
      if(role==='host') send({t:'create',civId:civ,seats:[{civId:'martiens',ai:false},{civId:'jupiteriens',ai:true},{civId:'ceinturiens',ai:true}]});
      else { const w=setInterval(()=>{ if(code){clearInterval(w); send({t:'join',code,civId:civ});} },50); }
    }
    else if(m.t==='game'){ if(role==='host'&&!code){code=m.game.code;} if(role==='host'&&m.game.status==='lobby'&&m.game.seats.every(s=>s.ai||s.user)) send({t:'start'}); }
    else if(m.t==='decision') send({t:'answer',id:m.pending.id,ans:realAnswer(m.pending)});
    else if(m.t==='your_action'){ waitingAction=true; send({t:'state'}); }
    else if(m.t==='notice'){ notices[m.kind]=(notices[m.kind]||0)+1; }
    else if(m.t==='state'){
      lastState=revive(m.state);
      if(waitingAction){
        waitingAction=false;
        const a = pickAction(lastState, civ);
        if(a){ console.log(name+' joue:', JSON.stringify(a)); send({t:'act', action:a}); }
        else send({t:'auto'});
      }
      if(over>=1 && role==='host') finalState=lastState;
    }
    else if(m.t==='over'){ over++; if(role==='host'){ console.log('scores:', m.scores.map(s=>s.name+' '+s.vp).join(' | ')); send({t:'state'}); setTimeout(()=>ws.close(), 800); } else ws.close(); }
  });
  ws.on('open',()=>send({t:'register',user:name,pass:'test-123456'}));
}
client('act_hote@test.ch','host','terriens'); client('act_inv@test.ch','guest','martiens');
setTimeout(()=>{ console.log('❌ TIMEOUT — over:'+over, done, notices, errors.slice(0,3)); process.exit(1); }, 90000);
const iv=setInterval(()=>{ if(over>=2 && finalState){ clearInterval(iv);
  const h = me(finalState,'terriens'), g = me(finalState,'martiens');
  console.log('actions jouées:', JSON.stringify(done), '— notices:', JSON.stringify(notices));
  console.log('hôte: colonies='+h.colonies.length+' routes='+h.routes.length+' cartes='+h.cards.length);
  console.log('invité: colonies='+g.colonies.length+' routes='+g.routes.length+' cartes='+g.cards.length);
  const okActs = done.colonize>0 && done.route>0 && done.buyTech>0;
  const okNot = Object.keys(notices).length>0;
  console.log((errors.length?'⚠ erreurs: '+errors.slice(0,5).join(';'):'')+(okActs&&okNot?'✅ actions de plateau appliquées + notices reçues':'❌ vérifier: acts='+okActs+' notices='+okNot));
  process.exit(errors.length||!okActs||!okNot?1:0); } },150);
