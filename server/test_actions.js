/* Test des VRAIES ACTIONS de plateau via WebSocket : le client-humain calcule des cibles
   valides depuis l'état reçu (mêmes règles que online.js v2.1) et joue colonize/route/buyTech/upgrade.
   Vérifie en fin de partie que les actions ont bien été appliquées par le serveur. */
'use strict';
const WebSocket = require('ws');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const aux = loadLogic(path.join(__dirname, '..', 'play.html')); // NODES/CARDS_POOL/coûts pour calculer les cibles
const vm = require('vm');
const NODES = vm.runInContext('NODES', aux);
const CARDS_POOL = vm.runInContext('CARDS_POOL', aux);

const URL = 'ws://127.0.0.1:8080';
let code=null, over=0, errors=[], notices={}, done={colonize:0,route:0,buyTech:0,upgrade:0}, finalState=null;
/* JOURNAL DES ÉCHANGES — affiché UNIQUEMENT en cas de blocage. Quand ce banc tombe en timeout, la
   seule question utile est « quel message est arrivé en dernier, et à qui ? ». Sans cette trace on
   la devine, et deviner sur un protocole asynchrone coûte des heures. */
const trace=[];
const tracer=(qui,m)=>{ if(trace.length<400) trace.push(qui+' ← '+m.t+(m.kind?'/'+m.kind:'')+(m.pending?'/'+m.pending.kind+'#'+m.pending.id:'')); };

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
/* ═══════ RÉPONDRE À CHAQUE QUESTION DU MOTEUR ═══════
   ⚠️ CE BANC EST TOMBÉ EN TIMEOUT PENDANT DES SEMAINES, ET LA CAUSE N'ÉTAIT PAS CELLE QU'ON CROIT.
   Il calait juste après la première colonisation. Mon premier diagnostic — « il manque des `kind` à
   ce répondeur » — était FAUX, et il était faux d'une manière instructive : j'avais ajouté un
   compteur de kinds inconnus, il avait désigné `event_announce`, et j'ai pris ce doigt pointé pour
   une preuve. `event_announce` se contentait très bien de `{}`.
   La vraie cause était un TYPE DE MESSAGE, pas une question : `confirm_pending`. Depuis l'ajout des
   actions annulables, le serveur ne les applique plus tout de suite — il les TIENT et attend
   `{t:'confirm'}`. Ce banc ne connaissait pas ce message, ne répondait rien, et la partie
   l'attendait jusqu'au bout du chronomètre. C'est la TRACE des échanges, pas le compteur, qui a
   donné la réponse : le dernier message reçu était `confirm_pending`.

   DEUX LEÇONS, CONSERVÉES DANS LE CODE :
     1. un répondeur qui rend `{}` par défaut échoue en silence → on recense les inconnus, kinds ET
        types de message, et on garde une trace des échanges pour le jour où ça recale ;
     2. un recensement est une PISTE, jamais un verdict. Le banc les liste sans accuser.

   Il manquait quand même huit `kind` (accord_request, event_comm, event_diplo, forced_war,
   human_dyson, peace_answer, raid_target, route_capture) : ils auraient bloqué plus loin. Les formes
   de réponse ci-dessous ne sont pas devinées — chacune est celle que lit la continuation
   correspondante dans moteur.js, dont le nom est donné en commentaire. */
const kindsInconnus = {};
/* Les `kind` sont les QUESTIONS ; les `t` sont les TYPES DE MESSAGE du protocole. Un banc peut
   caler sur les deux, et c'est le second qui m'a eu. On recense donc les deux. */
const typesInconnus = {};
/* Questions auxquelles ce banc a répondu, et celles qu'on lui a renvoyées deux fois. */
const repondues = new Map(); const doublons = [];
function realAnswer(p){
  const o=p.payload||{}, k=p.kind, opts=o.options||[];
  /* — combat et guerre — */
  if(k==='defense') return {defTokens:Math.min(2,o.maxDef||0)};
  if(k==='war_combat') return {tokens:1};
  if(k==='peace_offer') return {accept:true, offer:{materials:0,energy:0,science:0}};
  if(k==='peace_answer') return {id:'yes', accept:true};          // stPaixReponse
  if(k==='forced_war'){                                            // lit ans.peace / ans.route (nombre) / ans.colony
    if(o.colTarget) return {colony:o.colTarget};
    if(Array.isArray(o.routes)&&o.routes.length) return {route:0};
    return {peace:true};
  }
  /* — diplomatie — */
  if(k==='accord_request') return {id:'yes', accept:true};         // stAccordReponse
  if(k==='accord_confirm') return {confirm:true};
  if(k==='event_comm'){                                            // stAccordCommChoisi lit ans.aiId
    const c=o.cands||[]; return {aiId:c.length?c[0].id:null};
  }
  if(k==='event_diplo'){                                           // stDiploChoisi lit ans.selected (tableau)
    const r=o.rows||[]; return {selected:r.length?[r[0].id]:[]};
  }
  /* — Sphère de Dyson — */
  if(k==='ai_dyson') return {war:false};
  if(k==='human_dyson') return {war:false};                        // ne pas déclencher la guerre : ce banc mesure les actions de plateau
  if(k==='dyson_build') return {force:false};
  /* — pillage et routes — */
  if(k==='raid_target'){                                           // lit ans.targetId || ans.value || ans.id
    return {targetId:opts.length?opts[0].id:null};
  }
  if(k==='route_capture') return {capture:true};                   // adaptateur adCaptureRoute → booléen
  /* — NOTICES BLOQUANTES : le moteur ne demande rien, il attend un accusé de réception. `{}` EST la
       bonne réponse, et c'est le clic « Continuer » d'un vrai joueur. On les nomme pour qu'elles
       cessent d'apparaître dans la liste des « kinds répondus au hasard » : un banc qui avertit à
       chaque partie n'avertit plus de rien, et c'est ce bruit qui m'a fait accuser `event_announce`
       du blocage alors qu'il n'y était pour rien. */
  if(k==='event_announce'||k==='event_result'||k==='war_result'||k==='eot'||k==='raid_hit') return {};
  /* — le reste passe par une liste d'options — */
  if(!opts.length){ kindsInconnus[k]=(kindsInconnus[k]||0)+1; return {}; }
  /* `espionage` : la sélection à cocher (`{nation,branch,ids}`) est couverte en profondeur par
     test_espionnage.js. Ici on prend la première option par son `id`, chemin que le moteur accepte
     toujours (`_espOptions(nat).find(o=>o.id===choisi)`). */
  const key = k==='agenda'?'agendaId':(k==='strategy'?'cardId':(k==='invest1'||k==='invest2'?'cardId':(k==='espionage'?'id':(k==='extrasolar'?'node':(k==='empath_copy'?'cardId':'value')))));
  const op=opts[0]; const ans={}; ans[key]= op.id!==undefined?op.id:(op.branch!==undefined?op.branch:op.node);
  if(k==='strategy_calm') ans.targetId=op.id;
  return ans;
}
function client(name, role, civ){
  const ws=new WebSocket(URL); const send=o=>ws.send(JSON.stringify(o));
  let lastState=null, waitingAction=false;
  ws.on('message',raw=>{
    const m=JSON.parse(raw.toString());
    tracer(role,m);
    if(m.t==='registered') send({t:'login',user:name,pass:'test-123456'});
    else if(m.t==='error'){
      if(/déjà pris|déjà inscrite/.test(m.msg)) send({t:'login',user:name,pass:'test-123456'});
      else {
        let d=m.msg;
        if(/périmée/.test(m.msg)&&m.id) d+=' → '+(repondues.get(m.id)||'(jamais reçue par ce client)')+' #'+m.id
          +(doublons.some(x=>x.endsWith('#'+m.id))?' [RENVOYÉE DEUX FOIS]':' [reçue une seule fois]');
        errors.push(name+': '+d);
      }
    }
    else if(m.t==='logged'){
      if(role==='host') send({t:'create',civId:civ,seats:[{civId:'martiens',ai:false},{civId:'jupiteriens',ai:true},{civId:'ceinturiens',ai:true}]});
      else { const w=setInterval(()=>{ if(code){clearInterval(w); send({t:'join',code,civId:civ});} },50); }
    }
    else if(m.t==='game'){ if(role==='host'&&!code){code=m.game.code;} if(role==='host'&&m.game.status==='lobby'&&m.game.seats.every(s=>s.ai||s.user)) send({t:'start'}); }
    else if(m.t==='decision'){
      /* Qui a-t-on déjà répondu ? Une « décision périmée » est soit une question à laquelle ce
         client a répondu DEUX fois (le serveur nous l'a renvoyée), soit une question que le moteur
         avait déjà retirée de la file. Sans cette trace, impossible de distinguer les deux. */
      if(repondues.has(m.pending.id)) doublons.push(m.pending.kind+'#'+m.pending.id);
      repondues.set(m.pending.id, m.pending.kind);
      send({t:'answer',id:m.pending.id,ans:realAnswer(m.pending)});
    }
    else if(m.t==='your_action'){ waitingAction=true; send({t:'state'}); }
    else if(m.t==='notice'){ notices[m.kind]=(notices[m.kind]||0)+1; }
    /* ⚠️ LA BARRE VALIDER / ANNULER. Une action annulable réussie n'est pas appliquée tout de
       suite : le serveur la TIENT et envoie `confirm_pending`, en attendant `{t:'confirm'}` (valider)
       ou `{t:'undo'}` (annuler). Ce banc ne connaissait pas ce mécanisme, ajouté après son écriture :
       il colonisait, recevait `confirm_pending`, ne répondait rien, et la partie l'attendait jusqu'au
       bout du chronomètre. C'est ÇA qui le faisait tomber en timeout — pas les kinds manquants, que
       j'avais accusés en premier sur la foi du seul compteur. Un joueur valide ce qu'il vient de
       jouer : on valide. */
    else if(m.t==='confirm_pending'){ send({t:'confirm'}); }
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
    /* Purement informatifs : rien à répondre, et c'est voulu. */
    else if(m.t==='waiting'||m.t==='turn'||m.t==='log'||m.t==='started'||m.t==='absence'||m.t==='vote'||m.t==='pong'||m.t==='undone'||m.t==='bilan_attente'||m.t==='confirm'){ }
    /* Tout le reste est un message que ce banc ne sait pas traiter. On le RECENSE au lieu de le
       laisser tomber : c'est un `t` non géré (`confirm_pending`) qui l'a fait caler des semaines. */
    else { typesInconnus[m.t]=(typesInconnus[m.t]||0)+1; }
  });
  ws.on('open',()=>send({t:'register',user:name,pass:'test-123456'}));
}
client('act_hote@test.ch','host','terriens'); client('act_inv@test.ch','guest','martiens');
setTimeout(()=>{
  console.log('❌ TIMEOUT — over:'+over, done, notices, errors.slice(0,3));
  const inc=Object.keys(kindsInconnus), tin=Object.keys(typesInconnus);
  /* ⚠️ NE PAS DÉSIGNER DE COUPABLE. Ces deux listes sont des PISTES, pas un diagnostic : la première
     fois, `event_announce` y figurait et n'y était pour rien — `{}` lui suffisait amplement. C'est
     la trace ci-dessous qui a donné la vraie réponse. On liste, on n'accuse pas. */
  if(inc.length) console.log('   piste — questions répondues au hasard ({}) : '+inc.join(', '));
  if(tin.length) console.log('   piste — types de message ignorés : '+tin.join(', '));
  if(!inc.length && !tin.length) console.log('   (rien d\'inconnu côté protocole)');
  console.log('   Le dernier échange de la trace ci-dessous est le point d\'arrêt réel.');
  console.log('   ── 25 derniers échanges ──'); trace.slice(-25).forEach(l=>console.log('      '+l));
  process.exit(1); }, 90000);
const iv=setInterval(()=>{ if(over>=2 && finalState){ clearInterval(iv);
  const h = me(finalState,'terriens'), g = me(finalState,'martiens');
  console.log('actions jouées:', JSON.stringify(done), '— notices:', JSON.stringify(notices));
  const inc=Object.keys(kindsInconnus);
  if(inc.length) console.log('⚠️ kinds sans réponse dédiée (répondu {} au hasard) : '+inc.join(', '));
  const tinF=Object.keys(typesInconnus);
  if(tinF.length) console.log('⚠️ types de message ignorés : '+tinF.join(', '));
  console.log('hôte: colonies='+h.colonies.length+' routes='+h.routes.length+' cartes='+h.cards.length);
  console.log('invité: colonies='+g.colonies.length+' routes='+g.routes.length+' cartes='+g.cards.length);
  const okActs = done.colonize>0 && done.route>0 && done.buyTech>0;
  const okNot = Object.keys(notices).length>0;
  console.log((errors.length?'⚠ erreurs: '+errors.slice(0,5).join(';'):'')+(okActs&&okNot?'✅ actions de plateau appliquées + notices reçues':'❌ vérifier: acts='+okActs+' notices='+okNot));
  process.exit(errors.length||!okActs||!okNot?1:0); } },150);
