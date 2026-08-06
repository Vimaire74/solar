'use strict';
const WebSocket=require('ws'); const http=require('http');
let code=null, over=false, botJoined=false, errors=[];
function ans(p){const o=p.payload||{},k=p.kind,opts=o.options||[];
  if(k==='defense')return{defTokens:1}; if(k==='war_combat')return{tokens:1};
  if(k==='peace_offer')return{accept:true,offer:{materials:0,energy:0,science:0}};
  if(k==='ai_dyson')return{war:false}; if(k==='dyson_build')return{force:false}; if(k==='accord_confirm')return{confirm:true};
  if(!opts.length)return{};
  const key=k==='agenda'?'agendaId':(k==='strategy'?'cardId':(k==='invest1'||k==='invest2'?'cardId':(k==='espionage'?'branch':(k==='extrasolar'?'node':(k==='empath_copy'?'cardId':'value')))));
  const a={};a[key]=opts[0].id!==undefined?opts[0].id:(opts[0].branch||opts[0].node); if(k==='strategy_calm')a.targetId=opts[0].id; return a;}
const ws=new WebSocket('ws://127.0.0.1:8080'); const send=o=>ws.send(JSON.stringify(o));
let myAgendaSeen=null, foeAgendaHidden=null;
ws.on('open',()=>send({t:'register',user:'hote_bot_test@test.ch',pass:'test-123456'}));
ws.on('message',raw=>{ const m=JSON.parse(raw.toString());
  if(m.t==='registered')send({t:'login',user:'hote_bot_test@test.ch',pass:'test-123456'});
  else if(m.t==='error'){ if(/déjà pris|déjà inscrite/.test(m.msg))send({t:'login',user:'hote_bot_test@test.ch',pass:'test-123456'}); else errors.push(m.msg); }
  else if(m.t==='logged')send({t:'create',civId:'terriens',seats:[{civId:'martiens',ai:false},{civId:'jupiteriens',ai:true}]});
  else if(m.t==='game'){ if(!code){ code=m.game.code;
      http.get('http://127.0.0.1:8080/bot?fast=1&code='+code,r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>console.log('/bot →',d));});
    }
    if(m.game.status==='lobby'&&m.game.seats.every(s=>s.ai||s.user)){ botJoined=true; send({t:'start'}); } }
  else if(m.t==='decision')send({t:'answer',id:m.pending.id,ans:ans(m.pending)});
  else if(m.t==='your_action')send({t:'auto'});
  else if(m.t==='state'){ const g=m.state; const mine=g.player&&g.player.civ&&(g.player.civ.id==='terriens'?g.player:null)||([g.player].concat(g.ais||[]).find(p=>p.civ.id==='terriens'));
    const foe=[g.player].concat(g.ais||[]).find(p=>p.civ.id==='martiens');
    if(mine&&mine.agenda) myAgendaSeen = !!mine.agenda.id;
    if(foe&&foe.agenda) foeAgendaHidden = !!foe.agenda.hidden; }
  else if(m.t==='turn'||m.t==='waiting'){ if(Math.random()<0.2) send({t:'state'}); }
  else if(m.t==='over'){ over=true; console.log('scores:',m.scores.map(s=>s.name+' '+s.vp).join(' | ')); ws.close(); }
});
setTimeout(()=>{ console.log('❌ TIMEOUT over='+over,'bot='+botJoined,errors.slice(0,3)); process.exit(1); },60000);
const iv=setInterval(()=>{ if(over){ clearInterval(iv);
  console.log('bot a rejoint:',botJoined,'— mon agenda visible:',myAgendaSeen,'— agenda adverse masqué:',foeAgendaHidden);
  const ok=botJoined&&myAgendaSeen===true&&foeAgendaHidden===true&&!errors.length;
  console.log(ok?'✅ bot + filtrage des agendas OK sur partie complète':'❌ '+JSON.stringify({botJoined,myAgendaSeen,foeAgendaHidden,errors:errors.slice(0,3)}));
  process.exit(ok?0:1); } },150);
