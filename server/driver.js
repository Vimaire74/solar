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
  /* htmlPath = chemin de solar_conquest_carte.html */
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
    try { acted = this.sb.doAITurn(me, true); }
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
    try { acted = this.sb.doAITurn(me, true); }
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
    this.primaryId = civIds.find(id=>{ const n=this.roster.find(p=>p.civ.id===id); return n && !n._isAI; }) || civIds[0];
    this._aptr = 0; this._aorderRef = null;
    this.sb.showAgendaSelModal(); // sièges fixés → on lance le draft d'agenda (chaque humain choisit)
    return G;
  }

  // Notices BLOQUANTES : le joueur doit cliquer « Continuer » (fenêtre statique). Sinon le pump acquittait
  // tout de suite → les fenêtres « tu as gagné/perdu » et « résultat d'événement » passaient inaperçues.
  _isBlockingNotice(p){ return !!(p && ['war_result','event_result','event_announce'].includes(p.kind)); }
  _isNotice(p){ return !!(p && (p.notice || ['war_result','event_result','event_announce','eot'].includes(p.kind))) && !this._isBlockingNotice(p); }
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

  _stepActor(nat){
    const before=this.sb.__G.log?this.sb.__G.log.length:0;
    let acted=false;
    try{ acted=this.sb.doAITurn(nat,true); }catch(e){ nat._passedRound=true; this._advanceActor(); return; }
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
      if(G._pending){
        if(this._isNotice(G._pending)){ const id=G._pending.id; this.sb.resolveDecision(id,{}); continue; } // acquitte l'info → enchaîne
        // Notice BLOQUANTE sans destinataire (ex. résultat d'événement, nation=null) → l'adresser à un HUMAIN
        // (sinon personne ne peut cliquer « Continuer » et la partie se figerait).
        if(this._isBlockingNotice(G._pending) && !G._pending.nation){
          const h=this.roster.find(n=>n && !n._isAI);
          G._pending.nation = h ? h.civ.id : this.primaryId;
        }
        return {kind:'decision', pending:G._pending}; // décision d'un humain : attendre le client
      }
      if(this._gameOver()) return {kind:'over'};
      if(G._serverActionPhase){
        const nat=this._currentActor();
        if(nat===null){ // tous ont passé → clôturer la manche (déclenche guerres/EOT/événement/invest/draft)
          G._serverActionPhase=false;
          this.activate(this.primaryId); // le traitement de guerre/EOT s'appuie sur l'humain principal
          try{ this.sb.runEndOfRound(); }catch(e){ /* sécurité */ }
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
    // POUVOIR qui laisse de l'AC (ex. Surtension +1 AC) → le joueur GARDE la main : pas de rotation vers
    // un joueur qui a déjà passé, il enchaîne directement sa/ses action(s) (bug #4).
    if(action && action.type==='power' && !nat._isAI && nat.acLeft>0){
      return this.pump(); // _currentActor renverra la même nation (pointeur non avancé)
    }
    // Sinon : commit direct. Passer la nation sauf si pouvoir gratuit encore dispo.
    const keepForPower = !nat._isAI && (!action || action.type!=='pass') && nat.acLeft<=0 && this._freePowerAvailable(nat);
    if(!action || action.type==='pass' || (nat.acLeft<=0 && !keepForPower)) nat._passedRound=true;
    this._advanceActor();
    return this.pump();
  }
  // Valider une action tenue : on la fige et on continue (passe la main si plus d'AC ni pouvoir).
  commit(civId){
    const heldType = (this._hold && this._hold.civId===civId) ? this._hold.actionType : null;
    if(this._hold && this._hold.civId===civId) this._hold=null;
    const nat=this.nation(civId); this.activate(civId);
    // POUVOIR gratuit qui laisse de l'AC (ex. Surtension +1 AC) → après validation, le joueur GARDE la main
    // et enchaîne (pas de rotation vers un autre joueur). Évite la réapparition du bug #4.
    if(heldType==='power' && nat && nat.acLeft>0){ return this.pump(); }
    const keepForPower = nat && nat.acLeft<=0 && this._freePowerAvailable(nat);
    if(nat && nat.acLeft<=0 && !keepForPower) nat._passedRound=true;
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
