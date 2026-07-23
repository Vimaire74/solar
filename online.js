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
      onMyActionTurn();
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
      showNotice(m);
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
    case 'pong': break;
  }
}

// ───────────────────────── Affichage de l'état reçu ─────────────────────────
function applyState(state){
  try {
    // mémoriser l'onglet actif (Carte/Techs/Empire/Diplo/Journal) pour ne pas revenir à la carte après chaque sync
    let activeTab=null;
    try{ const t=document.querySelector('.mtab.active'); if(t) activeTab=t.getAttribute('data-tab'); }catch(e){}
    // reconstruire Set/Map (le serveur envoie __set/__map)
    const g = (typeof scDeserialize === 'function') ? scDeserialize(JSON.stringify(state)) : state;
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
  askLocalDecision(pending).then(ans=>{
    send({t:'answer', id:pending.id, ans:ans});
    STATE._answering = false;
    showWaitBlock();
    status('En attente des autres joueurs…');
  }).catch(()=>{ STATE._answering = false; });
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
  p.innerHTML = '<b>'+title+'</b><div style="margin-top:6px;line-height:1.35;font-size:.9em">'+body+'</div>';
  p.style.display='block';
  clearTimeout(p._timer);
  p._timer = setTimeout(()=>{ p.style.display='none'; }, (k==='war_result'||k==='event_result') ? 6500 : 3500);
  p.onclick = ()=>{ p.style.display='none'; };
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
        if(STATE.started && STATE._myTurn){
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
function showWaitBlock(){ let b=document.getElementById('sc-waitblock'); if(!b){ b=el('<div id="sc-waitblock" style="position:fixed;inset:0;z-index:6000;background:transparent;cursor:progress"></div>'); document.body.appendChild(b);} b.style.display='block'; }
function hideWaitBlock(){ const b=document.getElementById('sc-waitblock'); if(b) b.style.display='none'; }

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
  document.getElementById('sc-logout').onclick = ()=>{ STATE.user=null; STATE.token=null; try{localStorage.removeItem('sc_ws_token');}catch(e){} screenAuth('login'); };
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
  document.getElementById('sc-leave').onclick = ()=> screenLobby();
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
      const max=o.maxTokens!=null?o.maxTokens:(o.max!=null?o.max:5);
      body+=`<div>${o.body||o.title||'Engage tes jetons de force.'}</div>
        <input type="range" id="sc-d" min="0" max="${max}" value="${Math.min(1,max)}" style="width:100%">
        <div>Jetons : <b id="sc-dv">${Math.min(1,max)}</b></div>
        <button class="opt" id="sc-ok">⚔️ Engager</button>`;
      decisionPanel(body);
      const sl=document.getElementById('sc-d'), dv=document.getElementById('sc-dv');
      sl.oninput=()=>dv.textContent=sl.value;
      document.getElementById('sc-ok').onclick=()=>done({tokens:parseInt(sl.value)||0});
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
    if(k==='dyson_build'){ body+=`<button class="opt" id="sc-f">Forcer (guerre aux refusants)</button><button class="opt" id="sc-r">Renoncer</button>`;
      decisionPanel(body); document.getElementById('sc-f').onclick=()=>done({force:true}); document.getElementById('sc-r').onclick=()=>done({force:false}); return; }
    if(k==='accord_confirm'){ body+=`<div>Accord avec ${o.withName||''} sur ${o.nodeName||''} ?</div><button class="opt" id="sc-y">Confirmer</button><button class="opt" id="sc-n">Annuler</button>`;
      decisionPanel(body); document.getElementById('sc-y').onclick=()=>done({confirm:true}); document.getElementById('sc-n').onclick=()=>done({confirm:false}); return; }
    // Génériques à options (agenda, strategy, invest1/2, espionage, extrasolar, empath_copy…)
    const opts=o.options||[];
    if(!opts.length){ decisionPanel(body+'<button class="opt" id="sc-ok">Continuer</button>'); document.getElementById('sc-ok').onclick=()=>done({}); return; }
    const key = k==='agenda'?'agendaId' : (k==='strategy'?'cardId' : (k==='invest1'||k==='invest2'?'cardId' : (k==='espionage'?'branch' : (k==='extrasolar'?'node' : (k==='empath_copy'?'cardId':'value')))));
    body += opts.map((op,i)=>`<button class="opt" data-i="${i}">${op.emoji||''} <b>${op.name||op.id||op.branch||op.node}</b>${op.desc?'<br><span class="muted">'+op.desc+'</span>':''}</button>`).join('');
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
