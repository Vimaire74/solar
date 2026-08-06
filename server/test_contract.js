/* Test du CONTRAT DE RÉPONSES du vrai client (mêmes clés que online.js v2 :
   agendaId/cardId/branch/node/defTokens/tokens/accept/war/force/confirm) sur partie complète. */
'use strict';
const WebSocket = require('ws');
const URL = 'ws://127.0.0.1:8080';
let code=null, over=0, decisions={}, errors=[];
function realAnswer(p){
  const o=p.payload||{}, k=p.kind, opts=o.options||[];
  decisions[k]=(decisions[k]||0)+1;
  if(k==='defense') return {defTokens:Math.min(2,o.maxDef||0)};
  if(k==='war_combat') return {tokens:1};
  if(k==='peace_offer') return {accept:true, offer:{materials:0,energy:0,science:0}};
  if(k==='ai_dyson') return {war:false};
  if(k==='dyson_build') return {force:false};
  if(k==='accord_confirm') return {confirm:true};
  if(!opts.length) return {};
  const key = k==='agenda'?'agendaId':(k==='strategy'?'cardId':(k==='invest1'||k==='invest2'?'cardId':(k==='espionage'?'branch':(k==='extrasolar'?'node':(k==='empath_copy'?'cardId':'value')))));
  const op=opts[Math.floor(Math.random()*opts.length)]; const ans={};
  ans[key]= op.id!==undefined?op.id:(op.branch!==undefined?op.branch:op.node);
  if(k==='strategy_calm') ans.targetId=op.id;
  return ans;
}
function client(name, role){
  const ws=new WebSocket(URL); const send=o=>ws.send(JSON.stringify(o));
  ws.on('open',()=>send({t:'register',user:name,pass:'test-123456'}));
  ws.on('message',raw=>{
    const m=JSON.parse(raw.toString());
    if(m.t==='registered') send({t:'login',user:name,pass:'test-123456'});
    else if(m.t==='error'){ if(/déjà pris|déjà inscrite/.test(m.msg)) send({t:'login',user:name,pass:'test-123456'}); else errors.push(name+': '+m.msg); }
    else if(m.t==='logged'){
      if(role==='host') send({t:'create',civId:'terriens',seats:[{civId:'martiens',ai:false},{civId:'jupiteriens',ai:true},{civId:'ceinturiens',ai:true}]});
      else { const w=setInterval(()=>{ if(code){clearInterval(w); send({t:'join',code,civId:'martiens'});} },50); }
    }
    else if(m.t==='game'){ if(role==='host'&&!code){code=m.game.code;} if(role==='host'&&m.game.status==='lobby'&&m.game.seats.every(s=>s.ai||s.user)) send({t:'start'}); }
    else if(m.t==='decision') send({t:'answer',id:m.pending.id,ans:realAnswer(m.pending)});
    else if(m.t==='your_action') send(Math.random()<0.5?{t:'auto'}:{t:'act',action:{type:'pass'}});
    else if(m.t==='over'){ over++; if(role==='host'){ console.log('scores:', m.scores.map(s=>s.name+' '+s.vp).join(' | ')); } ws.close(); }
  });
}
client('ctr_hote@test.ch','host'); client('ctr_inv@test.ch','guest');
setTimeout(()=>{ console.log('❌ TIMEOUT', over, decisions, errors.slice(0,3)); process.exit(1); }, 60000);
const iv=setInterval(()=>{ if(over>=2){ clearInterval(iv);
  console.log('décisions par type:', JSON.stringify(decisions));
  console.log(errors.length? '⚠ erreurs: '+errors.slice(0,5).join(' ; ') : '✅ contrat de réponses du vrai client OK sur partie complète');
  process.exit(errors.length?1:0); } },100);
