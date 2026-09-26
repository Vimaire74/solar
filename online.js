/* Build de CE fichier, affiché sur l'écran de connexion. À INCRÉMENTER à chaque modification.
   Il est distinct de celui d'index.html : si les deux diffèrent à l'écran, c'est qu'un seul
   des deux fichiers a été mis en ligne (upload partiel ou cache) — la cause exacte est visible. */
const SOLAR_BUILD_JS = '2026-09-24 · v10.95';   /* ⚠️ LES TROIS ESTAMPILLES BOUGENT ENSEMBLE — celle-ci,
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
/* ⚠️ DANS L'APPLICATION (Capacitor), LA PAGE EST SERVIE DEPUIS `localhost`.
   Android : `https://localhost`, iOS : `capacitor://localhost`. L'ancien test « localhost = poste de
   développement » aurait donc envoyé chaque joueur de l'appli sur `ws://127.0.0.1:8080` — un serveur
   qui n'existe que sur la machine de Marc. Le mode en ligne serait mort dans l'appli, et rien ne
   l'aurait dit avant les magasins (repéré le 13/09 en préparant la bêta).
   La règle, dans l'ordre : `window.SOLAR_SERVER` s'il est posé (surcharge explicite) › appli native
   → serveur public › fichier local ou localhost → serveur de développement › sinon serveur public.
   Fonction PURE, testée par `server/test_serveur_url.js`. */
function serveurPour(loc, win){
  loc = loc || {}; win = win || {};
  if (typeof win.SOLAR_SERVER === 'string' && win.SOLAR_SERVER) return win.SOLAR_SERVER;
  const cap = win.Capacitor;
  const natif = !!(cap && ((typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
                           || (cap.platform && cap.platform !== 'web')))
             || loc.protocol === 'capacitor:' || loc.protocol === 'ionic:';
  if (natif) return 'wss://live.solar-game.com';
  const local = (loc.protocol === 'file:' || /^(localhost|127\.)/.test(loc.hostname || ''));
  return local ? 'ws://127.0.0.1:8080' : 'wss://live.solar-game.com';
}
const SERVER_URL = serveurPour(location, window);

// ───────────────────────── État de session ─────────────────────────
const STATE = { ws:null, connected:false, user:null, token:null, tier:1,
                game:null, myCiv:null, isHost:false, started:false,
                _answering:false, _lastStateReq:0, _reconnectTimer:null, _pingTimer:null };

// ───────────────────────── Transport WebSocket ─────────────────────────
function connect(onReady){
  if (STATE.ws && STATE.ws.readyState === 1){ if(onReady) onReady(); return; }
  status(t('web.connexion_serveur','Connexion au serveur…'));
  let ws;
  try { ws = new WebSocket(SERVER_URL); }
  catch(e){ status(t('web.serveur_injoignable','⚠️ Serveur injoignable')); return; }
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
    send({t:'hello', proto:SC_PROTO, build:SOLAR_BUILD_JS, lang:(window.SOLAR_LANG||'fr')});   // la langue du joueur : le serveur s'en sert pour l'email de fin
    // reprise de session : token puis re-join automatique de la partie en cours
    if (STATE.token) send({t:'token', token:STATE.token});
    if (onReady) onReady();
  };
  ws.onmessage = (ev) => { let m; try{ m = JSON.parse(ev.data); }catch(e){ return; } handle(m); };
  ws.onclose = () => {
    const etaitOuverte = STATE.connected;
    STATE.connected = false;
    clearInterval(STATE._pingTimer);
    // reconnexion systématique dès qu'on a une session (pas seulement en partie)
    if (STATE.user || STATE.token){ status(t('web.connexion_perdue_reconnexion_cours','🔌 Connexion perdue — reconnexion en cours…')); scheduleReconnect(); }
    /* ⚠️ « JE TAPE MON MOT DE PASSE, RIEN NE SE PASSE » (Marc, 07/09, juste après un redéploiement).
       Sans session, si le serveur ne répond pas à l'ouverture (redémarrage en cours), le bouton
       ne produisait AUCUN retour : le statut « Connexion au serveur… » restait affiché, sans
       erreur, sans nouvel essai. On le dit, sous le formulaire, et on rend la main. */
    else if (!etaitOuverte){
      status('');
      hideStatus();
      const msg=t('web.serveur_injoignable_moment_mise_jour_cou','⚠️ Serveur injoignable pour le moment (mise à jour en cours ?). Réessaie dans quelques secondes.');
      if (typeof _errCb==='function') _errCb(msg);
      else { const e=document.getElementById('lv-err'); if(e) e.textContent=msg; }
    }
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
  /* Les textes que le serveur a écrits en français voyagent avec leur clé (`<champ>_i18n`, voir
     `_i18nAplatir` dans moteur.js) : on les re-rend ici dans la langue de CE joueur. */
  try{ if(typeof _i18nHydrater==='function'&&m&&m.t!=='state'){ _i18nHydrater(m); if(m.pending&&m.pending.payload)_i18nHydrater(m.pending.payload); } }catch(e){}
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
    /* Le compte n'existe plus : on oublie tout ce que le navigateur en gardait (jeton, adresse,
       partie mémorisée) et on revient à l'écran de connexion, avec une phrase qui le dit. */
    case 'compte_supprime':
      STATE.user=null; STATE.token=null; STATE.game=null; STATE.parties=[]; STATE._surLobby=false;
      try{ localStorage.removeItem('sc_ws_token'); localStorage.removeItem('sc_ws_game'); localStorage.removeItem('sc_ws_user'); }catch(e){}
      screenAuth('login');
      try{ const e=document.getElementById('sc-err'); if(e){ e.style.color='#9ad89a'; e.textContent=t('web.compte_ete_supprime_merci_avoir_joue','Ton compte a été supprimé. Merci d\'avoir joué.'); } }catch(e){}
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
      status(t('web.partie_lancee_synchronisation','Partie lancée — synchronisation…'));
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
          status(t('web.choix','Choix de {v} et {v2}…',{v:qui.slice(0,-1).join(', '),v2:qui[qui.length-1]}));
        }
        showWaitBlock();
      }
      reqState();
      break;
    case 'log': // actions des autres joueurs → pop-up rouge (comme les tours d'IA en solo)
      try{
        const txts=(m.entries||[]).map(e=>(typeof _logTexte==='function'?_logTexte(e):String((e&&e.msg)||e)).replace(/<[^>]+>/g,'').trim()).filter(Boolean);
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
      overlay(t('web.mise_jour_necessaire_protocole_toi_serve','<h2>🔄 Mise à jour nécessaire</h2><div class="muted" style="margin:8px 0;line-height:1.5">{v}</div><div class="muted" style="font-size:.8em">Protocole — toi : {v2} · serveur : {v3}</div><button class="pri" id="sc-reload">↻ Recharger la page</button>',{v:(m.msg||t('web.version_jeu_correspond_celle_serveur','Ta version du jeu ne correspond plus à celle du serveur.')),v2:(m.client!==undefined?m.client:'?'),v3:(m.serveur!==undefined?m.serveur:'?')}));
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
          if(err) err.textContent=t('web.session_expiree_saisis_email_mot_passe','Session expirée — saisis ton email et ton mot de passe.');
          hideStatus();
        } else {
          status(t('web.session_expiree_reconnecte_toi','Session expirée — reconnecte-toi.'));
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
      status(((m.by && m.by!==STATE.user?t('web.quitte_retour_lobby','{v} a quitté — retour au lobby',{v:m.by}):t('web.partie_quittee','Partie quittée.'))));
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
    /* v10.62 : même rendu qu'en solo (séparateurs « TOUR n », filet coloré, sous-lignes « ↳ paie »). */
    if (typeof window._journalHTML === 'function') { el.innerHTML = window._journalHTML(g.log); return; }
    const color = (window._logColorNations) ? window._logColorNations : (s=>s);
    el.innerHTML = g.log.map(e => '<div class="log-e '+(e.cls||'')+'">'+color(typeof _logTexte==='function'?_logTexte(e):((e&&e.msg)||''))+'</div>').join('');
  } catch(e){}
}

// ───────────────────────── Décisions (routées par le serveur) ─────────────────────────
/* Y a-t-il au moins un autre joueur HUMAIN dans cette partie ? */
function _autresHumains(){ try{ return !!(STATE.game&&STATE.game.seats&&STATE.game.seats.some(x=>x&&!x.ai&&x.civId!==STATE.myCiv)); }catch(e){ return false; } }
function onDecision(pending){
  hideStatus();   // une question pour toi : on n'attend personne
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
    /* « En attente des autres joueurs… » n'a de sens que s'il y a d'AUTRES HUMAINS (Marc, 15/09 : « ça
       reste affiché même si je joue contre les IA »). Les ordinateurs répondent dans l'instant. */
    if(_autresHumains()) status(t('web.attente_autres_joueurs','En attente des autres joueurs…')); else hideStatus();
    // Fenêtre suivante de la file, s'il y en a une (voir la note en tête de onDecision).
    if(STATE._queue && STATE._queue.length){ const nx=STATE._queue.shift(); setTimeout(()=>onDecision(nx), 60); }
  };
  // VRAIES modales du jeu (même graphisme qu'en solo) pour ces décisions :
  if(pending.kind==='agenda' && showAgendaReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='strategy' && showStrategyReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='invest1' && showInvestReal(pending,1)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='invest2' && showInvestReal(pending,2)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='peace_offer' && showPeaceReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if((pending.kind==='ai_dyson'||pending.kind==='human_dyson'||pending.kind==='dyson_build') && showDysonReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='war_result' && showWarResultReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='raid_hit' && showHitReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='eot' && showEotReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='event_result' && showEventResultBlocking(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='event_announce' && showEventAnnounceBlocking(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='forced_war' && showForcedWarReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='route_capture' && showRouteCaptureReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='accord_confirm' && showAccordReal(pending)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='espionage' && showOptsReal(pending,'espionage-modal','espionage-branch-opts','id')){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  if(pending.kind==='empath_copy' && showOptsReal(pending,'empath-copy-modal','empath-copy-opts','cardId',true)){ STATE._realDecide=finish; scReduireFenetreVisible(); return; }
  // Événements interactifs : VRAIES fenêtres du jeu (les overrides _evCommPick/_evDiploConfirm envoient la réponse).
  if(pending.kind==='event_comm' && typeof window.showCommEventModal==='function'){ window._scDiploSel={}; STATE._realDecide=finish; try{ showCommEventModal(function(){}); scReduireFenetreVisible(); return; }catch(e){ STATE._realDecide=null; } }
  if(pending.kind==='event_diplo' && typeof window.showDiploEventModal==='function'){ window._scDiploSel={}; STATE._realDecide=finish; try{ showDiploEventModal(function(){}); scReduireFenetreVisible(); return; }catch(e){ STATE._realDecide=null; } }
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
    const who=(window._scPseudo&&window._scPseudo[o.builder])||o.builderName||t('avis.nation','Une nation');
    if(title)title.innerHTML=t('web.construit_sphere_dyson','⚡ {who} a construit la Sphère de Dyson !',{who:who});
    if(sub)sub.innerHTML=t('web.monopole_energetique_adverse_accepte_3_t','Monopole énergétique adverse. Accepte (+3<i class=ri-energy></i>/tour) ou refuse (= guerre).');
    actions.innerHTML=t('web.accepter_monopole_refuser_guerre','<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="eot-btn" id="scd-acc" style="flex:1;margin-top:0;background:#0e2a18;border-color:#3a8a5a;color:#9fe8b8">🤝 Accepter le monopole</button><button class="eot-btn" id="scd-ref" style="flex:1;margin-top:0;background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc">⚔️ Refuser — guerre</button></div>');
    m.classList.remove('hidden');
    document.getElementById('scd-acc').onclick=()=>go({war:false});
    document.getElementById('scd-ref').onclick=()=>go({war:true});
    return true;
  }
  if(k==='dyson_build'){
    const ref=o.refusing||[];
    if(title)title.innerHTML=t('web.sphere_dyson_construite','⚡ Sphère de Dyson construite !');
    if(sub)sub.innerHTML=((((ref.length?t('web.nations_refusent_monopole_forcer_declenc','Des nations refusent le monopole — forcer déclenche la guerre contre elles, ou renonce.'):t('web.toutes_nations_acceptent_monopole_energe','Toutes les nations acceptent le monopole énergétique.')))));
    actions.innerHTML=((((ref.length?t('web.forcer_guerre_renoncer','<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="eot-btn" id="scd-f" style="flex:1;margin-top:0;background:linear-gradient(135deg,#8a2222,#5a0a0a);border-color:#cc4444;color:#ffcccc"><i class=ri-energy></i> Forcer — guerre</button><button class="eot-btn" id="scd-r" style="flex:1;margin-top:0;background:#14182e;border-color:#5a6a8a;color:#aab8d8">↩️ Renoncer</button></div>'):'<button class="eot-btn" id="scd-f">Continuer</button>'))));
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
  const ti=document.getElementById('eot-title'); if(ti)ti.textContent=t('web.bilan_tour','📊 Bilan du Tour {tour}',{tour:o.turn||''});
  // Le serveur envoie le bilan COMPLET (construit par buildEOTBody dans index.html) : actions du tour,
  // entretien détaillé, revenus, une section par nation, guerre, pillages, pirates. On l'injecte tel quel
  // dans la vraie fenêtre — bilan rigoureusement identique au solo. Le résumé court ci-dessous ne sert
  // que de filet si un serveur plus ancien n'envoie pas le HTML.
  if(body)body.innerHTML = o.html || (t('web.fin_tour_titre','<div class="eot-section"><h4>📊 Fin du tour {n}</h4>',{n:(o.turn||'')})
    +li('Revenus',rv,'+')
    +(cout.length?t('web.entretien','<div class="eot-item"><span class="eot-name">Entretien : {v}</span></div>',{v:cout.join(' ')}):t('web.entretien_aucun','<div class="eot-item"><span class="eot-name">Entretien : aucun</span></div>'))
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
  const _ti=document.getElementById('wm-title'), b=document.getElementById('wm-body'), r=document.getElementById('wm-result');
  if(_ti)_ti.textContent=(o.title||t('web.es_attaque','⚔️ Tu es attaqué'));
  /* Cette fenêtre partage `#war-modal` avec le résultat de combat : sans cela elle gardait le médaillon
     et le nom du DERNIER combat (Martiens, puis Ceinturiens…) — l'un des « il me fait passer pour »
     de D538. Ici le titre dit tout : médaillon neutre, pas de nom. */
  /* UNE COLONISATION N'EST PAS UNE ATTAQUE (Marc, 22/09) : même fenêtre, mais au ton vert de la paix,
     médaillon 🚩 et bandeau « Colonisation ». La fenêtre est partagée : on remet le ton rouge sinon. */
  const _colo=(o.genre==='colonisation');
  try{ const f=document.getElementById('wm-fen'); if(f){ f.classList.toggle('fen-peace',_colo); f.classList.toggle('fen-war',!_colo); } }catch(e){}
  try{ const e=document.getElementById('wm-emoji'), nm=document.getElementById('wm-nation'), kk=document.getElementById('wm-kicker');
    /* Blason B : si le titre nomme la nation qui te frappe → « attaqué par NATION » ; sinon médaillon neutre. */
    let n=null; if(!_colo){ try{ const G=scGetG(); const _tt=String(o.title||''); n=[G.player].concat(G.ais||[]).find(x=>x&&x.civ&&_tt.indexOf(x.civ.name)>=0&&x.civ.id!==STATE.myCiv)||null; }catch(e){} }
    if(e)e.textContent=_colo?'🚩':(n?n.civ.emoji:'⚔️'); if(nm)nm.textContent=n?n.civ.name:'';
    if(kk){ kk.textContent=_colo?t('web.colonisation','Colonisation'):(n?t('web.attaque','attaqué par'):t('ui.guerre','Guerre')); kk.classList.toggle('fen-prep',!!n); } }catch(e){}
  if(b)b.innerHTML=o.body||'';
  if(r)r.classList.add('hidden');
  const go=()=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide({}); };
  const btn=m.querySelector('.war-btn'); if(btn){ btn.innerHTML='<span class="k">'+t('ui.compris','Compris')+'</span>'; btn.onclick=go; }
  m.classList.remove('hidden');
  return true;
}
// VRAIE fenêtre de RÉSULTAT DE COMBAT (#war-modal) — statique, se ferme sur « Continuer » (qui envoie l'ack).
function showWarResultReal(pending){
  const o=pending.payload||{};
  const m=document.getElementById('war-modal'); if(!m) return false;
  const _ti=document.getElementById('wm-title'), b=document.getElementById('wm-body'), r=document.getElementById('wm-result');
  if(_ti)_ti.textContent=o.title||'⚔️ Combat';
  try{ const f=document.getElementById('wm-fen'); if(f){ f.classList.remove('fen-peace'); f.classList.add('fen-war'); } }catch(e){}   // la fenêtre a pu servir à une colonisation
  /* Blason (14/09) : l'adversaire en médaillon. `civs` = [propriétaire, adversaire] ; « Vu par X » si on
     est le tiers spectateur (préfixe ajouté par le serveur dans ownerName). */
  try{ const G=scGetG(); const me=(typeof myNation==='function'&&myNation())||G.player; const civs=o.civs||[];
    const advId=civs.find(c=>c&&me&&me.civ&&c!==me.civ.id)||null;
    const n=advId?[G.player].concat(G.ais||[]).find(x=>x&&x.civ&&x.civ.id===advId):null;
    const e=document.getElementById('wm-emoji'), nm=document.getElementById('wm-nation'), kk=document.getElementById('wm-kicker');
    if(e)e.textContent=n?n.civ.emoji:'⚔️'; if(nm)nm.textContent=n?((window._scPseudo&&window._scPseudo[n.civ.id])||n.civ.name):'';
    if(kk){ kk.textContent=n?t('web.contre','contre'):t('ui.guerre','Guerre'); kk.classList.toggle('fen-prep',!!n); } }catch(e){}
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
  const _ti=document.getElementById('rcm-title'), d=document.getElementById('rcm-desc'), keep=document.getElementById('rcm-keep');
  if(_ti)_ti.textContent='🛤️ '+(o.name||'');
  if(d)d.innerHTML=((((o.prot?t('web.as_brise_protection_ennemie_jeton_detrui','Tu as <b>brisé la protection</b> ennemie (jeton détruit). 2 jetons engagés : 1 part en récupération. Que faire de la route ?'):t('web.route_ennemie_non_protegee_prise_sans_co','Route ennemie <b>non protégée</b>, prise sans coût. Que faire ?')))));
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  /* Par RÔLE (Blason : rouge = détruire à gauche, vert = récupérer à droite), plus par rang. */
  const bKeep=m.querySelector('#rcm-keep')||m.querySelectorAll('.atk-btns button')[0];
  const bDest=m.querySelector('.fen-btn.no')||m.querySelectorAll('.atk-btns button')[1];
  if(bKeep)bKeep.onclick=()=>go({capture:true});
  if(bDest)bDest.onclick=()=>go({capture:false});
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
  /* Blason : médaillon + nom de l'ennemi, le titre devient le verbe. */
  try{ const G=scGetG(); const n=[G.player].concat(G.ais||[]).find(x=>x&&x.civ&&x.civ.id===o.enemy); const e=document.getElementById('fw-emoji'), nm=document.getElementById('fw-nation'); if(e)e.textContent=n?n.civ.emoji:'😡'; if(nm)nm.textContent=enemy; }catch(e){}
  if(title)title.textContent=t('web.peuple_exige_guerre_choisis_cible','Ton peuple exige la guerre. Choisis ta cible.');
  /* `o.prix` vient du moteur (voir `prixDeLaGuerreHTML`) : même texte qu'en solo, chiffré pour toi. */
  if(desc)desc.innerHTML=t('web.tension_10_peuple_exige_attaques_mainten','Tension à 10 : le peuple exige que tu attaques <b>{enemy}</b> maintenant.{v}',{enemy:enemy,v:o.prix||''});
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  let html=t('web.exiger_paix_tribut_si_ennemi_faible_sino','<div class="fw-choice" id="fw-peace">🕊️ Exiger la paix (tribut si ennemi faible, sinon la guerre continue)</div>');
  (o.routes||[]).forEach(r=>{ const can=(o.myForce||0)>=r.need; html+=t('web.attaquer_route_jeton','<div class="fw-choice" data-rt="{v}" style="{v2}">{v3} Attaquer route {nom} — {v4} jeton{v5}</div>',{v:r.i,v2:(can?'':'opacity:.5'),v3:(r.prot?'🛡️':'🔓'),nom:r.name,v4:r.need,v5:(r.need>1?'s':'')}); });
  /* ⚠️ ON MONTRE TOUTES LES COLONIES À PORTÉE, pas seulement la plus proche. Avant, cette fenêtre
     n'offrait que `colTarget` et la fenêtre d'assaut qui suivait les proposait toutes : deux règles
     pour une seule décision (Marc, 083E tour 7). `cols` vient du moteur et applique la vraie règle
     de portée ; le repli sur `colTarget` ne sert qu'aux parties reprises d'une version antérieure. */
  const _cols=(o.cols&&o.cols.length)?o.cols:(o.colTarget?[{node:o.colTarget,name:(o.colName||o.colTarget)}]:[]);
  _cols.forEach(function(c,i){
    html+=t('web.attaquer','<div class="fw-choice" data-col="{v}">🏗️ Attaquer {v2}{v3}{v4}{v5}</div>',{v:c.node,v2:c.name||c.node,v3:(c.level?' Nv.'+c.level:''),v4:(c.isHome?t('web.capitale_10_garnison',' 🏛️ capitale (10 de garnison)'):''),v5:(c.dist!==undefined?t('web.ud',' <span style="opacity:.6;font-size:.85em">— {v} nœud{v2}{v3}</span>',{v:c.dist,v2:(c.dist>1?'s':''),v3:(i===0?t('web.proche',', la plus proche'):'')}):'')});
  });
  if(!(o.routes||[]).length && !_cols.length)html+=t('web.passer_aucune_cible_pression_populaire_r','<div class="fw-choice" id="fw-none">✖️ Passer — aucune cible, la pression populaire retombe</div>');
  choices.innerHTML=html;
  const pe=document.getElementById('fw-peace'); if(pe)pe.onclick=()=>go({peace:true});
  choices.querySelectorAll('.fw-choice[data-rt]').forEach(el=>{ el.onclick=()=>go({route:parseInt(el.getAttribute('data-rt'))}); });
  choices.querySelectorAll('.fw-choice[data-col]').forEach(el=>{ el.onclick=()=>go({colony:el.getAttribute('data-col')}); });
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
  try{ const G=scGetG(); const n=[G.player].concat(G.ais||[]).find(x=>x&&x.civ&&(x.civ.id===o.withId||x.civ.name===o.withName)); const e=document.getElementById('accord-emoji'), nm=document.getElementById('accord-nation'); if(e)e.textContent=n?n.civ.emoji:'🤝'; if(nm)nm.textContent=o.withName||(n?n.civ.name:''); }catch(e){}
  body.innerHTML=t('web.conclure_accord_commercial_3_vp_chacun_m','Conclure un accord commercial{v} ? (+3 VP chacun, met fin à une guerre)',{v:(o.nodeName?' sur <b>'+o.nodeName+'</b>':'')});
  const go=(ans)=>{ m.classList.add('hidden'); if(STATE._realDecide)STATE._realDecide(ans); };
  conf.onclick=()=>go({confirm:true});
  const cancel=m.querySelector('button.npop-btn')||m.querySelector('.fen-btn.ghost'); if(cancel)cancel.onclick=()=>go({confirm:false});
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
    const blocs=new Map(), ordre=[], _deja=Array.isArray(o.deja)?o.deja:[];
    /* `o.deja` : ce que la nation a et que tu as déjà — montré grisé, jamais cochable (Marc, BCE3, 21/09). */
    for(const o of opts.concat(_deja)){ if((o.kind!=='une'&&o.kind!=='deja')||!o.categorieCle)continue;
      if(!ordre.includes(o.nation))ordre.push(o.nation);
      if(!blocs.has(o.categorieCle))blocs.set(o.categorieCle,{groupe:o.groupe,nom:o.categorieNom,nation:o.nation,techs:[],deja:[]});
      blocs.get(o.categorieCle)[o.kind==='deja'?'deja':'techs'].push(o); }
    for(const [cle,b] of [...blocs].sort((x,y)=>ordre.indexOf(x[1].nation)-ordre.indexOf(y[1].nation))){
      if(b.groupe&&b.groupe!==g){ g=b.groupe; h+='<div class="esp-groupe">'+esc(b.groupe)+'</div>'; }
      h+='<div class="esp-cat" data-cle="'+esc(cle)+'"><div class="esp-cat-nom">'+esc(b.nom||'')+'</div>';
      for(const t of b.techs)
        /* ⚠️ LA CASE PORTE L'IDENTIFIANT DE L'OPTION, PAS CELUI DE LA CARTE. C'est tout le
           correctif du 25/08 : on ne renvoie que ce que le moteur a proposé, comme la Télépathie
           renvoie son `cardId`. La nation et la catégorie s'en déduisent côté moteur — plus besoin
           de les fabriquer ici, donc plus personne pour les perdre en route. */
        h+='<label class="esp-tech"><input type="checkbox" data-cle="'+esc(cle)+'" value="'+esc(t.id)+'"> <span>'+(t.name||'')+'</span></label>';
      for(const t of b.deja) h+='<div class="esp-tech esp-deja" style="opacity:.5">✓ <span>'+(t.name||'')+'</span></div>';
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
  return confirm(t('web.manques_ressources_attaquer_peux_engager','⚠️ Tu manques de ressources pour attaquer.\n\nTu ne peux engager que {n} jeton{v} ce tour-ci (stocks : {cout}🪨 {cout2}⚡ — il faut 1🪨 +1⚡ par jeton engagé).\n\nRefuser la paix maintenant, c\'est poursuivre une guerre que tu n\'as pas les moyens de mener.\n\nContinuer quand même ?',{n:n,v:(n>1?'s':''),cout:s.materials||0,cout2:s.energy||0}));
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
  /* Blason (14/09) : médaillon + nom de l'adversaire, avant tout texte. */
  set('pm-emoji', atk?atk.civ.emoji:'🕊️'); set('pm-nation', esc(atkName));
  /* Marc, 15/09 : si l'adversaire VIENT de déclarer la guerre, cette fenêtre est l'annonce elle-même :
     « Paix ou guerre ? » / NATION / « Ils t'ont déclaré la guerre. Que veux-tu faire ? ». Sinon « contre NATION ». */
  const _declParAdv=!!o.isJustDeclared&&o.declaredBy!=='player';
  set('pm-kicker', (_declParAdv?t('web.paix_ou_guerre','Paix ou guerre ?'):'contre'));
  try{ document.getElementById('pm-kicker').classList.toggle('fen-prep',!_declParAdv); }catch(e){}
  set('pm-verb', (_declParAdv?t('web.ils_ont_declare_guerre_veux_faire','Ils t\'ont déclaré la guerre. Que veux-tu faire ?'):(o.declaredBy==='player'?t('web.as_declare_guerre_proposer_paix','Tu as déclaré la guerre. Proposer la paix ?'):t('web.proposer_paix','Proposer la paix ?'))));
  set('pm-declaredby', (o.declaredBy==='player'?t('web.guerre_declaree_toi_adversaire_repond','Guerre déclarée par toi — l\'adversaire répond.'):(o.isJustDeclared?'':t('web.guerre_declaree','Guerre déclarée par {atkname}.',{atkname:atkName}))));
  const vy=(o.vpYou&&o.vpYou.total!==undefined)?o.vpYou.total:(o.vpYou||0);
  const ve=(o.vpEnemy&&o.vpEnemy.total!==undefined)?o.vpEnemy.total:(o.vpEnemy||0);
  set('pm-context',t('web.vp_toi_adversaire_offre_ressources_tente','VP — Toi : <b>{vy}</b> | Adversaire : <b>{ve}</b><br>Offre des ressources pour tenter la paix, ou refuse et combats.',{vy:vy,ve:ve}));
  if(typeof _updatePeaceDisplay==='function'){try{_updatePeaceDisplay();}catch(e){}}
  const close=()=>{ m.classList.add('hidden'); m.style.display='none'; };
  /* Les boutons sont désignés par leur RÔLE (.ok / .no), plus par leur rang : l'ordre a changé avec
     le Blason (rouge à gauche, vert à droite) et un rang aurait inversé paix et guerre. */
  const bOk=m.querySelector('.fen-btn.ok')||m.querySelectorAll('.atk-btns button')[0];
  const bNo=m.querySelector('.fen-btn.no')||m.querySelectorAll('.atk-btns button')[1];
  if(bOk)bOk.onclick=function(){ const off=(G&&G._peaceOffer)||{materials:0,energy:0,science:0}; close(); if(STATE._realDecide)STATE._realDecide({accept:true,offer:off}); };
  if(bNo)bNo.onclick=function(){ if(!_confirmerGuerreSansMoyens(o))return; close(); if(STATE._realDecide)STATE._realDecide({accept:false}); };
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
    /* Marc, 14/09 : plus de ressources ni de revenus ici (visibles en haut) — le prochain événement seul, sur
       toute la largeur, une ligne. */
    void resStr; void gainStr;
    if(ctx) ctx.innerHTML=t('web.prochain_evenement','<div class="agsel-ctx-box agsel-ctx-wide" title="{v}"><span class="agsel-ctx-label">Prochain événement</span> <span class="agsel-ctx-val">{tour}</span></div>',{v:(evNext?esc(String(evNext.name||'')+' — '+String(evNext.preview||'').replace(/<[^>]+>/g,'')):''),tour:(evNext?evNext.emoji+' T.'+((G.turn||1)+1)+' — <b>'+esc(evNext.name||'')+'</b> · '+evNext.preview:'Aucun')});
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
  el.innerHTML=opts.map(c=>t('web.ligne_7','<div class="strat-opt" id="strat-opt-{v}" onclick="selectStrategy(\'{v2}\')"><div class="so-emoji">{v3}</div><div class="so-name">{v4}</div><div class="so-desc">{v5}{tension}</div></div>',{v:c.id,v2:c.id,v3:c.emoji||'',v4:c.name||c.id,v5:c.desc||'',tension:(c.calmTension?t('web.calme_tension_2',' 🕊️ (calme une tension)'):'')})).join('');
  const b=document.getElementById('strat-confirm-btn'); if(b) b.disabled=true;
  /* ⚠️ Le suffixe ordinal ('er'/'e') était passé en PARAMÈTRE : il restait français en anglais
     (« Draft: your pick, 1er/4 »). Un ordinal ne se fabrique pas par morceaux d'une langue à
     l'autre — on écrit le rang tel quel, et la phrase complète vient du serveur (`o.phrase`). */
  const sub=document.getElementById('strat-sub'); if(sub) sub.textContent=t('web.draft_toi_2','Draft : à toi — {v}/{v2}.',{v:o.rank||1,v2:o.total||'?'});
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
    return t('web.ligne_8','<div class="inv-opt{v}"{v2}><div class="inv-opt-emoji">{v3}</div><div class="inv-opt-name">{v4}</div><div class="inv-opt-benefit">✅ {v5}</div><div class="inv-opt-cost">⚠️ {v6}</div>{cout}</div>',{v:(ok?'':' inv-nope'),v2:(ok?' onclick="'+selFn+'(\''+c.id+'\')"':''),v3:c.emoji||'',v4:c.name||c.id,v5:c.benefit||'',v6:c.contrepartie||'',cout:(ok?'':t('web.te_manque','<div class="inv-opt-cost" style="color:#ff8a8a;font-weight:700">🚫 Il te manque {v}</div>',{v:c.manque||''}))});}).join('');
  const aiEl=document.getElementById(two?'inv2-ai-pick':'inv-ai-pick');
  if(aiEl && Array.isArray(o.ai) && o.ai.length){
    /* ⚠️ `a.civ` est un IDENTIFIANT ('terriens'), pas un nom : il s'affichait tel quel (capture du
       20/09). Le nom vient de NOS tables, traduites au chargement — donc dans la langue du lecteur. */
    const nm=(id)=>{ const x=opts.find(y=>y.id===id); return x?((x.emoji||'')+' '+x.name):id; };
    const civNom=(id)=>{ const c=(typeof CIVS!=='undefined')&&CIVS[id]; return c?((c.emoji||'')+' '+c.name):id; };
    aiEl.innerHTML=o.ai.map(a=>'🤖 '+civNom(a.civ)+' : '+nm(a.pick)).join('<br>');
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
/* Lignes de DÉTAIL écartées des dépêches (Marc, 15/09 : « pas d'indications sur les bonus reçus au moment d'une
   colonisation, ça fait des infos en trop ») — elles restent dans le journal : 🏠 conditions de vie, 🗺️ découverte,
   ⚠️ colonie éloignée, 🌅 paysage remarquable, ⬆️ détail d'amélioration. */
const _TOAST_IGNORE=/^↳|paie\s*:|^💰|^📊|^⚙️|^🏠|^🗺️|^⚠️|^🌅|^⬆️/;
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
/* ═══ SEULEMENT LES ACTIONS, DANS L'ORDRE (Marc, 15/09) ═══
   Le journal écrit les DÉTAILS avant le résumé (« Colonie éloignée… », « Colonie sur Vesta connectée », puis
   « 🤖 Martiens colonise Vesta ») : lu tel quel, l'ordre paraît inversé et il y a trop d'informations. Les
   dépêches ne gardent que le résumé d'action : les lignes 🤖 pour une nation tenue par l'ordinateur ; pour un
   humain (pas de ligne 🤖), les seules lignes d'ACTION (colonie, route, achat, amélioration, raid, pouvoir,
   accord, capture). Tout le reste reste dans le journal. */
function _lignesActions(txts){
  const brut=(txts||[]).map(x=>(typeof _logTexte==='function'?_logTexte(x):String((x&&x.msg)||x||'')).replace(/<[^>]+>/g,'').trim()).filter(Boolean);
  const ia=brut.filter(t=>/^\u{1F916}/u.test(t));
  if(ia.length) return ia;
  return brut.filter(t=>/^(🏗️|🛤️ Route [^p]|✅|💼|⬆️|⚔️ Raid|💫|🤝|🏴|🕊️ Mission|🧬|🕵️)/u.test(t) && !_TOAST_IGNORE.test(t));
}
function showLogToast(txts, tout){
  const lignes=(tout?(txts||[]):_lignesActions(txts)).map(_toastLigne).filter(Boolean)
    .filter(l=>!(STATE.myCiv && l.indexOf(civLabel(STATE.myCiv).replace(/^\S+\s*/,''))===0));  // rien sur MA nation
  if(!lignes.length) return;
  const wait=(window._scGreenUntil||0)-Date.now();
  if(wait>0){ setTimeout(()=>{ try{ showLogToast(txts); }catch(e){} }, wait+120); return; }
  /* Blason B (Marc, 15/09) : carte « dépêches » flottante, médaillon par nation, COMPRIS avec anneau (8 s).
     On garde les 4 dernières lignes, comme le toast rouge qu'elle remplace. */
  if(typeof fenDepechesMontrer==='function'){
    window._scDepBuf=(window._scDepBuf||[]).concat(lignes).slice(-4);
    const p0=fenDepechesMontrer(window._scDepBuf,{kicker:t('web.pendant_attente','Pendant ton attente'),duree:8000});
    if(p0){ clearTimeout(window._scDepReset); window._scDepReset=setTimeout(()=>{ window._scDepBuf=[]; },((typeof fenDepechesDuree==='function')?fenDepechesDuree(8000):8000)+200); return; }
  }
  let p=document.getElementById('sc-logtoast');
  /* Moitié de la largeur disponible, centré, DANS la zone de jeu — plus sous la barre du haut, qu'il
     recouvrait. `--topband` est la hauteur mesurée de cette barre. */
  if(!p){ injectStyles(); p=el('<div id="sc-logtoast" style="position:fixed;top:calc(var(--topband,56px) + 46px);left:50%;transform:translateX(-50%);'
    +'width:min(50%,420px);z-index:8650;background:#2a0e14;border:2px solid #c0392b;border-radius:12px;padding:9px 46px 9px 13px;'
    +'color:#ffd7d2;font:600 .82em/1.5 var(--font-corps,system-ui);box-shadow:0 8px 28px rgba(0,0,0,.55);display:none;text-align:left"></div>');
    /* Bouton ✕ de la taille d'un doigt : on peut fermer AVANT la fin du délai (Marc, 13/09). */
    const x=el('<button type="button" aria-label="Fermer" style="position:absolute;top:4px;right:6px;width:40px;height:40px;border-radius:50%;border:1px solid #ff9a9a;background:#7a1015;color:#fff;font-size:20px;line-height:37px;padding:0;cursor:pointer">✕</button>');
    x.onclick=()=>{ clearTimeout(p._timer); p.style.display='none'; p._buf=[]; };
    p.appendChild(x); const body=el('<div id="sc-logtoast-body"></div>'); p.appendChild(body);
    document.body.appendChild(p); }
  p._buf=(p._buf||[]).concat(lignes).slice(-4);
  { const body=document.getElementById('sc-logtoast-body'); if(body) body.innerHTML=p._buf.join('<br>'); else p.innerHTML=p._buf.join('<br>'); }
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
    +'z-index:8660;max-width:min(60vw,340px);background:#0d2a16;border:2px solid #3fbf6a;border-radius:12px;padding:9px 34px 9px 13px;'
    +'color:#d6ffe4;font:600 .82em/1.5 var(--font-corps,system-ui);box-shadow:0 8px 28px rgba(0,0,0,.55);display:none;text-align:left;cursor:pointer"></div>');
    /* v10.62 (point 7) : une croix et un toucher n'importe où la ferment tout de suite. */
    p.onclick=()=>{ p.style.display='none'; p._buf=[]; clearTimeout(p._timer); };
    document.body.appendChild(p); }
  p._buf=(p._buf||[]).concat([html]).slice(-3);
  p.innerHTML='<span aria-label="Fermer" style="position:absolute;top:4px;right:8px;font-size:1.25em;line-height:1;color:#9fe0b4">✕</span>'+p._buf.join('<br>');
  p.style.display='block';
  window._scGreenUntil=Date.now()+5000;   // le toast rouge attend son tour (ils se chevauchaient)
  clearTimeout(p._timer);
  p._timer=setTimeout(()=>{ p.style.display='none'; p._buf=[]; }, 5000);
}
try{ window.showGainToast=showGainToast; }catch(e){}

// Affiche la VRAIE modale d'événement du jeu (#event-modal / #event-announce-modal) au lieu d'un bandeau.
// Retourne true si la modale existe (sinon repli sur le bandeau). Restaure le visuel d'origine des événements.
function showEventReal(o, isAnnounce){
  /* Le serveur envoie l'événement EN FRANÇAIS (son moteur n'a pas de dictionnaire) ; le client retrouve
     par l'id sa propre table EVENTS, retraduite en place au chargement (nom, aperçu dans SA langue). */
  const _evS=o.event||{}; const ev=(typeof EVENTS!=='undefined'&&_evS.id&&EVENTS.find(e=>e.id===_evS.id))||_evS;
  if(isAnnounce){
    const m=document.getElementById('event-announce-modal'); if(!m) return false;
    const em=document.getElementById('ea-emoji'), nm=document.getElementById('ea-name'), ds=document.getElementById('ea-desc');
    if(em)em.textContent=ev.emoji||'⭐'; if(nm)nm.textContent=(ev.name||t('web.evenement','Événement')); if(ds)ds.innerHTML=ev.preview||'';
    const b=m.querySelector('.ea-btn'); if(b)b.onclick=()=>m.classList.add('hidden');
    m.classList.remove('hidden'); return true;
  }
  const m=document.getElementById('event-modal'); if(!m) return false;
  const card=document.getElementById('evm-card'); if(card){card.className='fen fen-event evt-card'+(ev.type?(' '+ev.type):''); card.style.borderColor='';}
  const em=document.getElementById('evm-emoji'), bd=document.getElementById('evm-badge'), nm=document.getElementById('evm-name'), rs=document.getElementById('evm-result'), cq=document.getElementById('evm-consequence');
  const T={competition:t('web.competition','COMPÉTITION'),menace:t('web.menace','MENACE'),opportunite:t('web.opportunite','OPPORTUNITÉ')};
  if(em)em.textContent=ev.emoji||'🎯';
  if(bd){bd.textContent=(T[ev.type]||t('web.evenement_2','ÉVÉNEMENT'));bd.style.color=ev.type==='menace'?'#ffb347':ev.type==='competition'?'#ff6b62':ev.type==='opportunite'?'#5fd08a':'#ffd34d';}
  if(nm)nm.textContent=(ev.name||t('web.evenement','Événement'));
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
    const ti=document.getElementById('eot-title'); if(ti)ti.textContent=t('web.bilan_tour','📊 Bilan du Tour {tour}',{tour:o.turn||''});
    const body=document.getElementById('eot-body'); if(body)body.innerHTML=o.html||'';
    const go=()=>em.classList.add('hidden');
    const btn=em.querySelector('.eot-btn'); if(btn){ btn.textContent=t('web.fermer','Fermer'); btn.onclick=go; }
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
    if(o.perte) showLogToast([t + ' — ' + corps.replace(/<[^>]+>/g, '')], true);
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
      out.push({id:c.nodeId, label:'⬆️ '+n.name+' Nv.'+c.level+' → '+(c.level+1), sub:t('web.1_ac_cout_niveau','1 AC + coût du niveau')});
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
  showWaitBlock(); statusBref(t('web.coup_envoye','Coup envoyé…'));
  // anti-flicker : redemander l'état autoritaire rapidement (le round-trip est court),
  // pour que le plateau reflète le résultat réel sans rester sur l'affichage local périmé.
  setTimeout(()=>reqState(true), 120);
  setTimeout(()=>reqState(true), 500);
}
// Barre « ✓ Valider / ↩ Annuler » du jeu (DOM #sc-confirm), pilotée par le serveur en ligne.
function showConfirmBar(){
  try{
    const b=document.getElementById('sc-confirm'); if(!b) return;
    const lbl=document.getElementById('sc-confirm-label'); if(lbl) lbl.innerHTML=t('web.action_jouee','<span class="scc-act">Action jouée</span>');
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
          /* « Calmer la Population » (carte civique cm_calm) : comme la Forge, elle ouvre d'abord une
             fenêtre de CHOIX (quelle nation apaiser). On la laisse s'ouvrir localement (orig) ; le clic
             sur la nation appelle `applyCalmTension`, interceptée → envoyée au serveur avec la cible.
             Avant, `buyMarket('cm_calm')` partait tel quel au serveur, qui n'a pas d'écran pour la
             fenêtre de choix et plantait (TypeError) : la carte n'a jamais marché en ligne (D538). */
          /* Même chemin pour la Mission diplomatique (cm_diplomatie, 17/09) : fenêtre de choix locale,
             puis `applyCalmTension(id,'civic_diplo')` part au serveur, qui applique `diplomatieCivique`. */
          if(fn==='buyMarket'){ try{ const c=(typeof CIVIC_MARKET!=='undefined')?CIVIC_MARKET.find(x=>x.id===arguments[0]):null; if(c&&(c.calmAction||c.diploAction)){ return orig.apply(this, arguments); } }catch(e){} }
          const action=INTENT_MAP[fn](Array.prototype.slice.call(arguments));
          if(!action) return; // interception annulée (ex. modale d'attaque vide)
          // Forge Orbitale : la version LOCALE de _forgeUpgrade fermait la modale de choix de lune ; comme on
          // n'exécute PAS orig (on envoie juste l'intention), il faut fermer la modale nous-mêmes — sinon elle
          // reste affichée par-dessus le jeu (bug #24 : « popup Forge qui se réaffiche, je ne vois plus le jeu »).
          if(fn==='_forgeUpgrade'){ try{ const m=document.getElementById('forge-modal'); if(m)m.classList.add('hidden'); }catch(e){} }
          // Même raison pour la fenêtre de choix de « Calmer la Population » : c'est orig qui la fermait.
          if(fn==='applyCalmTension'){ try{ const o=document.getElementById('calm-overlay'); if(o)o.remove(); }catch(e){} }
          if(fn==='doEstablishRoute'){
            const me=myNation();
            /* IA de Navigation (`route_force_free`) : le moteur pose le jeton gratuitement, la question
               n'a pas lieu d'être — et sa réponse « non » écrivait « Route non protégée » à tort (FE37 T7). */
            const _gratuit = me && typeof window.hasSpec==='function' && (function(){ try{ return hasSpec(me,'route_force_free'); }catch(e){ return false; } })();
            if(me && me.forceTokens>0 && !_gratuit){ askRouteToken(action); return; }
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
          if(!confirm(t('web.quitter_partie_ligne_revenir_menu_partie','Quitter cette partie en ligne et revenir au menu ? La partie sera terminée pour tous les joueurs.'))) return;
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
      window.scConfirmValidate=function(){ if(STATE.started){ hideConfirmBar(); STATE._confirmPending=false; send({t:'confirm'}); showWaitBlock(); statusBref(t('web.valide','Validé…')); return; } return o.apply(this,arguments); };
      window.scConfirmValidate._scOff=true;
    }
    if(typeof window.scConfirmCancel==='function' && !window.scConfirmCancel._scOff){
      const o=window.scConfirmCancel;
      window.scConfirmCancel=function(){ if(STATE.started){ hideConfirmBar(); STATE._confirmPending=false; send({t:'undo'}); showWaitBlock(); statusBref(t('web.annule_retour_arriere','Annulé — retour en arrière…')); return; } return o.apply(this,arguments); };
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
  decisionPanel(t('web.proteger_route_jeton_maintient_connexion','<h2>🛤️ Protéger la route ?</h2><div class="muted">Un jeton maintient la connexion et repousse les pirates.</div>\n    <button class="opt" id="sc-t1">⚔️ Oui, déployer 1 jeton</button>\n    <button class="opt" id="sc-t0">Non, laisser sans protection militaire</button>'));
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
  const btn=(id,label,n)=>t('web.ligne_9','<button class="opt" id="{id}"{v}>{label}{v2}</button>',{id:id,v:(n?'':' disabled style="opacity:.45"'),label:label,v2:(n?' <span class="muted">('+n+' choix)</span>':t('web.aucune_cible',' <span class="muted">(aucune cible)</span>'))});
  decisionPanel(t('web.tour_ia_joue_coup_moi_passer_fin_ma_manc','<h2>🎮 Ton tour{ac}</h2>\n    {v}\n    {v2}\n    {v3}\n    {v4}\n    <button class="opt" id="sc-auto">🤖 L\'IA joue ce coup pour moi</button>\n    <button class="opt" id="sc-pass">⏭️ Passer (fin de ma manche)</button>\n    <div class="muted" style="margin-top:6px">Ce menu est un secours : le mieux est de jouer directement sur le plateau (coloniser, routes, techs, gouvernement, raid, attaque, pouvoir — tout est branché). 1 action = la main passe, puis revient à toi s\'il te reste des AC.</div>',{ac:acLeft,v:btn('sc-a-col','🏗️ Coloniser',cols.length),v2:btn('sc-a-rte','🛤️ Route',rts.length),v3:btn('sc-a-tech','🔬 Acheter une tech',techs.length),v4:btn('sc-a-up','⬆️ Améliorer une colonie',ups.length)}));
  const sub=(items, mk)=>{ // sous-menu générique
    decisionPanel(t('web.choisis_retour','<h2>Choisis</h2>{v}<button class="opt" id="sc-back">↩ Retour</button>',{v:items.map((it,i)=>`<button class="opt" data-i="${i}"><b>${it.label}</b><br><span class="muted">${it.sub||''}</span></button>`).join('')}));
    document.querySelectorAll('#sc-decision .opt[data-i]').forEach(b=>{ b.onclick=()=>mk(items[parseInt(b.getAttribute('data-i'))]); });
    document.getElementById('sc-back').onclick = actionMenu;
  };
  const bind=(id,fn)=>{ const b=document.getElementById(id); if(b && !b.disabled) b.onclick=fn; };
  bind('sc-a-col', ()=>sub(cols, it=>sendAction({type:'colonize', node:it.id})));
  bind('sc-a-rte', ()=>sub(rts, it=>{
    const me2=myNation(); const hasTok=me2&&me2.forceTokens>0;
    if(!hasTok) return sendAction({type:'route', from:it.from, to:it.to, token:false});
    decisionPanel(t('web.proteger_route_avec_jeton_force_oui_depl','<h2>{v}</h2><div class="muted">Protéger la route avec un jeton de force ?</div>\n      <button class="opt" id="sc-t1">⚔️ Oui, déployer 1 jeton</button>\n      <button class="opt" id="sc-t0">Non, laisser sans protection militaire</button>',{v:it.label}));
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
  /* ═══ ÉCRANS D'ENTRÉE (15/09, §124) : même image de fond que l'accueil, carte en verre dépoli, Blason. ═══ */
  #sc-ov{position:fixed;inset:0;z-index:9000;color:#cdd9f5;font-family:var(--font-corps,system-ui),sans-serif;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:max(46px,env(safe-area-inset-top,0px)) 12px 24px;box-sizing:border-box;
    background:#070718 url(assets/fond_accueil_phone.jpg) center 30%/cover no-repeat}
  #sc-ov::before{content:'';position:fixed;inset:0;pointer-events:none;background:rgba(7,7,24,.78)}
  @media (min-width:900px){ #sc-ov{background-image:url(assets/fond_accueil_desk.jpg);background-position:center} }
  #sc-ov .card{position:relative;background:rgba(11,13,36,.82);border:1px solid rgba(74,158,255,.35);border-radius:16px;padding:30px 16px 16px;width:min(92vw,420px);box-shadow:0 18px 50px rgba(0,0,0,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);margin-top:28px}
  #sc-ov .fen-medal{position:absolute;left:50%;top:-27px;transform:translateX(-50%);width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:26px;background:#0b0d24;border:2px solid #4a9eff;box-shadow:0 0 0 3px #070718}
  #sc-ov .fen-kicker{font-family:var(--font-titre,inherit);font-size:.6em;letter-spacing:.16em;text-transform:uppercase;color:#4a9eff;text-align:center}
  #sc-ov .fen-kicker.gauche{text-align:left;margin:10px 0 6px}
  #sc-ov h2{margin:0;font-family:var(--font-titre,inherit);font-weight:400;font-size:1.15em;letter-spacing:.06em;color:#fff;text-align:center}
  #sc-ov .sous{color:#8f98bf;font-size:.86em;text-align:center;margin:2px 0 10px}
  #sc-ov input,#sc-ov select{width:100%;box-sizing:border-box;margin:5px 0;padding:11px 12px;border-radius:9px;border:1px solid #232750;background:#0b0d24;color:#dce8ff;font-family:var(--font-corps,system-ui);font-size:.95em}
  #sc-ov button{cursor:pointer;border:1px solid #2a3a6a;border-radius:10px;padding:12px 14px;font-family:var(--font-titre,inherit);font-size:.7em;letter-spacing:.08em;text-transform:uppercase;color:#c8d4ff;background:#0b0d24}
  #sc-ov .pri{background:linear-gradient(135deg,#2f6fd0,#1f4fa0);border-color:#7fb3ff;color:#fff;width:100%;margin-top:8px}
  #sc-ov .sec{width:100%;margin-top:6px}
  #sc-ov .err{color:#ff8c8c;font-size:.85em;min-height:1.1em;margin-top:6px;text-align:center}
  #sc-ov .muted{color:#8f98bf;font-size:.82em}
  #sc-ov .row{display:flex;gap:8px;align-items:center}#sc-ov .row>*{flex:1}
  #sc-ov .liens{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:.8em}
  #sc-ov .liens a,#sc-ov .liens span{color:#8f98bf;text-decoration:none;cursor:pointer}
  #sc-ov .liens a:hover{color:#bcd3ff}
  #sc-ov .sc-btn-aide{flex:1;display:block;text-align:center;text-decoration:none;border:1px solid #2a3a6a;border-radius:10px;padding:12px 10px;font-family:var(--font-titre,inherit);font-size:.7em;letter-spacing:.08em;text-transform:uppercase;color:#c8d4ff;background:#0b0d24}
  #sc-ov .sc-btn-aide:hover{border-color:#4a6aaa;color:#fff}
  #sc-ov .sc-pied{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;font-size:.72em;color:#8f98bf;opacity:.85}
  #sc-ov .sc-pied a{color:#8f98bf;text-decoration:none}
  #sc-ov .sc-pied a:hover{color:#bcd3ff}
  /* Sièges de « Nouvelle partie » : médaillon, nom, base, sélecteur, ⓘ ; détail replié (Marc : caché au départ). */
  #sc-ov .siege{background:#0b0d24;border:1px solid #232750;border-radius:12px;padding:8px 8px 8px 10px;margin:8px 0}
  #sc-ov .siege .haut{display:flex;align-items:center;gap:9px}
  #sc-ov .siege .medal2{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:18px;background:#0f1130;border:2px solid var(--c,#4a9eff);flex:0 0 auto;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  /* min-width:0 : sans lui, un nom long (« Jupitériens », grand réglage Aa) refuse de rétrécir et pousse
     le menu IA/Moi hors de la carte (capture Samsung du 18/09). */
  #sc-ov .siege .nom{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600;color:#fff;line-height:1.2}
  #sc-ov .siege .nom small{display:block;font-weight:400;color:#8f98bf;font-size:.8em}
  #sc-ov .siege select{width:auto;flex:0 0 auto;margin:0;padding:9px 8px;font-family:var(--font-titre,inherit);font-size:.62em;letter-spacing:.04em;text-transform:uppercase;color:#c8d4ff;background:#131740;border-color:#2a3a6a;max-width:32vw;text-overflow:ellipsis}
  @media (max-width:400px){ #sc-ov .siege .nom{font-size:.9em} }
  #sc-ov .siege select.moi{background:#163a6b;border-color:#2f6fbf;color:#e8f1ff}
  #sc-ov .siege .i{width:32px;height:32px;padding:0;border-radius:50%;border:1px solid #2a3a6a;display:grid;place-items:center;font-family:var(--font-titre,inherit);font-size:.7em;color:#4a9eff;background:transparent;flex:0 0 auto;text-transform:none}
  #sc-ov .siege .det{display:none;margin-top:8px;padding-top:8px;border-top:1px solid #1d2350;font-size:.86em;line-height:1.45}
  #sc-ov .siege.on .det{display:block}
  #sc-ov .siege.on .i{background:#163a6b;color:#fff}
  #sc-ov .siege .r{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0 6px}
  #sc-ov .siege .r span{background:#131740;border:1px solid #232750;border-radius:999px;padding:2px 8px;font-size:.92em}
  #sc-ov .siege p{margin:3px 0;color:#dfe6ff}#sc-ov .siege p b{color:#ffb15a}#sc-ov .siege p.m{color:#8f98bf}
  #sc-ov .astuce{text-align:center;color:#8f98bf;font-size:.78em;margin-top:8px}
  /* Reprendre une partie : une ligne par partie, corbeille à côté. */
  #sc-ov .rep{display:flex;gap:6px;align-items:stretch;margin:6px 0}
  #sc-ov .rep .sc-reprise{flex:1 1 auto;width:auto;min-width:0;text-align:left;white-space:normal;margin:0;padding:10px 12px;text-transform:none;letter-spacing:0;font-family:var(--font-corps,system-ui);font-size:.9em}
  #sc-ov .rep .sc-reprise b{font-family:var(--font-titre,inherit);font-size:.86em;letter-spacing:.04em}
  #sc-ov .rep .sc-suppr{margin:0;padding:0 12px;flex:0 0 auto;width:auto;border-color:#7a2a2a;color:#ff9999;font-size:1em}
  #sc-ov .btns2{display:flex;gap:8px;margin-top:10px}#sc-ov .btns2 button{flex:1;margin:0}
  /* Pastille d'état EN BAS À DROITE, au-dessus de la barre d'onglets (Marc, FE37 : en haut elle couvrait
     le numéro de tour et les AC). --botband est posée par uiSyncBands (hauteur réelle de la barre). */
  #sc-status{position:fixed;bottom:calc(var(--botband,64px) + 58px);left:8px;right:auto;transform:none;z-index:8500;background:#0d1426cc;border:1px solid #26406e;border-radius:10px;padding:4px 10px;color:#bcd3ff;font:600 .72em var(--font-corps,system-ui);backdrop-filter:blur(4px);max-width:62vw;text-align:left}
  /* Look NATIF du jeu (carte sombre, bordure violette, police du jeu), inscrit dans la BANDE CENTRALE
     (entre les barres haut/bas) — restaure l'apparence d'origine au lieu du panneau bleu minimaliste. */
  #sc-decision{position:fixed;left:0;right:0;top:var(--topband,0);bottom:var(--botband,0);z-index:375;background:rgba(4,4,18,.92);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:8px}
  /* Blason (Marc, 14/09) : le panneau générique prend la forme de la famille .fen (index.html) — même
     cadre, titre en Michroma, boutons de 48 px. Les fenêtres qui ont un adversaire (défense, combat de
     guerre, paix) sont assemblées par fenBlason avec le médaillon ; celles-ci gardent le cadre commun. */
  #sc-decision .card{background:#0e1030;border:1px solid #33386b;border-radius:18px;padding:18px 16px 14px;width:min(94vw,470px);max-height:none;margin:auto;overflow:auto;box-shadow:0 18px 50px rgba(0,0,0,.65);color:#dbe1f7;font-family:var(--font-corps,system-ui),sans-serif;text-align:center}
  #sc-decision .card:has(> .fen-wrap){background:none;border:0;box-shadow:none;padding:0}
  #sc-decision h2{color:#fff;font-family:var(--font-titre,var(--font-corps)),sans-serif;font-weight:400;font-size:1em;letter-spacing:.06em;text-transform:uppercase;margin:0 0 12px;line-height:1.3}
  #sc-decision .muted{color:#9aa3c7;font-size:.86em}
  #sc-decision .opt{display:block;width:100%;text-align:left;margin:7px 0;padding:12px 14px;min-height:48px;border-radius:12px;border:1px solid #33386b;background:#0b0d24;color:#dbe1f7;cursor:pointer;font-size:.95em;line-height:1.3}
  #sc-decision .opt:hover{border-color:#4a9eff;background:#12143a}
  #sc-decision h2{color:#fff;font-size:1.3em;margin:0 0 14px;font-weight:700}
  #sc-decision .muted{color:#9fb0d0;font-size:.82em}
  #sc-decision .opt{display:block;width:100%;text-align:left;margin:7px 0;padding:11px 13px;border-radius:9px;border:1px solid #2a3a6a;background:#141a30;color:#dce8ff;cursor:pointer;font-size:.92em}
  #sc-decision .fen-btns .opt{margin:0}`;
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
/* Message FUGACE (« Coup envoyé… ») : s'efface seul après 2,5 s — sinon il restait pendant tout le tour des IA. */
function statusBref(txt){ status(txt); clearTimeout(window._scStatusBref); window._scStatusBref=setTimeout(hideStatus,2500); }
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
  const b=el(t('web.joueur_absent','<div id="sc-absence" style="position:fixed;z-index:8200;max-width:min(94vw,560px);background:rgba(24,30,44,.97);border:1px solid #45557a;border-radius:12px;padding:8px 12px;color:#dbe6ff;font:600 .82em system-ui;box-shadow:0 8px 28px rgba(0,0,0,.5);text-align:center"><div id="sc-abs-tete" style="display:flex;align-items:center;gap:8px;cursor:move;user-select:none;touch-action:none"><span id="sc-abs-poignee" style="flex:1;text-align:left;color:#9fb4d8;font-size:.9em">⠿ Joueur absent</span><button id="sc-abs-reduire" title="Réduire" style="background:#1a2444;color:#9fb4d8;border:1px solid #45557a;border-radius:7px;min-width:26px;height:22px;cursor:pointer;font-weight:800;line-height:1">–</button></div><div id="sc-abs-corps"><div id="sc-absence-msg" style="margin:6px 0 {v}"></div>{v2}</div></div>',{v:(m.votable?'8px':'0'),v2:(m.votable?t('web.proposer_remplacer_ia','<button id="sc-absence-vote" style="background:linear-gradient(135deg,#a2542f,#7a3c20);color:#fff;border:0;border-radius:9px;padding:7px 13px;font:700 .95em system-ui;cursor:pointer">🤖 Proposer de le remplacer par une IA</button><div id="sc-absence-vote-etat" style="margin-top:6px;color:#9fb4d8;font-weight:500"></div>'):'')}));
  b.querySelector('#sc-absence-msg').textContent = m.msg || '';
  document.body.appendChild(b);
  /* Position : celle qu'on avait laissée, sinon en bas au centre comme avant. */
  if(pos && typeof pos.x==='number'){ b.style.left=pos.x+'px'; b.style.top=pos.y+'px'; b.style.transform='none'; }
  else { b.style.left='50%'; b.style.bottom='64px'; b.style.transform='translateX(-50%)'; }
  const corps=b.querySelector('#sc-abs-corps'), btR=b.querySelector('#sc-abs-reduire');
  const appliquerRepli=()=>{ corps.style.display=replie?'none':''; btR.textContent=replie?'+':'–';
    btR.title=((((replie?t('web.deplier','Déplier'):t('web.reduire','Réduire'))))); b.style.padding=replie?'4px 8px':'8px 12px'; };
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
  if(bt) bt.onclick=()=>{ bt.disabled=true; bt.textContent=t('web.vote_enregistre','✓ Ton vote est enregistré'); bt.style.opacity=.65; send({t:'vote_ia'}); };
}
function hideAbsence(){ const b=document.getElementById('sc-absence'); if(b) b.remove(); }

/* ═══════════════ CONCÉDER LA VICTOIRE ═══════════════
   Le bouton est dans le journal. Il n'existe QU'EN LIGNE : en solo il n'y a personne à qui
   concéder, et « Recommencer à zéro » fait déjà ce qu'il faut.

   ⚠️ Cette fenêtre a son PROPRE calque (#sc-concede), délibérément séparé de #sc-decision.
   Une concession peut tomber pendant qu'on a une question de jeu à l'écran : réutiliser le
   calque des décisions écraserait cette question, et le joueur ne la reverrait jamais. */
/* Quels boutons de fin dans la carte Réglages du Journal (Marc, 16/09) :
     · solo, ou en ligne sans autre humain → « Recommencer la partie » (en ligne : quitte la partie serveur) ;
     · en ligne avec d'autres humains → « Admettre sa défaite » (ex-Concéder : les autres votent) et, pour
       le CRÉATEUR de la partie, « Renoncer à jouer » (une IA reprend son rôle, sans vote). */
function concederVisible(oui){
  const humains = oui && _autresHumains();
  const show=(id,on)=>{ const b=document.getElementById(id); if(b) b.style.display = on ? '' : 'none'; };
  show('conceder-btn', humains);
  show('renoncer-btn', humains && !!STATE.isHost);
  show('recommencer-btn', !humains);
}
window.scRenoncer = function(){
  if(!STATE.game || !STATE.started){ alert(t('web.aucune_partie_cours','Aucune partie en cours.')); return; }
  const ok = confirm(t('web.renoncer_jouer_ia_reprend_nation_immedia','RENONCER À JOUER\n\nUne IA reprend ta nation immédiatement et la partie continue sans toi. Tu ne pourras pas revenir.\n\nConfirmer ?'));
  if(!ok) return;
  send({t:'renoncer'});
};
window.scConcede = function(){
  if(!STATE.game || !STATE.started){ alert(t('web.aucune_partie_cours','Aucune partie en cours.')); return; }
  const ok = confirm(t('web.conceder_victoire_renonces_victoire_quit','CONCÉDER LA VICTOIRE\n\nTu renonces à la victoire et tu quittes définitivement cette partie.\n\nLes autres joueurs choisiront alors, à l\'unanimité, si la partie continue avec une IA à ta place ou si elle s\'arrête là.\n\nConfirmer ?'));
  if(!ok) return;
  send({t:'concede'});
  concedePanelHTML(t('web.as_concede_autres_joueurs_decident_si_pa','<h2>🏳️ Tu as concédé</h2><p style="color:#c7d4ee;font-size:.9em;line-height:1.5">Les autres joueurs décident si la partie continue avec une IA à ta place, ou si elle s\'arrête.</p><div id="sc-concede-etat" style="color:#9fb4d8;font-size:.84em;margin-top:10px">En attente de leur réponse…</div>'));
};
function concedePanelHTML(html){
  let p=document.getElementById('sc-concede');
  if(!p){ p=el('<div id="sc-concede"></div>'); document.body.appendChild(p); }
  // z-index AU-DESSUS de #sc-decision (375) : la concession suspend la partie, elle passe devant.
  p.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;z-index:8600;background:rgba(4,4,18,.94);'
    +'backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:10px;overflow-y:auto';
  p.innerHTML='<div style="background:#0c0c24;border:2px solid #c85050;border-radius:16px;padding:22px 26px;'
    +'width:min(94vw,460px);color:#e6ecff;font-family:var(--font-corps,system-ui),sans-serif;text-align:center;'
    +'box-shadow:0 20px 60px rgba(0,0,0,.92);box-sizing:border-box">'+html+'</div>';
  return p;
}
function concedeFermer(){ const p=document.getElementById('sc-concede'); if(p) p.remove(); }
function concedePanel(m){
  if(!m || !m.civId) return;
  if(m.civId===STATE.myCiv) return;            // c'est MOI qui ai concédé : mon panneau est déjà affiché
  if(m.dejaChoisi){ concedeAttente(null); return; }
  concedePanelHTML(t('web.concede_victoire_quitte_partie_nation_en','<h2 style="margin:0 0 12px;color:#ffd0d0;font-size:1.25em">🏳️ {v} concède la victoire</h2><p style="color:#c7d4ee;font-size:.92em;line-height:1.5;margin:0 0 16px">Il quitte la partie. Sa nation, <b>{v2}</b>, est encore sur le plateau.<br>Que faites-vous ?</p><button id="sc-cc-ia" style="display:block;width:100%;margin:7px 0;padding:12px;border-radius:10px;border:1px solid #3f7a4a;background:#14301c;color:#cdf0d6;font:700 .95em system-ui;cursor:pointer">🤖 Continuer — une IA reprend sa nation</button><button id="sc-cc-stop" style="display:block;width:100%;margin:7px 0;padding:12px;border-radius:10px;border:1px solid #7a3f3f;background:#301414;color:#f0cdcd;font:700 .95em system-ui;cursor:pointer">🛑 Arrêter la partie maintenant</button><div style="color:#8fa2c4;font-size:.78em;margin-top:12px;line-height:1.45">L\'accord de tous les joueurs restants est nécessaire. En cas de désaccord, la partie continue avec l\'IA.<br>Si vous arrêtez, les scores sont calculés en l\'état et l\'email de fin part normalement.</div><div id="sc-concede-etat" style="color:#9fb4d8;font-size:.82em;margin-top:8px"></div>',{v:esc(m.qui||'Un joueur'),v2:esc(m.nation||'')}));
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
  d.textContent = ((((manquants && manquants.length?t('web.attente','En attente de : {v}',{v:manquants.join(', ')}):t('web.reponse_enregistree_attente_autres_joueu','Réponse enregistrée. En attente des autres joueurs…')))));
}
function concedeFini(m){
  concedeFermer();
  const jeSuisLePartant = (m && m.civId===STATE.myCiv);
  if(m && m.issue==='ia'){
    if(jeSuisLePartant){
      concedePanelHTML(t('web.as_quitte_partie_ia_repris_nation_partie','<h2 style="margin:0 0 12px;color:#ffd0d0">🏳️ Tu as quitté la partie</h2><p style="color:#c7d4ee;font-size:.92em;line-height:1.5">Une IA a repris ta nation ; la partie continue sans toi.</p><button onclick="location.reload()" style="margin-top:14px;padding:11px 20px;border-radius:10px;border:0;background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;font:700 .95em system-ui;cursor:pointer">Retour à l\'accueil</button>'));
    }else{
      showLogToast([t('web.ia_reprend_nation_joueur_parti_partie_co','🤖 Une IA reprend la nation du joueur parti — la partie continue.')]);
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
  const txt = ((((autres.length?t('web.bilan_attend_encore','⏳ Bilan : on attend encore {nation}.',{nation:autres.map(civLabel).join(', ')}):t('web.bilan_autres_joueurs_ont_termine','⏳ Bilan : les autres joueurs ont terminé.')))));
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
const _SINGULIER={terriens:'LE TERRIEN',martiens:'LE MARTIEN',jupiteriens:t('web.jupiterien','LE JUPITÉRIEN'),ceinturiens:'LE CEINTURIEN'};
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
  /* v10.62 : le badge vit dans la ligne 3 de la nouvelle barre ; ses couleurs sont en CSS (data-etat). */
  { const te=document.getElementById('tb-etat'); if(te) te.classList.toggle('avec-passer', !!(_pb&&_pb.classList.contains('on'))); }
  if(!qui){ b.classList.remove('on'); if(tb)tb.classList.remove('a-toi'); return; }
  if(qui==='moi'){
    b.textContent=t('web.toi','À TOI'); b.dataset.etat='moi';
  }else if(_estIA(qui)){
    b.textContent='IA joue…'; b.dataset.etat='calme';
  }else{
    b.textContent=(_SINGULIER[qui]||String(qui).toUpperCase())+' JOUE'; b.dataset.etat='autre';
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
  d.textContent = ((((n?t('web.attente_autre_joueur_remplacement_ait_li','En attente de {n} autre{v} joueur{v2} pour que le remplacement ait lieu.',{n:n,v:(n>1?'s':''),v2:(n>1?'s':'')}):t('web.vote_complet_remplacement_cours','Vote complet — remplacement en cours…')))));
}
let _notYourTurnTs=0;
function notYourTurnToast(){
  // Fenêtre flottante SUPPRIMÉE (demande de Marc) : on utilise la ligne d'aide NATIVE du jeu (setHint),
  // en bas du plateau — pas de pop-up en plus.
  const now=Date.now(); if(now-_notYourTurnTs<1500) return; _notYourTurnTs=now;
  try{ const el2=document.getElementById('sc-nyt'); if(el2)el2.remove(); }catch(e){}
  try{ if(typeof setHint==='function'){ setHint(t('web.tour_peux_consulter_carte_journal_empire','⏳ Ce n\'est pas ton tour — tu peux consulter la carte, le journal, l\'empire et la diplomatie.')); setTimeout(()=>{ try{ setHint(''); }catch(e){} },2500); } }catch(e){}
}

// Étiquette de version affichée sur l'écran de connexion. Si index.html et online.js portent des
// builds différents, on affiche les DEUX en rouge : c'est le signe d'un upload partiel ou d'un cache.
function _buildLabel(){
  const h=(typeof window!=='undefined'&&window.SOLAR_BUILD_HTML)||null;
  const j=SOLAR_BUILD_JS;
  if(!h) return t('accueil.version','Version {v}',{v:j})+' <span style="color:#ff8a8a">'+t('accueil.version_html_inconnue','(jeu : version inconnue — index.html non à jour)')+'</span>';
  if(h===j) return t('accueil.version','Version {v}',{v:h});
  return '<span style="color:#ff8a8a">'+t('accueil.versions_incoherentes','Versions incohérentes — jeu : {h} · en ligne : {j}',{h:h,j:j})+'</span>';
}
// ── Connexion / inscription (pseudo, pas email — comptes du serveur live) ──
function screenAuth(mode){
  const isReg = mode==='register';
  let savedUser=''; try{ savedUser=localStorage.getItem('sc_ws_user')||''; }catch(e){}
  overlay(t('web.solar_nbsp','\n    <div class="fen-medal">🚀</div>\n    <div class="fen-kicker">Solar</div>\n    <h2>{v}</h2>\n    <div class="sous">&nbsp;</div>\n    <input id="sc-u" type="email" inputmode="email" placeholder="{v2}" autocomplete="email" enterkeyhint="next" value="{saveduser}">\n    <div style="position:relative">\n      <input id="sc-p" type="password" placeholder="{v3}" autocomplete="{v4}" enterkeyhint="go" style="padding-right:44px">\n      <button type="button" id="sc-eye" title="{v5}" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;border:0;color:#8fb0e0;font-size:1.1em;cursor:pointer;padding:4px 8px">👁️</button>\n    </div>\n    <div class="muted" style="font-size:.78em;margin:2px 0 6px">{v6}</div>\n    <div class="err" id="sc-err"></div>\n    <button class="pri" id="sc-go">{v7}</button>\n    <button class="sec" id="sc-alt">{v8}</button>\n    <button class="sec" id="sc-close">{tour}</button>\n    <div class="liens">\n      <a href="tutorial.html">{v9}</a><a href="regles.html">{v10}</a><a href="confidentialite.html">{v11}</a>\n    </div>\n    <div class="lv-langue">{v12}</div>\n    <div class="muted" style="font-size:.72em;opacity:.7;margin-top:9px;text-align:center">{v13}</div>\n  ',{v:(isReg?t('auth.creer_compte','Créer un compte'):t('auth.titre_connexion','Connexion')),v2:t('auth.ph_email','Ton adresse email'),saveduser:savedUser,v3:t('auth.ph_mdp6','Mot de passe (min. 6)'),v4:(isReg?'new-password':'current-password'),v5:t('auth.oeil','Afficher / masquer le mot de passe'),v6:t('auth.email_info',"Ton email sert d'identifiant et reçoit les scores de fin de partie."),v7:(isReg?t('auth.btn_creer','Créer le compte'):t('auth.connexion','Se connecter')),v8:(isReg?t('auth.deja_compte',"J'ai déjà un compte"):t('auth.creer_compte','Créer un compte')),tour:t('auth.retour_solo','↩ Retour au jeu solo'),v9:t('lien.tutoriel','🎓 Tutoriel'),v10:t('lien.regles','📖 Règles'),v11:t('lien.confidentialite','🔒 Confidentialité'),v12:(typeof i18nSelecteurHTML==='function'?i18nSelecteurHTML():''),v13:_buildLabel()}));
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
   if(eye&&pw)eye.onclick=()=>{ const show=pw.type==='password'; pw.type=show?'text':'password'; eye.textContent=show?'🙈':'👁️'; pw.focus(); };}
  document.getElementById('sc-close').onclick = ()=>{ _errCb=null; hideOverlay(); };
  document.getElementById('sc-go').onclick = ()=>{
    const user=document.getElementById('sc-u').value.trim(), pass=document.getElementById('sc-p').value;
    if(!/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(user)){ _errCb(t('auth.email_invalide','Entre une adresse email valide (ex. prenom@domaine.ch)')); return; }
    STATE._pendingPass = pass;
    STATE._afterLogin = ()=>{ _errCb=null; screenLobby(); };
    send(isReg ? {t:'register', user, pass} : {t:'login', user, pass});
  };
  document.getElementById('sc-alt').onclick = ()=> screenAuth(isReg?'login':'register');
}

// ── Lobby ──
const CIVS_LIST = [['terriens','🌍 Terriens'],['martiens','🔴 Martiens'],['jupiteriens',t('web.jupiteriens','🟠 Jupitériens')],['ceinturiens','☄️ Ceinturiens']];
function civLabel(id){ try{ if(typeof CIVS!=='undefined'&&CIVS[id]) return CIVS[id].emoji+' '+CIVS[id].name; }catch(e){} const c=CIVS_LIST.find(x=>x[0]===id); return c?c[1]:id; }   // CIVS d'abord : traduit (tranche 2)
/* Date et heure EUROPÉENNES, comme le reste des rapports (Marc). */
function _dateFr(ms){
  if(!ms) return '';
  /* Le format de date suit la langue choisie (i18n.js) : fr-FR, en-GB… `SOLAR_LANG` est un code à deux lettres. */
  const _loc=({fr:'fr-FR',en:'en-GB',de:'de-DE',es:'es-ES',zh:'zh-CN'})[(typeof SOLAR_LANG!=='undefined'&&SOLAR_LANG)||'fr']||'fr-FR';
  try{ return new Date(ms).toLocaleString(_loc,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return ''; }
}
/* Une ligne de partie reprenable : qui joue, où en est-on, et faut-il y aller MAINTENANT. */
function _ligneReprise(p){
  /* Les noms viennent de CIVS (traduits dans la langue du joueur, tranche 2) ; la table en dur ne sert que de repli. */
  const nomCiv = id => { try{ if(typeof CIVS!=='undefined'&&CIVS[id]) return CIVS[id].emoji+' '+CIVS[id].name; }catch(e){} const _n={terriens:'🌍 Terriens',martiens:'🔴 Martiens',jupiteriens:'🟠 Jupitériens',ceinturiens:'☠️ Ceinturiens'}; return _n[id]||id; };
  const joueurs = (p.joueurs||[]).map(j=>{
    if(j.ia) return '<span style="opacity:.6">'+nomCiv(j.civId)+' ('+t('commun.ia','IA')+')</span>';
    const pastille = j.connecte ? '🟢' : '⚪';
    return t('web.ligne_10','{pastille} {nation}{v}',{pastille:pastille,nation:nomCiv(j.civId),v:(j.moi?' <b>('+t('commun.toi','toi')+')</b>':(j.user?' <span style="opacity:.7">'+esc(j.user)+'</span>':''))});
  }).join(' · ');
  const tour = ((((p.tour?t('lobby.tour','tour {n}',{n:p.tour})+(p.maxTours?('/'+p.maxTours):''):(p.statut==='lobby'?t('lobby.pas_commencee','pas encore commencée'):'—')))));
  const urgent = p.aMoiDeJouer;
  /* La corbeille est À CÔTÉ du bouton, jamais DEDANS : un bouton dans un bouton n'est pas du HTML
     valide et le clic partirait au mauvais endroit. (Marc, 04/09 : « supprimer les parties test ».) */
  return t('web.ligne_11','<div class="rep"><button class="{v} sc-reprise" data-code="{v2}"><div>{v3}<b>{v4}</b> · {tour}</div><div style="font-size:.88em;opacity:.9;margin-top:3px">{joueurs}</div><div style="font-size:.8em;opacity:.65;margin-top:3px">{v5}</div></button><button class="sec sc-suppr" data-code="{v6}" title="{v7}">🗑️</button></div>',{v:(urgent?'pri':'sec'),v2:esc(p.code),v3:(urgent?t('lobby.a_toi','▶ À TOI DE JOUER — '):''),v4:esc(p.code),tour:tour,joueurs:joueurs,v5:t('lobby.derniere_activite','dernière activité : {d}',{d:_dateFr(p.maj)}),v6:esc(p.code),v7:t('lobby.supprimer_partie','Supprimer cette partie')});
}
function screenLobby(){
  STATE.game=null; STATE.myCiv=null; STATE.started=false;
  STATE._surLobby=true;
  try{ localStorage.removeItem('sc_ws_game'); }catch(e){}
  /* ⚠️ LA LISTE VIENT DU SERVEUR, PAS DU NAVIGATEUR. Avant, on ne pouvait rejoindre que la dernière
     partie mémorisée en local : vider le cache, changer d'appareil ou mener deux parties de front,
     et la partie devenait introuvable — alors qu'elle vivait toujours côté serveur. */
  const parties = Array.isArray(STATE.parties) ? STATE.parties : [];
  const bloc = ((((parties.length?'<div class="fen-kicker gauche">'+t('lobby.reprendre','Reprendre une partie')+'</div>'
       + parties.map(_ligneReprise).join(''):''))));
  /* Blason (15/09, §124) : médaillon, « Bonjour », le prénom de l'adresse en grand, l'adresse en dessous. */
  const _prenom=(()=>{ const u=String(STATE.user||''); const m=u.split('@')[0]||u; return m.charAt(0).toUpperCase()+m.slice(1); })();
  overlay(`
    <div class="fen-medal">👋</div>
    <div class="fen-kicker">${t('lobby.bonjour','Bonjour')}</div>
    <h2>${esc(_prenom)}</h2>
    <div class="sous">${esc(STATE.user||'')}</div>
    ${bloc}
    <button class="pri" id="sc-create" style="margin-top:12px">${t('lobby.creer','Créer une partie')}</button>
    <div class="row" style="margin-top:8px"><input id="sc-code" placeholder="${t('lobby.ph_code',"Code d'invitation")}" style="margin:0"><button class="sec" id="sc-join" style="margin:0;flex:0 0 auto;width:auto">${t('lobby.rejoindre','Rejoindre')}</button></div>
    <div class="err" id="sc-err"></div>
    <!-- ═══ ACCUEIL CONNECTÉ, REFAIT LE 22/09 (Marc) ═══
         Plus de « Rafraîchir » (la liste des parties se met à jour seule), plus de « Solo » (le jeu
         hors ligne est l'affaire de l'application), Tutoriel et Règles en vrais boutons, et tout ce
         qui touche au compte (déconnexion, confidentialité, suppression) rangé un niveau plus bas,
         derrière « Mon compte », à côté de la version : on n'y clique pas par hasard. Pas de guillemet
         oblique dans ce commentaire (gabarit JS). -->
    <div class="row sc-aides" style="margin-top:12px">
      <a class="sc-btn-aide" href="tutorial.html">${t('lien.tutoriel','🎓 Tutoriel')}</a>
      <a class="sc-btn-aide" href="regles.html">${t('lien.regles','📖 Règles')}</a>
    </div>
    <div class="lv-langue">${(typeof i18nSelecteurHTML==='function')?i18nSelecteurHTML():''}</div>
    <div class="sc-pied"><a href="#" id="sc-compte">${t('lobby.mon_compte','⚙️ Mon compte')}</a><span>·</span><span>${_buildLabel()}</span></div>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  [...document.querySelectorAll('.sc-reprise')].forEach(b=>{
    b.onclick = ()=>{ STATE._surLobby=false; send({t:'join', code:b.getAttribute('data-code')}); };
  });
  /* Supprimer est définitif : on demande confirmation, et on reste sur le lobby. */
  [...document.querySelectorAll('.sc-suppr')].forEach(b=>{
    b.onclick = ()=>{
      const code=b.getAttribute('data-code');
      if(!confirm(t('lobby.confirm_suppr','Supprimer définitivement la partie {code} ?',{code:code}))) return;
      send({t:'supprimer_partie', code});
    };
  });
  document.getElementById('sc-create').onclick = ()=>{ STATE._surLobby=false; screenCreate(); };
  document.getElementById('sc-join').onclick = ()=>{
    const code=document.getElementById('sc-code').value.trim().toUpperCase();
    if(code){ STATE._surLobby=false; send({t:'join', code}); }
  };
  document.getElementById('sc-compte').onclick = (ev)=>{ ev.preventDefault(); STATE._surLobby=false; screenCompte(); };
  _lobbyAutoRafraichir();
}
/* LA LISTE DES PARTIES SE MET À JOUR TOUTE SEULE (22/09) — elle remplace le lien « Rafraîchir ».
   Toutes les 30 s tant qu'on est sur l'accueil, et au retour sur l'onglet ou l'application. On ne
   redemande PAS pendant qu'on tape un code d'invitation : le nouvel affichage effacerait la saisie. */
function _lobbyAutoRafraichir(){
  if(STATE._lobbyTimer) return;
  const demander=()=>{
    if(!STATE._surLobby||!STATE.connected) return;
    const c=document.getElementById('sc-code');
    if(c&&(c.value||document.activeElement===c)) return;
    send({t:'mes_parties'});
  };
  STATE._lobbyTimer=setInterval(demander,30000);
  try{ document.addEventListener('visibilitychange',()=>{ if(!document.hidden) demander(); }); }catch(e){}
}
/* ═══ MON COMPTE (22/09) ═══ Adresse, déconnexion, confidentialité — et, tout en bas, la suppression
   du compte, qu'Apple et Google exigent accessible depuis l'appli sans qu'elle soit sous le doigt. */
function screenCompte(){
  overlay(`
    <div class="fen-medal">⚙️</div>
    <div class="fen-kicker">${t('compte.titre','Mon compte')}</div>
    <h2>${esc(STATE.user||'')}</h2>
    <button class="sec" id="sc-logout" style="margin-top:14px">${t('lobby.deconnexion','Se déconnecter')}</button>
    <a class="sc-btn-aide" href="confidentialite.html" style="display:block;margin-top:6px">${t('lien.confidentialite','🔒 Confidentialité')}</a>
    <button class="sec" id="sc-close" style="margin-top:6px">← ${t('commun.retour','Retour')}</button>
    <div style="margin-top:26px;text-align:center"><a href="#" id="sc-suppr-compte" style="color:#c88;opacity:.75;font-size:.8em;text-decoration:none">${t('compte.supprimer','Supprimer mon compte')}</a></div>
  `);
  document.getElementById('sc-close').onclick = ()=>{ screenLobby(); };
  document.getElementById('sc-logout').onclick = ()=>{ try{ if(STATE.game&&STATE.game.code) send({t:'leave'}); }catch(e){} STATE.user=null; STATE.token=null; STATE.game=null; try{localStorage.removeItem('sc_ws_token'); localStorage.removeItem('sc_ws_game');}catch(e){} screenAuth('login'); };
  document.getElementById('sc-suppr-compte').onclick = (ev)=>{ ev.preventDefault(); screenSupprimerCompte(); };
}
/* ═══ SUPPRIMER SON COMPTE ═══ Ce que ça efface est dit AVANT, en clair ; le mot de passe est
   redemandé (le serveur le verifie) ; « Annuler » ramene au lobby sans rien faire. */
function screenSupprimerCompte(){
  overlay(`
    <h2>${t('compte.supprimer','Supprimer mon compte')}</h2>
    <p style="font-size:.9em;color:#e0c0c0">${t('compte.definitif','Cette action est <b>définitive</b>. Elle efface :')}</p>
    <ul style="font-size:.88em;color:#c8c8d8;margin:4px 0 10px 18px;padding:0">
      <li>${t('compte.efface_compte','ton compte (<b>{user}</b>) et tes sessions sur tous tes appareils ;',{user:STATE.user})}</li>
      <li>${t('compte.efface_parties',"tes parties en cours contre l'ordinateur et tes parties archivées ;")}</li>
      <li>${t('compte.efface_multi','dans une partie en cours avec d\'autres joueurs, ta nation passe à l\'ordinateur — leur partie continue sans toi.')}</li>
    </ul>
    <p style="font-size:.88em;color:#9fb0d0">${t('compte.hors_ligne','Les parties jouées hors connexion sur cet appareil ne sont pas concernées.')}</p>
    <div class="row"><input id="sc-p" type="password" placeholder="${t('compte.ph_mdp','Ton mot de passe, pour confirmer')}" autocomplete="current-password"></div>
    <div class="err" id="sc-err"></div>
    <button class="pri" id="sc-go" style="background:linear-gradient(135deg,#b03030,#7a1a1a)">${t('compte.btn_supprimer','Supprimer définitivement')}</button>
    <button class="sec" id="sc-close">${t('commun.annuler','Annuler')}</button>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  document.getElementById('sc-close').onclick = ()=>{ _errCb=null; screenCompte(); };   // on revient d'où l'on vient : Mon compte
  document.getElementById('sc-go').onclick = ()=>{
    const pass=document.getElementById('sc-p').value;
    if(!pass){ _errCb(t('compte.err_mdp','Entre ton mot de passe pour confirmer.')); return; }
    if(!confirm(t('compte.confirm','Supprimer définitivement le compte {user} ?',{user:STATE.user}))) return;
    send({t:'supprimer_compte', pass});
  };
}
/* Fiche d'une nation, depuis `CIVS` (rien à maintenir à la main) : base, départ, jetons, capacité, passif,
   bonus tech. Repliée par défaut (Marc, 15/09) : ⓘ, survol du médaillon, ou appui long au doigt. */
function _ficheNation(id){
  try{
    const c=(typeof CIVS!=='undefined')?CIVS[id]:null; if(!c) return '';
    const home={lune:'Lune',phobos:'Phobos',io:'Io',eris:'Éris'}[c.home]||c.home;
    const st=c.start||{};
    const tb=(typeof TECH_BRANCHES!=='undefined'&&TECH_BRANCHES[c.techBonus])?TECH_BRANCHES[c.techBonus].label:c.techBonus;
    return '<div class="r"><span>'+t('creer.depart','Départ')+' '+(st.energy||0)+'⚡ '+(st.materials||0)+'🪨 '+(st.science||0)+'🔬 '+(st.morale||0)+'❤️</span><span>⚔️ '+t('creer.jetons','{n} jetons',{n:(c.startForce||0)})+'</span><span>🏠 '+esc(home)+'</span></div>'
      +'<p><b>'+esc(c.active.name)+'</b> — '+c.active.desc+'</p>'
      +'<p class="m">'+c.passive+(tb?' · '+t('creer.bonus_tech','Bonus tech : {b} −1🔬',{b:esc(tb)}):'')+'</p>';
  }catch(e){ return ''; }
}
function _siegesInteractifs(){
  document.querySelectorAll('#sc-ov .siege').forEach(sg=>{
    const m=sg.querySelector('.medal2'); let t=null;   // plus de bouton ⓘ (Marc, 15/09 : « ça casse la largeur »)
    const toggle=()=>sg.classList.toggle('on');
    if(m){
      m.onclick=toggle;
      m.addEventListener('mouseenter',()=>{ try{ if(matchMedia('(hover:hover)').matches) sg.classList.add('on'); }catch(e){} });
      m.addEventListener('mouseleave',()=>{ try{ if(matchMedia('(hover:hover)').matches) sg.classList.remove('on'); }catch(e){} });
      m.addEventListener('touchstart',()=>{ t=setTimeout(()=>sg.classList.add('on'),350); },{passive:true});
      m.addEventListener('touchend',()=>clearTimeout(t),{passive:true});
      m.addEventListener('touchmove',()=>clearTimeout(t),{passive:true});
      m.addEventListener('contextmenu',e=>e.preventDefault());
    }
    const sel=sg.querySelector('select'); if(sel){ const maj=()=>sel.classList.toggle('moi',sel.value==='host'); sel.onchange=maj; maj(); }
  });
}
function screenCreate(){
  const rows = CIVS_LIST.map(([id,label],i)=>{
    const c=(typeof CIVS!=='undefined')?CIVS[id]:null;
    /* Le nom de la base vient de NODES (retraduit en place au chargement) : « Moon » en anglais, plus « Lune » en dur. */
    const home=c?((typeof NODES!=='undefined'&&NODES[c.home]&&NODES[c.home].name)||c.home):'';
    return `
    <div class="siege">
      <div class="haut">
        <div class="medal2" style="--c:${c?c.color:'#4a9eff'}" title="${t('creer.fiche','Fiche de la nation')}">${c?c.emoji:label.split(' ')[0]}</div>
        <div class="nom">${c?esc(c.name):label}<small>${t('creer.base','Base : {b}',{b:esc(home)})}</small></div>
        <select data-civ="${id}">
          <option value="none">${t('creer.absente','— absente —')}</option>
          <option value="host"${i===0?' selected':''}>${t('creer.moi','Moi')}</option>
          <option value="open">${t('creer.humain','Humain')}</option>
          <option value="ai"${i>0?' selected':''}>${t('commun.ia','IA')}</option>
        </select>
      </div>
      <div class="det">${_ficheNation(id)}</div>
    </div>`; }).join('');
  overlay(`
    <div class="fen-medal">🚀</div>
    <div class="fen-kicker">${t('creer.kicker','Nouvelle partie')}</div>
    <h2>${t('creer.titre','Les sièges')}</h2>
    <div class="sous">${t('creer.sous','Choisis ta nation, et qui joue les autres.')}</div>
    ${rows}
    <div class="astuce">${t('creer.astuce','Appui long sur un médaillon pour les valeurs de départ des nations.')}</div>
    <div class="err" id="sc-err"></div>
    <div class="btns2"><button class="sec" id="sc-back">${t('commun.retour','Retour')}</button><button class="pri" id="sc-make">${t('creer.btn','Créer')}</button></div>
  `);
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  _siegesInteractifs();
  document.getElementById('sc-make').onclick = ()=>{
    let myCiv=null; const seats=[];
    document.querySelectorAll('#sc-ov select[data-civ]').forEach(s=>{
      const k=s.value, civId=s.getAttribute('data-civ');
      if(k==='none') return;
      if(k==='host'){ if(myCiv){ _errCb(t('creer.err_un_seul','Un seul siège « Moi (hôte) ».')); return; } myCiv=civId; }
      else seats.push({civId, ai:(k==='ai')});
    });
    if(!myCiv){ _errCb(t('creer.err_moi','Choisis un siège « Moi (hôte) ».')); return; }
    if(seats.length<1){ _errCb(t('creer.err_deux','Au moins 2 nations.')); return; }
    STATE.myCiv = myCiv;
    send({t:'create', civId:myCiv, seats});
  };
  document.getElementById('sc-back').onclick = screenLobby;
}
function renderWait(){
  const g = STATE.game; if(!g) return;
  const list = g.seats.map(s=>{
    const who = ((((s.ai?'🤖 '+t('commun.ia','IA'):(s.user?s.user + (s.connected?'':' ⚠️ '+t('attente.deconnecte','déconnecté')):'⏳ '+t('attente.libre','libre'))))));
    return `<div>${civLabel(s.civId)} — ${who}</div>`;
  }).join('');
  const allSeated = g.seats.every(s=>s.ai || s.user);
  overlay(t('web.ligne','<div class="fen-medal">⏳</div>\n    <div class="fen-kicker">{v}</div>\n    <h2 style="letter-spacing:.2em">{v2}</h2>\n    <div class="sous">{v3}</div>\n    <div id="sc-players" style="margin:12px 0;line-height:1.7">{list}</div>\n    <div class="err" id="sc-err"></div>\n    {v4}\n    <button class="sec" id="sc-leave">{v5}</button>',{v:t('attente.kicker',"Salle d'attente"),v2:g.code,v3:t('attente.sous',"Code d'invitation — partage-le."),list:list,v4:(STATE.isHost?`<button class="pri" id="sc-start"${allSeated?'':' disabled style="opacity:.5"'}>${t('attente.demarrer','Démarrer la partie')}</button>`:'<div class="muted">'+t('attente.hote','En attente que l&rsquo;hôte démarre…')+'</div>'),v5:t('attente.quitter','Quitter')}));
  _errCb = (msg)=>{ const e=document.getElementById('sc-err'); if(e) e.textContent=msg; };
  if(STATE.isHost){ const b=document.getElementById('sc-start'); if(b) b.onclick=()=>send({t:'start'}); }
  document.getElementById('sc-leave').onclick = ()=>{ try{ send({t:'leave'}); }catch(e){} screenLobby(); };
}

// ── Panneau de décision générique (contrat de réponses = celui des modales du jeu) ──
// Le bouton « 👁️ Voir le plateau » a été RETIRÉ (demande de Marc) : c'était un ajout de la version en ligne,
// absent du jeu d'origine. Les fenêtres se comportent désormais comme celles du jeu (on répond, elles se ferment).
/* ═══ RÉDUIRE UNE FENÊTRE POUR ALLER VOIR SES MENUS ═══
   Marc, 05/09 : « on peut jamais voir les menus Empire ou Diplomatie quand y a des événements qui
   apparaissent, tu peux mettre un − pour minimiser la fenêtre ? »
   Réduire ne RÉPOND À RIEN : la question reste en attente côté serveur, la pastille « Reprendre »
   la ramène intacte. C'est donc sans risque — on ne peut pas valider par mégarde en réduisant.
   Une seule fonction pour toutes les fenêtres : celles du panneau générique (`#sc-decision`) comme
   les vraies modales du jeu (événements, bilan, investissements, guerre populaire, paix…), qui sont
   justement celles que Marc rencontre. */
function scRendreReductible(m){
  try{
    if(!m)return;
    const card=m.firstElementChild||m;
    if(card.querySelector('.sc-min-btn'))return;                    // déjà posé
    try{ if(getComputedStyle(card).position==='static')card.style.position='relative'; }catch(e){ card.style.position='relative'; }
    const b=el('<button class="sc-min-btn" title="Réduire — va consulter Empire, Diplo ou les Techs ; la question reste en attente" style="position:absolute;top:6px;right:8px;width:32px;height:32px;border-radius:9px;border:1px solid #3a3a6a;background:#161a2e;color:#c8d8f8;font:700 1.2em system-ui;line-height:1;cursor:pointer;z-index:20">−</button>');
    card.appendChild(b);
    b.onclick=function(ev){
      try{ ev.stopPropagation(); }catch(e){}
      STATE._reduite=m;
      if(m.id==='sc-decision') m.style.display='none'; else m.classList.add('hidden');
      showResumeChip();
    };
  }catch(e){}
}
function scRestaurerFenetre(){
  const m=STATE._reduite;
  if(m){ if(m.id==='sc-decision') m.style.display='flex'; else m.classList.remove('hidden'); STATE._reduite=null; }
  else { const p=document.getElementById('sc-decision'); if(p)p.style.display='flex'; }
  hideResumeChip();
}
/* Les « vraies » modales du jeu (événements, bilan de fin de tour, investissements, guerre
   populaire, paix, Dyson…) vivent dans index.html et ne passent pas par `decisionPanel`. Plutôt que
   d'aller poser un bouton dans chacune — quinze endroits, donc quinze occasions d'en oublier un —
   on rend réductible CELLE QUI EST VISIBLE au moment où la question est posée. Une fenêtre ajoutée
   demain sera couverte sans qu'on y pense, à condition d'être dans cette liste. */
function scReduireFenetreVisible(){
  const ids=['eot-modal','bilan-modal','strategy-modal','agenda-sel-modal','invest-modal','invest2-modal',
             'invest-active-modal','event-modal','event-announce-modal','dyson-modal','espionage-modal',
             'empath-copy-modal','war-modal','war-combat-modal','discovery-modal','peace-modal',
             'forced-war-modal','accord-modal','route-capture-modal','comm-event-modal','diplo-event-modal'];
  for(const id of ids){ const m=document.getElementById(id); if(m&&!m.classList.contains('hidden')) scRendreReductible(m); }
}
function decisionPanel(html){
  let p=document.getElementById('sc-decision');
  if(!p){ injectStyles(); p=el('<div id="sc-decision"></div>'); document.body.appendChild(p); }
  p.innerHTML='<div class="card">'+html+'</div>';
  p.style.display='flex';
  hideResumeChip();
  scRendreReductible(p);
  return p;
}
function closeDecision(){ const p=document.getElementById('sc-decision'); if(p) p.style.display='none'; STATE._reduite=null; hideResumeChip(); }
function showResumeChip(){
  let c=document.getElementById('sc-resume');
  /* Un petit ▶ bleu, rond, en bas à DROITE de la carte, sans texte (Marc, 15/09) : l'ancien bandeau
     « Reprendre (choix en attente) » barrait le menu du bas. */
  if(!c){ c=el('<button id="sc-resume" aria-label="Reprendre le choix en attente" title="Reprendre le choix en attente" style="position:fixed;right:10px;bottom:calc(var(--botband,64px) + 58px);width:52px;height:52px;z-index:8900;background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;border:2px solid #7fb3ff;border-radius:50%;padding:0;font:700 22px/48px system-ui;text-align:center;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.55)">▶</button>'); document.body.appendChild(c);
    c.onclick=()=>scRestaurerFenetre(); }
  c.style.display='block';
}
function hideResumeChip(){ const c=document.getElementById('sc-resume'); if(c) c.style.display='none'; }
function askLocalDecision(pending){
  return new Promise(resolve=>{
    const o=pending.payload||{}; const k=pending.kind;
    const done=(ans)=>{ closeDecision(); resolve(ans); };
    const TITLES={raid_result:t('web.resultat_raid','💰 Résultat du raid'),raid_hit:t('web.es_pille','⚠️ Tu es pillé'),accord_result:t('web.reponse_accord','🤝 Réponse à ton accord'),raid_target:t('web.quelle_nation_piller','💰 Quelle nation piller ?'),accord_request:'🤝 Proposition d\'accord commercial',agenda:t('web.choisis_agenda_secret','Choisis ton agenda secret'),strategy:t('web.carte_strategie','Carte Stratégie'),strategy_calm:t('web.calmer_tension','Calmer une tension'),invest1:'Investissement (Niv.1)',invest2:'Investissement (Niv.2)',espionage:t('web.espionnage_quelle_filiere_copies','🕵️ Espionnage : quelle filière copies-tu ?'),extrasolar:'Exploration extra-solaire',empath_copy:t('web.telepathie_carte_copier','Télépathie : carte à copier'),ai_dyson:t('web.sphere_dyson_adverse','Sphère de Dyson adverse'),dyson_build:t('web.sphere_dyson','Ta Sphère de Dyson'),peace_offer:t('web.offre_paix','Offre de paix'),war_combat:'Combat',accord_confirm:'Accord commercial',defense:t('web.defense_2','Défense !'),peace_answer:t('web.proposition_paix','🕊️ Proposition de paix'),war_initiative:t('web.hyperpropulsion_frappe_premier','🌀 Hyperpropulsion : qui frappe en premier ?')};
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
      const cible=((((o.target?(o.target.type==='route'?'🛤️ route ':'🏙️ ')+o.target.name:t('web.positions','tes positions')))));
      const cc=o.cruiserCost||{materials:5,energy:5};
      /* ═══ BLASON (Marc, 14/09) : l'assaillant d'abord — médaillon, nom, puis le verbe et deux gros chiffres.
         Même fenêtre qu'en solo (`showAiAssaultDefenseModal`). Les ids sc-d / sc-dv / sc-dt / sc-cru / sc-ok /
         sc-none sont inchangés : la logique en dessous est la même. */
      if(typeof fenBlason==='function'){
        let _emo='⚔️'; try{ const _G=scGetG(); const _n=[_G.player].concat(_G.ais||[]).find(x=>x&&x.civ&&x.civ.id===o.attacker); if(_n)_emo=_n.civ.emoji||'⚔️'; }catch(e){}
        const _v0=Math.min(2,max), _base=(o.garrison||0)+(o.empath||0);
        const _cibleB=((((o.target?(o.target.type==='route'?t('web.la_route','la route '):'')+'<b>'+esc(o.target.name)+'</b>':t('web.positions_2','<b>tes positions</b>')))));
        const _milieu=t('web.leur_force_vs_defense_jetons_engages_as','<div class="fen-vs"><div><div class="n them">{v}</div><div class="l">Leur force</div></div><div class="x">VS</div><div><div class="n me" id="sc-dt">{v0}</div><div class="l">Ta défense</div></div></div><div class="fen-slider"><div class="row"><span>Jetons engagés</span><b><span id="sc-dv">{v02}</span> / {max}</b></div><input type="range" id="sc-d" min="0" max="{max2}" value="{v03}" aria-label="Jetons engagés en défense"><div class="row"><span>{jetons} · tu as {jetons2} jetons, {cout}🪨 {cout2}⚡</span></div>{v2}{cout3}</div>',{v:(o.threat!==undefined?'≈'+o.threat:'?'),v0:(_v0+_base),v02:_v0,max:max,max2:max,v03:_v0,jetons:(o.navDemi?t('web.jeton_ia_navigation','½🪨 ½⚡ par jeton (IA de Navigation)'):t('web.1_1_jeton','1🪨 1⚡ par jeton')),jetons2:(o.myTokens!==undefined?o.myTokens:max),cout:(o.myMat!==undefined?o.myMat:'?'),cout2:(o.myEnergy!==undefined?o.myEnergy:'?'),v2:(o.garrison!==undefined?'<div class="row"><span>🏛️ Garnison <b>'+o.garrison+'</b>'+(o.garrisonLabel?' ('+esc(o.garrisonLabel)+')':'')+(o.empath?' · 🔮 +'+o.empath+' Empathes':'')+'</span></div>':''),cout3:(o.cruiser?t('web.deployer_supercroiseur','<label><input type="checkbox" id="sc-cru"><span>⚓ Déployer le <b>Supercroiseur</b> (+{v}⚔️, −{cout}🪨 −{cout2}⚡)</span></label>',{v:o.cruiserPower||5,cout:cc.materials,cout2:cc.energy}):'')});
        const _chips=[];
        if(o.threatDetail) _chips.push(esc(o.threatDetail));
        if(o.attackerCruiser) _chips.push(t('web.supercroiseur_deploye','⚓ Supercroiseur déployé'));
        if(o.renfort) _chips.push(t('web.partages_avec','🤝 Tu partages {v} avec {v2}',{v:esc(o.target?o.target.name:'ce nœud'),v2:esc(o.principal||'le propriétaire')}));
        body=fenBlason({ton:'war', emoji:_emo, kicker:t('web.attaque','attaqué par'), prep:true, nation:esc(who),
          verbe:t('web.ligne_6','{v}{cibleb}',{v:(o.renfort?t('web.renfort_ud_partage_assaillent','Renfort — nœud partagé — assaillent '):'Assaut surprise — attaquent '),cibleb:_cibleB}), chips:_chips, milieu:_milieu,
          boutons:[{k:(o.renfort?'Rien':t('web.rien_engager','Ne rien engager')), s:(o.renfort?t('web.proprietaire_defend_seul','le propriétaire défend seul'):t('web.garnison_seule','la garnison seule')), cls:'ghost', id:'sc-none'},
                   {k:(o.renfort?'Renforcer':t('web.defendre_2','Défendre')), s:t('web.avec_jeton','<span id="sc-dbs">avec {v0} jeton{v}</span>',{v0:_v0,v:(_v0>1?'s':'')}), cls:'no', id:'sc-ok'}]});
        decisionPanel(body);
        const sl=document.getElementById('sc-d'), dv=document.getElementById('sc-dv'), dt=document.getElementById('sc-dt'), dbs=document.getElementById('sc-dbs');
        const cru=()=>{ const c=document.getElementById('sc-cru'); return !!(c&&c.checked); };
        const maj=()=>{ const v=parseInt(sl.value)||0; dv.textContent=v; if(dt)dt.textContent=v+_base+(cru()?(o.cruiserPower||5):0); if(dbs)dbs.textContent=v>0?t('assaut.avec_n_jetons','avec {n} jeton(s)',{n:v}):t('assaut.garnison_seule','la garnison seule'); };
        if(sl)sl.oninput=maj; { const c=document.getElementById('sc-cru'); if(c)c.onchange=maj; }
        document.getElementById('sc-ok').onclick=()=>done({defTokens:parseInt(sl.value)||0, cruiser:cru()});
        document.getElementById('sc-none').onclick=()=>done({defTokens:0, cruiser:cru()}); // la case cochée compte aussi ici (Marc, 21/09)
        return;
      }
      body=t('web.assaille_force_assaut_jetons_engageables','<h2>{v}</h2>{jetons}<div style="margin-bottom:8px"><b>{who}</b> assaille <b>{cible}</b>.<br><span class="muted">Force de l\'assaut : ~{v2}⚔️{v3} · tes jetons engageables : {max}{v4}</span></div>{v5}{v6}<input type="range" id="sc-d" min="0" max="{max2}" value="{cout}" style="width:100%"><div style="margin:4px 0 8px">Défense : <b id="sc-dv">{cout2}</b> jeton(s){cout3}</div>{cout4}<button class="opt" id="sc-ok">{jetons2}</button><button class="opt" id="sc-none" style="background:#2a2f45">{jetons3}</button>',{v:(o.renfort?'🤝 Renfort !':t('web.defense','🛡️ Défense !')),jetons:(o.renfort?t('web.partages_avec_deja_choisi_defense_jetons','<div style="background:#0e2a18;border:1px solid #3a8a5a;border-radius:8px;padding:6px 9px;margin-bottom:8px;color:#9fe8b8;font-size:.85em">Tu partages <b>{v}</b> avec <b>{v2}</b>, qui a déjà choisi sa défense. Tes jetons <b>s\'ajoutent</b> aux siens. Si la place tombe, vous êtes chassés tous les deux.</div>',{v:(o.target?o.target.name:t('web.ud_2','ce nœud')),v2:(o.principal||t('web.proprietaire','son propriétaire'))}):''),who:who,cible:cible,v2:o.threat||0,v3:(o.threatDetail?' ('+o.threatDetail+')':''),max:max,v4:(o.navDemi?t('web.chacun_ia_navigation',' (½🪨 +½⚡ chacun — IA de Navigation)'):' (1🪨 +1⚡ chacun)'),v5:(o.attackerCruiser?t('web.deploie_supercroiseur_deja_compte_ci_des','<div style="background:#2a1200;border:1px solid #cc6622;border-radius:8px;padding:6px 9px;margin-bottom:8px;color:#ffcfa0;font-size:.85em">⚓ Il déploie son <b>Supercroiseur</b> — déjà compté ci-dessus.</div>'):''),v6:(o.garrison!==undefined?t('web.garnison_place_comptes_dans_defense','<div style="background:#0e2a18;border:1px solid #3a8a5a;border-radius:8px;padding:6px 9px;margin-bottom:8px;color:#9fe8b8;font-size:.85em">🏛️ Garnison sur place : <b>{v}</b>{v2}{v3} — comptés dans ta défense.</div>',{v:o.garrison,v2:(o.garrisonLabel?' ('+o.garrisonLabel+')':''),v3:(o.empath?' · 🔮 +'+o.empath+' Empathes':'')}):''),max2:max,cout:Math.min(2,max),cout2:Math.min(2,max),cout3:(o.garrison!==undefined?' → total <b id="sc-dt">'+(Math.min(2,max)+(o.garrison||0)+(o.empath||0))+'</b>🛡️ contre ~'+(o.threat||0)+'⚔️':''),cout4:(o.cruiser?t('web.deployer_supercroiseur_2','<label class="opt" style="display:block;text-align:left;cursor:pointer"><input type="checkbox" id="sc-cru" style="margin-right:8px">⚓ Déployer le <b>Supercroiseur</b> (+{v}⚔️, −{cout}🪨 −{cout2}⚡)</label>',{v:o.cruiserPower||5,cout:cc.materials,cout2:cc.energy}):''),jetons2:(o.renfort?'🤝 Renforcer':t('web.defendre','🛡️ Défendre')),jetons3:(o.renfort?t('web.engage_rien_proprietaire_defend_seul','Je n\'engage rien — le propriétaire défend seul'):t('web.colonie_defend_toute_seule_avec_jetons_1','La colonie se défend toute seule avec ses jetons (1 pour une colonie, 10 pour la base de ta nation)'))});
      decisionPanel(body);
      const sl=document.getElementById('sc-d'), dv=document.getElementById('sc-dv');
      const cru=()=>{ const c=document.getElementById('sc-cru'); return !!(c&&c.checked); };
      const total=()=>{ const t=document.getElementById('sc-dt'); if(!t)return; t.textContent=(parseInt(sl.value)||0)+(o.garrison||0)+(o.empath||0)+(cru()?(o.cruiserPower||5):0); };
      if(sl)sl.oninput=()=>{ dv.textContent=sl.value; total(); };
      { const c=document.getElementById('sc-cru'); if(c)c.onchange=total; }
      document.getElementById('sc-ok').onclick=()=>done({defTokens:parseInt(sl.value)||0, cruiser:cru()});
      document.getElementById('sc-none').onclick=()=>done({defTokens:0, cruiser:cru()}); // la case cochée compte aussi ici (Marc, 21/09)
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
      /* Blason (14/09) : l'ennemi en médaillon sur les deux écrans (liste des cibles, puis curseur). */
      let _enEmo='⚔️'; try{ const _G=scGetG(); const _n=[_G.player].concat(_G.ais||[]).find(x=>x&&x.civ&&(x.civ.id===o.enemy||x.civ.name===o.enemyName)); if(_n)_enEmo=_n.civ.emoji||'⚔️'; }catch(e){}
      const _blason=(typeof fenBlason==='function');
      /* Tour de guerre (comme en solo : 1/2 puis 2/2) et FORCE ENNEMIE — exacte avec Réseau Orbital, ±3
         sinon (Marc, FE37 : « on ne peut pas voir la force ennemie alors que j'ai la technologie »). */
      const _chipsGuerre=()=>{ const c=[];
        if(o.warTurnsLeft!==undefined) c.push(t('web.tour_guerre_2','Tour de guerre <b>{v}/2</b>',{v:(o.warTurnsLeft>=2?'1':'2')}));
        if(o.enemyForce) c.push('Force ennemie <b>'+(o.enemyForce.exact?'':'~')+o.enemyForce.val+'⚔️</b>'+(o.enemyForce.exact?' (renseignement exact)':' (±3, sans renseignement)'));
        return c; };
      /* Ce que le défenseur peut aligner : garnison de la colonie (règle connue : 1, ou 10 pour une
         capitale) + ce qu'il engage, borné par sa force (exacte ou estimée). */
      const _defenseTexte=(c)=>{ const g=(c.garrison!==undefined)?c.garrison:(c.isHome?10:1);
        const f=o.enemyForce; const fx=f?((f.exact?'':'~')+f.val):'?';
        return t('web.defense_garnison_ennemi_engage_jeton_fou','{v}Défense = garnison <b>{g}</b> + ce que l\'ennemi engage (il a <b>{fx}</b> jeton{v2}{cout}). Fourchette : <b>{g2}</b> à <b>{v3}</b>⚔️{v4}',{v:(c.isHome?'🏛️ CAPITALE : ':''),g:g,fx:fx,v2:(f&&f.val>1?'s':''),cout:(f&&!f.exact?', estimation ±3':''),g2:g,v3:(f?g+f.val:'?'),v4:(f&&f.exact?' — renseignement exact.':'.')}); };
      const tokenPick=(title,hint,onOk)=>{ // sous-écran : choisir les jetons engagés (+ supercroiseur)
        const limite=((((maxF<force?t('web.possedes_jeton_mais_peux_payer_1_1_jeton','<div style="color:#ffcc88;font-size:.82em;margin-bottom:4px">⚠️ Tu possèdes {jetons} jeton(s) mais ne peux en <b>payer</b> que {maxf} (1🪨 +1⚡ par jeton engagé).</div>',{jetons:force,maxf:maxF}):''))));
        const cruLigne=((((cru.has?t('web.deployer_supercroiseur_3','<label style="display:flex;align-items:center;gap:8px;margin:8px 0;{v}"><input type="checkbox" id="sc-cru" style="width:auto"{v2}><span>⚓ Déployer le Supercroiseur <b>+{v3}⚔️</b>{v4}</span></label>',{v:(cru.afford?'':'opacity:.5'),v2:(cru.afford?'':' disabled'),v3:cru.power||5,v4:(cru.afford?'':' — ressources insuffisantes')}):''))));
        if(_blason){
          decisionPanel(fenBlason({ton:'war', emoji:_enEmo, kicker:'contre', prep:true, nation:esc(o.enemyName||'ennemi'),
            verbe:title, chips:_chipsGuerre(), corps:(hint?hint:'')+limite,
            milieu:'<div class="fen-slider"><div class="row"><span>'+t('assaut.jetons_engages','Jetons engagés')+'</span><b><span id="sc-wcv">'+Math.min(1,maxF)+'</span> / <span id="sc-wcmax">'+maxF+'</span></b></div>'
              +'<input type="range" id="sc-wc" min="0" max="'+maxF+'" value="'+Math.min(1,maxF)+'" aria-label="'+t('assaut.jetons_engages','Jetons engagés')+'">'
              +cruLigne.replace('style="display:flex;align-items:center;gap:8px;margin:8px 0;','style="')
              +'<div id="sc-wclim" class="row" style="color:#ffcc88;min-height:1em"></div></div>',
            boutons:[{k:'Retour', s:'choisir autre chose', cls:'ghost', id:'sc-wcback'},{k:'Engager', s:t('web.ces_jetons','ces jetons'), cls:'no', id:'sc-wcok'}]}));
        } else
        decisionPanel(t('web.jetons_engages_engager_retour','<h2>{title}</h2>{v}{limite}<div>Jetons engagés : <b id="sc-wcv">{cout}</b> / <b id="sc-wcmax">{maxf}</b></div><input type="range" id="sc-wc" min="0" max="{maxf2}" value="{cout2}" style="width:100%">{cruligne}<div id="sc-wclim" style="color:#ffcc88;font-size:.8em;min-height:1em"></div><button class="opt" id="sc-wcok">✓ Engager</button><button class="opt" id="sc-wcback">↩ Retour</button>',{title:title,v:(hint?'<div class="muted" style="margin-bottom:6px">'+hint+'</div>':''),limite:limite,cout:Math.min(1,maxF),maxf:maxF,maxf2:maxF,cout2:Math.min(1,maxF),cruligne:cruLigne}));
        const sl=document.getElementById('sc-wc'), dv=document.getElementById('sc-wcv'); if(sl)sl.oninput=()=>dv.textContent=sl.value;
        /* La case du croiseur rabat le maximum du curseur, et l'annonce. */
        const _cb=document.getElementById('sc-cru'), _lim=document.getElementById('sc-wclim');
        const _maj=()=>{
          if(!sl)return;
          const m=(_cb&&_cb.checked)?maxFCru:maxF;
          sl.max=m; if((parseInt(sl.value)||0)>m) sl.value=m;
          if(dv)dv.textContent=sl.value;
          const _el=document.getElementById('sc-wcmax'); if(_el)_el.textContent=m;
          if(_lim)_lim.textContent=((((_cb&&_cb.checked&&maxFCru<maxF?t('web.supercroiseur_reserve_ressources_maximum','⚓ Le Supercroiseur réserve des ressources : maximum ramené à {maxfcru} jeton(s).',{maxfcru:maxFCru}):''))));
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
        let b=((((_blason?'':t('web.combat_guerre','<h2>⚔️ Combat de guerre — {v}</h2>',{v:o.enemyName||'ennemi'})))));
        if(!_blason) b+=t('web.jetons_engageables_tour_guerre_restant','<div class="muted" style="margin-bottom:8px">Jetons engageables : <b>{maxf}</b>{jetons} · Tour de guerre restant : {v}</div>',{maxf:maxF,jetons:(maxF<force?t('web.possedes_limite_ressources',' <span style="color:#ffcc88">(sur {jetons} possédés — limité par tes ressources)</span>',{jetons:force}):''),v:o.warTurnsLeft||'?'});
        if(threat&&!_blason) b+=t('web.ennemi_menace_peux_defendre','<div style="background:#2a1200;border:1px solid #cc6622;border-radius:8px;padding:7px 10px;margin-bottom:8px;color:#ffcfa0;font-size:.85em">🛡️ L\'ennemi menace : <b>{v}{nom}</b>. Tu peux <b>défendre</b>.</div>',{v:(threat.type==='colony'?'🏙️ ':'🛤️ '),nom:threat.name});
        // Attaquer une colonie ennemie
        if(cols.length){
          b+=t('web.attaquer_colonie','<div style="font-weight:700;color:#ff9966;margin:4px 0 3px">⚔️ Attaquer une colonie</div>');
          b+=cols.map((c,i)=>t('web.nv_ud','<button class="opt" data-col="{i}"{v}>{v2}{v3} <b>{nom}</b> Nv.{v4}{v5} <span class="muted">({v6} nœud{v7})</span>{v8}</button>',{i:i,v:(maxF<1?' disabled style="opacity:.45"':''),v2:(c.isFocus?'🎯 ':''),v3:c.emoji||'',nom:c.name,v4:c.level,v5:(c.isHome?' 🏠 QG':''),v6:c.dist,v7:(c.dist>1?'s':''),v8:(c.isFocus?' <span style="color:#ffcc66">— gagne = capture !</span>':'')})).join('');
        } else b+=t('web.aucune_colonie_ennemie_portee','<div class="muted">Aucune colonie ennemie à portée.</div>');
        /* ═══ ATTAQUER UNE ROUTE — CETTE LISTE ÉTAIT ENVOYÉE ET JAMAIS AFFICHÉE ═══
           Le serveur remplit `payload.routes` depuis toujours ; ce panneau ne l'a jamais lue. En
           multijoueur, la guerre offrait donc strictement moins d'options qu'en solo, en silence.
           Une route non protégée coûte 1 jeton et rien d'autre, une route protégée en coûte 2 :
           c'est souvent le seul coup jouable quand on n'a plus de quoi monter un assaut. */
        if(routes.length){
          b+=t('web.attaquer_route','<div style="font-weight:700;color:#88bbee;margin:8px 0 3px">🛤️ Attaquer une route</div>');
          b+=routes.map(r=>{ const peut=force>=r.cost;
            return t('web.jeton','<button class="opt" data-rt="{v}"{v2}>{v3} <b>{nom}</b> — {cout} jeton{cout2}{v4}</button>',{v:r.i,v2:(peut?'':' disabled style="opacity:.45"'),v3:(r.protected?'🛡️':'🔓'),nom:r.name,cout:r.cost,cout2:(r.cost>1?'s':''),v4:(r.protected?t('web.protegee',' <span class="muted">(protégée)</span>'):t('web.non_protegee',' <span class="muted">(non protégée)</span>'))}); }).join('');
        }
        // Défendre / Se retirer
        if(threat) b+=t('web.defendre_choisir_jetons','<button class="opt" id="sc-wc-def" style="border-color:#cc6622">🛡️ Défendre (choisir jetons)</button>');
        /* ⚠️ CE BOUTON N'EST PLUS CONDITIONNEL, ET C'EST TOUT LE CORRECTIF DU 17/08.
           Il n'apparaissait pas pour celui qui avait déclaré la guerre. Sans ressources pour
           attaquer et sans menace à repousser, la fenêtre n'avait plus rien de cliquable : deux
           amis de Marc y ont perdu leur partie. Il y a désormais toujours une sortie. */
        b+=t('web.ligne_2','<button class="opt" id="sc-wc-hold" style="border-color:#4488cc">{tour}</button>',{tour:(estAgresseur?t('web.renoncer_assaut_tour_guerre_continue','🚪 Renoncer à l\'assaut ce tour <span class="muted">(la guerre continue)</span>'):t('web.tenir_position_rien_engager','🕊️ Tenir position (ne rien engager)'))});
        /* Et on DIT pourquoi tout est gris, au lieu de laisser croire à une fenêtre cassée. */
        if(maxF<1) b+=t('web.as_quoi_engager_seul_jeton_1_1_chacun_au','<div style="color:#ffcc88;font-size:.82em;margin-top:6px">⚠️ Tu n\'as pas de quoi engager un seul jeton (1🪨 +1⚡ chacun) : aucune attaque n\'est possible ce tour-ci.</div>');
        if(_blason){
          b=fenBlason({ton:'war', emoji:_enEmo, kicker:'contre', prep:true, nation:esc(o.enemyName||'ennemi'),
            verbe:t('web.fais_tour','Que fais-tu ce tour ?'), chips:_chipsGuerre().concat([t('web.engageables_possedes','Engageables <b>{n}</b>{v}',{n:maxF,v:((maxF<force)?t('web.sur_possedes',' / {n} possédés',{n:force}):'')})]).concat(threat?[t('web.menace_sur','🛡️ Menace sur <b>{n}</b>',{n:esc(threat.name||'')})]:[]),
            milieu:'<div style="text-align:left">'+b+'</div>'});
        }
        decisionPanel(b);
        document.querySelectorAll('#sc-decision .opt[data-col]').forEach(btn=>{ if(btn.disabled)return; btn.onclick=()=>{ const c=cols[parseInt(btn.getAttribute('data-col'))]; tokenPick('⚔️ Attaquer '+c.name, _defenseTexte(c), (t,cr)=>done({action:'attack', node:c.node, tokens:t, cruiser:cr})); }; });
        document.querySelectorAll('#sc-decision .opt[data-rt]').forEach(btn=>{ if(btn.disabled)return; btn.onclick=()=>done({action:'route', route:parseInt(btn.getAttribute('data-rt'))}); });
        const dfn=document.getElementById('sc-wc-def'); if(dfn) dfn.onclick=()=>tokenPick(t('web.defense_3','🛡️ Défense'), t('web.jetons_engages_defense_colonies','Jetons engagés en défense de tes colonies.'), (t,cr)=>done({action:'defend', tokens:t, cruiser:cr}));
        const hld=document.getElementById('sc-wc-hold'); if(hld) hld.onclick=()=>done({action:'hold'});
      };
      main();
      return;
    }
    if(k==='peace_offer'){
      body+=t('web.guerre_contre_vp_toi_lui_proposer_paix_c','<div>En guerre contre {v}. (VP toi {vp} / lui {vp2})</div>\n        <button class="opt" id="sc-peace">🕊️ Proposer la paix</button>\n        <button class="opt" id="sc-war">⚔️ Continuer la guerre</button>',{v:o.attackerName||o.attacker,vp:o.vpYou,vp2:o.vpEnemy});
      decisionPanel(body);
      document.getElementById('sc-peace').onclick=()=>done({accept:true, offer:{materials:0,energy:0,science:0}});
      // Même garde-fou que dans la vraie modale : le panneau de repli ne doit pas être plus permissif.
      document.getElementById('sc-war').onclick=()=>{ if(_confirmerGuerreSansMoyens(o)) done({accept:false}); };
      return;
    }
    if(k==='ai_dyson'){ body+=t('web.bati_sphere_dyson_accepter_refuser_guerr','<div>{v} a bâti la Sphère de Dyson.</div>\n        <button class="opt" id="sc-acc">🤝 Accepter</button><button class="opt" id="sc-ref">⚔️ Refuser (guerre)</button>',{v:(o.builderName||t('avis.nation','Une nation'))});
      decisionPanel(body);
      document.getElementById('sc-acc').onclick=()=>done({war:false});
      document.getElementById('sc-ref').onclick=()=>done({war:true}); return;
    }
    if(k==='human_dyson'){ body=t('web.sphere_dyson_adverse_bati_sphere_dyson_m','<h2>⚡ Sphère de Dyson adverse</h2><div>{v} a bâti la Sphère de Dyson (monopole énergétique). Accepte (+3⚡/tour) ou refuse (= guerre).</div>\n        <button class="opt" id="sc-acc">🤝 Accepter le monopole</button><button class="opt" id="sc-ref">⚔️ Refuser (guerre)</button>',{v:(o.builderName||t('web.joueur','Un joueur'))});
      decisionPanel(body);
      document.getElementById('sc-acc').onclick=()=>done({war:false});
      document.getElementById('sc-ref').onclick=()=>done({war:true}); return;
    }
    if(k==='dyson_build'){ body+=t('web.forcer_guerre_refusants_renoncer','<button class="opt" id="sc-f">Forcer (guerre aux refusants)</button><button class="opt" id="sc-r">Renoncer</button>');
      decisionPanel(body); document.getElementById('sc-f').onclick=()=>done({force:true}); document.getElementById('sc-r').onclick=()=>done({force:false}); return; }
    if(k==='accord_confirm'){ body+=t('web.accord_avec_confirmer_annuler','<div>Accord avec {v} sur {v2} ?</div><button class="opt" id="sc-y">Confirmer</button><button class="opt" id="sc-n">Annuler</button>',{v:o.withName||'',v2:o.nodeName||''});
      decisionPanel(body); document.getElementById('sc-y').onclick=()=>done({confirm:true}); document.getElementById('sc-n').onclick=()=>done({confirm:false}); return; }
    if(k==='event_comm'){ // Événement Accords Commerciaux : choisir UNE nation (accord gratuit +3 VP, met fin à une guerre) ou passer
      const cands=o.cands||[];
      let b=t('web.accords_commerciaux_accord_commercial_gr','<h2>🤝 Accords Commerciaux</h2><div class="muted" style="margin-bottom:8px">Accord commercial <b>gratuit</b> : +3 VP pour chaque nation, met fin à une guerre si elle existe. Un leader trop en avance peut refuser.</div>');
      if(!cands.length) b+=t('web.toutes_nations_ont_deja_accord_avec_toi','<div class="muted" style="margin-bottom:6px">Toutes les nations ont déjà un accord avec toi.</div>');
      else b+=cands.map((c,i)=>t('web.ligne_12','<button class="opt" data-comm="{i}">{v} <b>{nom}</b>{v2}{v3}</button>',{i:i,v:c.emoji||'',nom:c.name,v2:(c.war?t('web.guerre',' <span style="color:#ff7766">⚔️ en guerre</span>'):''),v3:(c.info?'<br><span class="muted">'+c.info+'</span>':'')})).join('');
      b+=t('web.passer_aucun_accord','<button class="opt" id="sc-comm-pass" style="background:#2a2f45">Passer (aucun accord)</button>');
      decisionPanel(b);
      document.querySelectorAll('#sc-decision .opt[data-comm]').forEach(btn=>{ btn.onclick=()=>done({aiId:cands[parseInt(btn.getAttribute('data-comm'))].id}); });
      document.getElementById('sc-comm-pass').onclick=()=>done({aiId:null});
      return;
    }
    if(k==='event_diplo'){ // Événement Accords Diplomatiques : sélectionner plusieurs pactes (6 matériaux chacun, +2 énergie si guerre)
      const rows=o.rows||[]; const sel={};
      let b=t('web.accords_diplomatiques_pacte_non_agressio','<h2>🕊️ Accords Diplomatiques</h2><div class="muted" style="margin-bottom:8px">Pacte de non-agression : 4 tours, 6🪨 par nation. Met fin à une guerre. +1🙂 par pacte conclu, tension 0 avec le partenaire. Tu as {cout}🔩 {cout2}⚡.</div>',{cout:o.mat||0,cout2:o.energy||0});
      b+=rows.map((r,i)=>t('web.4_tours','<label class="opt" style="display:block;text-align:left;cursor:pointer"><input type="checkbox" data-diplo="{i}" style="margin-right:8px">{v} <b>{nom}</b> — 4 tours · {v2}{v3}</label>',{i:i,v:r.emoji||'',nom:r.name,v2:(r.war?t('web.6_met_fin_guerre','6🪨 <span style="color:#ff7766">met fin à la guerre</span>'):'6🪨'),v3:(r.info?'<br><span class="muted" style="margin-left:24px">'+r.info+'</span>':'')})).join('');
      b+=t('web.conclure_pactes_selectionnes_aucun_pacte','<button class="opt" id="sc-diplo-ok">Conclure les pactes sélectionnés</button><button class="opt" id="sc-diplo-none" style="background:#2a2f45">Aucun pacte</button>');
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
    if(k==='strategy' && o.rappel){ body += '<div style="color:#ffd27a;margin-bottom:6px">'+o.rappel+'</div>'; }   // Initiative planifiée au tour précédent : dit AVANT le choix (Marc, 06/09)
    if(k==='strategy' && (o.phrase||o.rank)){ body += t('web.ligne_3','<div class="muted" style="margin-bottom:6px">{v}</div>',{v:o.phrase||('Tu choisis en '+o.rank+'/'+(o.total||'?'))}); }
    // Chaque option : nom + (bénéfice/contrepartie pour invest, effet tension pour stratégie, desc sinon)
    body += opts.map((op,i)=>{
      let sub='';
      if(op.benefit||op.contrepartie){ sub = (op.benefit?'<span style="color:#8fe0a0">✅ '+op.benefit+'</span>':'') + (op.contrepartie?'<br><span style="color:#e0a86a">⚠️ '+op.contrepartie+'</span>':''); }
      else if(op.desc){ sub = t('web.ligne_4','{v}{tension}',{v:op.desc,tension:(op.calmTension?t('web.calme_tension','<br><span style="color:#8fb6e6">🕊️ Calme la tension</span>'):'')}); }
      return `<button class="opt" data-i="${i}">${op.emoji||''} <b>${op.name||op.id||op.branch||op.node}</b>${sub?'<br><span class="muted">'+sub+'</span>':''}</button>`;
    }).join('');
    /* ═══ CALMER UNE TENSION : LE RENDU GÉNÉRIQUE NE MONTRAIT MÊME PAS LE CHIFFRE ═══
       Il affichait « 🔴 Martiens » et rien d'autre : ni la tension qui bouge, ni ce qu'elle devient.
       Marc, 05/09 : « il faut que la popup montre aussi les tensions relatives entre la nation et
       les autres nations, sinon ça sert à rien. » Le moteur envoie désormais les trois (§`tensionsCroisees`). */
    if(k==='strategy_calm'){
      const _amt=o.amount||0, _leur=(o.sens==='eux');
      body=t('web.ligne_5','<h2>🕊️ {tension}</h2><div class="muted" style="margin-bottom:8px">{tension2}</div>',{tension:(_leur?t('web.apaiser_nation','Apaiser une nation'):t('web.calmer_tension','Calmer une tension')),tension2:(_leur?t('web.mission_diplomatique_tension_envers_toi','Une mission diplomatique : <b>sa</b> tension envers toi baisse de <b>{amt}</b>. Moins elle t\'en veut, moins son peuple peut la pousser à te déclarer la guerre.',{amt:_amt}):t('web.tension_envers_nation_choisie_baisse','<b>Ta</b> tension envers la nation choisie baisse de <b>{amt}</b>.',{amt:_amt}))});
      body+=opts.map(function(op,i){
        const v=op.tension||0, ap=Math.max(0,v-_amt);
        const col=v>=8?'#ff6644':v>=5?'#ffaa44':v>=3?'#ffcc66':'#66cc88';
        let sub=t('web.10_10_10','<span style="color:{col}">{tension} : {v}/10 → {ap}/10</span><span style="color:#5a6a8a"> | {v2} : {v3}/10</span>',{col:col,tension:(_leur?t('web.tension_envers_toi','Sa tension envers toi'):t('web.tension','Ta tension')),v:v,ap:ap,v2:(_leur?t('web.tienne','la tienne'):t('web.leur','la leur')),v3:op.reciproque||0});
        const cr=(op.croisees||[]);
        if(cr.length){
          sub+=t('web.autres_tensions_envers','<br><span style="color:#7880a0;font-size:.92em">ses autres tensions <span style="opacity:.7">(envers / de)</span> : {cout}</span>',{cout:cr.map(function(x){
                const chaud=Math.max(x.vers||0,x.de||0);
                const c2=chaud>=8?'#ff6644':chaud>=5?'#ffaa44':chaud>=3?'#ffcc66':'#66cc88';
                return '<span style="color:'+c2+'">'+(x.emoji||'')+' '+esc(x.name||x.id)+' '+(x.vers||0)+'/'+(x.de||0)+(x.guerre?' ⚔️':'')+'</span>';
              }).join(' · ')});
        }
        return '<button class="opt" data-i="'+i+'">'+(op.emoji||'')+' <b>'+esc(op.name||op.id)+'</b><br><span class="muted">'+sub+'</span></button>';
      }).join('');
      decisionPanel(body);
      document.querySelectorAll('#sc-decision .opt').forEach(function(b){ b.onclick=function(){ done({targetId:opts[parseInt(b.getAttribute('data-i'))].id}); }; });
      return;
    }
    if(k==='empath_copy') body+=t('web.aucune_copie','<button class="opt" data-skip="1">Aucune copie</button>');
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
  const L=[[t('web.colonies_1_connectee','Colonies (+1/connectée)'),'colVP'],[t('web.routes_1_vp_route','Routes (1 VP/route)'),'routeVP'],['Cartes','cardsVP'],
           ['Bonus Tech (×0.5/tech)','techBonusVP'],[t('web.bonus_revenus_tour','Bonus Revenus/tour'),'rptVP'],['Agendas','agendasVP'],
           [t('web.evenements','Événements'),'evtVP'],[t('web.bonus_speciaux','Bonus spéciaux'),'extraVP']];
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
  const when=((((info&&info.dateFr?t('web.partie_terminee','<div class="muted" style="margin-bottom:8px">Partie {v} — terminée le {v2}</div>',{v:info.code||'',v2:info.dateFr}):''))));
  overlay(t('web.fin_partie_classement_aussi_envoye_email','<h2>🏆 Fin de partie</h2>{when}{v}<div class="muted" style="margin-top:8px;font-size:.8em">Le classement t\'est aussi envoyé par email.</div><button class="pri" id="sc-again">↩ Retour au lobby</button><button class="sec" id="sc-bug">🐞 Signaler un bug</button>',{when:when,v:rows||'<div class="muted">Scores indisponibles.</div>'}));
  document.getElementById('sc-again').onclick = ()=> screenLobby();
  document.getElementById('sc-bug').onclick = ()=> showBugReport(scores, info);
}
// Fenêtre « Signaler un bug » : le texte est conservé dans le log de la partie (visible dans /stats) et
// envoyé par email à l'administrateur.
function showBugReport(scores, info){
  overlay(t('web.signaler_bug_decris_mal_passe_faisais_at','<h2>🐞 Signaler un bug</h2><div class="muted" style="margin-bottom:6px">Décris ce qui s\'est mal passé (ce que tu faisais, ce que tu attendais, ce qui est arrivé). Ton message est joint au journal de cette partie.</div><textarea id="sc-bugtxt" rows="7" style="width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid #2c4a7e;background:#091020;color:#dce8ff;font:inherit" placeholder="Ex. : après avoir capturé Titan, la colonie est revenue aux Ceinturiens au tour suivant…"></textarea><div class="err" id="sc-err"></div><button class="pri" id="sc-bugsend">Envoyer</button><button class="sec" id="sc-bugback">↩ Retour</button>'));
  document.getElementById('sc-bugback').onclick = ()=> showFinal(scores, info);
  document.getElementById('sc-bugsend').onclick = ()=>{
    const _txt=document.getElementById('sc-bugtxt').value.trim();
    if(!_txt){ const e=document.getElementById('sc-err'); if(e)e.textContent=t('web.ecris_quelques_mots_avant_envoyer','Écris quelques mots avant d\'envoyer.'); return; }
    send({t:'bug_report', text:_txt});
    overlay(t('web.merci_signalement_ete_enregistre_avec_jo','<h2>🐞 Merci !</h2><div class="muted">Ton signalement a été enregistré avec le journal de la partie.</div><button class="pri" id="sc-again2">↩ Retour au lobby</button>'));
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
    if (uEl){ uEl.placeholder=t('auth.ph_email','Ton adresse email'); try{ uEl.type='email'; uEl.setAttribute('inputmode','email'); uEl.setAttribute('autocomplete','email'); }catch(e){} }
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
      if (!/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(user)){ if(err) err.textContent=t('web.entre_adresse_email_valide_ex_prenom_dom','Entre une adresse email valide (ex. prenom@domaine.ch).'); return; }
      if (p.length<6){ if(err) err.textContent=t('web.mot_passe_trop_court_min_6','Mot de passe trop court (min. 6).'); return; }
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
  const btn=el(t('web.jouer_ligne','<button id="sc-online-btn" style="position:fixed;bottom:12px;right:12px;z-index:8000;background:linear-gradient(135deg,#2f6fd0,#1f4fa0);color:#fff;border:0;border-radius:10px;padding:9px 14px;font:700 .85em system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4)">🌐 Jouer en ligne</button>'));
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
/* Banc VISUEL (captures Playwright, `scratchpad/shot3.js`) : ouvrir les fenêtres de décision avec une
   charge utile fabriquée, sans serveur. Exposé seulement si l'adresse porte `?sc_test=1`. */
try{ if(/[?&]sc_test=1/.test(location.search)) window.SC_TEST = { askLocalDecision, showPeaceReal, closeDecision, decisionPanel, STATE, installIntercepts, screenAuth, screenLobby, screenCreate, renderWait }; }catch(e){}
})();
