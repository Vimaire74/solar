/* ============================================================================
   diagnostic.js — LE RAPPORT DE DIAGNOSTIC (Marc, 28/09/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Partie du 28/09 sur le Flip 6 : « le jeu s'est juste arrêté à la fin de mes actions,
   sans fin de tour, sans filet de sécurité ». Aucune erreur JavaScript, aucun message : rien à lire
   après coup. Ce fichier garde sur l'appareil ce qu'il faut pour comprendre un plantage ou un
   figeage, et propose au joueur — À LUI SEUL de décider — de l'envoyer.

   CE QU'IL GARDE (localStorage `sc_debug`, plafonné à ~200 Ko) :
     · appareil : modèle et version d'Android lus dans `navigator.userAgent` (aucun plugin),
       écran, langue, mémoire déclarée, mode natif ou navigateur ;
     · versions : les trois estampilles du jeu + la version de l'appli si build-www l'a posée ;
     · erreurs : `error`, `unhandledrejection`, `console.error` — message, pile, et l'état de la
       partie à cet instant ;
     · figeages : une question en attente sans fenêtre pendant 30 s, ou le chien de garde de 8 s
       qui relance à répétition — avec l'état à ce moment (c'est ce qui manquait le 28/09) ;
     · fil d'Ariane : les 40 derniers appels de flux/tour (nom + heure), par enrobage des fonctions
       globales du moteur — le serveur ne charge PAS ce fichier, il ne voit donc rien de tout ça.
   Le rapport ENVOYÉ ajoute le journal de la partie (`buildFullLog`, tronqué à 60 Ko) et le
   commentaire libre du joueur. Il ne contient ni nom, ni adresse, ni compte, ni identifiant.

   COMMENT IL PART : `POST` en `text/plain` (pas de pré-vol CORS) vers le serveur de jeu,
   `/api/diagnostic` (voir server/diagnostic-serveur.js). Repli : copie dans le presse-papiers.
   Deux portes : le bandeau à l'ouverture s'il reste une erreur ou un figeage non envoyé, et le
   bouton « Signaler un problème » (accueil de l'appli, carte Réglages en partie).

   ⚠️ Chargé APRÈS moteur.js (il lui faut `t()`, `G`, `scDemander`) — les erreurs survenues AVANT
   sont ramassées par le petit tampon `window.__scErreursPrecoces` posé en tête d'index.html.
   ⚠️ Le balisage de la fenêtre est construit par une fonction PURE (`scDiagBalisage`), comme
   `scDemander` : le décor des bancs ne sait pas analyser du HTML (voir game-core.js).
   ========================================================================== */
(function(){
  'use strict';
  const CLE='sc_debug', MAX_OCTETS=200*1024, MAX_ERREURS=30, MAX_FIL=40, MAX_FIGEAGES=10, MAX_JOURNAL=400*1024;
  const MAX_ENVOI=2*1024*1024;   // même plafond que le serveur (03/10 : 2 Mo — journal + rapport + état complet de la partie)
  const win=(typeof window!=='undefined')?window:{};
  let _D=null;

  function _store(){ try{ return win.localStorage||null; }catch(e){ return null; } }
  function _vide(){ return {v:1, cree:_iso(), erreurs:[], figeages:[], fil:[], nonEnvoye:false, nePlusProposer:false, envoyes:0}; }
  function _iso(){ try{ return new Date().toISOString(); }catch(e){ return ''; } }
  function scDiagCharger(){
    if(_D) return _D;
    try{ const s=_store(); const raw=s&&s.getItem(CLE); const d=raw?JSON.parse(raw):null; _D=(d&&typeof d==='object'&&Array.isArray(d.erreurs))?d:_vide(); }
    catch(e){ _D=_vide(); }
    if(!Array.isArray(_D.figeages))_D.figeages=[]; if(!Array.isArray(_D.fil))_D.fil=[];
    return _D;
  }
  /* Le plafond se tient en retirant le plus ANCIEN : une erreur récente vaut plus qu'une vieille. */
  function scDiagSauver(){
    const d=scDiagCharger();
    d.erreurs=d.erreurs.slice(-MAX_ERREURS); d.fil=d.fil.slice(-MAX_FIL); d.figeages=d.figeages.slice(-MAX_FIGEAGES);
    let txt=JSON.stringify(d), garde=0;
    while(txt.length>MAX_OCTETS && garde++<200){
      if(d.erreurs.length) d.erreurs.shift(); else if(d.figeages.length) d.figeages.shift(); else if(d.fil.length) d.fil.shift(); else break;
      txt=JSON.stringify(d);
    }
    try{ const s=_store(); if(s) s.setItem(CLE,txt); }catch(e){}
    return txt.length;
  }
  function scDiagEffacer(){ _D=_vide(); try{ const s=_store(); if(s) s.removeItem(CLE); }catch(e){} return _D; }

  /* ── L'appareil, sans plugin : « Android 14; SM-F741B » vit déjà dans l'agent utilisateur ── */
  function scDiagAppareil(){
    const nav=win.navigator||{}, ua=String(nav.userAgent||'');
    let os='', modele='';
    const a=ua.match(/Android\s+([\d.]+)(?:;\s*([^;)]+?))?(?:\s+Build|[;)])/);
    if(a){ os='Android '+a[1]; modele=(a[2]||'').trim(); }
    else if(/iPhone|iPad/.test(ua)){ const i=ua.match(/OS\s+([\d_]+)/); os='iOS '+((i&&i[1])||'').replace(/_/g,'.'); modele=/iPad/.test(ua)?'iPad':'iPhone'; }
    else { const m=ua.match(/\(([^)]+)\)/); os=(m&&m[1])||''; }
    const cap=win.Capacitor, natif=!!(cap&&typeof cap.isNativePlatform==='function'&&cap.isNativePlatform());
    const scr=win.screen||{};
    return { modele:modele, os:os, natif:natif, agent:ua,
             ecran:(scr.width||0)+'×'+(scr.height||0)+' @'+(win.devicePixelRatio||1)+' · fenêtre '+(win.innerWidth||0)+'×'+(win.innerHeight||0),
             langue:String(nav.language||''), langueJeu:(function(){ try{ return _store()&&_store().getItem('sc_lang')||''; }catch(e){ return ''; } })(),
             memoireGo:(nav.deviceMemory||null), coeurs:(nav.hardwareConcurrency||null), enLigne:(typeof nav.onLine==='boolean')?nav.onLine:null };
  }
  function scDiagVersions(){
    return { html:win.SOLAR_BUILD_HTML||null, moteur:(typeof SOLAR_BUILD_MOTEUR!=='undefined')?SOLAR_BUILD_MOTEUR:null,
             online:(typeof SOLAR_BUILD_JS!=='undefined')?SOLAR_BUILD_JS:null, appli:win.SOLAR_APP_VERSION||null };
  }
  /* ── L'état de la partie, sans rien casser : chaque champ est pris dans un try ── */
  function _g(){ try{ return (typeof G!=='undefined')?G:null; }catch(e){ return null; } }
  function _txt(e){ try{ return (typeof _logTexte==='function')?_logTexte(e):String((e&&e.msg)||e); }catch(x){ return String((e&&e.msg)||e); } }
  function scDiagEtatPartie(lignes){
    const g=_g(); if(!g) return {partie:false};
    const o={partie:true};
    try{ o.tour=g.turn; o.phase=g.phase; o.entrelace=!!g._il; o.ilIdx=g._ilIdx; o.ilPause=!!g._ilPaused; o.mainHumain=!!g._humanActive; }catch(e){}
    try{ o.flux=(typeof fluxNom==='function')?fluxNom():null; }catch(e){}
    try{ o.questions=(g._pendings||(g._pending?[g._pending]:[])).map(p=>p&&{id:p.id,kind:p.kind,nation:p.nation}); }catch(e){}
    try{ o.enLigne=(typeof _decisionActive==='function'&&_decisionActive())||!!(win.SC_ONLINE&&win.SC_ONLINE.STATE&&win.SC_ONLINE.STATE.started); }catch(e){}
    try{ o.joueur=g.player&&g.player.civ&&g.player.civ.id; o.acRestants=g.player&&g.player.acLeft; o.nations=(typeof allPlayers==='function'?allPlayers():[]).map(p=>p&&p.civ&&(p.civ.id+(p._isAI?' (IA)':'')+(p._passedRound?' passé':'')+(p._passesDues?' dette '+p._passesDues:''))); }catch(e){}
    try{ o.ordre=(g._order||[]).map(p=>p&&p.civ&&p.civ.id); }catch(e){}
    try{ o.assautIA=!!g._aiAssaultCtx; o.suiteAssaut=g._assaultThenSuite||null; o.dernierProgres=g._lastProgress?Math.round((Date.now()-g._lastProgress)/1000)+' s':null; }catch(e){}
    try{ o.fenetreOuverte=(typeof _scAnyModalOpen==='function')?_scAnyModalOpen():null; }catch(e){}
    try{ const n=lignes||20; o.journal=(g.log||[]).slice(0,n).map(e=>_txt(e).replace(/<[^>]+>/g,'').trim()); }catch(e){}
    return o;
  }
  /* ── Erreurs ── */
  function scDiagErreur(type, message, pile, extra){
    const d=scDiagCharger();
    const e={quand:_iso(), type:String(type||'erreur'), msg:String(message||'').slice(0,2000), pile:String(pile||'').slice(0,4000)};
    if(extra) e.ou=String(extra).slice(0,300);
    try{ e.etat=scDiagEtatPartie(12); }catch(x){}
    d.erreurs.push(e); d.nonEnvoye=true; scDiagSauver();
    return e;
  }
  function scDiagFigeage(raison, detail){
    const d=scDiagCharger();
    const f={quand:_iso(), raison:String(raison||''), detail:String(detail||'').slice(0,500)};
    try{ f.etat=scDiagEtatPartie(30); }catch(x){}
    d.figeages.push(f); d.nonEnvoye=true; scDiagSauver();
    return f;
  }
  function scDiagTrace(nom){
    try{ const d=scDiagCharger(); d.fil.push((Date.now()%100000000)+' '+String(nom).slice(0,80)); if(d.fil.length>MAX_FIL) d.fil.splice(0,d.fil.length-MAX_FIL); }catch(e){}
  }
  let _traceSaveTimer=null;
  function _traceEtSauverPlusTard(nom){ scDiagTrace(nom); if(_traceSaveTimer)return; _traceSaveTimer=setTimeout(function(){ _traceSaveTimer=null; try{ scDiagSauver(); }catch(e){} },2000); }

  /* ── Les crochets : erreurs du navigateur, console.error, fonctions de flux ── */
  function _brancher(){
    try{ (win.__scErreursPrecoces||[]).forEach(function(x){ scDiagErreur(x.type,x.msg,x.pile,x.ou); }); win.__scErreursPrecoces=[]; }catch(e){}
    try{ win.addEventListener('error',function(ev){ scDiagNoterErreur(ev); }); }catch(e){}
    try{ win.addEventListener('unhandledrejection',function(ev){ const r=ev&&ev.reason; scDiagErreur('promesse',(r&&r.message)||String(r),(r&&r.stack)||''); }); }catch(e){}
    try{ const c=win.console; if(c&&typeof c.error==='function'){ const orig=c.error; c.error=function(){ try{ const a=Array.prototype.slice.call(arguments); const er=a.find(x=>x&&x.stack); scDiagErreur('console',a.map(x=>(x&&x.message)||(typeof x==='string'?x:(function(){try{return JSON.stringify(x);}catch(e){return String(x);}})())).join(' '),(er&&er.stack)||''); }catch(e){} return orig.apply(this,arguments); }; } }catch(e){}
    /* Enrobage des fonctions globales du moteur : elles sont déclarées par `function` dans un
       script classique, donc propriétés de window, et les appelants les résolvent à l'appel. */
    ['fluxAppeler','interleaveStep','playerActed','passTurnIL','endTurn','runEndOfRound','resolveDecision','_emitDecision','startTurn','continueAfterEOT'].forEach(function(nom){
      try{
        const f=win[nom]; if(typeof f!=='function'||f.__scDiag)return;
        const w=function(){ _traceEtSauverPlusTard(nom+(nom==='fluxAppeler'||nom==='_emitDecision'||nom==='resolveDecision'?' '+String(arguments[0]).slice(0,40):'')); return f.apply(this,arguments); };
        w.__scDiag=true; win[nom]=w;
      }catch(e){}
    });
    try{ const f=win._scWatchdogRecover; if(typeof f==='function'&&!f.__scDiag){ const w=function(){ _relances++; _traceEtSauverPlusTard('_scWatchdogRecover #'+_relances); if(_relances===3) scDiagFigeage('chien de garde','le chien de garde de 8 s a relancé 3 fois de suite sans progrès'); return f.apply(this,arguments); }; w.__scDiag=true; win._scWatchdogRecover=w; } }catch(e){}
    try{ const f=win.interleaveStep; if(typeof f==='function'){ /* un vrai pas remet le compteur de relances à zéro */ const w=function(){ const r=f.apply(this,arguments); try{ const g=_g(); if(g&&g._lastProgress&&Date.now()-g._lastProgress<3000)_relances=0; }catch(e){} return r; }; win.interleaveStep=w; } }catch(e){}
  }
  function scDiagNoterErreur(ev){
    try{
      const er=ev&&ev.error; const msg=(ev&&ev.message)||(er&&er.message)||String(ev);
      const ou=ev&&ev.filename?(String(ev.filename).split('/').pop()+':'+ev.lineno+':'+ev.colno):'';
      return scDiagErreur('erreur',msg,(er&&er.stack)||'',ou);
    }catch(e){ return null; }
  }
  /* ── Surveillance des figeages : appelée toutes les 10 s (ou par un banc, avec son horloge) ── */
  let _relances=0, _questionVue={id:null, depuis:0, signalee:false};
  function scDiagSurveiller(maintenant){
    const now=maintenant||Date.now(); const g=_g(); if(!g||g.phase==='over'||g.phase==='setup'||g.phase==='lobby') return null;
    let enLigne=false; try{ enLigne=(typeof _decisionActive==='function'&&_decisionActive())||!!(win.SC_ONLINE&&win.SC_ONLINE.STATE&&win.SC_ONLINE.STATE.started); }catch(e){}
    if(enLigne) return null;   // en ligne, c'est le serveur qui porte les questions : rien à juger ici
    const p=g._pending;
    if(!p){ _questionVue={id:null,depuis:0,signalee:false}; return null; }
    if(p.id!==_questionVue.id){ _questionVue={id:p.id,depuis:now,signalee:false}; return null; }
    let fenetre=null; try{ fenetre=(typeof _scAnyModalOpen==='function')?_scAnyModalOpen():null; }catch(e){}
    if(!_questionVue.signalee && now-_questionVue.depuis>30000 && fenetre===false){
      _questionVue.signalee=true;
      return scDiagFigeage('question sans fenêtre','question « '+p.kind+' » ('+p.id+', '+p.nation+') en attente depuis '+Math.round((now-_questionVue.depuis)/1000)+' s sans aucune fenêtre ouverte — le chien de garde se tait tant qu\'elle est posée');
    }
    return null;
  }

  /* ── Le rapport tel qu'il part ── */
  function scDiagRapport(commentaire){
    const d=scDiagCharger();
    const r={ v:1, envoye:_iso(), commentaire:String(commentaire||'').slice(0,2000),
              appareil:scDiagAppareil(), versions:scDiagVersions(), partie:scDiagEtatPartie(40),
              erreurs:d.erreurs.slice(), figeages:d.figeages.slice(), fil:d.fil.slice(), rapportCree:d.cree, dejaEnvoyes:d.envoyes||0 };
    /* TOUS LES ÉLÉMENTS DE LA PARTIE (Marc, 03/10) : le journal EXACTEMENT comme affiché, le rapport de partie
       (actions, VP, analyses) et l'état complet sérialisé (de quoi rejouer la situation). Au-delà du plafond,
       on retire d'abord l'état, puis on raccourcit le rapport, enfin le journal. */
    const cap=(x,n)=>{ x=String(x||''); return x.length>n?x.slice(0,n)+'\n… (tronqué)':x; };
    try{ if(_g()&&_g().player){
      if(typeof journalTexteVisible==='function') r.journal=cap(journalTexteVisible(),MAX_JOURNAL);
      if(typeof buildJournalReport==='function') r.rapportPartie=cap(buildJournalReport(),MAX_JOURNAL);
      if(typeof scSerialize==='function') r.etatPartie=scSerialize();
    } }catch(e){ r.journal=r.journal||('(journal indisponible : '+(e&&e.message)+')'); }
    let txt=JSON.stringify(r);
    if(txt.length>MAX_ENVOI){ delete r.etatPartie; txt=JSON.stringify(r); }
    if(txt.length>MAX_ENVOI){ r.rapportPartie=cap(r.rapportPartie,60*1024); txt=JSON.stringify(r); }
    if(txt.length>MAX_ENVOI){ r.journal=cap(r.journal,200*1024); r.erreurs=r.erreurs.slice(-10); }
    return r;
  }
  function scDiagTexte(r){
    return ['SOLAR — RAPPORT DE PROBLÈME', 'Commentaire : '+(r.commentaire||'(aucun)'),
      'Appareil : '+JSON.stringify(r.appareil||{}), 'Versions : '+JSON.stringify(r.versions||{}),
      'Erreurs : '+(r.erreurs||[]).length+' · Figeages : '+(r.figeages||[]).length, '',
      r.journal||'(pas de journal)', '', r.rapportPartie||''].join('\n');
  }
  function scDiagUrl(){
    let ws='wss://live.solar-game.com';
    try{ if(typeof serveurPour==='function') ws=serveurPour(win.location,win); }catch(e){}
    return ws.replace(/^ws(s?):\/\//,'http$1://').replace(/\/+$/,'')+'/api/diagnostic';
  }
  async function scDiagEnvoyer(commentaire){
    const r=scDiagRapport(commentaire);
    const rep=await fetch(scDiagUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(r)});
    if(!rep.ok) throw new Error('HTTP '+rep.status);
    const d=scDiagCharger(); d.erreurs=[]; d.figeages=[]; d.nonEnvoye=false; d.envoyes=(d.envoyes||0)+1; d.dernierEnvoi=_iso(); scDiagSauver();
    return r;
  }

  /* ── La fenêtre ── */
  function _esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function scDiagBalisage(auto){
    const titre=t('diag.titre','Envoyer un rapport de diagnostic ?');
    const intro=auto
      ? t('diag.intro_auto','L\'application semble s\'être arrêtée anormalement lors de la dernière partie.')
      : t('diag.intro_manuel','Un problème dans le jeu ? Décris-le en quelques mots ; le rapport technique est joint.');
    const texte=t('diag.texte','Ce rapport aide à corriger les défauts du jeu. Il contient : le modèle de votre appareil et la version de son système, la version de l\'application, le journal et l\'état complet de la partie en cours, et les messages d\'erreur techniques.\n\nIl ne contient ni votre nom, ni votre adresse, ni vos contacts, ni votre position, ni aucun identifiant publicitaire. Il n\'est envoyé que si vous appuyez sur Envoyer, il sert uniquement à corriger le jeu et il est supprimé une fois le défaut traité.');
    const lien=t('diag.lien_confidentialite','Politique de confidentialité');
    const paras=String(texte).split(/\n{2,}/).map(function(b){ return '<p style="margin:0 0 10px">'+_esc(b).replace(/\n/g,'<br>')+'</p>'; }).join('');
    const btn='min-height:44px;border-radius:9px;font-weight:700;font-size:.93em;cursor:pointer;padding:0 10px';
    return '<div id="sc-diag" style="position:fixed;inset:0;background:rgba(4,4,18,.86);z-index:905;display:flex;align-items:center;justify-content:center;padding:14px">'
      +'<div role="dialog" aria-modal="true" aria-labelledby="sc-diag-t" style="background:#0d1128;border:2px solid #39569c;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.7);max-width:460px;width:100%;max-height:calc(100dvh - 28px);display:flex;flex-direction:column">'
        +'<div id="sc-diag-t" style="font-family:var(--font-titre);font-size:.82em;letter-spacing:.06em;color:#cfe0ff;padding:14px 16px 8px">'+_esc(titre)+'</div>'
        +'<div style="padding:0 16px;overflow:auto;font-size:.92em;color:#c3cde6;line-height:1.5">'
          /* 03/10 (Marc) : la description EN HAUT, puis les trois boutons, puis les explications. */
          +'<p style="margin:0 0 8px;color:#ffd9a8">'+_esc(intro)+'</p>'
          +'<textarea id="sc-diag-com" rows="4" maxlength="2000" placeholder="'+_esc(t('diag.placeholder','Ce qui s\'est passé (facultatif)'))+'" style="width:100%;box-sizing:border-box;background:#0a0d22;border:1px solid #39569c;border-radius:8px;color:#e6ecff;padding:8px;font-size:16px"></textarea>'
          +'<div style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px">'
            +'<button type="button" id="sc-diag-non" style="'+btn+';flex:1;background:#141a36;border:1px solid #39569c;color:#cfe0ff">'+_esc(t('diag.retour','Retour'))+'</button>'
            +'<button type="button" id="sc-diag-copier" style="'+btn+';flex:1.4;background:#141a36;border:1px solid #39569c;color:#cfe0ff">'+_esc(t('diag.copier','Copier le rapport'))+'</button>'
            +'<button type="button" id="sc-diag-oui" style="'+btn+';flex:1.6;background:#16401a;border:1px solid #2f6b34;color:#bff3cf">'+_esc(t('diag.envoyer_rapport','Envoyer le rapport'))+'</button>'
          +'</div>'
          +'<div id="sc-diag-etat" style="margin:4px 0 10px;min-height:1.2em;font-size:.9em;color:#9fd0a0"></div>'
          +paras
          +'<p style="margin:0 0 12px"><a href="'+_esc(t('diag.url_confidentialite','confidentialite.html'))+'" target="_blank" rel="noopener" style="color:#8fb6ff">'+_esc(lien)+'</a></p>'
        +'</div>'
      +'</div></div>';
  }
  function scDiagOuvrir(auto){
    try{ const v=document.getElementById('sc-diag'); if(v)v.remove(); document.body.insertAdjacentHTML('beforeend',scDiagBalisage(!!auto)); }catch(e){ return; }
    const boite=document.getElementById('sc-diag'), etat=document.getElementById('sc-diag-etat');
    const com=()=>{ const ta=document.getElementById('sc-diag-com'); return ta?ta.value:''; };
    const fermer=()=>{ try{ boite.remove(); }catch(e){} };
    const dire=(m,rouge)=>{ if(etat){ etat.textContent=m; etat.style.color=rouge?'#ff9a8a':'#9fd0a0'; } };
    const b=id=>document.getElementById(id);
    if(b('sc-diag-non')) b('sc-diag-non').onclick=fermer;
    if(b('sc-diag-copier')) b('sc-diag-copier').onclick=async function(){ try{ await navigator.clipboard.writeText(scDiagTexte(scDiagRapport(com()))); dire(t('diag.copie','✅ Rapport copié — colle-le dans un message.')); }catch(e){ dire(t('diag.copie_impossible','⚠️ Copie impossible sur cet appareil.'),true); } };
    if(b('sc-diag-oui')) b('sc-diag-oui').onclick=async function(){
      const bo=b('sc-diag-oui'); bo.disabled=true; dire(t('diag.envoi','Envoi…'));
      try{ await scDiagEnvoyer(com()); dire(t('diag.envoye','✅ Merci, le rapport est envoyé.')); setTimeout(fermer,1400); }
      catch(e){ bo.disabled=false; dire(t('diag.echec','⚠️ Envoi impossible ({e}). Tu peux copier le rapport et l\'envoyer par message.',{e:(e&&e.message)||'réseau'}),true); }
    };
    /* « Retour » ferme la fenêtre et rien d'autre ; un toucher hors de la fenêtre ne ferme plus (fausse manœuvre). */
  }
  /* À l'ouverture : proposer si quelque chose d'anormal attend, une fois, et jamais pendant le tutoriel. */
  function scDiagProposerSiBesoin(){
    try{
      const d=scDiagCharger();
      if(d.nePlusProposer||!d.nonEnvoye) return false;
      if(!(d.erreurs.length||d.figeages.length)) return false;
      if(win.SC_TUTO||document.getElementById('tuto-coach')) return false;
      setTimeout(function(){ scDiagOuvrir(true); },900);
      return true;
    }catch(e){ return false; }
  }

  /* ── Exposition ── */
  Object.assign(win,{ scDiagCharger, scDiagSauver, scDiagEffacer, scDiagAppareil, scDiagVersions, scDiagEtatPartie, scDiagErreur, scDiagFigeage, scDiagTrace, scDiagNoterErreur, scDiagSurveiller, scDiagRapport, scDiagUrl, scDiagEnvoyer, scDiagBalisage, scDiagOuvrir, scDiagProposerSiBesoin });
  if(typeof document!=='undefined'&&document.getElementById&&!win.SOLAR_SANS_ECRAN){
    _brancher();
    setInterval(function(){ try{ scDiagSurveiller(); }catch(e){} },10000);
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',scDiagProposerSiBesoin); else setTimeout(scDiagProposerSiBesoin,0);
  }
  win.__scDiagBrancher=_brancher;   // pour les bancs : brancher sur commande, dans un décor
})();
