/* Build de CE fichier, affiché sur l'écran de connexion. À INCRÉMENTER à chaque modification.
   Il est distinct de celui d'index.html : si les deux diffèrent à l'écran, c'est qu'un seul
   des deux fichiers a été mis en ligne (upload partiel ou cache) — la cause exacte est visible. */
const SOLAR_BUILD_JS = '2026-09-04 · v10.22';   /* ⚠️ LES TROIS ESTAMPILLES BOUGENT ENSEMBLE — celle-ci,
   `window.SOLAR_BUILD_HTML` (index.html) et `SOLAR_BUILD_MOTEUR` (moteur.js). L'écran de connexion
   compare les trois et crie « Versions incohérentes » dès que l'une diverge.
   ⚠️ CET AVERTISSEMENT EXISTAIT DÉJÀ EN COMMENTAIRE, ET IL N'A RIEN EMPÊCHÉ : oublié une première
   fois pendant huit versions (resté à v8.1), puis de nouveau du 03/09 (v10.03 à v10.07) — je ne
   bougeais que `moteur.js`, et Marc a vu le message rouge après une partie. Un commentaire n'est
   pas un garde-fou : c'est `test_versions.js` qui l'est désormais. */
/* VERSION DU PROTOCOLE client/serveur — à INCRÉMENTER dès qu'un message change de forme
   (nouveau champ obligatoire, sens modifié, message retiré). Le build ci-dessus identifie le
   FICHIER ; celui-ci identifie le LANGAGE parlé avec le serveur. Les deux sont indépendants :
   on corrige souvent le jeu sans toucher au protocole. */
/* 2 (2026-08-23) — la réponse d'ESPIONNAGE a changé de forme le 17/08 : elle porte désormais
   `{id}` ou `{ids}` (identifiants d'OPTIONS), plus `{branch}` seul. Un client resté en cache continuait
   d'envoyer l'ancienne forme, que le serveur ne peut PAS appliquer : Marc a perdu son espionnage
   deux parties de suite sans qu'aucun message ne le prévienne. Le numéro n'avait pas été
   incrémenté — c'est précisément à cela qu'il sert. */
const SC_PROTO = 2;
// Exposé sur window pour que l'écran d'ACCUEIL (index.html, #lv-build) puisse comparer les deux
// builds et signaler un upload partiel. Un `const` seul n'est pas visible depuis l'autre fichier.
try{ window.SOLAR_BUILD_JS = SOLAR_BUILD_JS; }catch(e){}
/* Solar — couche EN LIGNE v2 : client WebSocket du SERVEUR AUTORITAIRE.
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
    /* POIGNÉE DE MAIN VERSIONNÉE. Indispensable pour l'application mobile : un joueur garde une
       vieille version installée pendant des mois et parlerait à un serveur récent sans que rien ne
       le détecte — on se retrouverait à chercher un bug de jeu là où il n'y a qu'un décalage de
       version. Le serveur répond « maj_requise » si le protocole ne correspond plus. */
    send({t:'hello', proto:SC_PROTO, build:SOLAR_BUILD_JS});
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
    /* ═══ LA LISTE DES PARTIES REPRENABLES (lot 17, étape 5) ═══
       Elle arrive SANS être demandée juste après la connexion. On la garde de côté et on
       rafraîchit l'écran d'accueil s'il est affiché — le joueur ne doit pas avoir à recliquer. */
    case 'partie_supprimee':
      /* Le serveur renvoie la liste à jour juste après : rien à faire ici, sinon rester au lobby. */
      STATE._surLobby=true; STATE.game=null;
      break;
    case 'mes_parties':
      STATE.parties = Array.isArray(m.parties) ? m.parties : [];
      if (STATE._surLobby) screenLobby();
      break;
    case 'game':
      STATE.game = m.game;
      // Table civId -> pseudo, pour afficher le nom du joueur (au lieu de « IA ») partout dans le jeu.
      try{ window._scPseudo = window._scPseudo || {}; (m.game.seats||[]).forEach(s=>{ if(s.civId && s.user) window._scPseudo[s.civId]=s.user; }); }catch(e){}
      if (!STATE.myCiv){ const s = m.game.seats.find(x=>x.user===STATE.user); if(s) STATE.myCiv = s.civId; }
      STATE.isHost = (m.game.host === STATE.user);
      /* ═══ UNE NOUVELLE PARTIE NE DOIT RIEN HÉRITER DE LA PRÉCÉDENTE ═══
         ⚠️ `scGetG()` garde en mémoire l'état de la DERNIÈRE partie affichée. Les fenêtres qui
         arrivent avant le premier `state` du serveur — l'agenda secret est la toute première —
         s'y alimentent : Laurent a choisi son agenda en lisant les ressources et les revenus de sa
         partie précédente, celle qui avait planté (Marc, 23/08 : « les chiffres de son ancienne
         partie sont revenus dans le choix d'agenda »). Rien n'était corrompu côté serveur : c'est
         l'écran qui affichait un état périmé.
         On marque donc l'état comme NON REÇU dès que le code de partie change ; `onDecision` met
         les fenêtres en file jusqu'au premier `state`. */
      if(STATE._codePartie !== m.game.code){ STATE._codePartie = m.game.code; STATE._etatRecu = false; }
      try{ localStorage.setItem('sc_ws_game', m.game.code); }catch(e){}
      if (m.game.status === 'lobby') renderWait();
      else if (m.game.status === 'playing' && !STATE.started){ STATE.started = true; installIntercepts(); concederVisible(true); hideOverlay(); revealGameUI(); reqState(true); send({t:'resync'}); }
      break;
    case 'started':
      STATE.started = true;
      installIntercepts();
      concederVisible(true);   // « Concéder » n'a de sens qu'en ligne, partie lancée
      hideOverlay(); revealGameUI();
      status('Partie lancée — synchronisation…');
      reqState(true);
      break;
    case 'bilan_attente':
      // Bilan de fin de tour : chacun clique OK. On dit qui manque, sinon celui qui a déjà cliqué
      // attend devant un écran muet sans savoir pourquoi le tour ne repart pas.
      bilanAttente(m.restants || []);
      break;
    case 'absence':
      // Un joueur est absent. RIEN ne se passera tout seul : on informe, et on n'offre le vote
      // que lorsque le serveur déclare l'échéance dépassée (m.votable).
      absenceBanner(m);
      break;
    case 'vote':
      absenceVoteEtat(m);
      break;
    case 'concede_vote':   // quelqu'un a concédé : à nous de dire si la partie continue
      concedePanel(m);
      break;
    case 'concede_wait':   // on a répondu, on attend les autres
      concedeAttente(m.manquants||[]);
      break;
    case 'concede_done':   // c'est tranché
      concedeFini(m);
      break;
    case 'decision':
      bandeauATonTour(false);   // une question remplace le tour d'action
      hideAbsence();   // la partie repart : plus personne n'est en attente de l'absent
      if(m.pending&&m.pending.kind!=='eot')hideBilanAttente();
      /* ⚠️ LE PLATEAU RESTAIT EN ARRIÈRE D'UNE ÉTAPE. Aucune demande d'état n'accompagnait une
         question : entre la résolution des investissements (début de tour) et la réponse à la carte
         Stratégie, l'écran montrait encore l'état d'AVANT. Marc et Laurent, tour 7 de la partie
         140A : « on pensait que les colonies de Laurent n'avaient pas été augmentées niveau 3 et on
         s'inquiétait pour rien » — Colonies Avancées venait de s'appliquer, invisible.
         On redemande donc l'état à chaque question : le plateau se met à jour derrière la fenêtre,
         et ce qu'on lit correspond à ce qui vient de se produire. */
      reqState(true);
      onDecision(m.pending);
      break;
    case 'your_action':
      STATE._confirmPending=false; hideConfirmBar();
      hideAbsence(); hideBilanAttente();
      onMyActionTurn();
      break;
    case 'confirm_pending':
      // Le serveur tient une action annulable → afficher l'état résultant + la barre Valider/Annuler.
      STATE._confirmPending=true; STATE._myTurn=false; turnBar(false); hideWaitBlock();
      reqState(true);
      showConfirmBar();
      break;
    case 'turn':
      if (m.civId !== STATE.myCiv){ STATE._myTurn=false; badgeTour(m.civId); turnBar(false); showWaitBlock(); }
      reqState();
      break;
    case 'waiting':
      if (m.civId !== STATE.myCiv){
        STATE._myTurn=false; turnBar(false);
        // Plusieurs joueurs peuvent être interrogés en même temps : on nomme celui qu'on attend
        // (le premier qui n'est pas toi), plutôt que de laisser le badge vert allumé.
        /* Plusieurs joueurs peuvent choisir EN MÊME TEMPS (agenda, investissement). Le badge nomme
           le premier ; la pastille de statut, elle, les nomme TOUS — sinon on annonçait « Choix de
           X… » alors qu'on attendait aussi Y, et le joueur croyait la partie bloquée sur une seule
           personne. Les deux ne se contredisent pas : l'un est un état, l'autre un détail. */
        const attendus=(Array.isArray(m.civIds)&&m.civIds.length?m.civIds:[m.civId]).filter(c=>c!==STATE.myCiv);
        badgeTour(attendus[0]||m.civId);
        if(attendus.length>1){
          const qui=attendus.map(civLabel);
          status('Choix de '+qui.slice(0,-1).join(', ')+' et '+qui[qui.length-1]+'…');
        }
        showWaitBlock();
      }
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
      showFinal(m.scores||[], {dateFr:m.dateFr, code:m.code});
      break;
    case 'hello_ok': break;   // protocole compatible : rien à signaler
    case 'maj_requise':       // versions incompatibles : le dire clairement plutôt que de dérailler
      status('');
      overlay('<h2>🔄 Mise à jour nécessaire</h2>'
        +'<div class="muted" style="margin:8px 0;line-height:1.5">'+(m.msg||'Ta version du jeu ne correspond plus à celle du serveur.')+'</div>'
        +'<div class="muted" style="font-size:.8em">Protocole — toi : '+(m.client!==undefined?m.client:'?')+' · serveur : '+(m.serveur!==undefined?m.serveur:'?')+'</div>'
        +'<button class="pri" id="sc-reload">↻ Recharger la page</button>');
      { const b=document.getElementById('sc-reload'); if(b)b.onclick=()=>location.reload(true); }
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
        /* JETON PÉRIMÉ (le serveur garde les jetons en MÉMOIRE : chaque redéploiement les efface).
           ⚠️ Il faut purger TOUT l'état mémorisé, pas seulement le jeton : un `sc_ws_game` resté en
           place fait ensuite tenter la reprise d'une partie qui n'existe plus, et le client s'enlise.
           Marc s'est retrouvé bloqué sur mobile — bouton sans effet — et n'a pu s'en sortir qu'en
           effaçant les données du site. Le client doit se remettre d'aplomb TOUT SEUL. */
        STATE.token=null; STATE.game=null; STATE.started=false;
        try{ localStorage.removeItem('sc_ws_token'); localStorage.removeItem('sc_ws_game'); }catch(e){}
        /* Et surtout : ne PAS ouvrir le second écran de connexion si celui du jeu est déjà à
           l'écran — deux écrans superposés, c'est exactement ce qui donne « je clique, rien ne se
           passe ». On se contente alors d'un message sur l'écran d'accueil. */
        const accueil=document.getElementById('civ-sel');
        const accueilVisible = accueil && !accueil.classList.contains('hidden') && accueil.offsetParent!==null;
        if(accueilVisible){
          const err=document.getElementById('lv-err');
          if(err) err.textContent='Session expirée — saisis ton email et ton mot de passe.';
          hideStatus();
        } else {
          status('Session expirée — reconnecte-toi.');
          screenAuth('login');
        }
      }
      else if (_errCb){ _errCb(m.msg); }
      else status('⚠️ '+m.msg);
      break;
    case 'game_ended':
      // partie quittée/terminée par un joueur → on libère tout et on revient au lobby (fix #3)
      STATE.started=false; STATE._myTurn=false; STATE._confirmPending=false;
      STATE.game=null; STATE.myCiv=null;
      try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
      hideWaitBlock(); hideConfirmBar(); turnBar(false); closeDecision(); concedeFermer(); concederVisible(false);
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
    /* L'état de CETTE partie est arrivé : les fenêtres mises de côté peuvent enfin s'afficher sur
       des chiffres qui sont les bons. */
    if(STATE._etatRecu === false){
      STATE._etatRecu = true;
      if(STATE._queue && STATE._queue.length && !STATE._answering){
        const nx = STATE._queue.shift(); setTimeout(()=>onDecision(nx), 40);
      }
    }
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
  /* ⚠️ NE JAMAIS JETER UNE DÉCISION. Avant, un `return` sec ici faisait DISPARAÎTRE toute fenêtre
     arrivant pendant qu'une autre attendait une réponse — c'est ainsi qu'une victoire au combat
     obtenue juste après la Sphère de Dyson ne s'affichait pas du tout (bug signalé le 2026-08-01).
     On les met en file : chaque fenêtre est montrée à son tour, aucune n'est perdue. */
  /* ⚠️ UNE MÊME QUESTION POUVAIT S'AFFICHER DEUX FOIS. La file écarte les doublons entre eux, mais
     jamais un doublon de la question DÉJÀ à l'écran — or `resync` (à la connexion, après un
     rafraîchissement) redistribue les questions en attente. Marc, partie 140A : « les événements du
     prochain tour ont été présentés deux fois à Laurent, au tour 1 et au tour 5 » — précisément les
     moments où l'on se (re)connecte. On retient donc l'identifiant en cours de traitement. */
  if (STATE._enCours && STATE._enCours === pending.id) return;
  if (STATE._answering || STATE._etatRecu === false){
    STATE._queue = STATE._queue || [];
    if(!STATE._queue.some(q=>q.id===pending.id)) STATE._queue.push(pending);
    return;
  }
  STATE._answering = true;
  STATE._enCours = pending.id;
  STATE._myTurn=false; turnBar(false);
  hideWaitBlock();
  reqState();
  const finish=(ans)=>{
    STATE._realDecide=null;
    bandeauATonTour(false);   // idem : répondre, c'est avoir joué
    send({t:'answer', id:pending.id, ans:ans});
    STATE._answering = false;
    STATE._enCours = null;
    showWaitBlock();
    status('En attente des autres joueurs…');
    // Fenêtre suivante de la file, s'il y en a une (voir la note en tête de onDecision).
    if(STATE._queue && STATE._queue.length){ const nx=STATE._queue.shift(); setTimeout(()=>onDecision(nx), 60); }
  };
  // VRAIES modales du jeu (même graphisme qu'en solo) pour ces décisions :
  if(pending.kind==='agenda' && showAgendaReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='strategy' && showStrategyReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='invest1' && showInvestReal(pending,1)){ STATE._realDecide=finish; return; }
  if(pending.kind==='invest2' && showInvestReal(pending,2)){ STATE._realDecide=finish; return; }
  if(pending.kind==='peace_offer' && showPeaceReal(pending)){ STATE._realDecide=finish; return; }
  if((pending.kind==='ai_dyson'||pending.kind==='human_dyson'||pending.kind==='dyson_build') && showDysonReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='war_result' && showWarResultReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='raid_hit' && showHitReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='eot' && showEotReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='event_result' && showEventResultBlocking(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='event_announce' && showEventAnnounceBlocking(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='forced_war' && showForcedWarReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='route_capture' && showRouteCaptureReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='accord_confirm' && showAccordReal(pending)){ STATE._realDecide=finish; return; }
  if(pending.kind==='espionage' && showOptsReal(pending,'espionage-modal','espionage-branch-opts','id')){ STATE._realDecide=finish; return; }
  if(pending.kind==='empath_copy' && showOptsReal(pending,'empath-copy-modal','empath-copy-opts','cardId',true)){ STATE._realDecide=finish; return; }
  // Événements interactifs : VRAIES fenêtres du jeu (les overrides _evCommPick/_evDiploConfirm envoient la réponse).
  if(pending.kind==='event_comm' && typeof window.showCommEventModal==='function'){ window._scDiploSel={}; STATE._realDecide=finish; try{ showCommEventModal(function(){}); return; }catch(e){ STATE._realDecide=null; } }
  if(pending.kind==='event_diplo' && typeof window.showDiploEventModal==='function'){ window._scDiploSel={}; STATE._realDecide=finish; try{ showDiploEventModal(function(){}); return; }catch(e){ STATE._realDecide=null; } }
  // sinon : panneau générique (restylé au look natif) pour le reste (war_combat, defense, extrasolar, strategy_calm)
  askLocalDecision(pending).then(finish).catch(()=>{ STATE._answering = false; });
}

// ── Rendu dans les VRAIES modales du jeu (réutilise le DOM + les classes CSS d'index.html) ──
// Retourne true si la modale existe (sinon repli sur le panneau générique).
// VRAIE modale Sphère de Dyson (#dyson-modal) réutilisée : accepter/refuser (ai/human_dyson) ou forcer/renoncer (dyson_build).
function showDysonReal(pending){
  const o=pending.payload||{}, k=pending.kind;
  const m=document.getElementById('dyson-modal'); if(!m) return false;
  const title=document.getElementById('dyson-title'), sub=document.getElementById('dyson-sub'), nations=document.getElementById('dyson-nations'), actions=document.getElementById('dyson-actions');
  if(!actions) return false;
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  if(nations)nations.innerHTML='';
  if(k==='ai_dyson'||k==='human_dyson'){
    const who=(window._scPseudo&&window._scPseudo[o.builder])||o.builderName||'Une nation';
    if(title)title.innerHTML='⚡ '+who+' a construit la Sphère de Dyson !';
    if(sub)sub.innerHTML='Monopole énergétique adverse. Accepte (+3<i class=ri-energy></i>/tour) ou refuse (= guerre).';
    actions.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="eot-btn" id="scd-acc" style="flex:1;margin-top:0;background:#0e2a18;border-color:#3a8a5a;color:#9fe8b8">🤝 Accepter le monopole</button><button class="eot-btn" id="scd-ref" style="flex:1;margin-top:0;background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc">⚔️ Refuser — guerre</button></div>';
    m.classList.remove('hidden');
    document.getElementById('scd-acc').onclick=()=>go({war:false});
    document.getElementById('scd-ref').onclick=()=>go({war:true});
    return true;
  }
  if(k==='dyson_build'){
    const ref=o.refusing||[];
    if(title)title.innerHTML='⚡ Sphère de Dyson construite !';
    if(sub)sub.innerHTML=ref.length?('Des nations refusent le monopole — forcer déclenche la guerre contre elles, ou renonce.'):'Toutes les nations acceptent le monopole énergétique.';
    actions.innerHTML=ref.length
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="eot-btn" id="scd-f" style="flex:1;margin-top:0;background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc"><i class=ri-energy></i> Forcer — guerre</button><button class="eot-btn" id="scd-r" style="flex:1;margin-top:0;background:#14182e;border-color:#5a6a8a;color:#aab8d8">↩️ Renoncer</button></div>'
      : '<button class="eot-btn" id="scd-f">Continuer</button>';
    m.classList.remove('hidden');
    const f=document.getElementById('scd-f'); if(f)f.onclick=()=>go({force:true});
    const r=document.getElementById('scd-r'); if(r)r.onclick=()=>go({force:false});
    return true;
  }
  return false;
}
// BILAN DE FIN DE TOUR (#eot-modal) — il n'était JAMAIS affiché en ligne (acquitté d'office par le serveur),
// alors que la séquence de tour voulue par Marc le prévoit. On affiche la vraie fenêtre du jeu.
function showEotReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('eot-modal'); if(!m) return false;
  const body=document.getElementById('eot-body');
  const mt=o.maint||{}, rv=o.revs||{};
  const rE=(typeof rEmoji==='function')?rEmoji:(r=>r);
  const li=(lbl,obj,signe)=>{ const parts=[]; for(const k of ['energy','materials','science','morale']){ const v=obj&&obj[k]; if(v)parts.push(signe+v+rE(k)); }
    return parts.length?('<div class="eot-item"><span class="eot-name">'+lbl+' : '+parts.join(' ')+'</span></div>'):''; };
  const cout=[]; if(mt.energyCost)cout.push('−'+mt.energyCost+rE('energy')); if(mt.matCost)cout.push('−'+mt.matCost+rE('materials'));
  if(mt.routeEnergyCost)cout.push('routes −'+mt.routeEnergyCost+rE('energy'));
  const ti=document.getElementById('eot-title'); if(ti)ti.textContent='📊 Bilan du Tour '+(o.turn||'');
  // Le serveur envoie le bilan COMPLET (construit par buildEOTBody dans index.html) : actions du tour,
  // entretien détaillé, revenus, une section par nation, guerre, pillages, pirates. On l'injecte tel quel
  // dans la vraie fenêtre — bilan rigoureusement identique au solo. Le résumé court ci-dessous ne sert
  // que de filet si un serveur plus ancien n'envoie pas le HTML.
  if(body)body.innerHTML = o.html || ('<div class="eot-section"><h4>📊 Fin du tour '+(o.turn||'')+'</h4>'
    +li('Revenus',rv,'+')
    +(cout.length?('<div class="eot-item"><span class="eot-name">Entretien : '+cout.join(' ')+'</span></div>'):'<div class="eot-item"><span class="eot-name">Entretien : aucun</span></div>')
    +'</div>');
  const go=()=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide({}); };
  const btn=m.querySelector('.eot-btn'); if(btn)btn.onclick=go; else { const b2=m.querySelector('button'); if(b2)b2.onclick=go; }
  m.classList.remove('hidden');
  return true;
}
// TU AS ÉTÉ ATTAQUÉ (raid, route détruite, colonie prise) : vraie fenêtre de guerre, bouton « Compris ».
function showHitReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('war-modal'); if(!m) return false;
  const t=document.getElementById('wm-title'), b=document.getElementById('wm-body'), r=document.getElementById('wm-result');
  if(t)t.textContent=o.title||'⚔️ Tu es attaqué';
  if(b)b.innerHTML=o.body||'';
  if(r)r.classList.add('hidden');
  const go=()=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide({}); };
  const btn=m.querySelector('.war-btn'); if(btn){ btn.textContent='Compris →'; btn.onclick=go; }
  m.classList.remove('hidden');
  return true;
}
// VRAIE fenêtre de RÉSULTAT DE COMBAT (#war-modal) — statique, se ferme sur « Continuer » (qui envoie l'ack).
function showWarResultReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('war-modal'); if(!m) return false;
  const t=document.getElementById('wm-title'), b=document.getElementById('wm-body'), r=document.getElementById('wm-result');
  if(t)t.textContent=o.title||'⚔️ Combat';
  if(b)b.innerHTML=o.body||'';
  if(r){ const res=o.result||null;
    // Même correctif que dans le puits de notices : ces phrases portent les icônes de ressources
    // sous forme de balises, `textContent` les affichait en clair (« class=ri-morale »).
    if(res&&res.txt){ r.innerHTML=res.txt; r.className='war-result '+(res.cls||''); r.classList.remove('hidden'); }
    else r.classList.add('hidden');
  }
  const go=()=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide({}); };
  const btn=m.querySelector('.war-btn'); if(btn)btn.onclick=go;
  m.classList.remove('hidden');
  return true;
}
// VRAIE fenêtre de RÉSULTAT D'ÉVÉNEMENT (#event-modal) en mode BLOQUANT : « Continuer » envoie l'ack.
function showEventResultBlocking(pending){
  const o=pending.payload||{};
  if(!showEventReal(o,false)) return false;
  const m=document.getElementById('event-modal');
  const btn=m?m.querySelector('.evm-btn'):null;
  if(btn)btn.onclick=()=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide({}); };
  return true;
}
// ANNONCE de l'événement du prochain tour (#event-announce-modal), à VALIDER (« Compris → »).
function showEventAnnounceBlocking(pending){
  const o=pending.payload||{};
  if(!showEventReal(o,true)) return false;
  const m=document.getElementById('event-announce-modal');
  const btn=m?m.querySelector('.ea-btn'):null;
  if(btn)btn.onclick=()=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide({}); };
  return true;
}
// VRAIE modale Route conquise (#route-capture-modal) — récupérer/détruire. Était en DOM direct, jamais routée.
function showRouteCaptureReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('route-capture-modal'); if(!m) return false;
  const t=document.getElementById('rcm-title'), d=document.getElementById('rcm-desc'), keep=document.getElementById('rcm-keep');
  if(t)t.textContent='🛤️ '+(o.name||'');
  if(d)d.innerHTML=o.prot?'Tu as <b>brisé la protection</b> ennemie (jeton détruit). 2 jetons engagés : 1 part en récupération. Que faire de la route ?':'Route ennemie <b>non protégée</b>, prise sans coût. Que faire ?';
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  const btns=m.querySelectorAll('.atk-btns button');
  if(btns[0])btns[0].onclick=()=>go({capture:true});
  if(btns[1])btns[1].onclick=()=>go({capture:false});
  m.classList.remove('hidden');
  return true;
}
// VRAIE modale Guerre Populaire Forcée (#forced-war-modal) — était affichée en DOM direct, jamais routée en ligne.
function showForcedWarReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('forced-war-modal'); if(!m) return false;
  const title=document.getElementById('fw-title'), desc=document.getElementById('fw-desc'), choices=document.getElementById('fw-choices');
  if(!choices) return false;
  const enemy=(window._scPseudo&&window._scPseudo[o.enemy])||o.enemyName||'l\'ennemi';
  if(title)title.textContent='⚔️ Guerre Populaire contre '+enemy+' !';
  if(desc)desc.innerHTML='Tension à 10 : le peuple exige que tu attaques <b>'+enemy+'</b> maintenant.';
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  let html='<div class="fw-choice" id="fw-peace">🕊️ Exiger la paix (tribut si ennemi faible, sinon la guerre continue)</div>';
  (o.routes||[]).forEach(r=>{ const can=(o.myForce||0)>=r.need; html+='<div class="fw-choice" data-rt="'+r.i+'" style="'+(can?'':'opacity:.5')+'">'+(r.prot?'🛡️':'🔓')+' Attaquer route '+r.name+' — '+r.need+' jeton'+(r.need>1?'s':'')+'</div>'; });
  if(o.colTarget)html+='<div class="fw-choice" id="fw-col">🏗️ Attaquer colonie la plus proche : '+(o.colName||o.colTarget)+'</div>';
  if(!(o.routes||[]).length && !o.colTarget)html+='<div class="fw-choice" id="fw-none">✖️ Passer — aucune cible, la pression populaire retombe</div>';
  choices.innerHTML=html;
  const pe=document.getElementById('fw-peace'); if(pe)pe.onclick=()=>go({peace:true});
  choices.querySelectorAll('.fw-choice[data-rt]').forEach(el=>{ el.onclick=()=>go({route:parseInt(el.getAttribute('data-rt'))}); });
  const col=document.getElementById('fw-col'); if(col)col.onclick=()=>go({colony:o.colTarget});
  const none=document.getElementById('fw-none'); if(none)none.onclick=()=>go({});
  m.classList.remove('hidden');
  return true;
}
// VRAIE modale Accord commercial (#accord-modal).
function showAccordReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('accord-modal'); if(!m) return false;
  const body=document.getElementById('accord-body'); const conf=document.getElementById('accord-confirm');
  if(!body||!conf) return false;
  body.innerHTML='Conclure un accord commercial avec <b>'+(o.withName||'cette nation')+'</b>'+(o.nodeName?(' sur <b>'+o.nodeName+'</b>'):'')+' ? (+3 VP chacun, met fin à une guerre)';
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  conf.onclick=()=>go({confirm:true});
  const cancel=m.querySelector('button.npop-btn'); if(cancel)cancel.onclick=()=>go({confirm:false});
  m.classList.remove('hidden');
  return true;
}
// VRAIE modale à liste d'options (#espionage-modal / #empath-copy-modal) : espionnage (branche) / télépathie (carte).
function showOptsReal(pending, modalId, contId, key, allowNone){
  const o=pending.payload||{}, opts=o.options||[];
  const m=document.getElementById(modalId), cont=document.getElementById(contId); if(!m||!cont) return false;
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  /* Les options d'espionnage sont longues (nation · catégorie · liste des technologies) : on laisse
     le texte respirer et s'aligner à gauche, sinon la liste est illisible sur mobile. */
  /* ESPIONNAGE : CASES À COCHER, une seule catégorie chez une seule nation.
     ⚠️ La liste ne proposait que « une technologie » OU « la catégorie entière » — on ne pouvait
     donc pas en prendre exactement deux, alors que la règle prévoit +6 / +8 / +10 de tension selon
     qu'on en vole une, deux ou trois. Le moteur savait compter, l'écran ne savait pas demander
     (Marc, 2026-08-15). Les autres listes d'options gardent leur affichage d'origine. */
  if(pending.kind==='espionage' && opts.some(o=>o.categorieCle)){
    let g=null, h='';
    const blocs=new Map();
    for(const o of opts){ if(o.kind!=='une'||!o.categorieCle)continue;
      if(!blocs.has(o.categorieCle))blocs.set(o.categorieCle,{groupe:o.groupe,nom:o.categorieNom,techs:[]});
      blocs.get(o.categorieCle).techs.push(o); }
    for(const [cle,b] of blocs){
      if(b.groupe&&b.groupe!==g){ g=b.groupe; h+='<div class="esp-groupe">'+esc(b.groupe)+'</div>'; }
      h+='<div class="esp-cat" data-cle="'+esc(cle)+'"><div class="esp-cat-nom">'+esc(b.nom||'')+'</div>';
      for(const t of b.techs)
        /* ⚠️ LA CASE PORTE L'IDENTIFIANT DE L'OPTION, PAS CELUI DE LA CARTE. C'est tout le
           correctif du 25/08 : on ne renvoie que ce que le moteur a proposé, comme la Télépathie
           renvoie son `cardId`. La nation et la catégorie s'en déduisent côté moteur — plus besoin
           de les fabriquer ici, donc plus personne pour les perdre en route. */
        h+='<label class="esp-tech"><input type="checkbox" data-cle="'+esc(cle)+'" value="'+esc(t.id)+'"> <span>'+(t.name||'')+'</span></label>';
      h+='<div class="esp-cat-pied"></div></div>';
    }
    const att=opts.find(o=>o.kind==='attendre');
    if(att) h+='<button class="inv-opt" id="sc-esp-att" style="cursor:pointer;width:100%;text-align:left;white-space:normal;margin-top:10px">'
      +'<div class="inv-opt-name">'+(att.name||'')+'</div><div class="inv-opt-benefit" style="white-space:normal">'+(att.desc||'')+'</div></button>';
    cont.innerHTML=h;
    const cases=[...cont.querySelectorAll('input[type=checkbox]')];
    const maj=()=>{
      cont.querySelectorAll('.esp-cat').forEach(div=>{
        const c=div.getAttribute('data-cle');
        const pris=cases.filter(x=>x.getAttribute('data-cle')===c&&x.checked);
        const pied=div.querySelector('.esp-cat-pied');
        if(!pied)return;
        pied.innerHTML=pris.length?('<button class="opt esp-go">🕵️ Voler '+pris.length+' technologie'+(pris.length>1?'s':'')+'</button>'):'';
        const b2=pied.querySelector('.esp-go');
        if(b2)b2.onclick=()=>{ go({ids:pris.map(x=>x.value)}); };
      });
    };
    // Une seule catégorie à la fois : cocher ailleurs décoche le bloc précédent.
    cases.forEach(x=>x.onchange=()=>{ if(x.checked)cases.forEach(y=>{ if(y.getAttribute('data-cle')!==x.getAttribute('data-cle'))y.checked=false; }); maj(); });
    const ba=document.getElementById('sc-esp-att'); if(ba)ba.onclick=()=>go({id:'attendre'});
    maj();
    m.classList.remove('hidden');
    return true;
  }
  let _grp=null;
  cont.innerHTML=opts.map((op,i)=>{
    let tete='';
    if(op.groupe&&op.groupe!==_grp){ _grp=op.groupe; tete='<div class="esp-groupe">'+esc(op.groupe)+'</div>'; }
    return tete+'<button class="inv-opt" data-i="'+i+'" style="cursor:pointer;width:100%;text-align:left;white-space:normal"><div class="inv-opt-name">'+(op.emoji||'')+' '+(op.name||op.id||op.branch)+'</div>'+(op.desc?'<div class="inv-opt-benefit" style="white-space:normal">'+op.desc+'</div>':'')+'</button>';
  }).join('');
  cont.querySelectorAll('.inv-opt[data-i]').forEach(b=>{ b.onclick=()=>{ const op=opts[parseInt(b.getAttribute('data-i'))]; const ans={}; ans[key]=(op[key]!==undefined?op[key]:(op.id!==undefined?op.id:op.branch)); go(ans); }; });
  m.classList.remove('hidden');
  return true;
}
/* ═══════ REFUSER LA PAIX SANS AVOIR DE QUOI SE BATTRE ═══════
   Deux amis de Marc, 17/08 : l'un refuse la paix, choisit d'attaquer, et ne découvre qu'à la
   fenêtre SUIVANTE qu'il n'a pas de quoi engager un seul jeton. À ce moment-là le choix est fait,
   le tour de guerre est engagé, et il ne lui reste qu'à se retirer.

   Le seuil est en JETONS PAYABLES, pas en ressources brutes. Marc proposait « moins de 2🪨 et
   moins de 2⚡ » ; c'est la bonne intuition, mais le compte exact dépend de l'IA de Navigation, qui
   divise le coût de guerre par deux : avec elle, 2🪨 2⚡ paient quatre jetons et l'avertissement
   serait faux. `maxEngage` est ce que le moteur autorisera réellement — la seule mesure qui ne
   puisse pas mentir. En dessous de 2, on demande confirmation ; on n'interdit rien.

   Rend `true` si on peut continuer. */
function _confirmerGuerreSansMoyens(o){
  const n=(o&&o.maxEngage!==undefined)?o.maxEngage:null;
  if(n===null||n>=2) return true;
  const s=(o&&o.stocks)||{};
  return confirm('⚠️ Tu manques de ressources pour attaquer.\n\n'
    +'Tu ne peux engager que '+n+' jeton'+(n>1?'s':'')+' ce tour-ci'
    +' (stocks : '+(s.materials||0)+'🪨 '+(s.energy||0)+'⚡ — il faut 1🪨 +1⚡ par jeton engagé).\n\n'
    +'Refuser la paix maintenant, c\'est poursuivre une guerre que tu n\'as pas les moyens de mener.\n\n'
    +'Continuer quand même ?');
}
// VRAIE modale de paix (#peace-modal) : offre de ressources +/− + Proposer la paix / Se battre.
function showPeaceReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('peace-modal'); if(!m) return false;
  let G=null; try{G=scGetG();}catch(e){}
  const me=(typeof myNation==='function'&&myNation())||(G&&G.player); if(!me) return false;
  const all=G?[G.player].concat(G.ais||[]):[];
  const atk=all.find(n=>n&&n.civ&&n.civ.id===o.attacker);
  const atkName=(window._scPseudo&&window._scPseudo[o.attacker])||o.attackerName||(atk?atk.civ.name:'Ennemi');
  if(G)G._peaceOffer={materials:0,energy:0,science:0};
  const set=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
  set('pm-combatants','<b>'+(me.civ.emoji||'')+' '+me.civ.name+'</b><span style="color:#556;font-size:.9em"> ⚔️ contre ⚔️ </span><b>'+(atk?atk.civ.emoji:'')+' '+atkName+'</b>');
  set('pm-declaredby', o.declaredBy==='player'?'Guerre déclarée par toi — l\'adversaire répond.':('Guerre déclarée par '+atkName+'.'));
  const vy=(o.vpYou&&o.vpYou.total!==undefined)?o.vpYou.total:(o.vpYou||0);
  const ve=(o.vpEnemy&&o.vpEnemy.total!==undefined)?o.vpEnemy.total:(o.vpEnemy||0);
  set('pm-context','VP — Toi : <b>'+vy+'</b> | Adversaire : <b>'+ve+'</b><br>Offre des ressources pour tenter la paix, ou refuse et combats.');
  if(typeof _updatePeaceDisplay==='function'){try{_updatePeaceDisplay();}catch(e){}}
  const close=()=>{ m.classList.add('hidden'); m.style.display='none'; };
  const btns=m.querySelectorAll('.atk-btns button');
  if(btns[0])btns[0].onclick=function(){ const off=(G&&G._peaceOffer)||{materials:0,energy:0,science:0}; close(); if(STATE._realDecide)STATE._realDecide({accept:true,offer:off}); };
  if(btns[1])btns[1].onclick=function(){ if(!_confirmerGuerreSansMoyens(o))return; close(); if(STATE._realDecide)STATE._realDecide({accept:false}); };
  m.style.display='flex'; m.classList.remove('hidden');
  return true;
}
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
    // NET (après entretien) — même source que la barre du haut ; un revenu négatif s'affiche en rouge.
    const _net=(typeof _netIncome==='function')?_netIncome(p):preview;
    const gainStr=Object.keys(_net).filter(k=>_net[k]!==0).map(k=>'<span class="agsel-res" style="color:'+(_net[k]<0?'#ff6b6b':'#7fe0a0')+'">'+rE(k)+' '+(_net[k]>0?'+':'')+_net[k]+'</span>').join('') || '—';
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
  /* Les cartes impayables sont grisées et non cliquables, EXACTEMENT comme en solo. C'est le
     moteur qui tranche (`payable`/`manque` arrivent dans la charge utile) : le client ne
     recalcule rien, sinon la règle finirait par différer entre les deux modes.
     `payable!==false` et non `payable` : un serveur d'une version antérieure n'envoie pas le
     champ, et tout griser serait pire que ne rien griser. */
  optsEl.innerHTML=opts.map(c=>{
    const ok=(c.payable!==false);
    return '<div class="inv-opt'+(ok?'':' inv-nope')+'"'+(ok?' onclick="'+selFn+'(\''+c.id+'\')"':'')+'>'
    +'<div class="inv-opt-emoji">'+(c.emoji||'')+'</div>'
    +'<div class="inv-opt-name">'+(c.name||c.id)+'</div>'
    +'<div class="inv-opt-benefit">✅ '+(c.benefit||'')+'</div>'
    +'<div class="inv-opt-cost">⚠️ '+(c.contrepartie||'')+'</div>'
    +(ok?'':'<div class="inv-opt-cost" style="color:#ff8a8a;font-weight:700">🚫 Il te manque '+(c.manque||'')+'</div>')
    +'</div>';}).join('');
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
// SUPPRIMÉE (demande de Marc) : fenêtre VERTE récapitulant sa propre action — redondante avec le plateau
// et le journal. La fonction est conservée vide car le serveur peut encore émettre ce type de notice.
function showResultToast(){ /* volontairement vide */ }

// ── Pop-up rouge : ce que font les AUTRES nations pendant la partie ──
/* ⚠️ RÉÉCRIT LE 2026-08-08 (Marc : « trop d'information en trop peu de temps »).
   Le toast reprenait les lignes du journal telles quelles, y compris « ↳ X paie : 1 AC −5🔬 » : deux
   lignes par action, dont une de comptabilité qu'on n'a pas le temps de lire en cinq secondes. Et il
   occupait toute la largeur, sous la barre du haut qu'il chevauchait à moitié.
   Désormais : une ligne par action, « Nation — verbe complément », rien d'autre. Les coûts restent
   dans le journal, consultable à froid. Rien n'est affiché pour TA propre nation : tu viens de le
   faire, tu le sais. */
const _TOAST_IGNORE=/^↳|paie\s*:|^💰|^📊|^⚙️/;
function _toastLigne(t){
  let x=String(t||'').replace(/<[^>]+>/g,'').trim();
  if(!x||_TOAST_IGNORE.test(x)) return null;
  /* ⚠️ AUCUN ÉMOJI DANS CETTE FENÊTRE (Marc, 2026-08-08). Je n'enlevais que celui de TÊTE de ligne ;
     il en restait au milieu — le drapeau de la nation, et l'icône de la carte achetée
     (« Jupitériens — achète 🌐 Communications Instantanées »). On les retire tous, d'un coup, par
     leurs plages Unicode : pictogrammes, symboles divers, drapeaux, flèches décoratives et
     sélecteurs de variante. Il ne reste que du texte. */
  x=x.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{20E3}\u{200D}]/gu,'');
  /* ⚠️ NE PAS BALAYER U+2200–U+2BFF EN BLOC : le signe moins « − » est U+2212 et s'y trouve.
     Mon premier essai effaçait donc les valeurs négatives — « −2 moral » devenait « 2 moral »,
     c'est-à-dire l'inverse. On ne retire que les plages réellement décoratives. */
  x=x.replace(/\s{2,}/g,' ').trim();
  // « Jupitériens achète X » → « Jupitériens — achète X ». Le tiret sépare l'acteur de l'action.
  const m=x.match(/^([^\s]*\s*)?(Terriens|Martiens|Jupitériens|Ceinturiens)\s+(.*)$/);
  if(m) x=m[2]+' — '+m[3];
  return x;
}
function showLogToast(txts){
  const lignes=(txts||[]).map(_toastLigne).filter(Boolean)
    .filter(l=>!(STATE.myCiv && l.indexOf(civLabel(STATE.myCiv).replace(/^\S+\s*/,''))===0));  // rien sur MA nation
  if(!lignes.length) return;
  const wait=(window._scGreenUntil||0)-Date.now();
  if(wait>0){ setTimeout(()=>{ try{ showLogToast(txts); }catch(e){} }, wait+120); return; }
  let p=document.getElementById('sc-logtoast');
  /* Moitié de la largeur disponible, centré, DANS la zone de jeu — plus sous la barre du haut, qu'il
     recouvrait. `--topband` est la hauteur mesurée de cette barre. */
  if(!p){ injectStyles(); p=el('<div id="sc-logtoast" style="position:fixed;top:calc(var(--topband,56px) + 46px);left:50%;transform:translateX(-50%);'
    +'width:min(50%,420px);z-index:8650;background:#2a0e14;border:2px solid #c0392b;border-radius:12px;padding:9px 13px;'
    +'color:#ffd7d2;font:600 .82em/1.5 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.55);display:none;text-align:left"></div>');
    document.body.appendChild(p); }
  p._buf=(p._buf||[]).concat(lignes).slice(-4);
  p.innerHTML=p._buf.join('<br>');
  p.style.display='block';
  clearTimeout(p._timer);
  p._timer=setTimeout(()=>{ p.style.display='none'; p._buf=[]; }, 5000);
}
/* ── Annonce VERTE : ce que TU viens de gagner (raid réussi, action gratuite) ───────────────────
   Elle manquait : un raid rapportait des ressources sans que rien ne le dise à l'écran, et une
   action gratuite se validait en silence. Même durée que le toast rouge, mais en bas à droite —
   à l'emplacement du bouton Valider, là où l'œil est déjà. */
function showGainToast(html){
  if(!html) return;
  let p=document.getElementById('sc-gaintoast');
  if(!p){ p=el('<div id="sc-gaintoast" style="position:fixed;right:12px;bottom:calc(var(--botband,84px) + 14px);'
    +'z-index:8660;max-width:min(60vw,340px);background:#0d2a16;border:2px solid #3fbf6a;border-radius:12px;padding:9px 13px;'
    +'color:#d6ffe4;font:600 .82em/1.5 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.55);display:none;text-align:left"></div>');
    document.body.appendChild(p); }
  p._buf=(p._buf||[]).concat([html]).slice(-3);
  p.innerHTML=p._buf.join('<br>');
  p.style.display='block';
  window._scGreenUntil=Date.now()+5000;   // le toast rouge attend son tour (ils se chevauchaient)
  clearTimeout(p._timer);
  p._timer=setTimeout(()=>{ p.style.display='none'; p._buf=[]; }, 5000);
}
try{ window.showGainToast=showGainToast; }catch(e){}

// Affiche la VRAIE modale d'événement du jeu (#event-modal / #event-announce-modal) au lieu d'un bandeau.
// Retourne true si la modale existe (sinon repli sur le bandeau). Restaure le visuel d'origine des événements.
function showEventReal(o, isAnnounce){
  const ev=o.event||{};
  if(isAnnounce){
    const m=document.getElementById('event-announce-modal'); if(!m) return false;
    const em=document.getElementById('ea-emoji'), nm=document.getElementById('ea-name'), ds=document.getElementById('ea-desc');
    if(em)em.textContent=ev.emoji||'⭐'; if(nm)nm.textContent=ev.name||'Événement'; if(ds)ds.innerHTML=ev.preview||'';
    const b=m.querySelector('.ea-btn'); if(b)b.onclick=()=>m.classList.add('hidden');
    m.classList.remove('hidden'); return true;
  }
  const m=document.getElementById('event-modal'); if(!m) return false;
  const card=document.getElementById('evm-card'); if(card)card.className='evt-card'+(ev.type?(' '+ev.type):'');
  const em=document.getElementById('evm-emoji'), bd=document.getElementById('evm-badge'), nm=document.getElementById('evm-name'), rs=document.getElementById('evm-result'), cq=document.getElementById('evm-consequence');
  const T={competition:'COMPÉTITION',menace:'MENACE',opportunite:'OPPORTUNITÉ'};
  if(em)em.textContent=ev.emoji||'🎯';
  if(bd){bd.textContent=T[ev.type]||'ÉVÉNEMENT';bd.style.background=ev.type==='menace'?'#3a1a08':ev.type==='competition'?'#3a0808':'#0a2a18';bd.style.color=ev.type==='menace'?'#ffbb77':ev.type==='competition'?'#ff7777':'#88e8b0';}
  if(nm)nm.textContent=ev.name||'Événement';
  if(rs)rs.innerHTML=o.msg||'—';
  if(cq)cq.classList.add('hidden');
  const b=m.querySelector('.evm-btn'); if(b)b.onclick=()=>m.classList.add('hidden');
  m.classList.remove('hidden'); return true;
}
// ───────────────────────── Notices (résultats de combat / événements / fin de tour) ─────────────────────────
function showNotice(m){
  const o = m.payload || {}, k = m.kind;
  // FENÊTRES AJOUTÉES SUPPRIMÉES (demande de Marc) : le bandeau #sc-notice (largeur réduite) faisait doublon
  // avec les VRAIES fenêtres du jeu. On n'utilise plus QUE celles-ci :
  //   · événement (annonce/résultat) → #event-modal / #event-announce-modal
  //   · résultat de combat           → #war-modal
  // Le reste (fin de tour, info, résultat d'action) part dans le JOURNAL, sans pop-up.
  if(k==='event_result'||k==='event_announce'){ showEventReal(o, k==='event_announce'); return; }
  if(k==='war_result'){
    const wm=document.getElementById('war-modal');
    if(wm){
      const t=document.getElementById('wm-title'), b=document.getElementById('wm-body'), r=document.getElementById('wm-result');
      if(t)t.textContent=o.title||'⚔️ Combat';
      if(b)b.innerHTML=o.body||'';
      if(r){ const res=o.result||null;
        /* ⚠️ `textContent` AFFICHAIT LE HTML EN CLAIR. Le moteur écrit ces phrases avec les icônes
           de ressources sous forme de balises — « Égalité — −1<i class=ri-morale></i> pour les
           deux » — et `textContent` les rend littéralement : le joueur lisait « class=ri-morale »
           au milieu du texte. La version solo, elle, utilise `innerHTML` deux lignes plus loin dans
           moteur.js : les deux chemins affichaient donc la même phrase différemment. */
        if(res&&res.txt){ r.innerHTML=res.txt; r.className='war-result '+(res.cls||''); r.classList.remove('hidden'); }
        else r.classList.add('hidden'); }
      const btn=wm.querySelector('.war-btn'); if(btn)btn.onclick=()=>wm.classList.add('hidden');
      wm.classList.remove('hidden');
    }
    return;
  }
  /* BILAN DE FIN DE TOUR reçu en NOTICE = je ne suis pas celui qui porte la décision, mais le bilan
     me concerne quand même : à la fin d'une manche il n'y a plus de joueur actif, tout le monde doit
     voir LE SIEN en même temps (règle posée par Marc). Le serveur envoie à chacun son propre corps
     (`payload.html`, construit par buildEOTBody dans la perspective de sa nation).
     ⚠️ Cette branche manquait : le serveur diffusait correctement, mais le client jetait la notice —
     d'où « le bilan n'est pas visible pour tous, et quand je valide les autres ne l'ont pas vu ».
     Ici PAS de réponse à envoyer : seul le porteur de la décision relance la partie ; les autres
     ferment simplement leur fenêtre. */
  if(k==='eot'){
    const em=document.getElementById('eot-modal'); if(!em) return;
    const ti=document.getElementById('eot-title'); if(ti)ti.textContent='📊 Bilan du Tour '+(o.turn||'');
    const body=document.getElementById('eot-body'); if(body)body.innerHTML=o.html||'';
    const go=()=>em.classList.add('hidden');
    const btn=em.querySelector('.eot-btn'); if(btn){ btn.textContent='Fermer'; btn.onclick=go; }
    else { const b2=em.querySelector('button'); if(b2)b2.onclick=go; }
    em.classList.remove('hidden');
    return;
  }
  /* RÉSULTAT D'UN RAID — notice personnelle, au pillard ET à la victime.
     ⚠️ Le butin ne s'affichait qu'en solo : `gainToast` s'exécute dans le moteur, or en
     multijoueur le moteur tourne sur le SERVEUR, où aucune fenêtre n'existe. Le joueur payait ses
     jetons et ne voyait rien arriver ; il fallait ouvrir le journal. On rend ici la notice que le
     serveur envoie désormais. Bandeau, pas fenêtre modale : un raid est une petite action, une
     modale à fermer serait plus lourde que le gain. */
  if(k==='raid_result'){
    const t=esc(o.title||'💰 Raid');
    const corps=o.body||'';
    /* ⚠️ J'AI FAILLI APPELER UNE FONCTION QUI N'EXISTE PAS. Le bandeau rouge s'appelle
       `showLogToast`, pas `showRedToast` — et il prend un TABLEAU de lignes brutes, qu'il filtre
       et met en forme lui-même. Un `typeof === 'function'` en garde-fou aurait masqué l'erreur :
       le pillé n'aurait simplement rien vu, et personne ne l'aurait su avant une partie réelle. */
    if(o.perte) showLogToast([t + ' — ' + corps.replace(/<[^>]+>/g, '')]);
    else showGainToast('<b>' + t + '</b><br>' + corps);
    return;
  }
  /* RÉPONSE À MA PROPOSITION D'ACCORD COMMERCIAL — notice PERSONNELLE au proposant.
     Sans ce rendu, il ne saurait pas si son partenaire a accepté (le journal seul ne suffit pas :
     Marc « les accords ne sont pas validés de manière évidente »). Réutilise la fenêtre de guerre,
     statique, fermée par le bouton. */
  if(k==='accord_result'){
    const wm=document.getElementById('war-modal'); if(!wm) return;
    const t=document.getElementById('wm-title'), b=document.getElementById('wm-body'), r=document.getElementById('wm-result');
    if(t)t.textContent=o.title||'🤝 Accord commercial';
    if(b)b.innerHTML=o.body||'';
    if(r)r.classList.add('hidden');
    const btn=wm.querySelector('.war-btn'); if(btn){ btn.textContent='Compris →'; btn.onclick=()=>wm.classList.add('hidden'); }
    wm.classList.remove('hidden');
    return;
  }
  // info / result : rien à afficher (déjà dans le journal et sur le plateau).
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
  bandeauATonTour(false);   // ← tu viens de jouer : le badge s'éteint sans attendre un message du serveur
  window._scOnPass=null; window._scOnSkip=null;
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
/* ═══════ LE SUPERCROISEUR TRAVERSE-T-IL LE RÉSEAU ? ═══════
   Marc, partie du 16/08, tour 10 — trois combats, la case ⚓ cochée à chaque fois :

       combat 1 : 1 jeton  → puissance 1   « techs : … Supercroiseur »   défaite 1 vs 4
       combat 2 : 2 jetons → puissance 2   « techs : … Supercroiseur »   défaite 2 vs 3
       combat 3 : 6 jetons → puissance 11 (+5 supercroiseur)             victoire

   Les deux premiers sont des assauts de la PHASE D'ACTIONS, le troisième un combat de FIN DE TOUR.
   Deux chemins différents, et un seul transportait le croiseur :
     · fin de tour → question `war_combat`, dont la réponse porte `cruiser:` (voir `tokenPick`) ;
     · phase d'actions → intention `{type:'attack', node, tokens}` … et rien d'autre.

   Or le bouton « ⚓ Déployer le Supercroiseur » ne fait que basculer `G._cruiserDeployTemp`, une
   variable de la page. En solo, `confirmWarCombat` la recopie dans `G._cruiserDeployed` juste avant
   de résoudre. En ligne, l'interception court-circuite ce passage : l'action part au serveur, qui
   pose `G._cruiserDeployed = !!a.cruiser` — donc `false`, faute de champ. Le joueur cochait, le
   bouton passait au vert, et le croiseur restait à quai sans un mot.

   ⚠️ ET L'AFFICHAGE ENFONÇAIT LE CLOU : le récapitulatif de combat liste « Supercroiseur » dès
   qu'on le POSSÈDE, déployé ou non (voir `techsCombat` dans moteur.js). Marc lisait
   « puissance 2 · techs : … Supercroiseur » et engageait deux jetons contre trois. */
function _croiseurCoche(){
  try{ return !!scGetG()._cruiserDeployTemp; }catch(e){ return false; }
}
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
    return {type:'attack', node, tokens, cruiser:_croiseurCoche()};
  },
  // CRITIQUE : l'assaut du PLATEAU passe par la modale de COMBAT DE GUERRE (confirmWarCombat), pas l'ancienne
  // modale d'attaque. Sans cette interception, la capture ne se faisait QUE sur l'écran du joueur (jamais envoyée
  // au serveur) → la colonie « repartait » à la resynchro suivante. On envoie l'attaque au serveur (qui capture).
  confirmWarCombat: ()=>{
    let node=null, tokens=1;
    try{ node=_warAttackColonyTarget; }catch(e){}
    try{ const sl=document.getElementById('wcm-slider'); if(sl)tokens=parseInt(sl.value)||1; }catch(e){}
    try{ const m=document.getElementById('war-combat-modal'); if(m)m.classList.add('hidden'); }catch(e){}
    if(!node) return null; // pas de cible colonie (ex. défense/tenir) → laisser le flux normal
    return {type:'attack', node, tokens:Math.max(1,tokens), cruiser:_croiseurCoche()};
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
          // Forge Orbitale : la version LOCALE de _forgeUpgrade fermait la modale de choix de lune ; comme on
          // n'exécute PAS orig (on envoie juste l'intention), il faut fermer la modale nous-mêmes — sinon elle
          // reste affichée par-dessus le jeu (bug #24 : « popup Forge qui se réaffiche, je ne vois plus le jeu »).
          if(fn==='_forgeUpgrade'){ try{ const m=document.getElementById('forge-modal'); if(m)m.classList.add('hidden'); }catch(e){} }
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
      window._scAbilityReminderSkip=function(){
        if(STATE.started){
          try{ if(window._scCloseAbilityReminder)_scCloseAbilityReminder(); }catch(e){}
          // BUG (Marc) : ce bouton envoyait TOUJOURS « passer », donc refuser la capacité faisait perdre les
          // actions restantes. Le rappel apparaissant maintenant à 1 AC, on ne passe QUE si l'AC est épuisé.
          let reste=0; try{ const me=myNation(); reste=(me&&me.acLeft)||0; }catch(e){}
          if(reste>0) return;                    // il te reste des actions → on referme, tu continues à jouer
          sendAction({type:'pass'});
          return;
        }
        return o.apply(this,arguments);
      };
      window._scAbilityReminderSkip._scOff=true;
    }
    // Événements INTERACTIFS : on réutilise les VRAIES fenêtres du jeu (showCommEventModal / showDiploEventModal).
    // Leurs fonctions d'application sont overridées → en ligne elles ENVOIENT la réponse au lieu d'appliquer localement.
    if(typeof window._evCommPick==='function' && !window._evCommPick._scOff){ const o=window._evCommPick;
      window._evCommPick=function(aiId){ if(STATE.started&&STATE._realDecide){ try{if(window._evCloseOverlay)_evCloseOverlay();}catch(e){} const f=STATE._realDecide;STATE._realDecide=null;f({aiId:aiId||null}); return; } return o.apply(this,arguments); }; window._evCommPick._scOff=true; }
    if(typeof window._evDiploToggle==='function' && !window._evDiploToggle._scOff){ const o=window._evDiploToggle;
      window._evDiploToggle=function(id,on){ if(STATE.started){ window._scDiploSel=window._scDiploSel||{}; window._scDiploSel[id]=on; } return o.apply(this,arguments); }; window._evDiploToggle._scOff=true; }
    if(typeof window._evDiploConfirm==='function' && !window._evDiploConfirm._scOff){ const o=window._evDiploConfirm;
      window._evDiploConfirm=function(){ if(STATE.started&&STATE._realDecide){ const s=window._scDiploSel||{}; const sel=Object.keys(s).filter(k=>s[k]); try{if(window._evCloseOverlay)_evCloseOverlay();}catch(e){} const f=STATE._realDecide;STATE._realDecide=null;f({selected:sel}); return; } return o.apply(this,arguments); }; window._evDiploConfirm._scOff=true; }
    if(typeof window._evDiploNone==='function' && !window._evDiploNone._scOff){ const o=window._evDiploNone;
      window._evDiploNone=function(){ if(STATE.started&&STATE._realDecide){ try{if(window._evCloseOverlay)_evCloseOverlay();}catch(e){} const f=STATE._realDecide;STATE._realDecide=null;f({selected:[]}); return; } return o.apply(this,arguments); }; window._evDiploNone._scOff=true; }
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
    <button class="opt" id="sc-t0">Non, laisser sans protection militaire</button>`);
  document.getElementById('sc-t1').onclick=()=>{ action.token=true; sendAction(action); };
  document.getElementById('sc-t0').onclick=()=>{ action.token=false; sendAction(action); };
}
// Barre de tour discrète (en haut) : le plateau reste visible et cliquable.
function turnBar(show){
  // Barre bleue « 🎮 À toi de jouer — Menu / IA / Passer » RETIRÉE (demande de Marc) : positionnée en haut,
  // elle recouvrait la barre du jeu (#top-bar : ressources + bouton Capacité). Elle était REDONDANTE :
  //  - « Passer » se fait par le bouton « Fin de Tour » natif du jeu (window._scOnPass, cf. onMyActionTurn) ;
  //  - c'est déjà la disparition du bandeau d'attente (showWaitBlock/hideWaitBlock) qui indique que c'est ton tour.
  // On ne crée plus la barre ; on retire un résidu éventuel.
  const b=document.getElementById('sc-turnbar'); if(b)b.remove();
}
function onMyActionTurn(){
  STATE._myTurn = true;   // ⚠️ AVANT badgeTour : c'est cette valeur qui décide d'afficher PASSER
  hideWaitBlock(); closeDecision(); hideStatus();
  bandeauATonTour(true);   // « A TOI DE JOUER », en haut, en majuscules (demande de Marc)
  reqState(true);                                   // état frais → plateau à jour
  window._scOnPass = ()=> sendAction({type:'pass'}); // le bouton « Fin de Tour » du jeu = passer TOUTE la manche
  window._scOnSkip = ()=> sendAction({type:'skip'}); // le bouton PASSER = renoncer à UNE action, on rejoue au tour suivant
  turnBar(true);
  // RAPPEL DU POUVOIR GRATUIT — déclenché quand il te reste **1 AC** (donc AVANT ta dernière action),
  // pendant ta phase de jeu où tu peux encore l'utiliser. Avant, il se déclenchait à 0 AC, c'est-à-dire
  // au basculement en fin de tour : il venait alors s'intercaler entre les fenêtres de guerre (bug Marc).
  // Une seule fois par tour (STATE._abilityHintTurn).
  setTimeout(()=>{
    try{
      if(!STATE._myTurn) return;
      const me=myNation(); if(!me) return;
      const G=scGetG(); const turn=(G&&G.turn)||0;
      if(STATE._abilityHintTurn===turn) return;              // déjà proposé ce tour
      if(typeof _scAbilityAvailable!=='function' || !_scAbilityAvailable()) return;
      if((me.acLeft||0)!==1) return;                          // uniquement au dernier AC
      STATE._abilityHintTurn=turn;
      if(typeof _scShowAbilityReminder==='function') _scShowAbilityReminder();
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
      <button class="opt" id="sc-t0">Non, laisser sans protection militaire</button>`);
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
/* Les noms de joueurs viennent d'ailleurs (comptes) : ils ne sont JAMAIS insérés bruts dans du HTML. */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
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
  /* Look NATIF du jeu (carte sombre, bordure violette, police du jeu), inscrit dans la BANDE CENTRALE
     (entre les barres haut/bas) — restaure l'apparence d'origine au lieu du panneau bleu minimaliste. */
  #sc-decision{position:fixed;left:0;right:0;top:var(--topband,0);bottom:var(--botband,0);z-index:375;background:rgba(4,4,18,.92);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:8px}
  #sc-decision .card{background:#0c0c24;border:2px solid #5a1a7a;border-radius:16px;padding:22px 26px;width:min(94vw,440px);max-height:none;margin:auto;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.92);color:#e6ecff;font-family:system-ui,sans-serif;text-align:center;box-sizing:border-box}
  #sc-decision h2{color:#fff;font-size:1.3em;margin:0 0 14px;font-weight:700}
  #sc-decision .muted{color:#9fb0d0;font-size:.82em}
  #sc-decision .opt{display:block;width:100%;text-align:left;margin:7px 0;padding:11px 13px;border-radius:9px;border:1px solid #2a3a6a;background:#141a30;color:#dce8ff;cursor:pointer;font-size:.92em}
  #sc-decision .opt:hover{border-color:#7a4aaa;background:#1c2340}`;
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

/* ─────────────── BANDEAU D'ABSENCE + VOTE DE REMPLACEMENT (lot 17) ───────────────
   Le serveur ne joue plus jamais à la place de personne : une partie dont le joueur
   attendu est absent ATTEND, indéfiniment. Sans ce bandeau, les autres n'auraient
   aucun moyen de savoir pourquoi rien ne bouge — ils croiraient la partie plantée.
   Le bouton ne fait qu'ENREGISTRER UN VOTE : le remplacement par une IA ne se produit
   que si TOUS les humains présents le demandent. Ne rien faire est un choix valable,
   et c'est celui par défaut : la partie attend le joueur aussi longtemps qu'il faut. */
function absenceBanner(m){
  hideAbsence();
  if(!m || !m.civId || m.civId===STATE.myCiv) return;
  /* ═══ CE BANDEAU RECOUVRAIT LE PLATEAU, ET ON NE POUVAIT RIEN Y FAIRE ═══
     Marc, partie 140A : « le message qui demande si on veut remplacer un joueur est bloquant, il
     cache ce qui est dessous ; rendre la fenêtre déplaçable et ajouter la possibilité de la réduire
     à un filet serait bien. » Il est donc DÉPLAÇABLE (souris et doigt) et RÉDUCTIBLE à une simple
     pastille. Sa position et son état replié sont mémorisés : on ne le repousse pas à chaque fois
     qu'il réapparaît.
     ⚠️ Il ne bloque rien au sens technique — aucun calque, aucun `pointer-events` — mais il occupait
     le bas de l'écran, là où sont les boutons. Le déplacer suffit ; le réduire vaut mieux. */
  let pos=null, replie=false;
  try{ pos=JSON.parse(localStorage.getItem('sc_abs_pos')||'null'); replie=localStorage.getItem('sc_abs_replie')==='1'; }catch(e){}
  const b=el('<div id="sc-absence" style="position:fixed;z-index:8200;'
    +'max-width:min(94vw,560px);background:rgba(24,30,44,.97);border:1px solid #45557a;border-radius:12px;'
    +'padding:8px 12px;color:#dbe6ff;font:600 .82em system-ui;box-shadow:0 8px 28px rgba(0,0,0,.5);text-align:center">'
    +'<div id="sc-abs-tete" style="display:flex;align-items:center;gap:8px;cursor:move;user-select:none;touch-action:none">'
      +'<span id="sc-abs-poignee" style="flex:1;text-align:left;color:#9fb4d8;font-size:.9em">⠿ Joueur absent</span>'
      +'<button id="sc-abs-reduire" title="Réduire" style="background:#1a2444;color:#9fb4d8;border:1px solid #45557a;'
        +'border-radius:7px;min-width:26px;height:22px;cursor:pointer;font-weight:800;line-height:1">–</button>'
    +'</div>'
    +'<div id="sc-abs-corps">'
      +'<div id="sc-absence-msg" style="margin:6px 0 '+(m.votable?'8px':'0')+'"></div>'
      +(m.votable
        ? '<button id="sc-absence-vote" style="background:linear-gradient(135deg,#a2542f,#7a3c20);color:#fff;border:0;'
          +'border-radius:9px;padding:7px 13px;font:700 .95em system-ui;cursor:pointer">🤖 Proposer de le remplacer par une IA</button>'
          +'<div id="sc-absence-vote-etat" style="margin-top:6px;color:#9fb4d8;font-weight:500"></div>'
        : '')
    +'</div>'
    +'</div>');
  b.querySelector('#sc-absence-msg').textContent = m.msg || '';
  document.body.appendChild(b);
  /* Position : celle qu'on avait laissée, sinon en bas au centre comme avant. */
  if(pos && typeof pos.x==='number'){ b.style.left=pos.x+'px'; b.style.top=pos.y+'px'; b.style.transform='none'; }
  else { b.style.left='50%'; b.style.bottom='64px'; b.style.transform='translateX(-50%)'; }
  const corps=b.querySelector('#sc-abs-corps'), btR=b.querySelector('#sc-abs-reduire');
  const appliquerRepli=()=>{ corps.style.display=replie?'none':''; btR.textContent=replie?'+':'–';
    btR.title=replie?'Déplier':'Réduire'; b.style.padding=replie?'4px 8px':'8px 12px'; };
  appliquerRepli();
  btR.onclick=(ev)=>{ ev.stopPropagation(); replie=!replie; appliquerRepli();
    try{ localStorage.setItem('sc_abs_replie', replie?'1':'0'); }catch(e){} };
  /* Déplacement — souris ET tactile, via les événements Pointer : une seule implémentation. */
  const tete=b.querySelector('#sc-abs-tete');
  let dx=0, dy=0, bouge=false;
  tete.addEventListener('pointerdown', (ev)=>{
    if(ev.target===btR) return;
    const r=b.getBoundingClientRect();
    b.style.left=r.left+'px'; b.style.top=r.top+'px'; b.style.bottom='auto'; b.style.transform='none';
    dx=ev.clientX-r.left; dy=ev.clientY-r.top; bouge=true;
    try{ tete.setPointerCapture(ev.pointerId); }catch(e){}
  });
  tete.addEventListener('pointermove', (ev)=>{
    if(!bouge) return;
    const x=Math.max(0,Math.min(window.innerWidth-40, ev.clientX-dx));
    const y=Math.max(0,Math.min(window.innerHeight-30, ev.clientY-dy));
    b.style.left=x+'px'; b.style.top=y+'px';
  });
  const fin=()=>{ if(!bouge)return; bouge=false;
    const r=b.getBoundingClientRect();
    try{ localStorage.setItem('sc_abs_pos', JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)})); }catch(e){} };
  tete.addEventListener('pointerup', fin);
  tete.addEventListener('pointercancel', fin);
  const bt=document.getElementById('sc-absence-vote');
  if(bt) bt.onclick=()=>{ bt.disabled=true; bt.textContent='✓ Ton vote est enregistré'; bt.style.opacity=.65; send({t:'vote_ia'}); };
}
function hideAbsence(){ const b=document.getElementById('sc-absence'); if(b) b.remove(); }

/* ═══════════════ CONCÉDER LA VICTOIRE ═══════════════
   Le bouton est dans le journal. Il n'existe QU'EN LIGNE : en solo il n'y a personne à qui
   concéder, et « Recommencer à zéro » fait déjà ce qu'il faut.

   ⚠️ Cette fenêtre a son PROPRE calque (#sc-concede), délibérément séparé de #sc-decision.
   Une concession peut tomber pendant qu'on a une question de jeu à l'écran : réutiliser le
   calque des décisions écraserait cette question, et le joueur ne la reverrait jamais. */
function concederVisible(oui){ const b=document.getElementById('conceder-btn'); if(b) b.style.display = oui ? 'block' : 'none'; }
window.scConcede = function(){
  if(!STATE.game || !STATE.started){ alert('Aucune partie en cours.'); return; }
  const ok = confirm('CONCÉDER LA VICTOIRE\n\n'
    + 'Tu renonces à la victoire et tu quittes définitivement cette partie.\n\n'
    + 'Les autres joueurs choisiront alors, à l\'unanimité, si la partie continue avec une IA '
    + 'à ta place ou si elle s\'arrête là.\n\nConfirmer ?');
  if(!ok) return;
  send({t:'concede'});
  concedePanelHTML('<h2>🏳️ Tu as concédé</h2>'
    + '<p style="color:#c7d4ee;font-size:.9em;line-height:1.5">Les autres joueurs décident si la partie '
    + 'continue avec une IA à ta place, ou si elle s\'arrête.</p>'
    + '<div id="sc-concede-etat" style="color:#9fb4d8;font-size:.84em;margin-top:10px">En attente de leur réponse…</div>');
};
function concedePanelHTML(html){
  let p=document.getElementById('sc-concede');
  if(!p){ p=el('<div id="sc-concede"></div>'); document.body.appendChild(p); }
  // z-index AU-DESSUS de #sc-decision (375) : la concession suspend la partie, elle passe devant.
  p.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;z-index:8600;background:rgba(4,4,18,.94);'
    +'backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:10px;overflow-y:auto';
  p.innerHTML='<div style="background:#0c0c24;border:2px solid #c85050;border-radius:16px;padding:22px 26px;'
    +'width:min(94vw,460px);color:#e6ecff;font-family:system-ui,sans-serif;text-align:center;'
    +'box-shadow:0 20px 60px rgba(0,0,0,.92);box-sizing:border-box">'+html+'</div>';
  return p;
}
function concedeFermer(){ const p=document.getElementById('sc-concede'); if(p) p.remove(); }
function concedePanel(m){
  if(!m || !m.civId) return;
  if(m.civId===STATE.myCiv) return;            // c'est MOI qui ai concédé : mon panneau est déjà affiché
  if(m.dejaChoisi){ concedeAttente(null); return; }
  concedePanelHTML('<h2 style="margin:0 0 12px;color:#ffd0d0;font-size:1.25em">🏳️ '
      + esc(m.qui||'Un joueur') + ' concède la victoire</h2>'
    + '<p style="color:#c7d4ee;font-size:.92em;line-height:1.5;margin:0 0 16px">Il quitte la partie. '
    + 'Sa nation, <b>' + esc(m.nation||'') + '</b>, est encore sur le plateau.<br>Que faites-vous ?</p>'
    + '<button id="sc-cc-ia" style="display:block;width:100%;margin:7px 0;padding:12px;border-radius:10px;border:1px solid #3f7a4a;'
    + 'background:#14301c;color:#cdf0d6;font:700 .95em system-ui;cursor:pointer">🤖 Continuer — une IA reprend sa nation</button>'
    + '<button id="sc-cc-stop" style="display:block;width:100%;margin:7px 0;padding:12px;border-radius:10px;border:1px solid #7a3f3f;'
    + 'background:#301414;color:#f0cdcd;font:700 .95em system-ui;cursor:pointer">🛑 Arrêter la partie maintenant</button>'
    + '<div style="color:#8fa2c4;font-size:.78em;margin-top:12px;line-height:1.45">L\'accord de tous les joueurs '
    + 'restants est nécessaire. En cas de désaccord, la partie continue avec l\'IA.<br>'
    + 'Si vous arrêtez, les scores sont calculés en l\'état et l\'email de fin part normalement.</div>'
    + '<div id="sc-concede-etat" style="color:#9fb4d8;font-size:.82em;margin-top:8px"></div>');
  const rep=(choix)=>{
    send({t:'concede_choice', choix});
    document.getElementById('sc-cc-ia').disabled=true; document.getElementById('sc-cc-stop').disabled=true;
    document.getElementById('sc-cc-ia').style.opacity=.5; document.getElementById('sc-cc-stop').style.opacity=.5;
    concedeAttente(null);
  };
  document.getElementById('sc-cc-ia').onclick=()=>rep('ia');
  document.getElementById('sc-cc-stop').onclick=()=>rep('stop');
}
function concedeAttente(manquants){
  const d=document.getElementById('sc-concede-etat'); if(!d) return;
  d.textContent = (manquants && manquants.length)
    ? 'En attente de : ' + manquants.join(', ')
    : 'Réponse enregistrée. En attente des autres joueurs…';
}
function concedeFini(m){
  concedeFermer();
  const jeSuisLePartant = (m && m.civId===STATE.myCiv);
  if(m && m.issue==='ia'){
    if(jeSuisLePartant){
      concedePanelHTML('<h2 style="margin:0 0 12px;color:#ffd0d0">🏳️ Tu as quitté la partie</h2>'
        + '<p style="color:#c7d4ee;font-size:.92em;line-height:1.5">Une IA a repris ta nation ; la partie continue sans toi.</p>'
        + '<button onclick="location.reload()" style="margin-top:14px;padding:11px 20px;border-radius:10px;border:0;'
        + 'background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;font:700 .95em system-ui;cursor:pointer">Retour à l\'accueil</button>');
    }else{
      showLogToast(['🤖 Une IA reprend la nation du joueur parti — la partie continue.']);
    }
    return;
  }
  // 'stop' : le message 'over' arrive juste après et affiche l'écran de fin. On ne fait rien de plus.
}

/* ─── BILAN DE FIN DE TOUR : QUI N'A PAS ENCORE CLIQUÉ ───
   Le bilan est désormais MULTI-ACTIF : le tour ne repart qu'au dernier clic (demande de Marc).
   Sans ce bandeau, celui qui a déjà cliqué reste devant un écran figé sans comprendre : il croit
   la partie plantée. On nomme donc les joueurs attendus, et on efface dès que tout le monde a lu. */
function bilanAttente(restants){
  const moi=STATE.myCiv;
  const autres=(restants||[]).filter(c=>c!==moi);
  const b=document.getElementById('sc-bilan-attente');
  if(!restants||!restants.length||( restants.length===1 && restants[0]===moi )){ if(b)b.remove(); return; }
  const txt = autres.length
    ? '⏳ Bilan : on attend encore '+autres.map(civLabel).join(', ')+'.'
    : '⏳ Bilan : les autres joueurs ont terminé.';
  if(b){ const d=b.querySelector('span'); if(d)d.textContent=txt; return; }
  const el2=el('<div id="sc-bilan-attente" style="position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:8300;'
    +'max-width:min(94vw,560px);background:rgba(24,30,44,.97);border:1px solid #45557a;border-radius:12px;'
    +'padding:8px 14px;color:#dbe6ff;font:600 .82em system-ui;box-shadow:0 8px 28px rgba(0,0,0,.5);text-align:center">'
    +'<span></span></div>');
  el2.querySelector('span').textContent=txt;
  document.body.appendChild(el2);
}
function hideBilanAttente(){ const b=document.getElementById('sc-bilan-attente'); if(b) b.remove(); }

/* ─── « A TOI DE JOUER » ───
   Demande de Marc (2026-08-07) : un bandeau EN HAUT, EN MAJUSCULES, quand c'est son tour.
   Jusqu'ici l'information n'existait que par la barre de tour et par l'ABSENCE de message
   d'attente — autant dire pas du tout sur mobile, où l'on ne savait pas si la partie attendait
   quelqu'un d'autre. Il s'efface dès que le tour passe : un bandeau qui reste ne veut plus rien
   dire au bout de deux minutes. */
/* ⚠️ LE BADGE EST DANS LA BARRE DU HAUT, PAS FLOTTANT AU-DESSUS DU JEU.
   Trois tentatives, trois fois le même tort : j'ai posé un élément flottant, et un élément flottant
   se superpose forcément à quelque chose. Il est maintenant DANS `#top-bar`, hors du flux (donc la
   barre ne change pas de hauteur), calé en bas à droite sous le bouton Capacité.

   IL DIT AUSSI QUI JOUE QUAND CE N'EST PAS TOI (demande de Marc) : vert « À TOI », rouge
   « LE CEINTURIEN JOUE », ou « IA JOUE » si le siège est tenu par l'ordinateur. Avant, cette
   information vivait dans une pastille flottante séparée (`#sc-status`) qui disait « Choix de… » —
   deux endroits pour une seule question, « est-ce mon tour ? ». Il n'y en a plus qu'un. */
const _SINGULIER={terriens:'LE TERRIEN',martiens:'LE MARTIEN',jupiteriens:'LE JUPITÉRIEN',ceinturiens:'LE CEINTURIEN'};
function _estIA(civId){
  try{ const s=(STATE.game&&STATE.game.seats||[]).find(x=>x.civId===civId); return !!(s&&s.ai); }catch(e){ return false; }
}
/* qui : 'moi' | un civId | null (rien à afficher) */
function badgeTour(qui){
  /* Le bouton PASSER n'apparaît QUE pendant TON tour d'action — pas quand une question t'est posée
     (là, il faut répondre, pas passer) ni quand c'est le tour d'un autre. */
  const _pb=document.getElementById('passer-btn');
  if(_pb){
    _pb.classList.toggle('on', qui==='moi' && !!STATE._myTurn);
    /* PASSER ≠ Fin de Tour : il renonce à UNE action (_scOnSkip), pas à la manche entière (_scOnPass). */
    if(!_pb._lie){ _pb._lie=true; _pb.onclick=()=>{ if(typeof window._scOnSkip==='function') window._scOnSkip(); }; }
  }
  const b=document.getElementById('a-toi-badge');
  const tb=document.getElementById('top-bar');
  const vieux=document.getElementById('sc-a-toi'); if(vieux)vieux.remove();   // résidu d'une version précédente
  if(!b) return;
  if(!qui){ b.classList.remove('on'); if(tb)tb.classList.remove('a-toi'); return; }
  if(qui==='moi'){
    b.textContent='À TOI';
    b.style.background='linear-gradient(135deg,#1f7a3a,#146030)';
    b.style.borderColor='#35a35c';
  }else{
    b.textContent=(_estIA(qui) ? 'IA JOUE' : ((_SINGULIER[qui]||String(qui).toUpperCase())+' JOUE'));
    b.style.background='linear-gradient(135deg,#8f2b2b,#6b1d1d)';
    b.style.borderColor='#c05555';
  }
  b.classList.add('on');
  if(tb) tb.classList.add('a-toi');
  if(qui==='moi') hideStatus();   // c'est ton tour : aucun « on attend X » ne doit rester affiché
}
// Ancien nom, conservé : il est appelé à une dizaine d'endroits.
function bandeauATonTour(afficher){ badgeTour(afficher?'moi':null); }
function absenceVoteEtat(m){
  const d=document.getElementById('sc-absence-vote-etat'); if(!d) return;
  const n=(m.manquants||[]).length;
  d.textContent = n ? ('En attente de '+n+' autre'+(n>1?'s':'')+' joueur'+(n>1?'s':'')+' pour que le remplacement ait lieu.')
                    : 'Vote complet — remplacement en cours…';
}
let _notYourTurnTs=0;
function notYourTurnToast(){
  // Fenêtre flottante SUPPRIMÉE (demande de Marc) : on utilise la ligne d'aide NATIVE du jeu (setHint),
  // en bas du plateau — pas de pop-up en plus.
  const now=Date.now(); if(now-_notYourTurnTs<1500) return; _notYourTurnTs=now;
  try{ const el2=document.getElementById('sc-nyt'); if(el2)el2.remove(); }catch(e){}
  try{ if(typeof setHint==='function'){ setHint('⏳ Ce n\'est pas ton tour — tu peux consulter la carte, le journal, l\'empire et la diplomatie.'); setTimeout(()=>{ try{ setHint(''); }catch(e){} },2500); } }catch(e){}
}

// Étiquette de version affichée sur l'écran de connexion. Si index.html et online.js portent des
// builds différents, on affiche les DEUX en rouge : c'est le signe d'un upload partiel ou d'un cache.
function _buildLabel(){
  const h=(typeof window!=='undefined'&&window.SOLAR_BUILD_HTML)||null;
  const j=SOLAR_BUILD_JS;
  if(!h) return 'Version '+j+' <span style="color:#ff8a8a">(jeu : version inconnue — index.html non à jour)</span>';
  if(h===j) return 'Version '+h;
  return '<span style="color:#ff8a8a">Versions incohérentes — jeu : '+h+' · en ligne : '+j+'</span>';
}
// ── Connexion / inscription (pseudo, pas email — comptes du serveur live) ──
function screenAuth(mode){
  const isReg = mode==='register';
  let savedUser=''; try{ savedUser=localStorage.getItem('sc_ws_user')||''; }catch(e){}
  overlay(`
    <h2>${isReg?'Créer un compte':'Connexion'} — Solar</h2>
    <input id="sc-u" type="email" inputmode="email" placeholder="Ton adresse email" autocomplete="email" enterkeyhint="next" value="${savedUser}">
    <div style="position:relative">
      <input id="sc-p" type="password" placeholder="Mot de passe (min. 6)" autocomplete="${isReg?'new-password':'current-password'}" enterkeyhint="go" style="padding-right:44px">
      <button type="button" id="sc-eye" title="Afficher / masquer le mot de passe" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;border:0;color:#8fb0e0;font-size:1.1em;cursor:pointer;padding:4px 8px">👁</button>
    </div>
    <div class="muted" style="font-size:.78em;margin:2px 0 6px">Ton email sert d'identifiant et reçoit les scores de fin de partie.</div>
    <div class="err" id="sc-err"></div>
    <button class="pri" id="sc-go">${isReg?'Créer le compte':'Se connecter'}</button>
    <button class="sec" id="sc-alt">${isReg?"J'ai déjà un compte":'Créer un compte'}</button>
    <button class="sec" id="sc-close">↩ Retour au jeu solo</button>
    <div style="margin-top:10px;text-align:center;font-size:.85em">
      <a href="tutorial.html" style="color:#8fc8ff;text-decoration:none">🎓 Découvrir le jeu — tutoriel</a>
      <span style="color:#3a4a6a"> · </span>
      <a href="regles.html" style="color:#8fc8ff;text-decoration:none">📖 Règles</a>
    </div>
    <div class="muted" style="font-size:.72em;opacity:.7;margin-top:9px;text-align:center">${_buildLabel()}</div>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  /* Touche « Aller » du clavier : ces champs ne sont pas dans un <form>, il n'y a donc aucune
     validation implicite. Sans ça, la flèche du clavier mobile ne fait rien (signalé par Marc). */
  {const _u=document.getElementById('sc-u'), _p=document.getElementById('sc-p');
   const _onKey=(ev)=>{ if(!ev||ev.key!=='Enter')return; ev.preventDefault();
     if(ev.target===_u && _p && !_p.value){ _p.focus(); return; }
     try{ ev.target.blur(); }catch(e){}
     const go=document.getElementById('sc-go'); if(go)go.click(); };
   if(_u)_u.addEventListener('keydown',_onKey); if(_p)_p.addEventListener('keydown',_onKey);}
  // Œil : afficher / masquer le mot de passe
  {const eye=document.getElementById('sc-eye'), pw=document.getElementById('sc-p');
   if(eye&&pw)eye.onclick=()=>{ const show=pw.type==='password'; pw.type=show?'text':'password'; eye.textContent=show?'🙈':'👁'; pw.focus(); };}
  document.getElementById('sc-close').onclick = ()=>{ _errCb=null; hideOverlay(); };
  document.getElementById('sc-go').onclick = ()=>{
    const user=document.getElementById('sc-u').value.trim(), pass=document.getElementById('sc-p').value;
    if(!/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(user)){ _errCb('Entre une adresse email valide (ex. prenom@domaine.ch)'); return; }
    STATE._pendingPass = pass;
    STATE._afterLogin = ()=>{ _errCb=null; screenLobby(); };
    send(isReg ? {t:'register', user, pass} : {t:'login', user, pass});
  };
  document.getElementById('sc-alt').onclick = ()=> screenAuth(isReg?'login':'register');
}

// ── Lobby ──
const CIVS_LIST = [['terriens','🌍 Terriens'],['martiens','🔴 Martiens'],['jupiteriens','🟠 Jupitériens'],['ceinturiens','☄️ Ceinturiens']];
function civLabel(id){ const c=CIVS_LIST.find(x=>x[0]===id); return c?c[1]:id; }
/* Date et heure EUROPÉENNES, comme le reste des rapports (Marc). */
function _dateFr(ms){
  if(!ms) return '';
  try{ return new Date(ms).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return ''; }
}
/* Une ligne de partie reprenable : qui joue, où en est-on, et faut-il y aller MAINTENANT. */
function _ligneReprise(p){
  const nomCiv = id => { const t={terriens:'🌍 Terriens',martiens:'🔴 Martiens',jupiteriens:'🟠 Jupitériens',ceinturiens:'☠️ Ceinturiens'}; return t[id]||id; };
  const joueurs = (p.joueurs||[]).map(j=>{
    if(j.ia) return '<span style="opacity:.6">'+nomCiv(j.civId)+' (IA)</span>';
    const pastille = j.connecte ? '🟢' : '⚪';
    return pastille+' '+nomCiv(j.civId)+(j.moi?' <b>(toi)</b>':(j.user?' <span style="opacity:.7">'+esc(j.user)+'</span>':''));
  }).join(' · ');
  const tour = p.tour ? ('tour '+p.tour+(p.maxTours?('/'+p.maxTours):'')) : (p.statut==='lobby'?'pas encore commencée':'—');
  const urgent = p.aMoiDeJouer;
  /* La corbeille est À CÔTÉ du bouton, jamais DEDANS : un bouton dans un bouton n'est pas du HTML
     valide et le clic partirait au mauvais endroit. (Marc, 04/09 : « supprimer les parties test ».) */
  return '<div style="display:flex;gap:6px;align-items:stretch;margin:6px 0">'
    +'<button class="'+(urgent?'pri':'sec')+' sc-reprise" data-code="'+esc(p.code)+'"'
    +' style="flex:1;text-align:left;white-space:normal;margin:0;padding:10px 12px">'
    +'<div style="font-weight:700">'+(urgent?'▶ À TOI DE JOUER — ':'')+'Partie '+esc(p.code)+' · '+tour+'</div>'
    +'<div style="font-size:.85em;opacity:.9;margin-top:3px">'+joueurs+'</div>'
    +'<div style="font-size:.78em;opacity:.65;margin-top:3px">dernière activité : '+_dateFr(p.maj)+'</div>'
    +'</button>'
    +'<button class="sec sc-suppr" data-code="'+esc(p.code)+'" title="Supprimer cette partie"'
    +' style="margin:0;padding:0 12px;flex:0 0 auto;border-color:#7a2a2a;color:#ff9999">🗑</button>'
    +'</div>';
}
function screenLobby(){
  STATE.game=null; STATE.myCiv=null; STATE.started=false;
  STATE._surLobby=true;
  try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
  /* ⚠️ LA LISTE VIENT DU SERVEUR, PAS DU NAVIGATEUR. Avant, on ne pouvait rejoindre que la dernière
     partie mémorisée en local : vider le cache, changer d'appareil ou mener deux parties de front,
     et la partie devenait introuvable — alors qu'elle vivait toujours côté serveur. */
  const parties = Array.isArray(STATE.parties) ? STATE.parties : [];
  const bloc = parties.length
    ? ('<div style="margin:6px 0 2px;font-weight:700">Reprendre une partie</div>'
       + parties.map(_ligneReprise).join('')
       + '<div style="border-top:1px solid #2a3a6a;margin:12px 0 8px"></div>')
    : '';
  overlay(`
    <h2>Bonjour ${STATE.user}</h2>
    ${bloc}
    <button class="pri" id="sc-create">Créer une partie</button>
    <div class="row"><input id="sc-code" placeholder="Code d'invitation"><button class="sec" id="sc-join">Rejoindre</button></div>
    <div class="err" id="sc-err"></div>
    <button class="sec" id="sc-refresh">🔄 Rafraîchir mes parties</button>
    <button class="sec" id="sc-logout">Se déconnecter</button>
    <button class="sec" id="sc-close">↩ Retour au jeu solo</button>
    <!-- ATTENTION : ce bloc est dans un gabarit JS. Pas de guillemet oblique ici, il refermerait
         le gabarit et casserait tout le fichier (erreur commise en écrivant ce commentaire).
         LE LIEN DU TUTORIEL EXISTAIT DEJA, MAIS SUR L'AUTRE ECRAN (Marc, 26/08). L'ecran de saisie
         de l'email le porte depuis longtemps ; seulement, des qu'un compte est memorise, on ne le
         voit plus : on arrive directement ICI. C'est donc cet ecran-la qui est la fenetre de
         connexion pour un joueur qui revient. Les deux le portent maintenant : un lien d'aide doit
         etre la ou l'on hesite, pas la ou l'on tape. -->
    <div style="margin-top:10px;text-align:center;font-size:.85em">
      <a href="tutorial.html" style="color:#8fc8ff;text-decoration:none">🎓 Découvrir le jeu — tutoriel</a>
      <span style="color:#3a4a6a"> · </span>
      <a href="regles.html" style="color:#8fc8ff;text-decoration:none">📖 Règles</a>
    </div>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  [...document.querySelectorAll('.sc-reprise')].forEach(b=>{
    b.onclick = ()=>{ STATE._surLobby=false; send({t:'join', code:b.getAttribute('data-code')}); };
  });
  /* Supprimer est définitif : on demande confirmation, et on reste sur le lobby. */
  [...document.querySelectorAll('.sc-suppr')].forEach(b=>{
    b.onclick = ()=>{
      const code=b.getAttribute('data-code');
      if(!confirm('Supprimer définitivement la partie '+code+' ?')) return;
      send({t:'supprimer_partie', code});
    };
  });
  document.getElementById('sc-refresh').onclick = ()=> send({t:'mes_parties'});
  document.getElementById('sc-create').onclick = ()=>{ STATE._surLobby=false; screenCreate(); };
  document.getElementById('sc-join').onclick = ()=>{
    const code=document.getElementById('sc-code').value.trim().toUpperCase();
    if(code){ STATE._surLobby=false; send({t:'join', code}); }
  };
  document.getElementById('sc-logout').onclick = ()=>{ try{ if(STATE.game&&STATE.game.code) send({t:'leave'}); }catch(e){} STATE.user=null; STATE.token=null; STATE.game=null; try{localStorage.removeItem('sc_ws_token'); localStorage.removeItem('sc_ws_game');}catch(e){} screenAuth('login'); };
  document.getElementById('sc-close').onclick = ()=>{ _errCb=null; STATE._surLobby=false; hideOverlay(); };
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
// Le bouton « 👁 Voir le plateau » a été RETIRÉ (demande de Marc) : c'était un ajout de la version en ligne,
// absent du jeu d'origine. Les fenêtres se comportent désormais comme celles du jeu (on répond, elles se ferment).
function decisionPanel(html){
  let p=document.getElementById('sc-decision');
  if(!p){ injectStyles(); p=el('<div id="sc-decision"></div>'); document.body.appendChild(p); }
  p.innerHTML='<div class="card">'+html+'</div>';
  p.style.display='flex';
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
    const TITLES={raid_result:'💰 Résultat du raid',raid_hit:'⚠️ Tu es pillé',accord_result:'🤝 Réponse à ton accord',raid_target:'💰 Quelle nation piller ?',accord_request:'🤝 Proposition d\'accord commercial',agenda:'Choisis ton agenda secret',strategy:'Carte Stratégie',strategy_calm:'Calmer une tension',invest1:'Investissement (Niv.1)',invest2:'Investissement (Niv.2)',espionage:'🕵️ Espionnage : quelle filière copies-tu ?',extrasolar:'Exploration extra-solaire',empath_copy:'Télépathie : carte à copier',ai_dyson:'Sphère de Dyson adverse',dyson_build:'Ta Sphère de Dyson',peace_offer:'Offre de paix',war_combat:'Combat',accord_confirm:'Accord commercial',defense:'Défense !',peace_answer:'🕊️ Proposition de paix',war_initiative:'🌀 Hyperpropulsion : qui frappe en premier ?'};
    /* ⚠️ LE REPLI AFFICHAIT LE NOM TECHNIQUE DE LA FENÊTRE. Marc, 27/08 : « le résultat du raid
       indique : raid_result mais pas ce qu'on a gagné ». `TITLES[k]||k` : quand le type n'est pas
       dans la table, l'utilisateur lisait `raid_result` — un identifiant de code, sans le moindre
       contenu, alors que le moteur avait pourtant envoyé titre ET butin dans la charge utile.
       Le défaut n'est pas ce type-là, c'est le REPLI : il reviendra à chaque nouveau type de
       fenêtre. On lit donc d'abord ce que le moteur a écrit (`payload.title`), et on ne montre un
       identifiant de code que s'il n'y a vraiment rien d'autre — cas où l'on préfère encore un mot
       obscur à une fenêtre vide. */
    let body='<h2>'+esc(o.title||TITLES[k]||k)+'</h2>';
    /* Et le CORPS envoyé par le moteur doit s'afficher, quel que soit le type : c'est là que vivent
       le butin d'un raid, le motif d'un refus, le détail d'un combat. */
    if(o.body) body+='<div style="margin:4px 0 10px">'+o.body+'</div>';
    if(k==='defense'){
      // CHOIX TACTIQUE DE DÉFENSE : combien de jetons engager (0 = ne pas défendre) + Supercroiseur éventuel.
      const max=o.maxDef||0;
      const who=(window._scPseudo&&window._scPseudo[o.attacker])||o.attackerName||o.attacker;
      const cible=o.target?((o.target.type==='route'?'🛤️ route ':'🏙️ ')+o.target.name):'tes positions';
      const cc=o.cruiserCost||{materials:5,energy:5};
      body='<h2>🛡️ Défense !</h2>'
        +'<div style="margin-bottom:8px"><b>'+who+'</b> assaille <b>'+cible+'</b>.<br>'
        +'<span class="muted">Force de l\'assaut : ~'+(o.threat||0)+'⚔️ · tes jetons engageables : '+max+' (1🪨 +1⚡ chacun)</span></div>'
        +'<input type="range" id="sc-d" min="0" max="'+max+'" value="'+Math.min(2,max)+'" style="width:100%">'
        +'<div style="margin:4px 0 8px">Défense : <b id="sc-dv">'+Math.min(2,max)+'</b> jeton(s)</div>'
        +(o.cruiser?('<label class="opt" style="display:block;text-align:left;cursor:pointer"><input type="checkbox" id="sc-cru" style="margin-right:8px">⚓ Déployer le <b>Supercroiseur</b> (+'+(o.cruiserPower||5)+'⚔️, −'+cc.materials+'🪨 −'+cc.energy+'⚡)</label>'):'')
        +'<button class="opt" id="sc-ok">🛡️ Défendre</button>'
        +'<button class="opt" id="sc-none" style="background:#2a2f45">La colonie se défend toute seule avec ses jetons (1 pour une colonie, 10 pour la base de ta nation)</button>';
      decisionPanel(body);
      const sl=document.getElementById('sc-d'), dv=document.getElementById('sc-dv');
      if(sl)sl.oninput=()=>{ dv.textContent=sl.value; };
      const cru=()=>{ const c=document.getElementById('sc-cru'); return !!(c&&c.checked); };
      document.getElementById('sc-ok').onclick=()=>done({defTokens:parseInt(sl.value)||0, cruiser:cru()});
      document.getElementById('sc-none').onclick=()=>done({defTokens:0, cruiser:false});
      return;
    }
    if(k==='war_combat'){
      const force=o.myForce||0;
      // Le curseur est borné au VRAI plafond du moteur (jetons possédés ET payables). Sinon le
      // joueur engage 15 et le moteur n'en retient que ce qu'il peut payer, sans qu'il le voie.
      const maxF=(o.maxEngage!==undefined)?o.maxEngage:force;
      /* ⚠️ LE CROISEUR SE PAIE AUSSI, ET LE CURSEUR L'IGNORAIT. Le serveur envoie maintenant DEUX
         plafonds : sans croiseur, et avec sa réserve déduite. Cocher la case rabaisse donc le
         maximum en direct, au lieu de laisser le joueur engager une force que le moteur rognerait
         ensuite en silence (Marc, 2026-08-15 : « vérifie que j'avais assez de ressources »). */
      const maxFCru=(o.maxEngageAvecCroiseur!==undefined)?o.maxEngageAvecCroiseur:maxF;
      const cru=o.cruiser||{has:false,afford:false,power:5};
      const cols=o.cols||[]; const threat=o.aiThreat;
      const routes=o.routes||[]; const estAgresseur=!!o.estAgresseur;
      const tokenPick=(title,hint,onOk)=>{ // sous-écran : choisir les jetons engagés (+ supercroiseur)
        const limite=(maxF<force)?('<div style="color:#ffcc88;font-size:.82em;margin-bottom:4px">⚠️ Tu possèdes '+force+' jeton(s) mais ne peux en <b>payer</b> que '+maxF+' (1🪨 +1⚡ par jeton engagé).</div>'):'';
        const cruLigne=cru.has
          ? ('<label style="display:flex;align-items:center;gap:8px;margin:8px 0;'+(cru.afford?'':'opacity:.5')+'">'
             +'<input type="checkbox" id="sc-cru" style="width:auto"'+(cru.afford?'':' disabled')+'>'
             +'<span>⚓ Déployer le Supercroiseur <b>+'+(cru.power||5)+'⚔️</b>'+(cru.afford?'':' — ressources insuffisantes')+'</span></label>')
          : '';
        decisionPanel('<h2>'+title+'</h2>'+(hint?'<div class="muted" style="margin-bottom:6px">'+hint+'</div>':'')+limite
          +'<div>Jetons engagés : <b id="sc-wcv">'+Math.min(1,maxF)+'</b> / <b id="sc-wcmax">'+maxF+'</b></div>'
          +'<input type="range" id="sc-wc" min="0" max="'+maxF+'" value="'+Math.min(1,maxF)+'" style="width:100%">'
          +cruLigne
          +'<div id="sc-wclim" style="color:#ffcc88;font-size:.8em;min-height:1em"></div>'
          +'<button class="opt" id="sc-wcok">✓ Engager</button><button class="opt" id="sc-wcback">↩ Retour</button>');
        const sl=document.getElementById('sc-wc'), dv=document.getElementById('sc-wcv'); if(sl)sl.oninput=()=>dv.textContent=sl.value;
        /* La case du croiseur rabat le maximum du curseur, et l'annonce. */
        const _cb=document.getElementById('sc-cru'), _lim=document.getElementById('sc-wclim');
        const _maj=()=>{
          if(!sl)return;
          const m=(_cb&&_cb.checked)?maxFCru:maxF;
          sl.max=m; if((parseInt(sl.value)||0)>m) sl.value=m;
          if(dv)dv.textContent=sl.value;
          const t=document.getElementById('sc-wcmax'); if(t)t.textContent=m;
          if(_lim)_lim.textContent=(_cb&&_cb.checked&&maxFCru<maxF)
            ? ('⚓ Le Supercroiseur réserve des ressources : maximum ramené à '+maxFCru+' jeton(s).') : '';
        };
        if(_cb)_cb.onchange=_maj;
        _maj();
        document.getElementById('sc-wcok').onclick=()=>{
          const c=document.getElementById('sc-cru');
          onOk(parseInt(sl.value)||0, !!(c&&c.checked));
        };
        document.getElementById('sc-wcback').onclick=()=>main();
      };
      const main=()=>{
        let b='<h2>⚔️ Combat de guerre — '+(o.enemyName||'ennemi')+'</h2>';
        b+='<div class="muted" style="margin-bottom:8px">Jetons engageables : <b>'+maxF+'</b>'+((maxF<force)?(' <span style="color:#ffcc88">(sur '+force+' possédés — limité par tes ressources)</span>'):'')+' · Tour de guerre restant : '+(o.warTurnsLeft||'?')+'</div>';
        if(threat) b+='<div style="background:#2a1200;border:1px solid #cc6622;border-radius:8px;padding:7px 10px;margin-bottom:8px;color:#ffcfa0;font-size:.85em">🛡️ L\'ennemi menace : <b>'+(threat.type==='colony'?'🏙️ ':'🛤️ ')+threat.name+'</b>. Tu peux <b>défendre</b>.</div>';
        // Attaquer une colonie ennemie
        if(cols.length){
          b+='<div style="font-weight:700;color:#ff9966;margin:4px 0 3px">⚔️ Attaquer une colonie</div>';
          b+=cols.map((c,i)=>'<button class="opt" data-col="'+i+'"'+(maxF<1?' disabled style="opacity:.45"':'')+'>'+(c.isFocus?'🎯 ':'')+(c.emoji||'')+' <b>'+c.name+'</b> Nv.'+c.level+(c.isHome?' 🏠 QG':'')+' <span class="muted">('+c.dist+' nœud'+(c.dist>1?'s':'')+')</span>'+(c.isFocus?' <span style="color:#ffcc66">— gagne = capture !</span>':'')+'</button>').join('');
        } else b+='<div class="muted">Aucune colonie ennemie à portée.</div>';
        /* ═══ ATTAQUER UNE ROUTE — CETTE LISTE ÉTAIT ENVOYÉE ET JAMAIS AFFICHÉE ═══
           Le serveur remplit `payload.routes` depuis toujours ; ce panneau ne l'a jamais lue. En
           multijoueur, la guerre offrait donc strictement moins d'options qu'en solo, en silence.
           Une route non protégée coûte 1 jeton et rien d'autre, une route protégée en coûte 2 :
           c'est souvent le seul coup jouable quand on n'a plus de quoi monter un assaut. */
        if(routes.length){
          b+='<div style="font-weight:700;color:#88bbee;margin:8px 0 3px">🛤️ Attaquer une route</div>';
          b+=routes.map(r=>{ const peut=force>=r.cost;
            return '<button class="opt" data-rt="'+r.i+'"'+(peut?'':' disabled style="opacity:.45"')+'>'
              +(r.protected?'🛡️':'🔓')+' <b>'+r.name+'</b> — '+r.cost+' jeton'+(r.cost>1?'s':'')
              +(r.protected?' <span class="muted">(protégée)</span>':' <span class="muted">(non protégée)</span>')+'</button>'; }).join('');
        }
        // Défendre / Se retirer
        if(threat) b+='<button class="opt" id="sc-wc-def" style="border-color:#cc6622">🛡️ Défendre (choisir jetons)</button>';
        /* ⚠️ CE BOUTON N'EST PLUS CONDITIONNEL, ET C'EST TOUT LE CORRECTIF DU 17/08.
           Il n'apparaissait pas pour celui qui avait déclaré la guerre. Sans ressources pour
           attaquer et sans menace à repousser, la fenêtre n'avait plus rien de cliquable : deux
           amis de Marc y ont perdu leur partie. Il y a désormais toujours une sortie. */
        b+='<button class="opt" id="sc-wc-hold" style="border-color:#4488cc">'
          +(estAgresseur?'🚪 Renoncer à l\'assaut ce tour <span class="muted">(la guerre continue)</span>'
                        :'🕊️ Tenir position (ne rien engager)')+'</button>';
        /* Et on DIT pourquoi tout est gris, au lieu de laisser croire à une fenêtre cassée. */
        if(maxF<1) b+='<div style="color:#ffcc88;font-size:.82em;margin-top:6px">⚠️ Tu n\'as pas de quoi engager un seul jeton (1🪨 +1⚡ chacun) : aucune attaque n\'est possible ce tour-ci.</div>';
        decisionPanel(b);
        document.querySelectorAll('#sc-decision .opt[data-col]').forEach(btn=>{ if(btn.disabled)return; btn.onclick=()=>{ const c=cols[parseInt(btn.getAttribute('data-col'))]; tokenPick('⚔️ Attaquer '+c.name, (c.isHome?'🏛️ CAPITALE : défendue d\'office par 10 jetons, plus ce que l\'ennemi engage.':'Force ennemie inconnue (garnison + défense).'), (t,cr)=>done({action:'attack', node:c.node, tokens:t, cruiser:cr})); }; });
        document.querySelectorAll('#sc-decision .opt[data-rt]').forEach(btn=>{ if(btn.disabled)return; btn.onclick=()=>done({action:'route', route:parseInt(btn.getAttribute('data-rt'))}); });
        const dfn=document.getElementById('sc-wc-def'); if(dfn) dfn.onclick=()=>tokenPick('🛡️ Défense', 'Jetons engagés en défense de tes colonies.', (t,cr)=>done({action:'defend', tokens:t, cruiser:cr}));
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
      // Même garde-fou que dans la vraie modale : le panneau de repli ne doit pas être plus permissif.
      document.getElementById('sc-war').onclick=()=>{ if(_confirmerGuerreSansMoyens(o)) done({accept:false}); };
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
      let b='<h2>🤝 Accords Commerciaux</h2><div class="muted" style="margin-bottom:8px">Accord commercial <b>gratuit</b> : +3 VP pour chaque nation, met fin à une guerre si elle existe. Un leader trop en avance peut refuser.</div>';
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
      let b='<h2>🕊️ Accords Diplomatiques</h2><div class="muted" style="margin-bottom:8px">Pacte de non-agression : 4 tours, 6🪨 par nation. Met fin à une guerre. +1🙂 par pacte conclu, tension 0 avec le partenaire. Tu as '+(o.mat||0)+'🔩 '+(o.energy||0)+'⚡.</div>';
      b+=rows.map((r,i)=>'<label class="opt" style="display:block;text-align:left;cursor:pointer"><input type="checkbox" data-diplo="'+i+'" style="margin-right:8px">'+(r.emoji||'')+' <b>'+r.name+'</b> — 4 tours · '+(r.war?'6🪨 <span style="color:#ff7766">met fin à la guerre</span>':'6🪨')+(r.info?'<br><span class="muted" style="margin-left:24px">'+r.info+'</span>':'')+'</label>').join('');
      b+='<button class="opt" id="sc-diplo-ok">Conclure les pactes sélectionnés</button><button class="opt" id="sc-diplo-none" style="background:#2a2f45">Aucun pacte</button>';
      decisionPanel(b);
      document.getElementById('sc-diplo-ok').onclick=()=>{ const chosen=[]; document.querySelectorAll('#sc-decision input[data-diplo]').forEach(cb=>{ if(cb.checked)chosen.push(rows[parseInt(cb.getAttribute('data-diplo'))].id); }); done({selected:chosen}); };
      document.getElementById('sc-diplo-none').onclick=()=>done({selected:[]});
      return;
    }
    /* ⚠️ AFFICHER CE QU'ON PROPOSE, PAS SEULEMENT LES BOUTONS.
       Le rendu générique n'a jamais montré `payload.texte` : sur une proposition d'accord
       commercial, le destinataire voyait « 🤝 Proposition d'accord commercial » et deux boutons
       Accepter / Refuser — sans savoir QUI proposait ni ce qu'il offrait. Même chose maintenant
       pour la paix, où l'offre en ressources est le cœur de la décision. */
    if(o.texte){ body += '<div style="margin:2px 0 10px;text-align:left">'+o.texte+'</div>'; }
    // Génériques à options (agenda, strategy, invest1/2, espionage, extrasolar, empath_copy…)
    const opts=o.options||[];
    if(!opts.length){ decisionPanel(body+'<button class="opt" id="sc-ok">Continuer</button>'); document.getElementById('sc-ok').onclick=()=>done({}); return; }
    /* ⚠️ `espionage` DEMANDAIT `branch`, ET AUCUNE RÉPONSE `branch` N'EST APPLICABLE.
       Ce panneau générique est le REPLI : il sert dès que la vraie modale à cases à cocher n'a pas
       pu s'ouvrir (fenêtre absente d'un client resté en cache, par exemple). Il renvoyait alors
       `{branch:'expansion'}` — le nom de la filière. Or le moteur cherche une OPTION par son
       identifiant (`une:martiens:bio1`, `lot:martiens:expansion`) : « expansion » ne correspond à
       rien, et une filière ne dit d'ailleurs pas CHEZ QUI voler, puisque plusieurs nations peuvent
       avoir la même. La réponse était donc rejetée à tous les coups, la fenêtre revenait au tour
       suivant, et Marc voyait huit fois « espionnage reporté » sans jamais pouvoir choisir
       (journal du 16/08). `driver.js` utilisait déjà `id` de son côté : les deux chemins
       divergeaient en silence. */
    const key = k==='agenda'?'agendaId' : (k==='strategy'?'cardId' : (k==='invest1'||k==='invest2'?'cardId' : (k==='espionage'?'id' : (k==='extrasolar'?'node' : (k==='empath_copy'?'cardId':'value')))));
    // Pour les investissements : montrer ce que les IA/adversaires ont choisi (comme la vraie modale)
    if((k==='invest1'||k==='invest2') && Array.isArray(o.ai) && o.ai.length){
      const optName=(id)=>{ const op=opts.find(x=>x.id===id); return op?((op.emoji||'')+' '+op.name):id; };
      body += '<div class="muted" style="margin:2px 0 8px">Choix adverses : '+o.ai.map(a=>a.civ+' → '+optName(a.pick)).join(' · ')+'</div>';
    }
    /* La phrase vient du MOTEUR (`payload.phrase`) : solo et en ligne ne peuvent donc pas dire deux
       choses différentes. Et « rang d'initiative » était faux de toute façon — l'ordre du draft va du
       plus faible au plus fort, il n'a rien à voir avec l'initiative du tour. */
    if(k==='strategy' && (o.phrase||o.rank)){ body += '<div class="muted" style="margin-bottom:6px">'+(o.phrase||('Tu choisis en '+o.rank+'/'+(o.total||'?')))+'</div>'; }
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
/* DÉCOMPTE DÉTAILLÉ DES POINTS DE VICTOIRE — mêmes postes et même ordre qu'en solo (#vp-wrap).
   Marc : « les calculs finaux visibles dans l'ancienne version ne le sont plus ». En ligne l'écran
   de fin ne recevait que le total ; le serveur envoie désormais tout le détail. On affiche TOUS
   les postes, y compris ceux à 0, pour qu'on voie aussi les points qu'on n'a PAS gagnés. */
function _vpDetailHTML(d){
  if(!d) return '';
  const L=[['Colonies (+1/connectée)','colVP'],['Routes (1 VP/route)','routeVP'],['Cartes','cardsVP'],
           ['Bonus Tech (×0.5/tech)','techBonusVP'],['Bonus Revenus/tour','rptVP'],['Agendas','agendasVP'],
           ['Événements','evtVP'],['Bonus spéciaux','extraVP']];
  return '<div style="margin:-2px 0 9px;padding:7px 12px;border:1px solid #22305a;border-top:0;border-radius:0 0 9px 9px;background:#101528;font-size:.8em">'
    + L.map(([lbl,k])=>{const v=d[k]||0;
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:1px 0;color:'+(v?'#c8d8f8':'#6a7a98')+'">'
             + '<span>'+lbl+'</span><span>'+(v>0?'+':'')+v+'</span></div>';}).join('')
    + '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:4px;padding-top:4px;border-top:1px solid #22305a;font-weight:700;color:#ffd34d">'
    + '<span>Total</span><span>'+(d.total||0)+' VP</span></div></div>';
}
function showFinal(scores, info){
  hideWaitBlock(); closeDecision();
  // CLASSEMENT DÉTAILLÉ par nation (rétabli) + date de fin + lien « Signaler un bug ».
  const med=['🥇','🥈','🥉'];
  const rows=(scores||[]).map((s,i)=>{
    const who=(window._scPseudo&&window._scPseudo[s.civId])?(' <span class="muted">('+window._scPseudo[s.civId]+')</span>'):'';
    const mine=(s.civId===STATE.myCiv)?';border-color:#5a8ad0':'';
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:5px 0;padding:8px 11px;border:1px solid #2a3a6a;border-radius:9px;background:#141a30'+mine+'">'
      +'<span>'+(med[i]||('&nbsp;'+(i+1)+'.'))+' <b>'+civLabel(s.civId)+'</b>'+who+'</span>'
      +'<b style="color:#ffd34d">'+s.vp+' VP</b></div>'
      + _vpDetailHTML(s.detail);
  }).join('');
  const when=(info&&info.dateFr)?('<div class="muted" style="margin-bottom:8px">Partie '+(info.code||'')+' — terminée le '+info.dateFr+'</div>'):'';
  overlay('<h2>🏆 Fin de partie</h2>'+when+(rows||'<div class="muted">Scores indisponibles.</div>')
    +'<div class="muted" style="margin-top:8px;font-size:.8em">Le classement t\'est aussi envoyé par email.</div>'
    +'<button class="pri" id="sc-again">↩ Retour au lobby</button>'
    +'<button class="sec" id="sc-bug">🐞 Signaler un bug</button>');
  document.getElementById('sc-again').onclick = ()=> screenLobby();
  document.getElementById('sc-bug').onclick = ()=> showBugReport(scores, info);
}
// Fenêtre « Signaler un bug » : le texte est conservé dans le log de la partie (visible dans /stats) et
// envoyé par email à l'administrateur.
function showBugReport(scores, info){
  overlay('<h2>🐞 Signaler un bug</h2>'
    +'<div class="muted" style="margin-bottom:6px">Décris ce qui s\'est mal passé (ce que tu faisais, ce que tu attendais, ce qui est arrivé). Ton message est joint au journal de cette partie.</div>'
    +'<textarea id="sc-bugtxt" rows="7" style="width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid #2c4a7e;background:#091020;color:#dce8ff;font:inherit" placeholder="Ex. : après avoir capturé Titan, la colonie est revenue aux Ceinturiens au tour suivant…"></textarea>'
    +'<div class="err" id="sc-err"></div>'
    +'<button class="pri" id="sc-bugsend">Envoyer</button>'
    +'<button class="sec" id="sc-bugback">↩ Retour</button>');
  document.getElementById('sc-bugback').onclick = ()=> showFinal(scores, info);
  document.getElementById('sc-bugsend').onclick = ()=>{
    const t=document.getElementById('sc-bugtxt').value.trim();
    if(!t){ const e=document.getElementById('sc-err'); if(e)e.textContent='Écris quelques mots avant d\'envoyer.'; return; }
    send({t:'bug_report', text:t});
    overlay('<h2>🐞 Merci !</h2><div class="muted">Ton signalement a été enregistré avec le journal de la partie.</div>'
      +'<button class="pri" id="sc-again2">↩ Retour au lobby</button>');
    document.getElementById('sc-again2').onclick = ()=> screenLobby();
  };
}

// ───────────────────────── Reprise du formulaire d'accueil du jeu ─────────────────────────
// L'écran d'accueil d'index.html (« Se connecter / Créer un compte ») appelait l'ancien PHP
// (lvSubmit → api/login.php → 404) puis cliquait le bouton flottant (caché par le CSS du jeu).
// On REMPLACE ses fonctions globales : mêmes boutons, mais ils parlent au serveur WebSocket.
function hijackBuiltinAuth(){
  try {
    const err = document.getElementById('lv-err');
    const uEl = document.getElementById('lv-user');
    // L'identifiant est une ADRESSE EMAIL (elle reçoit les scores de fin de partie).
    if (uEl){ uEl.placeholder='Ton adresse email'; try{ uEl.type='email'; uEl.setAttribute('inputmode','email'); uEl.setAttribute('autocomplete','email'); }catch(e){} }
    /* Le bouton œil n'est PLUS créé ici : il fait partie du HTML de l'écran d'accueil (index.html),
       positionné par le CSS dans un conteneur relatif. L'injecter au forceps le faisait passer à la
       ligne et se décaler (les champs font width:100%) — il apparaissait « à des endroits bizarres »
       sur mobile. Corollaire : il existe désormais aussi en solo et dans le tutoriel. */
    window.lvSubmit = function(){
      const u=(document.getElementById('lv-user')||{}).value||'', p=(document.getElementById('lv-pass')||{}).value||'';
      if (err) err.textContent='';
      // ⚠️ AVANT : on coupait l'email avant le « @ » (héritage des pseudos) → le serveur recevait « marc »
      // et refusait l'inscription en réclamant une adresse email. On envoie désormais l'adresse COMPLÈTE.
      const user=u.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(user)){ if(err) err.textContent='Entre une adresse email valide (ex. prenom@domaine.ch).'; return; }
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
  // Rafraîchir l'affichage de version : online.js est chargé APRÈS le premier rendu de l'accueil,
  // c'est seulement maintenant que SOLAR_BUILD_JS est connu (et donc une éventuelle incohérence).
  try{ if(typeof lvShowBuild==='function') lvShowBuild(); }catch(e){}
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
