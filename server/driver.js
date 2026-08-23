/* Solar Conquest — driver de tour côté serveur (étape D).
   Orchestration AUTORITAIRE d'une partie entrelacée sur la logique de carte.html (source unique).
   - Roster stable de nations, chacune marquée humaine ou IA (`_isAI`).
   - Tour d'IA : `doAITurn(nation,true)` — AUTONOME (ne dépend plus de G.player).
   - Tour d'humain : on « active » sa nation (G.player = nation, G.ais = les autres) puis on applique son action.
   - Ordre entrelacé tiré au sort chaque manche ; 1 action = 1 passage ; fin de manche → pirates/maintenance/revenus/événement.
   Aucune règle n'est réécrite ici : tout vient du moteur chargé. */
'use strict';
const path = require('path');
const vm = require('vm');
const { Engine } = require('./game-core.js');

function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

class GameDriver {
  /* htmlPath = chemin d'index.html (le moteur, `moteur.js`, est son voisin). */
  constructor(htmlPath){
    this.engine = new Engine(htmlPath);
    this.sb = this.engine.sb;
    this.EVENTS = vm.runInContext("(typeof EVENTS!=='undefined')?EVENTS:[]", this.sb);
    this.roster = [];        // nations (objets joueur), ordre stable
    this.primaryId = null;   // nation activée par défaut (G.player au repos)
    this.order = [];         // civIds de la manche en cours
    this.ptr = 0;
    this.onLog = null;       // callback(entries[]) optionnel
  }

  /* seats = [{civId, isAI}], 2 à 4. Le 1er sert de "primary" (G.player initial). */
  setup(seats){
    const civIds = seats.map(s=>s.civId);
    this.engine.newGame(civIds[0], civIds.slice(1));
    const G = this.sb.__G;
    this.roster = [G.player, ...G.ais];
    // Appliquer l'identité humain/IA de chaque siège (un humain peut ne pas être le primary).
    for(const s of seats){
      const n = this.roster.find(p=>p.civ.id===s.civId);
      if(n) n._isAI = !!s.isAI;
    }
    this.primaryId = civIds[0];
    return this.state();
  }

  state(){ return this.sb.__G; }
  nation(civId){ return this.roster.find(p=>p.civ.id===civId) || null; }
  isAI(civId){ const n=this.nation(civId); return !!(n && n._isAI); }

  /* Place une nation comme "active" : G.player = elle, G.ais = les autres. Réattache les vues de guerre. */
  activate(civId){
    const G = this.sb.__G;
    const me = this.nation(civId);
    if(!me) throw new Error('nation inconnue: '+civId);
    G.player = me;
    G.ais = this.roster.filter(p=>p!==me);
    if(typeof this.sb.refreshWarViews==='function') this.sb.refreshWarViews();
    return me;
  }

  /* Début de manche : reset (startTurn couvre toutes les nations via allPlayers), ordre tiré au sort. */
  beginRound(){
    const G = this.sb.__G;
    this.activate(this.primaryId);
    try { this.sb.startTurn(); }
    catch(e){ for(const p of this.roster) p.acLeft = p.acMax; }
    for(const p of this.roster){ p._passedRound = false; p._aiSetupDone = false; }
    this.order = shuffle(this.roster.map(p=>p.civ.id));
    this.ptr = 0;
    return this.order.slice();
  }

  roundComplete(){ return this.roster.every(p=>p._passedRound); }

  /* civId dont c'est le tour (en sautant ceux qui ont passé). null si manche finie. */
  current(){
    if(this.roundComplete()) return null;
    for(let k=0;k<this.order.length;k++){
      const id = this.order[(this.ptr+k)%this.order.length];
      if(!this.nation(id)._passedRound) return id;
    }
    return null;
  }

  _advance(){ this.ptr = (this.ptr+1)%Math.max(1,this.order.length); }

  /* Fait jouer UNE action de l'IA courante. Retourne {civId,acted} ou null si ce n'est pas une IA. */
  stepAI(){
    const id = this.current();
    if(id===null) return null;
    if(!this.isAI(id)) return null; // c'est à un humain de jouer
    const me = this.nation(id);
    const before = this.sb.__G.log ? this.sb.__G.log.length : 0;
    let acted = false;
    try { acted = this._aiTurn(me); }
    catch(e){ me._passedRound = true; this._advance(); return {civId:id, acted:false, error:e.message.split('\n')[0]}; }
    this._emitLog(before);
    if(!acted || me.acLeft<=0) me._passedRound = true;
    this._advance();
    return {civId:id, acted};
  }

  /* Repli IA : joue UNE action à la place d'une nation humaine (déconnexion, timeout, ou test).
     Ne dépend pas de G.player (doAITurn est autonome). */
  stepHumanFallback(civId){
    const id = this.current();
    if(id!==civId) return null;
    const me = this.nation(id);
    const before = this.sb.__G.log ? this.sb.__G.log.length : 0;
    let acted = false;
    try { acted = this._aiTurn(me); }
    catch(e){ me._passedRound = true; this._advance(); return {civId:id, acted:false, error:e.message.split('\n')[0]}; }
    this._emitLog(before);
    if(!acted || me.acLeft<=0) me._passedRound = true;
    this._advance();
    return {civId:id, acted};
  }

  /* Applique l'action d'un humain (doit être son tour). action = {type,...} ou {type:'pass'}. */
  submitHuman(civId, action){
    const id = this.current();
    if(id!==civId) throw new Error('ce n\'est pas le tour de '+civId+' (tour de '+id+')');
    if(this.isAI(civId)) throw new Error(civId+' est une IA');
    const me = this.activate(civId);
    const before = this.sb.__G.log ? this.sb.__G.log.length : 0;
    if(action && action.type==='skip'){   // renoncer à UN coup (cf. act()) : consomme 1 AC, ne sort pas de la manche
      if((me.acLeft||0)>0) me.acLeft-=1;
      try{ this.sb.addLog(((me.civ&&me.civ.name)||civId)+' passe une action.'); }catch(e){}
      this._emitLog(before);
      if(me.acLeft<=0) me._passedRound=true;
      this._advance();
      return {civId, passed:me._passedRound};
    }
    if(action && action.type && action.type!=='pass'){
      this.engine.apply(action);
    }
    this._emitLog(before);
    const passed = !action || action.type==='pass' || me.acLeft<=0;
    if(passed) me._passedRound = true;
    this._advance();
    return {civId, passed:me._passedRound};
  }

  /* Joue automatiquement toutes les IA jusqu'à ce que ce soit à un humain ou que la manche soit finie. */
  autoPlayAISeats(){
    let guard=0;
    while(guard++ < 5000){
      const id = this.current();
      if(id===null) break;          // manche finie
      if(!this.isAI(id)) break;     // tour d'un humain → on rend la main
      this.stepAI();
    }
  }

  /* Clôture de manche : pirates, maintenance, revenus, événement ; incrémente le tour. */
  endRound(){
    const G = this.sb.__G;
    this.activate(this.primaryId);
    try { this.sb.advancePirates(); this.sb.doMaintenance(); this.sb.doRevenues(); } catch(e){}
    const ev = this.EVENTS.find(x=>x.turn===G.turn);
    if(ev){ try{ ev.resolve(G); }catch(e){} }
    G.turn++;
  }

  gameOver(){ const G=this.sb.__G; return G.turn > G.maxTurns; }

  _emitLog(before){
    if(!this.onLog) return;
    const G = this.sb.__G;
    // addLog UNSHIFT en tête (le plus récent en index 0) → les NOUVELLES entrées sont au DÉBUT,
    // pas à la fin. On envoie donc slice(0, nb nouvelles), remis dans l'ordre chronologique.
    if(G.log && G.log.length>before){
      const nNew = G.log.length - before;
      this.onLog(G.log.slice(0, nNew).reverse());
    }
  }

  /* ================= ORCHESTRATION COMPLÈTE (queue de tour) =================
     Réutilise le flux du moteur : startTurn→actions→runEndOfRound→continueAfterEOT
     (guerres, maintenance, événement, EOT, investissement, draft) — toutes modales routées.
     Le driver ne pilote QUE la phase d'actions ; le reste s'enchaîne via le courtier. */

  // Démarre une partie en mode serveur. onDecision(pending) reçoit chaque décision/notice émise.
  boot(seats, onDecision){
    this._onDecision = onDecision || (()=>{});
    this.sb.setDecisionSink(p=>{ try{ this._onDecision(p); }catch(e){} });
    const civIds = seats.map(s=>s.civId);
    this.engine.newGame(civIds[0], civIds.slice(1)); // initGame → émet la 1re décision (agenda)
    const G = this.sb.__G;
    this.roster = [G.player, ...G.ais];
    for(const s of seats){ const n=this.roster.find(p=>p.civ.id===s.civId); if(n)n._isAI=!!s.isAI; }
    /* Les tempéraments sont attribués une première fois à la création de la partie, quand le moteur
       ne sait pas encore quels sièges sont humains. Maintenant qu'ils le sont, on rappelle :
       la fonction ignore les nations déjà pourvues et sert donc uniquement à en donner un à celles
       qui viennent de passer sous contrôle de l'ordinateur. */
    try{ if(typeof this.sb.attribuerProfilsIA==='function') this.sb.attribuerProfilsIA(); }catch(e){}
    this.primaryId = civIds.find(id=>{ const n=this.roster.find(p=>p.civ.id===id); return n && !n._isAI; }) || civIds[0];
    this._aptr = 0; this._aorderRef = null;
    this.sb.showAgendaSelModal(); // sièges fixés → on lance le draft d'agenda (chaque humain choisit)
    return G;
  }

  // Notices BLOQUANTES : le joueur doit cliquer « Continuer » (fenêtre statique). Sinon le pump acquittait
  // tout de suite → les fenêtres « tu as gagné/perdu » et « résultat d'événement » passaient inaperçues.
  _isBlockingNotice(p){
    /* ⚠️ `accord_result` ET `raid_result` MANQUAIENT, ET LE JOUEUR NE LES VOYAIT JAMAIS.
       Ces deux notices annoncent le RÉSULTAT d'une action que le joueur vient de faire : « ta
       proposition d'accord a été refusée », « voici ton butin ». N'étant pas dans cette liste, elles
       étaient traitées comme de simples informations et ACQUITTÉES par ce pilote — la réponse partait
       d'ici, l'écran du joueur ne recevait rien. `online.js` a pourtant une fenêtre pour elles depuis
       longtemps ; elle n'a simplement jamais eu l'occasion de s'ouvrir.
       Marc, partie FDDD du 23/08 : « j'ai fait un accord avec le Terrien et j'ai pas vu si ils ont
       accepté ou pas. » Le journal, lui, disait bien qu'ils avaient refusé.
       Règle : une notice qui répond à une action du joueur est BLOQUANTE — il doit la lire. */
    if(!p || !['war_result','event_result','event_announce','raid_hit','raid_result','accord_result','eot'].includes(p.kind)) return false;
    // ⚠️ JUGEMENT FINAL : sa fenêtre ne doit JAMAIS bloquer — sinon la partie ne se termine pas, les scores
    // ne sont pas calculés, l'archive et l'email ne partent jamais (bug vécu par Marc, partie figée au tour 10).
    try{ const ev=p.payload&&p.payload.event; if(ev&&ev.id==='final') return false; }catch(e){}
    try{ const G=this.sb.__G; if(G && (G.phase==='over' || G.turn>G.maxTurns)) return false; }catch(e){}
    return true;
  }
  _isNotice(p){ return !!(p && (p.notice || ['war_result','event_result','event_announce','eot'].includes(p.kind))) && !this._isBlockingNotice(p); }

  /* ═══════ UNE QUESTION POSÉE À UNE NATION QUE PERSONNE NE JOUE ═══════
     Depuis que les guerres éclatent aussi entre deux IA, le flux de guerre change de point de vue
     (`_focusWar`) et pose ses fenêtres à un belligérant qui peut être tenu par l'ordinateur. Aucun
     siège humain ne les reçoit, et la table entière attend une réponse qui ne viendra jamais.

     ⚠️ POURQUOI ICI ET PAS DANS LE MOTEUR. J'avais d'abord court-circuité les quatre fenêtres
     concernées dans `moteur.js` : « si `G.player` est une IA, appeler la continuation tout de
     suite ». Ça débloquait le multijoueur — et ça a CASSÉ LA REPRISE DE PARTIE. Mesuré : deux bancs
     verts depuis le 6 août (`test_serialisation`, `test_reprise`) tombaient deux fois sur trois, une
     partie restaurée ne repartant plus.
     La raison tient au modèle : une partie n'est reprenable que parce que chaque question EXISTE
     dans `G._flux`, avec sa suite rangée sous forme de NOM. En appelant la continuation en direct,
     on saute cette étape — la question n'est jamais posée, donc jamais sauvegardée, et la chaîne
     d'appels se déroule d'un bloc au lieu de rendre la main entre chaque étape. Sauvegarder au
     milieu de cette chaîne donne un état dont plus personne ne sait quoi faire.
     Ici, dans la boucle du pilote, la question est POSÉE normalement, puis résolue par le même
     `resolveDecision` qu'un humain — exactement comme les notices juste au-dessus. L'état reste
     cohérent à tout instant, et donc sérialisable. */
  _natDe(p){
    const n = p && p.nation;
    const id = (n && typeof n === 'object') ? (n.civ && n.civ.id) : n;
    return id ? this.nation(id) : null;
  }
  _reponseIA(p){
    const o = (p && p.payload) || {}, k = p && p.kind, opts = o.options || [];
    const nat = this._natDe(p), sb = this.sb;
    /* Les décisions de fond sont calculées par le MOTEUR (`iaVeutLaPaix`, `iaChoixDeCombat`) :
       les règles restent d'un seul côté, ce pilote ne fait que transmettre. */
    if(k==='peace_offer'){
      const ennemi = this.nation(this.sb.__G.warWith);
      const veut = (typeof sb.iaVeutLaPaix==='function') ? sb.iaVeutLaPaix(nat, ennemi) : true;
      return veut ? {accept:true, offer:{materials:0,energy:0,science:0}} : {accept:false};
    }
    if(k==='peace_answer'||k==='accord_request') return {id:'yes', accept:true};
    /* ORDRE DES DEUX COMBATS (Hyperpropulsion). Une nation tenue par l'ordinateur frappe la première
       si elle a de quoi le faire — engager ses jetons tant qu'elle les a encore vaut mieux que les
       garder pour un assaut qu'une défense coûteuse lui interdira. Sans moyens, elle défend d'abord
       et gardera le peu qui lui reste pour riposter. */
    if(k==='war_initiative'){
      const jetons = nat ? Math.min(nat.forceTokens||0, nat.res.materials||0, nat.res.energy||0) : 0;
      return {id: jetons>=2 ? 'attaque' : 'defense'};
    }
    if(k==='war_combat') return (typeof sb.iaChoixDeCombat==='function') ? sb.iaChoixDeCombat(nat) : {action:'hold'};
    if(k==='defense') return {defTokens:Math.min(2, o.maxDef||0)};
    if(k==='route_capture') return {capture:true};
    if(k==='forced_war'){
      if(o.colTarget) return {colony:o.colTarget};
      if(Array.isArray(o.routes) && o.routes.length) return {route:0};
      return {peace:true};
    }
    if(k==='raid_target') return {targetId: opts.length?opts[0].id:null};
    if(k==='ai_dyson'||k==='human_dyson') return {war:false};
    if(k==='dyson_build') return {force:false};
    if(k==='event_comm'){ const c=o.cands||[]; return {aiId: c.length?c[0].id:null}; }
    if(k==='event_diplo'){ const r=o.rows||[]; return {selected: r.length?[r[0].id]:[]}; }
    if(!opts.length) return {};   // notice bloquante : un accusé de réception suffit
    const cle = k==='agenda'?'agendaId':(k==='strategy'?'cardId':((k==='invest1'||k==='invest2')?'cardId':(k==='espionage'?'id':(k==='extrasolar'?'node':'value'))));
    const a={}; const op=opts[0];
    a[cle] = (op.id!==undefined)?op.id:(op.node!==undefined?op.node:op.branch);
    return a;
  }
  _gameOver(){ const G=this.sb.__G; return G.phase==='over' || G.turn>G.maxTurns; }

  // Acteur courant de la phase d'actions (round-robin sur G._order, en sautant ceux qui ont passé).
  _currentActor(){
    const G=this.sb.__G;
    const order=G._order||[];
    if(order!==this._aorderRef){ this._aorderRef=order; this._aptr=0; } // nouvelle manche
    if(!order.length) return null;
    for(let k=0;k<order.length;k++){
      const nat=order[(this._aptr+k)%order.length];
      if(!nat._passedRound) return nat;
    }
    return null; // tous ont passé
  }
  _advanceActor(){ const order=this.sb.__G._order||[]; if(order.length)this._aptr=(this._aptr+1)%order.length; }

  /* Joue le tour d'une IA ET reporte ses actions dans SON journal de nation.
     ⚠️ Sans ce report, le bilan de fin de tour affichait « Rien fait ce tour » pour toutes les IA
     alors que le journal montrait bien leurs coups (bug signalé par Marc, partie 6DA8) : la
     concaténation de `G.aiActions` vers `nat._turnActions` n'existait que dans `interleaveStep`,
     le chemin SOLO. Le serveur, lui, appelle `doAITurn` directement — il sautait donc l'étape. */
  _aiTurn(nat){
    const G=this.sb.__G;
    let acted=false;
    try{ acted=this.sb.doAITurn(nat,true); }
    catch(e){ throw e; }
    try{ if(acted && G.aiActions && G.aiActions.length) nat._turnActions=(nat._turnActions||[]).concat(G.aiActions); }catch(e){}
    return acted;
  }
  _stepActor(nat){
    const before=this.sb.__G.log?this.sb.__G.log.length:0;
    let acted=false;
    try{ acted=this._aiTurn(nat); }catch(e){ nat._passedRound=true; this._advanceActor(); return; }
    this._emitLog(before);
    if(!acted || nat.acLeft<=0) nat._passedRound=true;
    this._advanceActor();
  }

  // Avance automatiquement le plus loin possible. S'arrête quand il faut un HUMAIN (décision ou action) ou fin de partie.
  // Retourne {kind:'decision',pending} | {kind:'action',civId} | {kind:'over'} | {kind:'idle'}.
  pump(){
    const G=this.sb.__G;
    let guard=0;
    while(guard++ < 200000){
      /* PLUSIEURS QUESTIONS À LA FOIS. Le moteur sait désormais en porter plusieurs (agenda secret,
         investissements : chacun choisit chez lui, en même temps). On ne regarde donc plus « la »
         question en cours mais LA LISTE — et on la rend ENTIÈRE au serveur, qui envoie à chacun la
         sienne. Ne regarder que la tête aurait produit le pire des deux mondes : le moteur pose
         quatre questions, le serveur n'en distribue qu'une, et trois joueurs attendent un message
         qui ne viendra jamais. */
      const liste = (typeof this.sb.fluxQuestionsEnAttente==='function')
        ? this.sb.fluxQuestionsEnAttente()
        : (G._pending ? [G._pending] : []);
      if(liste.length){
        // Acquitter les simples informations OÙ QU'ELLES SOIENT dans la file : une notice coincée
        // derrière la question d'un joueur bloquerait tout le reste jusqu'à ce qu'il réponde.
        const info = liste.find(p=>this._isNotice(p));
        if(info){ this.sb.resolveDecision(info.id,{}); continue; }
        /* Question adressée à une nation tenue par l'ordinateur : on y répond ici, au même endroit
           et de la même façon que les notices ci-dessus. La question a bien été posée dans
           `G._flux` avant d'être résolue — c'est ce qui garde l'état sérialisable à tout instant. */
        const pourIA = liste.find(p=>{ const n=this._natDe(p); return n && n._isAI; });
        if(pourIA){ this.sb.resolveDecision(pourIA.id, this._reponseIA(pourIA)); continue; }
        // Notice BLOQUANTE sans destinataire (ex. résultat d'événement, nation=null) → l'adresser à un HUMAIN
        // (sinon personne ne peut cliquer « Continuer » et la partie se figerait).
        for(const p of liste){
          if(this._isBlockingNotice(p) && !p.nation){
            const h=this.roster.find(n=>n && !n._isAI);
            p.nation = h ? h.civ.id : this.primaryId;
          }
        }
        // `pending` = la tête, pour tout le code qui n'attend qu'une question ; `pendings` = la liste.
        return {kind:'decision', pending:liste[0], pendings:liste.slice()};
      }
      if(this._gameOver()) return {kind:'over'};
      if(G._serverActionPhase){
        const nat=this._currentActor();
        if(nat===null){ // tous ont passé → clôturer la manche (déclenche guerres/EOT/événement/invest/draft)
          G._serverActionPhase=false;
          this.activate(this.primaryId); // le traitement de guerre/EOT s'appuie sur l'humain principal
          /* ⚠️ CE `catch` AVALAIT L'ERREUR EN SILENCE — commentaire d'origine : « sécurité ».
             C'est le contraire d'une sécurité. Si la fin de tour lève une exception, elle ne se fait
             pas : les revenus ne tombent pas, le tour suivant ne démarre jamais, `pump()` rend
             `idle`, et le serveur finit par écrire « BLOQUÉE — État debut, en attente de … » sans
             que personne sache POURQUOI. On a cherché ce blocage dans le protocole pendant des
             heures alors que le moteur criait, et qu'on lui avait mis la main sur la bouche.
             On garde le filet — une exception ici ne doit pas tuer le serveur pour toutes les
             parties — mais elle est désormais JOURNALISÉE, avec l'état et le tour. */
          try{ this.sb.runEndOfRound(); }
          catch(e){
            const G2=this.sb.__G||{};
            console.error('⚠️ runEndOfRound a levé (tour ' + (G2.turn||'?') + ') : ' + e.message);
            if(e.stack) console.error(e.stack.split('\n').slice(1,4).join('\n'));
            this._eotErreur = { tour:G2.turn, message:e.message };
          }
          continue;
        }
        if(this.isAI(nat.civ.id)){ this._stepActor(nat); continue; }
        return {kind:'action', civId:nat.civ.id}; // tour d'action d'un humain
      }
      return {kind:'idle'}; // rien à faire (ne devrait pas arriver)
    }
    return {kind:'guard'};
  }

  // Le client répond à une décision → on applique puis on ré-avance.
  answer(id, ans){ this.sb.resolveDecision(id, ans||{}); return this.pump(); }

  // Un pouvoir de nation GRATUIT (0 AC) est-il encore disponible pour cette nation ?
  // Sert à NE PAS faire passer un humain à 0 AC avant qu'il ait pu l'utiliser (rappel côté client).
  _freePowerAvailable(nat){
    try{
      const ab = nat.civ && nat.civ.active; if(!ab) return false;
      if(nat.abilityUsed) return false;
      if((ab.ac||0) !== 0) return false;                 // seulement les pouvoirs 0 AC
      for(const r in (ab.cost||{})){ if((nat.res[r]||0) < ab.cost[r]) return false; }
      if(nat.civ.id==='jupiteriens'){ const el=(nat.colonies||[]).filter(c=>['io','europe','ganymede','callisto'].includes(c.nodeId)&&c.level===1&&c.connected); if(!el.length) return false; }
      return true;
    }catch(e){ return false; }
  }

  // Une action est-elle ANNULABLE (déterministe ou aléa figé par nœud) ? → colonisation, route,
  // amélioration, tech, cartes civiques/générales (gouv), pouvoir. NON annulable (commit direct) :
  // raid, attaque, accord, gestion de jeton (aléa/irréversible ou négociation).
  _isConfirmable(action){
    if(!action || !action.type) return false;
    // 'power' est annulable (demande de Marc : Valider/Annuler après un pouvoir gratuit). La rotation de main
    // est gérée par commit() qui GARDE la main si le pouvoir laisse de l'AC (pas de bug Surtension).
    if(['colonize','route','upgrade','buyTech','power'].includes(action.type)) return true;
    if(action.type==='call' && ['buyGeneral','buyMarket','doUpgrade','buyTech'].includes(action.fn)) return true;
    return false;
  }
  // Sérialise l'état en coupant les cycles (_enemy) — pour la photo d'annulation.
  _snap(){
    const enc=(v,seen)=>{ if(v instanceof Set)return{__set:[...v].map(x=>enc(x,seen))}; if(v instanceof Map)return{__map:[...v].map(kv=>[enc(kv[0],seen),enc(kv[1],seen)])};
      if(v===null||typeof v!=='object')return (typeof v==='function'||v===undefined)?undefined:v;
      if(seen.indexOf(v)!==-1)return undefined; seen.push(v); let out;
      if(Array.isArray(v))out=v.map(x=>enc(x,seen)); else{ out={}; for(const k in v){ const e=enc(v[k],seen); if(e!==undefined)out[k]=e; } }
      seen.pop(); return out; };
    return JSON.stringify(enc(this.sb.__G,[]));
  }
  _restore(snapJson){
    const g=this.sb.scDeserialize(snapJson);           // reviver __set/__map
    this.sb.scSetG(g);
    if(typeof this.sb.rehydrateState==='function') this.sb.rehydrateState(g);
    if(typeof this.sb.refreshWarViews==='function') this.sb.refreshWarViews();
    // CRUCIAL : après désérialisation, G contient de NOUVEAUX objets nations → reconstruire le roster
    // du driver (sinon activate() ré-attache les ANCIENS objets et l'annulation semble sans effet).
    const G=this.sb.__G;
    const flags={}; for(const p of this.roster){ flags[p.civ.id]=p._isAI; }   // garder humain/IA
    this.roster=[G.player].concat(G.ais||[]);
    for(const p of this.roster){ if(flags[p.civ.id]!==undefined) p._isAI=flags[p.civ.id]; }
  }

  // Le client soumet une action de jeu pendant son tour → on applique sur sa nation puis on ré-avance.
  act(civId, action){
    const nat=this._currentActor();
    if(!nat || nat.civ.id!==civId) throw new Error('pas le tour d\'action de '+civId);
    this.activate(civId);
    const G=this.sb.__G;
    /* PASSER UNE SEULE ACTION (bouton PASSER, demande de Marc 2026-08-09).
       À NE PAS CONFONDRE avec 'pass' (bouton « Fin de Tour »), qui sort de la manche ENTIÈRE :
       'skip' renonce à CE coup-ci, rend la main au joueur suivant, et on rejouera au passage suivant.
       L'AC est bel et bien consommé, et c'est délibéré : `roundComplete()` exige que TOUS aient
       `_passedRound`. Un « skip » gratuit permettrait donc de passer indéfiniment et la manche ne se
       terminerait jamais. Consommer l'AC garantit la terminaison (à 0 AC, on sort de la manche). */
    if(action && action.type==='skip'){
      const b0 = G.log?G.log.length:0;
      if((nat.acLeft||0)>0) nat.acLeft-=1;
      try{ this.sb.addLog(((nat.civ&&nat.civ.name)||civId)+' passe une action.'); }catch(e){}
      this._emitLog(b0);
      this._lastActionLog=[];
      if(nat.acLeft<=0) nat._passedRound=true;
      this._advanceActor();
      return this.pump();
    }
    const confirmable = !nat._isAI && this._isConfirmable(action);
    const snap = confirmable ? this._snap() : null;    // photo AVANT l'action (pour annuler)
    const before=G.log?G.log.length:0;
    if(action && action.type && action.type!=='pass'){ this.engine.apply(action); }
    this._emitLog(before);
    this._lastActionLog = (G.log && G.log.length>before) ? G.log.slice(0, G.log.length-before).map(e=>String((e&&e.msg)||e)) : [];
    // Action REJETÉE (sans effet : pas assez de ressources/AC, déjà pris, impossible…) → on GARDE la main du
    // joueur : une action ratée ne doit NI passer le tour NI faire tourner la main vers l'autre joueur.
    if(action && action.type && action.type!=='pass' && !nat._isAI){
      const rej=this._lastActionLog.some(x=>/pas assez|impossible|déjà|non adjacent|invalide|refuse|besoin|insuffisant/i.test(String(x)));
      if(rej){ return {kind:'action', civId}; } // rien appliqué → c'est encore son tour
    }
    // Si action ANNULABLE et RÉUSSIE (pas de ⚠️ rejet) → on TIENT (Valider/Annuler), on n'avance pas encore.
    if(confirmable){
      // Rejet = l'action n'a rien fait (vrais mots de refus, PAS un simple ⚠️ d'info type « colonie éloignée »).
      const rejected = this._lastActionLog.some(x=>/pas assez|impossible|déjà|non adjacent|invalide|refuse|besoin/i.test(String(x)));
      if(!rejected){ this._hold={civId, snap, actionType:(action&&action.type)}; return {kind:'confirm', civId}; }
    }
    /* RÈGLE (Marc, 2026-08-01) : l'AC SUPPLÉMENTAIRE donné par un pouvoir (ex. Surtension martienne)
       ne s'enchaîne PAS. Un joueur pouvait faire 3 coups d'affilée — action normale, pouvoir gratuit,
       puis l'action offerte par ce pouvoir — pendant que les autres attendaient. La main tourne donc
       après un pouvoir comme après n'importe quelle action ; l'AC gagné servira au prochain passage.
       (Ceci REMPLACE volontairement l'ancien comportement « le pouvoir garde la main ».) */
    // Sinon : commit direct. Passer la nation sauf si pouvoir gratuit encore dispo.
    // Le rappel du pouvoir gratuit est désormais proposé à 1 AC RESTANT (côté client), donc on ne RETIENT
    // PLUS la main du joueur à 0 AC : sinon le tour n'avançait plus tant qu'il n'avait pas utilisé ce pouvoir
    // (bug vécu par Marc : obligé de l'activer pour débloquer la partie).
    if(!action || action.type==='pass' || nat.acLeft<=0) nat._passedRound=true;
    this._advanceActor();
    return this.pump();
  }
  // Valider une action tenue : on la fige et on continue (passe la main si plus d'AC ni pouvoir).
  commit(civId){
    const heldType = (this._hold && this._hold.civId===civId) ? this._hold.actionType : null;
    if(this._hold && this._hold.civId===civId) this._hold=null;
    const nat=this.nation(civId); this.activate(civId);
    // Idem après validation d'un pouvoir : la main tourne (voir la règle expliquée dans act()).
    void heldType;
    if(nat && nat.acLeft<=0) nat._passedRound=true; // idem : plus de blocage pour le pouvoir gratuit
    this._advanceActor();
    return this.pump();
  }
  // Annuler une action tenue : restaurer la photo, MAIS garder les découvertes figées (pas de re-tirage).
  undo(civId){
    if(this._hold && this._hold.civId===civId){
      const postDisc = (this.sb.__G && this.sb.__G._discCache) || {};
      this._restore(this._hold.snap);
      this.sb.__G._discCache = Object.assign({}, this.sb.__G._discCache||{}, postDisc);
      this._hold=null;
      this.activate(civId);
      // repositionner le pointeur d'acteur sur ce joueur (c'est de nouveau son tour après annulation)
      const order=this.sb.__G._order||[];
      this._aorderRef=order;
      const idx=order.findIndex(n=>n&&n.civ&&n.civ.id===civId);
      this._aptr = idx>=0?idx:0;
    }
    return {kind:'action', civId};   // c'est de nouveau son tour, état d'avant l'action
  }

  // Repli IA pour un humain (déconnexion/timeout) pendant son tour d'action.
  actAuto(civId){ const nat=this._currentActor(); if(nat&&nat.civ.id===civId){ this._stepActor(nat); } return this.pump(); }
}

module.exports = { GameDriver };
