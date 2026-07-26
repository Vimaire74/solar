/* Solar Conquest — couche EN LIGNE v2 : client WebSocket du SERVEUR AUTORITAIRE.
   Remplace l'ancienne couche PHP/polling (archivée dans server/php/online.js).
   À servir à la racine du site : index.html contient déjà <script src="online.js"></script> (optionnel —
   si ce fichier manque, le solo fonctionne normalement).
   Modèle : l'état vit sur le serveur (live.solar-game.com). Ce client envoie des INTENTIONS
   (answer / act / auto), reçoit décisions + état, et RÉAFFICHE via le rendu existant du jeu
   (scSetG + rehydrateState + refreshWarViews + render).
   v2.0 (rodage) : décisions complètes ; tours d'action = « IA joue pour moi » ou « Passer »
   (le branchement des actions de plateau — coloniser/route/tech — viendra à l'itération suivante). */
(function(){
'use strict';

// ───────────────────────── Config serveur ─────────────────────────
const LOCAL = (location.protocol === 'file:' || /^(localhost|127\.)/.test(location.hostname));
const SERVER_URL = LOCAL ? 'ws://127.0.0.1:8080' : 'wss://live.solar-game.com';

// ───────────────────────── État de session ─────────────────────────
const STATE = { ws:null, connected:false, user:null, token:null, tier:1,
                game:null, myCiv:null, isHost:false, started:false,
                _answering:false, _lastStateReq:0, _reconnectTimer:null, _pingTimer:null };

// ───────────────────────── Transport WebSocket ─────────────────────────
function connect(onReady){
  if (STATE.ws && STATE.ws.readyState === 1){ if(onReady) onReady(); return; }
  status('Connexion au serveur…');
  let ws;
  try { ws = new WebSocket(SERVER_URL); }
  catch(e){ status('⚠️ Serveur injoignable'); return; }
  STATE.ws = ws;
  ws.onopen = () => {
    STATE.connected = true;
    hideStatus();
    clearInterval(STATE._pingTimer);
    STATE._pingTimer = setInterval(()=>send({t:'ping'}), 25000);
    // reprise de session : token puis re-join automatique de la partie en cours
    if (STATE.token) send({t:'token', token:STATE.token});
    if (onReady) onReady();
  };
  ws.onmessage = (ev) => { let m; try{ m = JSON.parse(ev.data); }catch(e){ return; } handle(m); };
  ws.onclose = () => {
    STATE.connected = false;
    clearInterval(STATE._pingTimer);
    // reconnexion systématique dès qu'on a une session (pas seulement en partie)
    if (STATE.user || STATE.token){ status('🔌 Connexion perdue — reconnexion en cours…'); scheduleReconnect(); }
  };
  ws.onerror = () => {};
}
function scheduleReconnect(){
  clearTimeout(STATE._reconnectTimer);
  STATE._reconnectTimer = setTimeout(()=>{
    if (STATE.connected) return;
    connect(()=>{ /* onopen renvoie le token ; le re-join se fait sur 'logged' */ });
    scheduleReconnect(); // boucle : retente tant que ce n'est pas rouvert
  }, 3000);
}
// Au retour sur l'onglet (Firefox coupe parfois les WebSockets en arrière-plan) : re-vérifier la connexion.
try {
  document.addEventListener('visibilitychange', ()=>{
    if (!document.hidden && !STATE.connected && (STATE.user || STATE.token)) connect(()=>{});
  });
  window.addEventListener('focus', ()=>{ if (!STATE.connected && (STATE.user || STATE.token)) connect(()=>{}); });
} catch(e){}
function send(obj){ if (STATE.ws && STATE.ws.readyState === 1){ try{ STATE.ws.send(JSON.stringify(obj)); }catch(e){} } }

// Demande d'état (throttlée) : le serveur renvoie {t:'state'}.
function reqState(force){
  const now = Date.now();
  if (!force && now - STATE._lastStateReq < 600) return;
  STATE._lastStateReq = now;
  send({t:'state'});
}

// ───────────────────────── Réception des messages serveur ─────────────────────────
let _errCb = null; // affichage d'erreur contextuel (formulaires)
function handle(m){
  STATE._lastMsg = Date.now();
  switch(m.t){
    case 'registered':
      send({t:'login', user:m.user, pass:STATE._pendingPass||''});
      break;
    case 'logged': {
      STATE.user = m.user; STATE.token = m.token; STATE.tier = m.tier||1;
      try{ localStorage.setItem('sc_ws_token', m.token); localStorage.setItem('sc_ws_user', m.user); }catch(e){}
      hideStatus();
      let code = (STATE.game && STATE.game.code) || null;
      if (!code){ try{ code = localStorage.getItem('sc_ws_game'); }catch(e){} } // partie mémorisée
      if (code){ send({t:'join', code}); }
      else if (STATE._afterLogin){ const f=STATE._afterLogin; STATE._afterLogin=null; f(); }
      break;
    }
    case 'game':
      STATE.game = m.game;
      if (!STATE.myCiv){ const s = m.game.seats.find(x=>x.user===STATE.user); if(s) STATE.myCiv = s.civId; }
      STATE.isHost = (m.game.host === STATE.user);
      try{ localStorage.setItem('sc_ws_game', m.game.code); }catch(e){}
      if (m.game.status === 'lobby') renderWait();
      else if (m.game.status === 'playing' && !STATE.started){ STATE.started = true; installIntercepts(); hideOverlay(); revealGameUI(); reqState(true); send({t:'resync'}); }
      break;
    case 'started':
      STATE.started = true;
      installIntercepts();
      hideOverlay(); revealGameUI();
      status('Partie lancée — synchronisation…');
      reqState(true);
      break;
    case 'decision':
      onDecision(m.pending);
      break;
    case 'your_action':
      STATE._confirmPending=false; hideConfirmBar();
      onMyActionTurn();
      break;
    case 'confirm_pending':
      // Le serveur tient une action annulable → afficher l'état résultant + la barre Valider/Annuler.
      STATE._confirmPending=true; STATE._myTurn=false; turnBar(false); hideWaitBlock();
      reqState(true);
      showConfirmBar();
      break;
    case 'turn':
      if (m.civId !== STATE.myCiv){ STATE._myTurn=false; turnBar(false); status('Tour '+(m.turn||'')+' — au tour de '+civLabel(m.civId)+'…'); showWaitBlock(); }
      reqState();
      break;
    case 'waiting':
      if (m.civId !== STATE.myCiv){ STATE._myTurn=false; turnBar(false); status('Choix de '+civLabel(m.civId)+'…'); showWaitBlock(); }
      reqState();
      break;
    case 'log': // actions des autres joueurs → pop-up rouge (comme les tours d'IA en solo)
      try{
        const txts=(m.entries||[]).map(e=>String((e&&e.msg)||e).replace(/<[^>]+>/g,'').trim()).filter(Boolean);
        if(txts.length) showLogToast(txts);
        txts.forEach(t=>console.log('[JEU]', t));
      }catch(e){}
      reqState();
      break;
    case 'notice':
      if(m.kind==='result') showResultToast(m.payload&&m.payload.lines||[]);
      else showNotice(m);
      reqState();
      break;
    case 'state':
      applyState(m.state);
      break;
    case 'over':
      STATE.started = false;
      STATE._myTurn=false; turnBar(false);
      try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
      reqState(true);
      showFinal(m.scores||[]);
      break;
    case 'error':
      console.warn('[SC] serveur:', m.msg);
      if (/introuvable/.test(m.msg||'') && STATE.user){
        // la partie mémorisée n'existe plus (serveur redéployé) : on l'oublie et on va au lobby
        try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
        STATE.game=null;
        if (!STATE.started) screenLobby();
      }
      else if (/token/.test(m.msg||'')){
        // token invalide (ex. serveur redémarré) : redemander le mot de passe, pseudo prérempli — PAS de blocage silencieux
        STATE.token=null; try{localStorage.removeItem('sc_ws_token');}catch(e){}
        status('Session expirée — reconnecte-toi.');
        screenAuth('login');
      }
      else if (_errCb){ _errCb(m.msg); }
      else status('⚠️ '+m.msg);
      break;
    case 'game_ended':
      // partie quittée/terminée par un joueur → on libère tout et on revient au lobby (fix #3)
      STATE.started=false; STATE._myTurn=false; STATE._confirmPending=false;
      STATE.game=null; STATE.myCiv=null;
      try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
      hideWaitBlock(); hideConfirmBar(); turnBar(false); closeDecision();
      status(m.by && m.by!==STATE.user ? (m.by+' a quitté — retour au lobby') : 'Partie quittée.');
      screenLobby();
      break;
    case 'pong': break;
  }
}

// ───────────────────────── Affichage de l'état reçu ─────────────────────────
function applyState(state){
  try {
    // mémoriser l'onglet actif (Carte/Techs/Empire/Diplo/Journal) pour ne pas revenir à la carte après chaque sync
    let activeTab=null;
    try{ const t=document.querySelector('.mtab.active'); if(t) activeTab=t.getAttribute('data-tab'); }catch(e){}
    // mémoriser la VUE CARTE locale (global vs zoom + planète centrée) : c'est de l'affichage CLIENT,
    // le serveur ne doit pas la réinitialiser à chaque synchro (sinon retour forcé à la carte globale).
    let vView=null, vZoom=null;
    try{ const G0=scGetG(); if(G0){ vView=G0.mapView; vZoom=G0._zoomNode; } }catch(e){}
    // reconstruire Set/Map (le serveur envoie __set/__map)
    const g = (typeof scDeserialize === 'function') ? scDeserialize(JSON.stringify(state)) : state;
    if (vView!=null) g.mapView = vView;       // conserver la vue carte du joueur
    if (vZoom!=null) g._zoomNode = vZoom;
    if (typeof scSetG === 'function') scSetG(g);
    if (typeof rehydrateState === 'function') rehydrateState(g);
    if (typeof scSetLocalHuman === 'function' && STATE.myCiv) scSetLocalHuman(STATE.myCiv);
    if (typeof refreshWarViews === 'function') refreshWarViews();
    renderBoard();
    refreshJournal(g);   // le log arrive dans l'état serveur ; render() ne le redessine pas → on le fait ici
    // restaurer l'onglet actif s'il a été réinitialisé par le rendu
    try{
      if(activeTab && typeof uiTab==='function'){
        const cur=document.querySelector('.mtab.active');
        if(!cur || cur.getAttribute('data-tab')!==activeTab) uiTab(activeTab);
      }
    }catch(e){}
  } catch(e){ console.error('[SC] applyState:', e); }
}
function renderBoard(){ try { if (window.render) window.render(); } catch(e){} }
// Redessine le panneau Journal depuis G.log (en solo c'est addLog qui le fait ; en ligne le log
// vient tout fait dans l'état serveur, donc on le reconstruit à chaque synchro).
function refreshJournal(g){
  try {
    const el = document.getElementById('log-content');
    if (!el || !g || !Array.isArray(g.log)) return;
    const color = (window._logColorNations) ? window._logColorNations : (s=>s);
    el.innerHTML = g.log.map(e => '<div class="log-e '+(e.cls||'')+'">'+color((e&&e.msg)||'')+'</div>').join('');
  } catch(e){}
}

// ───────────────────────── Décisions (routées par le serveur) ─────────────────────────
function onDecision(pending){
  if (STATE._answering) return;
  STATE._answering = true;
  STATE._myTurn=false; turnBar(false);
  hideWaitBlock();
  reqState();
  const finish=(ans)=>{
    STATE._realDecide=null;
    send({t:'answer', id:pending.id, ans:ans});
    STATE._answering = false;
    showWaitBlock();
    status('En attente des autres joueurs…');
  };
  // VRAIES modales du jeu (même graphisme qu'en solo) pour ces décisions :
  if(pending.kind==='agenda' && showAgendaReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='strategy' && showStrategyReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='invest1' && showInvestReal(pending,1)){ STATE._realDecide=finish; return; }
  if(pending.kind==='invest2' && showInvestReal(pending,2)){ STATE._realDecide=finish; return; }
  // sinon : panneau générique (agenda, événements, guerre, etc.)
  askLocalDecision(pending).then(finish).catch(()=>{ STATE._answering = false; });
}

// ── Rendu dans les VRAIES modales du jeu (réutilise le DOM + les classes CSS d'index.html) ──
// Retourne true si la modale existe (sinon repli sur le panneau générique).
function showAgendaReal(pending){
  const o=pending.payload||{}, opts=o.options||[];
  const modal=document.getElementById('agenda-sel-modal'), cont=document.getElementById('agsel-agendas'), ctx=document.getElementById('agsel-context');
  if(!modal || !cont) return false;
  // Contexte (ressources + revenus prévus + prochain événement) — calculé comme la vraie modale.
  try{
    const G=scGetG(), p=G.player;
    const preview={energy:0,materials:0,science:0,morale:0};
    for(const col of (p.colonies||[])){ if(!col.connected)continue; const node=NODES[col.nodeId]; if(!node||node.decorative)continue; const mult=col.level===3?2:col.level===2?1.5:1; for(const k in node.res){ preview[k]=(preview[k]||0)+Math.floor(node.res[k]*mult); } if(col.level===2)preview.morale++; else if(col.level>=3)preview.morale+=2; }
    for(const k in (p.rpt||{})) preview[k]=(preview[k]||0)+p.rpt[k];
    const evNext = (typeof eventForTurn==='function') ? eventForTurn((G.turn||1)+1) : null;
    const rE = (typeof rEmoji==='function') ? rEmoji : (r=>r);
    const resStr='<i class=ri-energy></i>'+(p.res.energy||0)+' <i class=ri-materials></i>'+(p.res.materials||0)+' <i class=ri-science></i>'+(p.res.science||0)+' <i class=ri-morale></i>'+(p.res.morale||0);
    const gainStr=Object.keys(preview).filter(k=>preview[k]>0).map(k=>'<span class="agsel-res">'+rE(k)+' +'+preview[k]+'</span>').join('') || '—';
    if(ctx) ctx.innerHTML='<div class="agsel-ctx-box"><div class="agsel-ctx-label">Vos ressources</div><div class="agsel-ctx-val">'+resStr+'</div></div>'
      +'<div class="agsel-ctx-box"><div class="agsel-ctx-label">Revenus prévus/tour</div><div class="agsel-ctx-val">'+gainStr+'</div></div>'
      +'<div class="agsel-ctx-box"><div class="agsel-ctx-label">Prochain événement</div><div class="agsel-ctx-val">'+(evNext?(evNext.emoji+' '+evNext.preview):'Aucun')+'</div></div>';
  }catch(e){ if(ctx) ctx.innerHTML=''; }
  cont.innerHTML=opts.map(ag=>'<div class="agsel-ag" id="agsel-ag-'+ag.id+'" onclick="selectAgenda(\''+ag.id+'\')">'
    +'<div class="agsel-ag-emoji">'+(ag.emoji||'')+'</div>'
    +'<div class="agsel-ag-name">'+(ag.name||ag.id)+'</div>'
    +'<div class="agsel-ag-desc">'+(ag.desc||'')+'</div></div>').join('');
  const b=document.getElementById('agsel-confirm-btn'); if(b) b.disabled=true;
  modal.classList.remove('hidden');
  return true;
}
function showStrategyReal(pending){
  const o=pending.payload||{}, opts=o.options||[];
  const el=document.getElementById('strat-options'), modal=document.getElementById('strategy-modal');
  if(!el || !modal) return false;
  el.innerHTML=opts.map(c=>'<div class="strat-opt" id="strat-opt-'+c.id+'" onclick="selectStrategy(\''+c.id+'\')">'
    +'<div class="so-emoji">'+(c.emoji||'')+'</div>'
    +'<div class="so-name">'+(c.name||c.id)+'</div>'
    +'<div class="so-desc">'+(c.desc||'')+(c.calmTension?' 🕊️ (calme une tension)':'')+'</div></div>').join('');
  const b=document.getElementById('strat-confirm-btn'); if(b) b.disabled=true;
  const sub=document.getElementById('strat-sub'); if(sub) sub.textContent='Draft : à toi en '+(o.rank||1)+((o.rank||1)===1?'er':'e')+'/'+(o.total||'?')+'.';
  modal.classList.remove('hidden');
  return true;
}
function showInvestReal(pending, lvl){
  const o=pending.payload||{}, opts=o.options||[];
  const two=(lvl===2);
  const optsEl=document.getElementById(two?'inv2-opts':'inv-opts'), modal=document.getElementById(two?'invest2-modal':'invest-modal');
  if(!optsEl || !modal) return false;
  const selFn=two?'selectInvestment2':'selectInvestment';
  optsEl.innerHTML=opts.map(c=>'<div class="inv-opt" onclick="'+selFn+'(\''+c.id+'\')">'
    +'<div class="inv-opt-emoji">'+(c.emoji||'')+'</div>'
    +'<div class="inv-opt-name">'+(c.name||c.id)+'</div>'
    +'<div class="inv-opt-benefit">✅ '+(c.benefit||'')+'</div>'
    +'<div class="inv-opt-cost">⚠️ '+(c.contrepartie||'')+'</div></div>').join('');
  const aiEl=document.getElementById(two?'inv2-ai-pick':'inv-ai-pick');
  if(aiEl && Array.isArray(o.ai) && o.ai.length){
    const nm=(id)=>{ const x=opts.find(y=>y.id===id); return x?((x.emoji||'')+' '+x.name):id; };
    aiEl.innerHTML=o.ai.map(a=>'🤖 '+a.civ+' : '+nm(a.pick)).join('<br>');
    aiEl.classList.remove('hidden');
  }
  modal.classList.remove('hidden');
  return true;
}

// ── Pop-up VERTE : résultat de TON action (raid volé, combat gagné/perdu, colonie prise/capturée…) ──
function showResultToast(lines){
  if(!lines || !lines.length) return;
  let p=document.getElementById('sc-resulttoast');
  if(!p){ injectStyles(); p=el('<div id="sc-resulttoast" style="position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:8680;background:#0e2a16;border:2px solid #2e9e57;border-radius:12px;padding:10px 14px;width:min(92vw,430px);color:#d0ffdc;font:600 .88em system-ui;box-shadow:0 10px 30px rgba(0,0,0,.55);line-height:1.4"></div>'); document.body.appendChild(p); p.onclick=()=>{ p.style.display='none'; }; }
  p.innerHTML='<div style="font-weight:800;margin-bottom:3px">✅ Résultat de ton action</div>'+lines.map(t=>'• '+t).join('<br>');
  p.style.display='block';
  clearTimeout(p._timer);
  p._timer=setTimeout(()=>{ p.style.display='none'; }, 6000);
}

// ── Pop-up rouge : ce que font les AUTRES (bot, IA) pendant la partie ──
function showLogToast(txts){
  let p=document.getElementById('sc-logtoast');
  if(!p){ injectStyles(); p=el('<div id="sc-logtoast" style="position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:8650;background:#2a0e14;border:2px solid #c0392b;border-radius:12px;padding:10px 14px;width:min(92vw,430px);color:#ffd7d0;font:600 .85em system-ui;box-shadow:0 10px 30px rgba(0,0,0,.55);line-height:1.4"></div>'); document.body.appendChild(p); p.onclick=()=>{ p.style.display='none'; }; }
  p._buf=(p._buf||[]).concat(txts).slice(-4); // les 4 dernières lignes
  p.innerHTML=p._buf.map(t=>'• '+t).join('<br>');
  p.style.display='block';
  clearTimeout(p._timer);
  p._timer=setTimeout(()=>{ p.style.display='none'; p._buf=[]; }, 5000);
}

// ───────────────────────── Notices (résultats de combat / événements / fin de tour) ─────────────────────────
function showNotice(m){
  const o = m.payload || {}, k = m.kind;
  let title='', body='';
  if(k==='war_result'){ title=o.title||'⚔️ Combat'; body=(o.body||'')+(o.result&&o.result.txt?'<br><br><b>'+o.result.txt+'</b>':''); }
  else if(k==='event_result'){ title='🎯 Événement'+(o.event?' — '+(o.event.emoji||'')+' '+o.event.name:''); body=o.msg||''; }
  else if(k==='event_announce'){ title='📣 Événement à venir'+(o.event?' — '+(o.event.emoji||'')+' '+o.event.name:''); body=(o.event&&o.event.preview)||''; }
  else if(k==='eot'){ title='📊 Fin du tour '+(o.turn||''); const mt=o.maint||{}; const parts=[];
    if(mt.energyCost) parts.push('−'+mt.energyCost+'⚡'); if(mt.matCost) parts.push('−'+mt.matCost+'🪨'); if(mt.routeEnergyCost) parts.push('routes −'+mt.routeEnergyCost+'⚡');
    body='Entretien : '+(parts.length?parts.join(' '):'aucun')+'. Revenus appliqués.'; }
  else if(k==='info'){ title='ℹ️'; body=o.msg||''; }
  else { title=k; }
  // panneau séparé du panneau de décision (une décision peut être ouverte en même temps)
  let p=document.getElementById('sc-notice');
  if(!p){ injectStyles(); p=el('<div id="sc-notice" style="position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:8700;background:#101a30;border:2px solid #3a6abf;border-radius:12px;padding:12px 16px;width:min(92vw,420px);color:#dce8ff;font-family:system-ui;box-shadow:0 10px 30px rgba(0,0,0,.5)"></div>'); document.body.appendChild(p); }
  // Avis IMPORTANTS (résultat de combat, résultat d'événement — ex. « tu gagnes X VP ») : PERSISTANTS,
  // il faut cliquer « ✓ Continuer » pour les fermer (fix #10 : ne passent plus trop vite). Les autres
  // (annonces, fin de tour) s'auto-referment.
  const important = (k==='war_result' || k==='event_result');
  // Événements : gros emoji centré + titre centré, façon vraie modale d'événement du jeu.
  const evEmoji = ((k==='event_result'||k==='event_announce') && o.event && o.event.emoji) ? o.event.emoji : '';
  const evName = (o.event && o.event.name) ? o.event.name : '';
  const evLead = (k==='event_announce') ? 'Événement à venir' : 'Événement';
  const head = evEmoji
    ? '<div style="font-size:2.4em;text-align:center;line-height:1">'+evEmoji+'</div>'
      +'<div style="text-align:center;font-size:.72em;color:#8fb0e0;letter-spacing:.05em;text-transform:uppercase">'+evLead+'</div>'
      +'<div style="text-align:center;font-weight:700;margin-top:1px">'+evName+'</div>'
    : '<b>'+title+'</b>';
  const align = evEmoji ? 'text-align:center;' : '';
  p.innerHTML = head + '<div style="margin-top:6px;line-height:1.35;font-size:.9em;'+align+'">'+body+'</div>'
    + (important ? '<button style="margin-top:10px;width:100%;padding:8px;background:#2f6fd0;color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer">✓ Continuer</button>' : '');
  p.style.display='block';
  clearTimeout(p._timer);
  if(important){ p.onclick = ()=>{ p.style.display='none'; }; }
  else { p.onclick = ()=>{ p.style.display='none'; }; p._timer = setTimeout(()=>{ p.style.display='none'; }, 3500); }
}

// ───────────────────────── Mon tour d'action (v2.1 : vraies actions de plateau) ─────────────────────────
// Les listes de cibles valides sont calculées avec les données du JEU déjà chargé dans la page
// (NODES, CARDS_POOL, colonizeCost, routeCost, getEffCost, isTechAvailable) appliquées à l'état reçu.
// Le SERVEUR reste l'autorité : il re-valide tout ; une action invalide est simplement sans effet.
function myNation(){ try{ const G=scGetG(); return [G.player].concat(G.ais||[]).find(p=>p&&p.civ&&p.civ.id===STATE.myCiv)||null; }catch(e){ return null; } }
function listColonize(){
  const out=[]; try{
    const G=scGetG(), me=myNation(); if(!me) return out;
    const cost=colonizeCost(me); const all=[G.player].concat(G.ais||[]);
    if(me.acLeft<cost.ac || (me.res.materials||0)<cost.mat || (me.res.energy||0)<cost.en) return out;
    for(const id in NODES){ const n=NODES[id];
      if(n.decorative||n.noColonize) continue;
      if(all.some(p=>p.colonies&&p.colonies.some(c=>c.nodeId===id))) continue;
      const adj = me.colonies.some(c=>NODES[c.nodeId]&&NODES[c.nodeId].conn.includes(id))
               || me.routes.some(r=>(r.from===id||r.to===id)&&me.colonies.find(c=>c.nodeId===(r.from===id?r.to:r.from)));
      if(!adj) continue;
      out.push({id, label:(n.emoji||'🪐')+' '+n.name, sub:cost.ac+' AC, '+cost.mat+'🪨 '+cost.en+'⚡'});
    }
  }catch(e){ console.warn('[SC] listColonize:', e); }
  return out;
}
function listRoutes(){
  const out=[]; try{
    const me=myNation(); if(!me) return out;
    const rc=routeCost(me);
    if(me.acLeft<rc.ac || (me.res.materials||0)<rc.mat) return out;
    const seen={};
    for(const c of me.colonies){ const n=NODES[c.nodeId]; if(!n) continue;
      for(const to of (n.conn||[])){
        const key=[c.nodeId,to].sort().join('|'); if(seen[key]) continue; seen[key]=1;
        if(me.routes.some(r=>(r.from===c.nodeId&&r.to===to)||(r.from===to&&r.to===c.nodeId))) continue;
        if(!NODES[to]) continue;
        out.push({from:c.nodeId, to, label:'🛤️ '+n.name+' → '+NODES[to].name, sub:rc.ac+' AC, '+rc.mat+'🪨'});
      }
    }
  }catch(e){ console.warn('[SC] listRoutes:', e); }
  return out;
}
function listTechs(){
  const out=[]; try{
    const G=scGetG(), me=myNation(); if(!me) return out;
    for(const card of CARDS_POOL){
      if(me.cards.some(c=>c.id===card.id)) continue;
      try{ if(!isTechAvailable(card, me)) continue; }catch(e){ continue; }
      try{ if(typeof isTechExclusive==='function' && isTechExclusive(card) && G.techTaken && G.techTaken.has && G.techTaken.has(card.id)) continue; }catch(e){}
      const acCost=card.tier===3?2:1; if(me.acLeft<acCost) continue;
      let cost={}; try{ cost=getEffCost(card, me)||{}; }catch(e){}
      let ok=true; for(const r in cost){ if((me.res[r]||0)<cost[r]){ ok=false; break; } }
      if(!ok) continue;
      const cs=Object.entries(cost).map(([r,a])=>a+({materials:'🪨',energy:'⚡',science:'🔬',morale:'🙂'}[r]||r)).join(' ');
      out.push({id:card.id, label:(card.emoji||'🔬')+' '+card.name+' (T'+card.tier+')', sub:acCost+' AC'+(cs?', '+cs:'')});
    }
  }catch(e){ console.warn('[SC] listTechs:', e); }
  return out;
}
function listUpgrades(){
  const out=[]; try{
    const me=myNation(); if(!me||me.acLeft<1) return out;
    for(const c of me.colonies){ const n=NODES[c.nodeId]; if(!n) continue;
      if(c.noUpgrade) continue; if(c.level>=(n.maxLv||1)) continue;
      out.push({id:c.nodeId, label:'⬆️ '+n.name+' Nv.'+c.level+' → '+(c.level+1), sub:'1 AC + coût du niveau'});
    }
  }catch(e){ console.warn('[SC] listUpgrades:', e); }
  return out;
}
function sendAction(action){
  if(STATE._confirmPending) return;   // une action est en attente de Valider/Annuler → bloquer
  STATE._myTurn=false;
  closeDecision(); turnBar(false);
  window._scOnPass=null;
  send({t:'act', action});
  showWaitBlock(); status('Coup envoyé…');
  // anti-flicker : redemander l'état autoritaire rapidement (le round-trip est court),
  // pour que le plateau reflète le résultat réel sans rester sur l'affichage local périmé.
  setTimeout(()=>reqState(true), 120);
  setTimeout(()=>reqState(true), 500);
}
// Barre « ✓ Valider / ↩ Annuler » du jeu (DOM #sc-confirm), pilotée par le serveur en ligne.
function showConfirmBar(){
  try{
    const b=document.getElementById('sc-confirm'); if(!b) return;
    const lbl=document.getElementById('sc-confirm-label'); if(lbl) lbl.innerHTML='<span class="scc-act">Action jouée</span>';
    b.classList.add('show');
    hideWaitBlock();
  }catch(e){}
}
function hideConfirmBar(){ try{ const b=document.getElementById('sc-confirm'); if(b) b.classList.remove('show'); }catch(e){} }

// ── ERGONOMIE NORMALE : jouer sur le VRAI plateau ──────────────────────────
// Pendant ton tour, le plateau est débloqué : les fonctions d'action du jeu (doColonize,
// doEstablishRoute, buyTech, doUpgrade, endTurn) sont INTERCEPTÉES → au lieu de s'exécuter
// localement, elles envoient l'INTENTION au serveur (qui reste l'autorité et re-valide).
// Hors de ton tour, elles reprennent leur comportement normal (solo intact).
const INTENT_MAP = {
  doColonize:       a=>({type:'colonize', node:a[0]}),
  doEstablishRoute: a=>({type:'route', from:a[0], to:a[1]}),
  buyTech:          a=>({type:'buyTech', card:a[0]}),
  doUpgrade:        a=>({type:'upgrade', node:a[0]}),
  doRaid:           ()=>({type:'raid'}),
  doRaidTarget:     a=>({type:'raid', target:a[0], node:a[1]}),
  useAbility:       ()=>({type:'power'}),
  buyGeneral:       a=>({type:'call', fn:'buyGeneral', args:[a[0]]}),
  buyMarket:        a=>({type:'call', fn:'buyMarket', args:[a[0]]}),
  applyCalmTension: a=>({type:'call', fn:'applyCalmTension', args:a}),
  _forgeUpgrade:    a=>({type:'call', fn:'_forgeUpgrade', args:[a[0]]}),
  proposeAccord:    a=>({type:'call', fn:'proposeAccord', args:[a[0]]}),
  routeManageDeploy: ()=>{ // lit la route sélectionnée dans la page, ferme la modale, envoie l'intention
    let r=null; try{ r=scGetG().player.routes[_routeManageIdx]; }catch(e){}
    try{ if(window.routeManageClose) window.routeManageClose(); }catch(e){}
    return r ? {type:'routeToken', from:r.from, to:r.to, deploy:true} : null;
  },
  routeManageRecall: ()=>{
    let r=null; try{ r=scGetG().player.routes[_routeManageIdx]; }catch(e){}
    try{ if(window.routeManageClose) window.routeManageClose(); }catch(e){}
    return r ? {type:'routeToken', from:r.from, to:r.to, deploy:false} : null;
  },
  confirmAttack:    ()=>{ // lit la vraie modale d'attaque de la page, puis la ferme
    let node=null, tokens=1;
    try{ node=_attackTargetNode; }catch(e){}
    try{ tokens=parseInt((document.getElementById('atk-slider')||{}).value)||1; }catch(e){}
    try{ if(window.cancelAttack) window.cancelAttack(); }catch(e){}
    if(!node) return null; // rien à envoyer
    return {type:'attack', node, tokens};
  }
};
function installIntercepts(){
  for(const fn in INTENT_MAP){
    const orig=window[fn];
    if(typeof orig!=='function' || orig._scWrapped) continue;
    (function(fn, orig){
      const w=function(){
        if(STATE.started){
          if(STATE._confirmPending){ return; }            // une action est en attente de Valider/Annuler
          if(!STATE._myTurn){ notYourTurnToast(); return; } // #6 : pas ton tour → bloquer CETTE action, rien d'autre
          // Forge Orbitale (Jupitériens) : le pouvoir ouvre une modale de CHOIX de lune → on la laisse
          // s'ouvrir localement (orig) ; le clic sur la lune appellera _forgeUpgrade (intercepté → envoi).
          if(fn==='useAbility'){ const me=myNation(); if(me && me.civ && me.civ.id==='jupiteriens'){ return orig.apply(this, arguments); } }
          const action=INTENT_MAP[fn](Array.prototype.slice.call(arguments));
          if(!action) return; // interception annulée (ex. modale d'attaque vide)
          if(fn==='doEstablishRoute'){
            const me=myNation();
            if(me && me.forceTokens>0){ askRouteToken(action); return; }
            action.token=false;
          }
          sendAction(action);
          return;
        }
        return orig.apply(this, arguments);
      };
      w._scWrapped=true; window[fn]=w;
    })(fn, orig);
  }
  // EN LIGNE : neutraliser le système « Valider / Annuler » (undo) du solo. En multijoueur le serveur
  // valide et fige chaque action immédiatement — pas de take-back. Ça supprime les boutons Valider/Annuler
  // incohérents et le blocage _scGuard (« valide ton action avant d'en jouer une autre ») qui gênaient en ligne.
  try{
    if(typeof window.scArmConfirm==='function' && !window.scArmConfirm._scOff){ const o=window.scArmConfirm; window.scArmConfirm=function(){ if(STATE.started) return; return o.apply(this,arguments); }; window.scArmConfirm._scOff=true; }
    if(typeof window._scGuard==='function' && !window._scGuard._scOff){ const g=window._scGuard; window._scGuard=function(){ if(STATE.started) return false; return g.apply(this,arguments); }; window._scGuard._scOff=true; }
    if(typeof window.saveUndo==='function' && !window.saveUndo._scOff){ const s=window.saveUndo; window.saveUndo=function(){ if(STATE.started) return; return s.apply(this,arguments); }; window.saveUndo._scOff=true; }
    // « Recommencer à zéro » (journal) EN LIGNE → quitter proprement la partie serveur (fix #3) au lieu de
    // recharger la page (qui ré-embarquait dans la partie fantôme). Ramène au lobby (création d'une partie).
    if(typeof window.scAbandonGame==='function' && !window.scAbandonGame._scOff){
      const o=window.scAbandonGame;
      window.scAbandonGame=function(){
        if(STATE.started || (STATE.game&&STATE.game.code)){
          if(!confirm('Quitter cette partie en ligne et revenir au menu ? La partie sera terminée pour tous les joueurs.')) return;
          try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
          send({t:'leave'});
          return;
        }
        return o.apply(this,arguments);
      };
      window.scAbandonGame._scOff=true;
    }
    // Rappel de pouvoir gratuit : en ligne, « Utiliser » → intention power (useAbility est déjà intercepté),
    // « Passer le tour » → intention pass (au lieu du passTurnIL local).
    if(typeof window._scAbilityReminderSkip==='function' && !window._scAbilityReminderSkip._scOff){
      const o=window._scAbilityReminderSkip;
      window._scAbilityReminderSkip=function(){ if(STATE.started){ try{ if(window._scCloseAbilityReminder)_scCloseAbilityReminder(); }catch(e){} sendAction({type:'pass'}); return; } return o.apply(this,arguments); };
      window._scAbilityReminderSkip._scOff=true;
    }
    // VRAIES modales stratégie / investissement : quand une décision en ligne est en cours
    // (STATE._realDecide posé), les boutons de validation ENVOIENT la réponse au serveur au lieu
    // d'appliquer localement. Hors décision en ligne → comportement solo d'origine.
    if(typeof window.confirmAgendaChoice==='function' && !window.confirmAgendaChoice._scOff){
      const o=window.confirmAgendaChoice;
      window.confirmAgendaChoice=function(){
        if(STATE.started && STATE._realDecide){
          const sel=document.querySelector('#agenda-sel-modal .agsel-ag.ag-selected');
          if(!sel) return;
          const id=sel.id.replace('agsel-ag-','');
          const modal=document.getElementById('agenda-sel-modal'); if(modal) modal.classList.add('hidden');
          const f=STATE._realDecide; STATE._realDecide=null; f({agendaId:id});
          return;
        }
        return o.apply(this,arguments);
      };
      window.confirmAgendaChoice._scOff=true;
    }
    if(typeof window.confirmStrategy==='function' && !window.confirmStrategy._scOff){
      const o=window.confirmStrategy;
      window.confirmStrategy=function(){
        if(STATE.started && STATE._realDecide){
          const sel=document.querySelector('#strategy-modal .strat-opt.so-selected');
          if(!sel) return;
          const id=sel.id.replace('strat-opt-','');
          const modal=document.getElementById('strategy-modal'); if(modal) modal.classList.add('hidden');
          const f=STATE._realDecide; STATE._realDecide=null; f({cardId:id});
          return;
        }
        return o.apply(this,arguments);
      };
      window.confirmStrategy._scOff=true;
    }
    // Boutons ✓ Valider / ↩ Annuler : en ligne, valident/annulent l'action tenue par le SERVEUR.
    if(typeof window.scConfirmValidate==='function' && !window.scConfirmValidate._scOff){
      const o=window.scConfirmValidate;
      window.scConfirmValidate=function(){ if(STATE.started){ hideConfirmBar(); STATE._confirmPending=false; send({t:'confirm'}); showWaitBlock(); status('Validé…'); return; } return o.apply(this,arguments); };
      window.scConfirmValidate._scOff=true;
    }
    if(typeof window.scConfirmCancel==='function' && !window.scConfirmCancel._scOff){
      const o=window.scConfirmCancel;
      window.scConfirmCancel=function(){ if(STATE.started){ hideConfirmBar(); STATE._confirmPending=false; send({t:'undo'}); showWaitBlock(); status('Annulé — retour en arrière…'); return; } return o.apply(this,arguments); };
      window.scConfirmCancel._scOff=true;
    }
    ['selectInvestment','selectInvestment2'].forEach(function(fn){
      if(typeof window[fn]==='function' && !window[fn]._scOff){
        const o=window[fn], two=(fn==='selectInvestment2');
        window[fn]=function(cardId){
          if(STATE.started && STATE._realDecide){
            const modal=document.getElementById(two?'invest2-modal':'invest-modal'); if(modal) modal.classList.add('hidden');
            const f=STATE._realDecide; STATE._realDecide=null; f({cardId:cardId});
            return;
          }
          return o.apply(this,arguments);
        };
        window[fn]._scOff=true;
      }
    });
  }catch(e){ console.warn('[SC] neutralisation confirm:', e); }
}
function askRouteToken(action){
  decisionPanel(`<h2>🛤️ Protéger la route ?</h2><div class="muted">Un jeton maintient la connexion et repousse les pirates.</div>
    <button class="opt" id="sc-t1">⚔️ Oui, déployer 1 jeton</button>
    <button class="opt" id="sc-t0">Non, route passive</button>`);
  document.getElementById('sc-t1').onclick=()=>{ action.token=true; sendAction(action); };
  document.getElementById('sc-t0').onclick=()=>{ action.token=false; sendAction(action); };
}
// Barre de tour discrète (en haut) : le plateau reste visible et cliquable.
function turnBar(show){
  let b=document.getElementById('sc-turnbar');
  if(!b){
    injectStyles();
    b=el('<div id="sc-turnbar" style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:8600;background:rgba(16,42,98,.96);border:1px solid #3a6abf;border-top:0;border-radius:0 0 10px 10px;padding:6px 12px;color:#dce8ff;font:600 .82em system-ui;display:flex;gap:8px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.5)"></div>');
    b.innerHTML='🎮 <b>À toi de jouer</b> — utilise le plateau'
      +' <button id="sc-tb-menu" style="background:#16223c;color:#9fb6e6;border:0;border-radius:7px;padding:5px 10px;cursor:pointer">☰ Menu</button>'
      +' <button id="sc-tb-ai" style="background:#16223c;color:#9fb6e6;border:0;border-radius:7px;padding:5px 10px;cursor:pointer">🤖 IA</button>'
      +' <button id="sc-tb-pass" style="background:#2f6fd0;color:#fff;border:0;border-radius:7px;padding:5px 10px;cursor:pointer">⏭ Passer</button>';
    document.body.appendChild(b);
    document.getElementById('sc-tb-menu').onclick=()=>actionMenu();
    document.getElementById('sc-tb-ai').onclick=()=>{ STATE._myTurn=false; turnBar(false); window._scOnPass=null; closeDecision(); send({t:'auto'}); showWaitBlock(); };
    document.getElementById('sc-tb-pass').onclick=()=>sendAction({type:'pass'});
  }
  b.style.display = show?'flex':'none';
}
function onMyActionTurn(){
  STATE._myTurn = true;
  hideWaitBlock(); closeDecision(); hideStatus();
  reqState(true);                                   // état frais → plateau à jour
  window._scOnPass = ()=> sendAction({type:'pass'}); // le bouton « Fin de Tour » du jeu = passer
  turnBar(true);
  // Si je n'ai plus d'AC mais mon POUVOIR GRATUIT est encore dispo → rappel (comme en solo),
  // au lieu de finir le tour sans l'avoir proposé. Le serveur m'a laissé la main exprès pour ça.
  setTimeout(()=>{
    try{
      if(!STATE._myTurn) return;
      const me=myNation();
      if(me && me.acLeft<=0 && typeof _scAbilityAvailable==='function' && _scAbilityAvailable()){
        if(typeof _scShowAbilityReminder==='function') _scShowAbilityReminder();
      }
    }catch(e){}
  }, 400);
}
function actionMenu(){
  const me = myNation();
  const acLeft = me ? ' — '+me.acLeft+' AC' : '';
  const cols=listColonize(), rts=listRoutes(), techs=listTechs(), ups=listUpgrades();
  const btn=(id,label,n)=>`<button class="opt" id="${id}"${n?'':' disabled style="opacity:.45"'}>${label}${n?' <span class="muted">('+n+' choix)</span>':' <span class="muted">(aucune cible)</span>'}</button>`;
  decisionPanel(`<h2>🎮 Ton tour${acLeft}</h2>
    ${btn('sc-a-col','🏗 Coloniser',cols.length)}
    ${btn('sc-a-rte','🛤 Route',rts.length)}
    ${btn('sc-a-tech','🔬 Acheter une tech',techs.length)}
    ${btn('sc-a-up','⬆️ Améliorer une colonie',ups.length)}
    <button class="opt" id="sc-auto">🤖 L'IA joue ce coup pour moi</button>
    <button class="opt" id="sc-pass">⏭ Passer (fin de ma manche)</button>
    <div class="muted" style="margin-top:6px">Ce menu est un secours : le mieux est de jouer directement sur le plateau (coloniser, routes, techs, gouvernement, raid, attaque, pouvoir — tout est branché). 1 action = la main passe, puis revient à toi s'il te reste des AC.</div>`);
  const sub=(items, mk)=>{ // sous-menu générique
    decisionPanel('<h2>Choisis</h2>'+items.map((it,i)=>`<button class="opt" data-i="${i}"><b>${it.label}</b><br><span class="muted">${it.sub||''}</span></button>`).join('')+'<button class="opt" id="sc-back">↩ Retour</button>');
    document.querySelectorAll('#sc-decision .opt[data-i]').forEach(b=>{ b.onclick=()=>mk(items[parseInt(b.getAttribute('data-i'))]); });
    document.getElementById('sc-back').onclick = actionMenu;
  };
  const bind=(id,fn)=>{ const b=document.getElementById(id); if(b && !b.disabled) b.onclick=fn; };
  bind('sc-a-col', ()=>sub(cols, it=>sendAction({type:'colonize', node:it.id})));
  bind('sc-a-rte', ()=>sub(rts, it=>{
    const me2=myNation(); const hasTok=me2&&me2.forceTokens>0;
    if(!hasTok) return sendAction({type:'route', from:it.from, to:it.to, token:false});
    decisionPanel(`<h2>${it.label}</h2><div class="muted">Protéger la route avec un jeton de force ?</div>
      <button class="opt" id="sc-t1">⚔️ Oui, déployer 1 jeton</button>
      <button class="opt" id="sc-t0">Non, route passive</button>`);
    document.getElementById('sc-t1').onclick=()=>sendAction({type:'route', from:it.from, to:it.to, token:true});
    document.getElementById('sc-t0').onclick=()=>sendAction({type:'route', from:it.from, to:it.to, token:false});
  }));
  bind('sc-a-tech', ()=>sub(techs, it=>sendAction({type:'buyTech', card:it.id})));
  bind('sc-a-up',   ()=>sub(ups,  it=>sendAction({type:'upgrade', node:it.id})));
  bind('sc-auto', ()=>{ STATE._myTurn=false; turnBar(false); window._scOnPass=null; closeDecision(); send({t:'auto'}); showWaitBlock(); });
  bind('sc-pass', ()=>sendAction({type:'pass'}));
}

// ───────────────────────── UI overlay (repris de la v1, transport en moins) ─────────────────────────
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
function injectStyles(){
  if (document.getElementById('sc-online-css')) return;
  const s=document.createElement('style'); s.id='sc-online-css';
  s.textContent = `
  #sc-ov{position:fixed;inset:0;z-index:9000;background:rgba(4,6,18,.96);color:#cdd9f5;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:12px 0}
  #sc-ov .card{background:#0d1426;border:1px solid #26406e;border-radius:14px;padding:22px 24px;width:min(92vw,420px);max-height:92dvh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  #sc-ov h2{margin:0 0 14px;font-size:1.2em;color:#bcd3ff}
  #sc-ov input,#sc-ov select{width:100%;box-sizing:border-box;margin:6px 0;padding:9px 11px;border-radius:8px;border:1px solid #2c4a7e;background:#091020;color:#dce8ff;font-size:.95em}
  #sc-ov button{cursor:pointer;border:0;border-radius:8px;padding:9px 14px;font-weight:700;font-size:.92em}
  #sc-ov .pri{background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;width:100%;margin-top:8px}
  #sc-ov .sec{background:#16223c;color:#9fb6e6;margin-top:6px}
  #sc-ov .err{color:#ff8c8c;font-size:.85em;min-height:1.1em;margin-top:6px}
  #sc-ov .muted{color:#7187b4;font-size:.82em}
  #sc-ov .row{display:flex;gap:8px}#sc-ov .row>*{flex:1}
  #sc-status{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:8500;background:#0d1426cc;border:1px solid #26406e;border-radius:10px;padding:6px 14px;color:#bcd3ff;font:600 .82em system-ui;backdrop-filter:blur(4px)}
  #sc-decision{position:fixed;inset:0;z-index:8800;background:rgba(4,6,18,.45);display:flex;align-items:center;justify-content:center}
  #sc-decision .card{background:#101a30;border:2px solid #3a6abf;border-radius:14px;padding:20px;width:min(92vw,440px);max-height:84vh;overflow:auto}
  #sc-decision .muted{color:#7187b4;font-size:.82em}
  #sc-decision .opt{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border-radius:9px;border:1px solid #2c4a7e;background:#0a1326;color:#dce8ff;cursor:pointer}
  #sc-decision .opt:hover{border-color:#5a8ad0;background:#13213c}`;
  document.head.appendChild(s);
}
function overlay(inner){
  injectStyles();
  let ov=document.getElementById('sc-ov');
  if(!ov){ ov=el('<div id="sc-ov"></div>'); document.body.appendChild(ov); }
  ov.innerHTML = '<div class="card">'+inner+'</div>';
  ov.style.display='flex';
  return ov;
}
function hideOverlay(){ const ov=document.getElementById('sc-ov'); if(ov) ov.style.display='none'; }
function status(txt){ let b=document.getElementById('sc-status'); if(!b){ injectStyles(); b=el('<div id="sc-status"></div>'); document.body.appendChild(b);} b.textContent=txt; b.style.display='block'; }
function hideStatus(){ const b=document.getElementById('sc-status'); if(b) b.style.display='none'; }
// #6 : plus de voile plein écran qui bloque TOUT. On laisse le joueur regarder librement (carte, journal,
// empire, diplo, détail des techs, survol des ressources). Seules les ACTIONS CONCRÈTES sont bloquées
// (via les interceptions, message « pas ton tour »). showWaitBlock ne fait plus qu'afficher un statut discret.
function showWaitBlock(){ /* volontairement non bloquant — voir intercepts */ }
function hideWaitBlock(){ const b=document.getElementById('sc-waitblock'); if(b) b.style.display='none'; }
let _notYourTurnTs=0;
function notYourTurnToast(){
  const now=Date.now(); if(now-_notYourTurnTs<1500) return; _notYourTurnTs=now;
  let p=document.getElementById('sc-nyt');
  if(!p){ injectStyles(); p=el('<div id="sc-nyt" style="position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:8690;background:#2a1e0e;border:2px solid #c08a30;border-radius:12px;padding:9px 14px;color:#ffe6c0;font:600 .86em system-ui;box-shadow:0 10px 30px rgba(0,0,0,.5)"></div>'); document.body.appendChild(p); p.onclick=()=>p.style.display='none'; }
  p.textContent='⏳ Ce n\'est pas ton tour — tu peux regarder le plateau, la carte, le journal, l\'empire, la diplo (mais pas jouer une action).';
  p.style.display='block'; clearTimeout(p._t); p._t=setTimeout(()=>{p.style.display='none';},2500);
}

// ── Connexion / inscription (pseudo, pas email — comptes du serveur live) ──
function screenAuth(mode){
  const isReg = mode==='register';
  let savedUser=''; try{ savedUser=localStorage.getItem('sc_ws_user')||''; }catch(e){}
  overlay(`
    <h2>${isReg?'Créer un compte':'Connexion'} — Solar Conquest</h2>
    <input id="sc-u" type="text" placeholder="Pseudo (3-20 lettres/chiffres)" autocomplete="username" value="${savedUser}">
    <input id="sc-p" type="password" placeholder="Mot de passe (min. 6)" autocomplete="${isReg?'new-password':'current-password'}">
    <div class="err" id="sc-err"></div>
    <button class="pri" id="sc-go">${isReg?'Créer le compte':'Se connecter'}</button>
    <button class="sec" id="sc-alt">${isReg?"J'ai déjà un compte":'Créer un compte'}</button>
    <button class="sec" id="sc-close">↩ Retour au jeu solo</button>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  document.getElementById('sc-close').onclick = ()=>{ _errCb=null; hideOverlay(); };
  document.getElementById('sc-go').onclick = ()=>{
    const user=document.getElementById('sc-u').value.trim(), pass=document.getElementById('sc-p').value;
    STATE._pendingPass = pass;
    STATE._afterLogin = ()=>{ _errCb=null; screenLobby(); };
    send(isReg ? {t:'register', user, pass} : {t:'login', user, pass});
  };
  document.getElementById('sc-alt').onclick = ()=> screenAuth(isReg?'login':'register');
}

// ── Lobby ──
const CIVS_LIST = [['terriens','🌍 Terriens'],['martiens','🔴 Martiens'],['jupiteriens','🟠 Jupitériens'],['ceinturiens','☄️ Ceinturiens']];
function civLabel(id){ const c=CIVS_LIST.find(x=>x[0]===id); return c?c[1]:id; }
function screenLobby(){
  STATE.game=null; STATE.myCiv=null; STATE.started=false;
  try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
  overlay(`
    <h2>Bonjour ${STATE.user}</h2>
    <button class="pri" id="sc-create">Créer une partie</button>
    <div class="row"><input id="sc-code" placeholder="Code d'invitation"><button class="sec" id="sc-join">Rejoindre</button></div>
    <div class="err" id="sc-err"></div>
    <button class="sec" id="sc-logout">Se déconnecter</button>
    <button class="sec" id="sc-close">↩ Retour au jeu solo</button>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  document.getElementById('sc-create').onclick = screenCreate;
  document.getElementById('sc-join').onclick = ()=>{
    const code=document.getElementById('sc-code').value.trim().toUpperCase();
    if(code) send({t:'join', code});
  };
  document.getElementById('sc-logout').onclick = ()=>{ try{ if(STATE.game&&STATE.game.code) send({t:'leave'}); }catch(e){} STATE.user=null; STATE.token=null; STATE.game=null; try{localStorage.removeItem('sc_ws_token'); localStorage.removeItem('sc_ws_game');}catch(e){} screenAuth('login'); };
  document.getElementById('sc-close').onclick = ()=>{ _errCb=null; hideOverlay(); };
}
function screenCreate(){
  const rows = CIVS_LIST.map(([id,label],i)=>`
    <div class="row" style="align-items:center">
      <span style="flex:1.3">${label}</span>
      <select data-civ="${id}">
        <option value="none">— absente —</option>
        <option value="host"${i===0?' selected':''}>Moi (hôte)</option>
        <option value="open">Humain (à rejoindre)</option>
        <option value="ai"${i>0?' selected':''}>IA</option>
      </select>
    </div>`).join('');
  overlay(`
    <h2>Nouvelle partie</h2>
    ${rows}
    <div class="err" id="sc-err"></div>
    <button class="pri" id="sc-make">Créer</button>
    <button class="sec" id="sc-back">Retour</button>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  document.getElementById('sc-make').onclick = ()=>{
    let myCiv=null; const seats=[];
    document.querySelectorAll('#sc-ov select[data-civ]').forEach(s=>{
      const k=s.value, civId=s.getAttribute('data-civ');
      if(k==='none') return;
      if(k==='host'){ if(myCiv){ _errCb('Un seul siège « Moi (hôte) ».'); return; } myCiv=civId; }
      else seats.push({civId, ai:(k==='ai')});
    });
    if(!myCiv){ _errCb('Choisis un siège « Moi (hôte) ».'); return; }
    if(seats.length<1){ _errCb('Au moins 2 nations.'); return; }
    STATE.myCiv = myCiv;
    send({t:'create', civId:myCiv, seats});
  };
  document.getElementById('sc-back').onclick = screenLobby;
}
function renderWait(){
  const g = STATE.game; if(!g) return;
  const list = g.seats.map(s=>{
    const who = s.ai ? '🤖 IA' : (s.user ? (s.user + (s.connected?'':' ⚠️ déconnecté')) : '⏳ libre');
    return `<div>${civLabel(s.civId)} — ${who}</div>`;
  }).join('');
  const allSeated = g.seats.every(s=>s.ai || s.user);
  overlay(`<h2>Salle d'attente</h2>
    <div>Code : <b style="font-size:1.2em;letter-spacing:2px">${g.code}</b> <span class="muted">(partage-le)</span></div>
    <div id="sc-players" style="margin:12px 0">${list}</div>
    <div class="err" id="sc-err"></div>
    ${STATE.isHost ? `<button class="pri" id="sc-start"${allSeated?'':' disabled style="opacity:.5"'}>Démarrer la partie</button>` : '<div class="muted">En attente que l&rsquo;hôte démarre…</div>'}
    <button class="sec" id="sc-leave">Quitter</button>`);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  if(STATE.isHost){ const b=document.getElementById('sc-start'); if(b) b.onclick=()=>send({t:'start'}); }
  document.getElementById('sc-leave').onclick = ()=>{ try{ send({t:'leave'}); }catch(e){} screenLobby(); };
}

// ── Panneau de décision générique (contrat de réponses = celui des modales du jeu) ──
// Chaque panneau a un bouton « 👁 Voir le plateau » : il replie le panneau (le plateau devient
// visible et consultable), et une pastille « ▶ Reprendre » le rouvre. Le fond est peu opaque.
function decisionPanel(html){
  let p=document.getElementById('sc-decision');
  if(!p){ injectStyles(); p=el('<div id="sc-decision"></div>'); document.body.appendChild(p); }
  p.innerHTML='<div class="card"><button id="sc-peek" style="float:right;background:#16223c;color:#9fb6e6;border:0;border-radius:7px;padding:5px 9px;cursor:pointer;font-size:.78em">👁 Voir le plateau</button>'+html+'</div>';
  p.style.display='flex';
  const peek=document.getElementById('sc-peek');
  if(peek) peek.onclick=()=>{ p.style.display='none'; showResumeChip(); };
  hideResumeChip();
  return p;
}
function closeDecision(){ const p=document.getElementById('sc-decision'); if(p) p.style.display='none'; hideResumeChip(); }
function showResumeChip(){
  let c=document.getElementById('sc-resume');
  if(!c){ c=el('<button id="sc-resume" style="position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:8900;background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;border:0;border-radius:10px;padding:10px 18px;font:700 .9em system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.5)">▶ Reprendre (choix en attente)</button>'); document.body.appendChild(c);
    c.onclick=()=>{ const p=document.getElementById('sc-decision'); if(p) p.style.display='flex'; hideResumeChip(); }; }
  c.style.display='block';
}
function hideResumeChip(){ const c=document.getElementById('sc-resume'); if(c) c.style.display='none'; }
function askLocalDecision(pending){
  return new Promise(resolve=>{
    const o=pending.payload||{}; const k=pending.kind;
    const done=(ans)=>{ closeDecision(); resolve(ans); };
    const TITLES={agenda:'Choisis ton agenda secret',strategy:'Carte Stratégie',strategy_calm:'Calmer une tension',invest1:'Investissement (Niv.1)',invest2:'Investissement (Niv.2)',espionage:'Espionnage : branche à copier',extrasolar:'Exploration extra-solaire',empath_copy:'Télépathie : carte à copier',ai_dyson:'Sphère de Dyson adverse',dyson_build:'Ta Sphère de Dyson',peace_offer:'Offre de paix',war_combat:'Combat',accord_confirm:'Accord commercial',defense:'Défense !'};
    let body='<h2>'+(TITLES[k]||k)+'</h2>';
    if(k==='defense'){
      const max=o.maxDef||0;
      body+=`<div>${o.attackerName||o.attacker} t'assaille (${o.target?o.target.name:''}). Force ~${o.threat}.</div>
        <input type="range" id="sc-d" min="0" max="${max}" value="${Math.min(2,max)}" style="width:100%">
        <div>Défense : <b id="sc-dv">${Math.min(2,max)}</b> jeton(s)</div>
        <button class="opt" id="sc-ok">Défendre</button>`;
      decisionPanel(body);
      const sl=document.getElementById('sc-d'), dv=document.getElementById('sc-dv');
      sl.oninput=()=>dv.textContent=sl.value;
      document.getElementById('sc-ok').onclick=()=>done({defTokens:parseInt(sl.value)||0});
      return;
    }
    if(k==='war_combat'){
      const maxF=o.myForce||0;
      const cols=o.cols||[]; const canHold=!!o.canHold; const threat=o.aiThreat;
      const tokenPick=(title,hint,onOk)=>{ // sous-écran : choisir les jetons engagés
        decisionPanel('<h2>'+title+'</h2>'+(hint?'<div class="muted" style="margin-bottom:6px">'+hint+'</div>':'')
          +'<div>Jetons engagés : <b id="sc-wcv">'+Math.min(1,maxF)+'</b> / '+maxF+'</div>'
          +'<input type="range" id="sc-wc" min="0" max="'+maxF+'" value="'+Math.min(1,maxF)+'" style="width:100%">'
          +'<button class="opt" id="sc-wcok">✓ Engager</button><button class="opt" id="sc-wcback">↩ Retour</button>');
        const sl=document.getElementById('sc-wc'), dv=document.getElementById('sc-wcv'); if(sl)sl.oninput=()=>dv.textContent=sl.value;
        document.getElementById('sc-wcok').onclick=()=>onOk(parseInt(sl.value)||0);
        document.getElementById('sc-wcback').onclick=()=>main();
      };
      const main=()=>{
        let b='<h2>⚔️ Combat de guerre — '+(o.enemyName||'ennemi')+'</h2>';
        b+='<div class="muted" style="margin-bottom:8px">Tes jetons Force engageables : <b>'+maxF+'</b> · Tour de guerre restant : '+(o.warTurnsLeft||'?')+'</div>';
        if(threat) b+='<div style="background:#2a1200;border:1px solid #cc6622;border-radius:8px;padding:7px 10px;margin-bottom:8px;color:#ffcfa0;font-size:.85em">🛡️ L\'ennemi menace : <b>'+(threat.type==='colony'?'🏙️ ':'🛤️ ')+threat.name+'</b>. Tu peux <b>défendre</b>.</div>';
        // Attaquer une colonie ennemie
        if(cols.length){
          b+='<div style="font-weight:700;color:#ff9966;margin:4px 0 3px">⚔️ Attaquer une colonie</div>';
          b+=cols.map((c,i)=>'<button class="opt" data-col="'+i+'"'+(maxF<1?' disabled style="opacity:.45"':'')+'>'+(c.isFocus?'🎯 ':'')+(c.emoji||'')+' <b>'+c.name+'</b> Nv.'+c.level+(c.isHome?' 🏠 QG':'')+' <span class="muted">('+c.dist+' nœud'+(c.dist>1?'s':'')+')</span>'+(c.isFocus?' <span style="color:#ffcc66">— gagne = capture !</span>':'')+'</button>').join('');
        } else b+='<div class="muted">Aucune colonie ennemie à portée.</div>';
        // Défendre / Tenir
        if(threat) b+='<button class="opt" id="sc-wc-def" style="border-color:#cc6622">🛡️ Défendre (choisir jetons)</button>';
        if(canHold) b+='<button class="opt" id="sc-wc-hold" style="border-color:#4488cc">🕊️ Tenir position (ne rien engager)</button>';
        decisionPanel(b);
        document.querySelectorAll('#sc-decision .opt[data-col]').forEach(btn=>{ if(btn.disabled)return; btn.onclick=()=>{ const c=cols[parseInt(btn.getAttribute('data-col'))]; tokenPick('⚔️ Attaquer '+c.name, 'Force ennemie inconnue (garnison + défense). Engage assez pour gagner.', (t)=>done({action:'attack', node:c.node, tokens:t})); }; });
        const dfn=document.getElementById('sc-wc-def'); if(dfn) dfn.onclick=()=>tokenPick('🛡️ Défense', 'Jetons engagés en défense de tes colonies.', (t)=>done({action:'defend', tokens:t}));
        const hld=document.getElementById('sc-wc-hold'); if(hld) hld.onclick=()=>done({action:'hold'});
      };
      main();
      return;
    }
    if(k==='peace_offer'){
      body+=`<div>En guerre contre ${o.attackerName||o.attacker}. (VP toi ${o.vpYou} / lui ${o.vpEnemy})</div>
        <button class="opt" id="sc-peace">🕊️ Proposer la paix</button>
        <button class="opt" id="sc-war">⚔️ Continuer la guerre</button>`;
      decisionPanel(body);
      document.getElementById('sc-peace').onclick=()=>done({accept:true, offer:{materials:0,energy:0,science:0}});
      document.getElementById('sc-war').onclick=()=>done({accept:false});
      return;
    }
    if(k==='ai_dyson'){ body+=`<div>${o.builderName||'Une nation'} a bâti la Sphère de Dyson.</div>
        <button class="opt" id="sc-acc">🤝 Accepter</button><button class="opt" id="sc-ref">⚔️ Refuser (guerre)</button>`;
      decisionPanel(body);
      document.getElementById('sc-acc').onclick=()=>done({war:false});
      document.getElementById('sc-ref').onclick=()=>done({war:true}); return;
    }
    if(k==='human_dyson'){ body='<h2>⚡ Sphère de Dyson adverse</h2>'+`<div>${o.builderName||'Un joueur'} a bâti la Sphère de Dyson (monopole énergétique). Accepte (+3⚡/tour) ou refuse (= guerre).</div>
        <button class="opt" id="sc-acc">🤝 Accepter le monopole</button><button class="opt" id="sc-ref">⚔️ Refuser (guerre)</button>`;
      decisionPanel(body);
      document.getElementById('sc-acc').onclick=()=>done({war:false});
      document.getElementById('sc-ref').onclick=()=>done({war:true}); return;
    }
    if(k==='dyson_build'){ body+=`<button class="opt" id="sc-f">Forcer (guerre aux refusants)</button><button class="opt" id="sc-r">Renoncer</button>`;
      decisionPanel(body); document.getElementById('sc-f').onclick=()=>done({force:true}); document.getElementById('sc-r').onclick=()=>done({force:false}); return; }
    if(k==='accord_confirm'){ body+=`<div>Accord avec ${o.withName||''} sur ${o.nodeName||''} ?</div><button class="opt" id="sc-y">Confirmer</button><button class="opt" id="sc-n">Annuler</button>`;
      decisionPanel(body); document.getElementById('sc-y').onclick=()=>done({confirm:true}); document.getElementById('sc-n').onclick=()=>done({confirm:false}); return; }
    if(k==='event_comm'){ // Événement Accords Commerciaux : choisir UNE nation (accord gratuit +3 VP, met fin à une guerre) ou passer
      const cands=o.cands||[];
      let b='<h2>🤝 Accords Commerciaux</h2><div class="muted" style="margin-bottom:8px">Accord <b>gratuit</b> : +3 VP chacun, met fin à une guerre. Un leader trop en avance peut refuser.</div>';
      if(!cands.length) b+='<div class="muted" style="margin-bottom:6px">Toutes les nations ont déjà un accord avec toi.</div>';
      else b+=cands.map((c,i)=>'<button class="opt" data-comm="'+i+'">'+(c.emoji||'')+' <b>'+c.name+'</b>'+(c.war?' <span style="color:#ff7766">⚔️ en guerre</span>':'')+(c.info?'<br><span class="muted">'+c.info+'</span>':'')+'</button>').join('');
      b+='<button class="opt" id="sc-comm-pass" style="background:#2a2f45">Passer (aucun accord)</button>';
      decisionPanel(b);
      document.querySelectorAll('#sc-decision .opt[data-comm]').forEach(btn=>{ btn.onclick=()=>done({aiId:cands[parseInt(btn.getAttribute('data-comm'))].id}); });
      document.getElementById('sc-comm-pass').onclick=()=>done({aiId:null});
      return;
    }
    if(k==='event_diplo'){ // Événement Accords Diplomatiques : sélectionner plusieurs pactes (6 matériaux chacun, +2 énergie si guerre)
      const rows=o.rows||[]; const sel={};
      let b='<h2>🕊️ Accords Diplomatiques</h2><div class="muted" style="margin-bottom:8px">Pacte de non-agression 4 tours. 6🔩 chacun (6🔩+2⚡ si en guerre → l\'annule). +1 moral/pacte, tension 0. Tu as '+(o.mat||0)+'🔩 '+(o.energy||0)+'⚡.</div>';
      b+=rows.map((r,i)=>'<label class="opt" style="display:block;text-align:left;cursor:pointer"><input type="checkbox" data-diplo="'+i+'" style="margin-right:8px">'+(r.emoji||'')+' <b>'+r.name+'</b> — 4 tours · '+(r.war?'6🔩+2⚡ <span style="color:#ff7766">annule la guerre</span>':'6🔩')+(r.info?'<br><span class="muted" style="margin-left:24px">'+r.info+'</span>':'')+'</label>').join('');
      b+='<button class="opt" id="sc-diplo-ok">Conclure les pactes sélectionnés</button><button class="opt" id="sc-diplo-none" style="background:#2a2f45">Aucun pacte</button>';
      decisionPanel(b);
      document.getElementById('sc-diplo-ok').onclick=()=>{ const chosen=[]; document.querySelectorAll('#sc-decision input[data-diplo]').forEach(cb=>{ if(cb.checked)chosen.push(rows[parseInt(cb.getAttribute('data-diplo'))].id); }); done({selected:chosen}); };
      document.getElementById('sc-diplo-none').onclick=()=>done({selected:[]});
      return;
    }
    // Génériques à options (agenda, strategy, invest1/2, espionage, extrasolar, empath_copy…)
    const opts=o.options||[];
    if(!opts.length){ decisionPanel(body+'<button class="opt" id="sc-ok">Continuer</button>'); document.getElementById('sc-ok').onclick=()=>done({}); return; }
    const key = k==='agenda'?'agendaId' : (k==='strategy'?'cardId' : (k==='invest1'||k==='invest2'?'cardId' : (k==='espionage'?'branch' : (k==='extrasolar'?'node' : (k==='empath_copy'?'cardId':'value')))));
    // Pour les investissements : montrer ce que les IA/adversaires ont choisi (comme la vraie modale)
    if((k==='invest1'||k==='invest2') && Array.isArray(o.ai) && o.ai.length){
      const optName=(id)=>{ const op=opts.find(x=>x.id===id); return op?((op.emoji||'')+' '+op.name):id; };
      body += '<div class="muted" style="margin:2px 0 8px">Choix adverses : '+o.ai.map(a=>a.civ+' → '+optName(a.pick)).join(' · ')+'</div>';
    }
    if(k==='strategy' && o.rank){ body += '<div class="muted" style="margin-bottom:6px">Ton rang d\'initiative : '+o.rank+'/'+(o.total||'?')+'</div>'; }
    // Chaque option : nom + (bénéfice/contrepartie pour invest, effet tension pour stratégie, desc sinon)
    body += opts.map((op,i)=>{
      let sub='';
      if(op.benefit||op.contrepartie){ sub = (op.benefit?'<span style="color:#8fe0a0">✅ '+op.benefit+'</span>':'') + (op.contrepartie?'<br><span style="color:#e0a86a">⚠️ '+op.contrepartie+'</span>':''); }
      else if(op.desc){ sub = op.desc + (op.calmTension?'<br><span style="color:#8fb6e6">🕊️ Calme la tension</span>':''); }
      return `<button class="opt" data-i="${i}">${op.emoji||''} <b>${op.name||op.id||op.branch||op.node}</b>${sub?'<br><span class="muted">'+sub+'</span>':''}</button>`;
    }).join('');
    if(k==='empath_copy') body+='<button class="opt" data-skip="1">Aucune copie</button>';
    decisionPanel(body);
    document.querySelectorAll('#sc-decision .opt').forEach(b=>{ b.onclick=()=>{
      if(b.getAttribute('data-skip')){ done({cardId:null}); return; }
      const op=opts[parseInt(b.getAttribute('data-i'))]; const ans={};
      ans[key]= op.id!==undefined?op.id:(op.branch!==undefined?op.branch:op.node);
      if(k==='strategy_calm') ans.targetId=op.id;
      done(ans);
    }; });
  });
}

// ───────────────────────── Révéler l'UI du jeu / fin ─────────────────────────
function revealGameUI(){
  const s=document.getElementById('civ-sel'); if(s) s.classList.add('hidden');
  ['top-bar','game-wrap','action-bar','bottom-bar'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display='flex'; });
  const ob=document.getElementById('sc-online-btn'); if(ob) ob.style.display='none';
  try { if(window.initTechResize) window.initTechResize(); } catch(e){}
  try { if(window.installBackGuard) window.installBackGuard(); } catch(e){}
}
function showFinal(scores){
  hideWaitBlock(); closeDecision();
  const rows = scores.map((s,i)=>`<div>${i+1}. ${civLabel(s.civId)} <b>${s.name!==undefined?'':''}</b> — ${s.vp} VP</div>`).join('');
  overlay(`<h2>🏆 Fin de partie</h2>${rows||'<div class="muted">Scores indisponibles.</div>'}
    <button class="pri" id="sc-again">↩ Retour au lobby</button>`);
  document.getElementById('sc-again').onclick = ()=> screenLobby();
}

// ───────────────────────── Reprise du formulaire d'accueil du jeu ─────────────────────────
// L'écran d'accueil d'index.html (« Se connecter / Créer un compte ») appelait l'ancien PHP
// (lvSubmit → api/login.php → 404) puis cliquait le bouton flottant (caché par le CSS du jeu).
// On REMPLACE ses fonctions globales : mêmes boutons, mais ils parlent au serveur WebSocket.
function hijackBuiltinAuth(){
  try {
    const err = document.getElementById('lv-err');
    const uEl = document.getElementById('lv-user');
    if (uEl){ uEl.placeholder='Pseudo (3-20 lettres/chiffres)'; try{ uEl.type='text'; uEl.setAttribute('autocomplete','username'); }catch(e){} }
    window.lvSubmit = function(){
      const u=(document.getElementById('lv-user')||{}).value||'', p=(document.getElementById('lv-pass')||{}).value||'';
      if (err) err.textContent='';
      let user=u.trim().toLowerCase();
      if (user.indexOf('@')!==-1) user=user.split('@')[0];      // tolère un email : on prend la partie avant @
      user=user.replace(/[^a-z0-9_.-]/g,'').slice(0,20);
      if (user.length<3){ if(err) err.textContent='Pseudo trop court (min. 3 caractères).'; return; }
      if (p.length<6){ if(err) err.textContent='Mot de passe trop court (min. 6).'; return; }
      let reg=false; try{ reg=(typeof _lvMode!=='undefined' && _lvMode==='register'); }catch(e){}
      _errCb = (msg)=>{ if(err) err.textContent=msg; };
      STATE._pendingPass = p;
      STATE._afterLogin = ()=>{ _errCb=null; screenLobby(); };
      connect(()=>{ send(reg ? {t:'register', user, pass:p} : {t:'login', user, pass:p}); });
    };
    // Auto-connexion : notre token remplace l'ancienne session PHP.
    // Si une partie était en cours (code mémorisé), on la REJOINT automatiquement (reprise après rechargement).
    window.lvTryAutoLogin = function(){
      let tok=null, code=null; try{ tok=localStorage.getItem('sc_ws_token'); code=localStorage.getItem('sc_ws_game'); }catch(e){}
      if (!tok) return;
      STATE.token = tok;
      if (code) STATE.game = { code };           // 'logged' fera le join automatique
      else STATE._afterLogin = ()=> screenLobby();
      connect(()=>{});
    };
  } catch(e){ console.warn('[SC] hijackBuiltinAuth:', e); }
}

// ───────────────────────── Démarrage de la couche ─────────────────────────
function init(){
  injectStyles();
  hijackBuiltinAuth();
  const btn=el('<button id="sc-online-btn" style="position:fixed;bottom:12px;right:12px;z-index:8000;background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;border:0;border-radius:10px;padding:9px 14px;font:700 .85em system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4)">🌐 Jouer en ligne</button>');
  btn.onclick = ()=>{
    let tok=null; try{ tok=localStorage.getItem('sc_ws_token'); }catch(e){}
    STATE.token = tok;
    STATE._afterLogin = ()=> screenLobby();
    connect(()=>{ if(!STATE.token) screenAuth('login'); /* sinon : 'logged' arrivera via le token */ });
    // si le token est refusé, handle('error') nettoiera et l'utilisateur verra l'écran de connexion
    setTimeout(()=>{ if(!STATE.user && STATE.connected) screenAuth('login'); }, 1500);
  };
  document.body.appendChild(btn);
  // Garde-fou anti-gel : en partie, si plus aucun message depuis 40 s, on redemande où on en est.
  setInterval(()=>{
    if (STATE.started && STATE.connected && Date.now()-(STATE._lastMsg||0) > 40000){
      STATE._lastMsg = Date.now();
      send({t:'resync'}); reqState(true);
    }
  }, 10000);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

window.SC_ONLINE = { STATE, send, reqState }; // debug console
})();
