/* ============================================================================
   Solar — Couche TUTORIEL (coach par-dessus le VRAI jeu).
   Chargée par tutorial.html À LA PLACE de online.js. Ne touche pas index.html.
   Principe : on lance une vraie partie (IA neutralisée), et une bulle "coach"
   explique chaque mécanisme au fil de ~4 tours. Chaque étape a un bouton
   « Suivant » (filet de sécurité) ; les actions du joueur font aussi avancer.
   ============================================================================ */
(function(){
'use strict';

/* ---------- utilitaires ---------- */
function el(html){const d=document.createElement('div');d.innerHTML=html.trim();return d.firstChild;}
function $(id){return document.getElementById(id);}
function ready(fn){ if(document.readyState!=='loading')fn(); else document.addEventListener('DOMContentLoaded',fn); }
function G(){ try{ return window.scGetG?window.scGetG():null; }catch(e){ return null; } }

/* ---------- styles ---------- */
function injectCSS(){
  const s=document.createElement('style');
  s.textContent=`
  #tuto-coach{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;
    width:min(456px,92vw);max-height:46dvh;display:flex;flex-direction:column;background:linear-gradient(#101a34,#0b1428);
    border:2px solid #ffd34d;border-radius:16px;padding:13px 15px;box-shadow:0 10px 40px #000c;color:#dce8ff;font-family:system-ui,Segoe UI,Roboto,sans-serif}
  #tuto-body{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
  #tuto-coach .st{color:#ffd34d;font-size:.7em;font-weight:800;letter-spacing:.6px;text-transform:uppercase}
  #tuto-coach .tx{margin-top:3px;line-height:1.5;font-size:.97em;overflow-y:auto;min-height:0;flex:1 1 auto}
  #tuto-coach .tx b{color:#ffd34d}
  #tuto-coach .go{margin-top:10px;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-shrink:0}
  #tuto-coach .hint{color:#8fa2c8;font-size:.8em}
  #tuto-coach button{background:#ffd34d;color:#1a1400;border:0;border-radius:10px;padding:8px 16px;font-weight:800;cursor:pointer;font-size:.92em}
  #tuto-coach button.skip{background:#1a2444;color:#9fb0d0;border:1px solid #33507f;font-weight:600;padding:6px 10px;font-size:.82em}
  #tuto-head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;user-select:none;
    margin:-4px -5px 7px;padding:2px 3px 6px;border-bottom:1px solid #ffd34d40}
  #tuto-title{color:#ffd34d;font-size:.72em;font-weight:800;letter-spacing:.5px;text-transform:uppercase;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #tuto-min{background:#1a2444;color:#ffd34d;border:1px solid #ffd34d66;border-radius:7px;min-width:28px;height:24px;font-weight:900;cursor:pointer;font-size:1.05em;line-height:1;flex-shrink:0}
  .tuto-glow{position:relative;z-index:2147482000;box-shadow:0 0 0 3px #ffd34d,0 0 22px 5px #ffd34daa!important;
    border-radius:10px;animation:tutopulse 1.2s infinite}
  @keyframes tutopulse{0%,100%{box-shadow:0 0 0 3px #ffd34d,0 0 12px 2px #ffd34d66}50%{box-shadow:0 0 0 3px #ffd34d,0 0 28px 9px #ffd34dcc}}
  #tuto-note{position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:2147483001;
    background:#0c1f3a;border:1px solid #3a6db0;color:#cfe4ff;padding:10px 15px;border-radius:12px;max-width:min(440px,92vw);
    box-shadow:0 8px 30px #000a;font-family:system-ui;font-size:.92em;opacity:0;transition:.25s;pointer-events:none;text-align:center}
  #tuto-note.show{opacity:1}
  #tuto-welcome,#tuto-final{position:fixed;inset:0;z-index:2147483002;background:radial-gradient(900px 600px at 50% 12%,#12224a,#05080f 72%);
    display:flex;flex-direction:column;align-items:center;justify-content:safe center;text-align:center;padding:18px;gap:11px;
    overflow-y:auto;color:#dce8ff;font-family:system-ui}
  #tuto-welcome h1,#tuto-final h2{color:#ffd34d;margin:0}
  #tuto-welcome p,#tuto-final p{max-width:min(440px,88vw);line-height:1.55;margin:4px 0}
  #tuto-welcome .big,#tuto-final .big{font-size:3em}
  #tuto-welcome button,#tuto-final button{background:#ffd34d;color:#1a1400;border:0;border-radius:12px;padding:12px 26px;font-weight:800;font-size:1.05em;cursor:pointer;margin-top:6px}
  #tuto-final button.ghost{background:#16223f;color:#cfe0ff;border:1px solid #33507f}
  .tuto-hidden{display:none!important}
  /* Jeu libre (Marc, 08/10) : le coach se réduit à un bouton flèche jaune, déplaçable. */
  #tuto-mini-btn{display:none}
  #tuto-coach.tuto-mini{width:54px!important;height:54px;padding:0;border-radius:50%;max-height:none;background:#ffd34d;overflow:hidden}
  #tuto-coach.tuto-mini #tuto-body,#tuto-coach.tuto-mini #tuto-title,#tuto-coach.tuto-mini #tuto-min{display:none!important}
  #tuto-coach.tuto-mini #tuto-head{margin:0;padding:0;border:0;width:100%;height:100%;justify-content:center}
  #tuto-coach.tuto-mini #tuto-mini-btn{display:block;width:100%;height:100%;padding:0;margin:0;border:0;border-radius:50%;background:#ffd34d;color:#1a1400;font-size:1.5em;font-weight:900;line-height:1;cursor:move}
  .tuto-inhibited{pointer-events:none!important;cursor:default!important}
  #top-bar.tuto-resflash{animation:tutoResFlash 1.1s ease}
  @keyframes tutoResFlash{0%,100%{box-shadow:none;transform:scale(1)}30%{box-shadow:0 0 26px 6px #ffd34d, inset 0 0 22px #ffd34d55;transform:scale(1.03)}}
  #tuto-cursor{position:fixed;left:50%;top:50%;z-index:2147483647;pointer-events:none;transition:left .62s cubic-bezier(.34,.02,.2,1),top .62s cubic-bezier(.34,.02,.2,1);will-change:left,top;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))}
  #tuto-cursor.click{animation:tutoClick .34s ease}
  @keyframes tutoClick{0%{transform:scale(1)}45%{transform:scale(.68)}100%{transform:scale(1)}}
  .tuto-clickring{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #ffd34d;border-radius:50%;transform:translate(-50%,-50%);animation:tutoRing .55s ease-out forwards}
  @keyframes tutoRing{0%{width:8px;height:8px;opacity:.9}100%{width:48px;height:48px;opacity:0}}
  `;
  document.head.appendChild(s);
}

/* ---------- coach (bulle principale) ---------- */
let _coachEl=null,_collapsed=false,_userMoved=false,_advTimer=null,_awaitCleanup=null;
function scheduleAdvance(delay){ clearTimeout(_advTimer); _advTimer=setTimeout(function(){ _advTimer=null; advance(); }, delay||220); }
function coach(stepLabel, html, opts){
  opts=opts||{};
  if(!_coachEl){ _coachEl=el('<div id="tuto-coach"></div>'); document.body.appendChild(_coachEl); makeDraggable(); }
  _coachEl.classList.remove('tuto-hidden'); // réapparaît (ex. après une cinématique d'achat)
  const nextTxt=opts.nextText||t('tuto.suivant','Suivant ▶');
  const backBtn = opts.noBack ? '' : '<button id="tuto-back" class="skip">'+t('tuto.retour','◀ Retour')+'</button>';
  const nextBtn = opts.noNext ? '' : '<button id="tuto-next">'+nextTxt+'</button>';
  _coachEl.innerHTML=
    '<div id="tuto-head"><button id="tuto-mini-btn" type="button" title="'+t('tuto.ouvrir','Ouvrir le tutoriel')+'">▲</button><span id="tuto-title">'+(stepLabel||'Tutoriel')+'</span>'+
      '<button id="tuto-min" title="'+t('tuto.reduire_agrandir','Réduire / agrandir')+'">'+(_collapsed?'+':'–')+'</button></div>'+
    '<div id="tuto-body"'+(_collapsed?' style="display:none"':'')+'>'+
      '<div class="tx">'+html+'</div>'+
      '<div class="go">'+backBtn+'<span class="hint">'+(opts.hint||'')+'</span>'+nextBtn+'</div>'+
    '</div>';
  const nx=$('tuto-next'); if(nx)nx.onclick=opts.onNext||(()=>advance());
  const bk=$('tuto-back'); if(bk)bk.onclick=()=>back();
  $('tuto-min').onclick=function(){ if(_free&&!_special){ setMini(true); } else toggleCollapse(); };
  _coachEl.classList.remove('tuto-hidden');
}
let _miniPos=null;
function setMini(on){
  if(!_coachEl)return;
  _coachEl.classList.toggle('tuto-mini',!!on);
  const st=_coachEl.style;
  if(on){
    if(_miniPos){ st.left=_miniPos.left; st.top=_miniPos.top; st.right='auto'; st.bottom='auto'; }
    else { st.left='auto'; st.top='56%'; st.right='8px'; st.bottom='auto'; }   // à mi-hauteur à droite : en bas, il couvrait « Tour suivant »
    st.transform='none';
  } else {
    st.left=''; st.right=''; st.transform=''; st.top='auto'; st.bottom='14px'; _userMoved=false;
  }
}
function toggleCollapse(){ _collapsed=!_collapsed; const b=$('tuto-body'); if(b)b.style.display=_collapsed?'none':''; const m=$('tuto-min'); if(m)m.textContent=_collapsed?'+':'–'; }
function back(){ if(_finished)return; clearTimeout(_advTimer); _advTimer=null; if(_free){_free=false; setMini(false);} _cur=Math.max(0,_cur-1); showStep(); }
function _pt(e){ const t=(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0]); return t?{x:t.clientX,y:t.clientY}:{x:e.clientX,y:e.clientY}; }
function makeDraggable(){
  const start=(e)=>{ if(!e.target.closest('#tuto-head')||e.target.id==='tuto-min')return;
    const p=_pt(e); const r=_coachEl.getBoundingClientRect(); const ox=p.x-r.left, oy=p.y-r.top;
    const mini=_coachEl.classList.contains('tuto-mini'); let bouge=false;
    const mv=(ev)=>{ const q=_pt(ev); if(Math.abs(q.x-p.x)+Math.abs(q.y-p.y)<6&&!bouge)return; bouge=true; _coachEl.style.left=(q.x-ox)+'px'; _coachEl.style.top=(q.y-oy)+'px'; _coachEl.style.right='auto'; _coachEl.style.bottom='auto'; _coachEl.style.transform='none'; if(mini)_miniPos={left:_coachEl.style.left,top:_coachEl.style.top}; else _userMoved=true; if(ev.cancelable)ev.preventDefault(); };
    const up=()=>{ if(mini&&!bouge)setMini(false); document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.removeEventListener('touchmove',mv); document.removeEventListener('touchend',up); };
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    document.addEventListener('touchmove',mv,{passive:false}); document.addEventListener('touchend',up);
    if(e.cancelable)e.preventDefault();
  };
  _coachEl.addEventListener('mousedown',start); _coachEl.addEventListener('touchstart',start,{passive:false});
}
// Positionne la bulle À L'OPPOSÉ de l'élément expliqué (jamais le cacher, et laisse la barre du bas cliquable).
function positionCoach(glowId, pos){
  if(!_coachEl||_userMoved)return; // l'utilisateur a déplacé la fenêtre → on respecte sa position
  let putTop=true; // défaut : en haut → la barre du bas (Coloniser, techs…) reste cliquable
  const isModal = glowId && /modal/i.test(glowId);
  /* Une FENÊTRE du jeu (agenda, événement, stratégie, découverte, jeton de route…) est centrée :
     un coach posé en haut la recouvrait entièrement — « c'est la fenêtre affichée », disait-il, sans
     qu'on puisse la lire (vu sur écran étroit, 07/09). Pour une fenêtre, le coach va EN BAS et ne
     dépasse pas la moitié de l'écran : le contenu reste lisible, et le bouton du coach fait ce que
     ferait celui de la fenêtre. */
  if(isModal){ _coachEl.style.top='auto'; _coachEl.style.bottom='14px'; return; }
  if(pos!=='top' && glowId && !isModal){ const t=$(glowId);
    if(t){ const r=t.getBoundingClientRect();
      if(r.width<1||r.height<1) putTop=true; // cible cachée (ex. bouton d'action pas encore visible) → bulle en haut
      else putTop=(r.top+r.height/2)>(window.innerHeight/2); } } // cible en bas → bulle en haut
  if(putTop){ const tb=$('top-bar'); const off=(tb?Math.round(tb.getBoundingClientRect().bottom):40)+8;
    _coachEl.style.top=off+'px'; _coachEl.style.bottom='auto'; }
  else { _coachEl.style.top='auto'; _coachEl.style.bottom='14px'; }
}
/* Confirmations "faites par le coach" : le bouton du tuto exécute la validation du VRAI jeu
   (sinon le jeu reste bloqué en attente de son propre bouton, parfois masqué par la bulle). */
function confirmAgenda(){
  const m=$('agenda-sel-modal'); if(!m||m.classList.contains('hidden'))return;
  try{ if(window.confirmAgendaChoice)window.confirmAgendaChoice(); }catch(e){}
  if(!m.classList.contains('hidden')){ const o=m.querySelector('.agsel-ag'); if(o){ o.click(); try{ if(window.confirmAgendaChoice)window.confirmAgendaChoice(); }catch(e){} } }
}
function confirmStrategy(){
  const m=$('strategy-modal'); if(!m||m.classList.contains('hidden'))return;
  const o=m.querySelector('.strat-opt'); if(o)o.click();
}
/* Avant de finir le tour, on range ce que l'étape « Essaie » a pu laisser ouvert : la tuile
   Découverte d'une colonisation, et une action encore en attente de ✓ (sinon le bilan s'ouvrait
   par-dessus la découverte, et l'action non validée restait annulable — vu au banc, 07/09). */
function rangerAvantFinDeTour(){
  try{ const m=$('discovery-modal'); if(m&&!m.classList.contains('hidden')&&window.dismissDiscovery)window.dismissDiscovery(); }catch(e){}
  try{ const c=$('sc-confirm'); if(c&&c.classList.contains('show')&&window.scConfirmValidate)window.scConfirmValidate(); }catch(e){}
  try{ const r=$('sc-ability-reminder'); if(r&&window._scAbilityReminderSkip)window._scAbilityReminderSkip(); }catch(e){}
}
function confirmEndTurn(){ rangerAvantFinDeTour(); try{ if(window.endTurn)window.endTurn(); }catch(e){} } // le bouton « Fin de tour » n'existe plus → on termine le tour directement
function confirmEOT(){ rangerAvantFinDeTour(); try{ if(window.continueAfterEOT)window.continueAfterEOT(); }catch(e){} }
function confirmEventAnnounce(){ const m=$('event-announce-modal'); if(m && !m.classList.contains('hidden')){ try{ if(window.dismissEventAnnounce)window.dismissEventAnnounce(); }catch(e){} } }
function confirmDiscovery(){ const m=$('discovery-modal'); if(m && !m.classList.contains('hidden')){ try{ if(window.dismissDiscovery)window.dismissDiscovery(); }catch(e){} } }
function confirmRouteTokenDefault(){
  const m=$('route-token-modal');
  if(m && !m.classList.contains('hidden')){ try{ if(window.confirmRouteToken)window.confirmRouteToken(true); }catch(e){} }
  else { scheduleAdvance(50); } // pas de fenêtre (route non tracée) → on avance quand même
}
// La route est créée AVANT le choix du jeton → on avance vers l'étape "protéger" quand la fenêtre du jeton s'ouvre.
function routeCreatedAdvance(){ if(_finished||_free)return; const s=STEPS[_cur]; if(s && s.sync==='route'){ scheduleAdvance(220); } }
// Boost du tour 1 (appliqué APRÈS startTurn) : 5 AC + ressources au max, pour tout essayer sans manquer.
function boostForTutorial(){
  const g=G(); if(!g||!g.player)return;
  g.player.acMax=Math.max(5,g.player.acMax||2); g.player.acLeft=Math.max(5,g.player.acLeft||0);
  g.player.res.energy=12; g.player.res.materials=20; g.player.res.science=10; g.player.res.morale=10;
  g.player.forceTokens=Math.max(g.player.forceTokens||0,8);
  try{ if(window.render)window.render(); }catch(e){}
}
/* ---------- CINÉMATIQUE tech/civique/militaire : le tuto joue, le joueur regarde ---------- */
// Boost généreux pour que TOUS les achats de la démo réussissent et que les décomptes restent visibles.
function boostMaxCine(){
  const g=G(); if(!g||!g.player)return;
  g.player.acMax=Math.max(20,g.player.acMax||2); g.player.acLeft=20;
  g.player.res.energy=30; g.player.res.materials=40; g.player.res.science=20; g.player.res.morale=10;
  g.player.forceTokens=Math.max(g.player.forceTokens||0,12);
  try{ if(window.render)window.render(); }catch(e){}
}
// Flash doré sur la barre de ressources pour bien VOIR le décompte à chaque achat.
function flashRes(){ const t=$('top-bar'); if(t){ t.classList.remove('tuto-resflash'); void t.offsetWidth; t.classList.add('tuto-resflash'); } }
// Achat piloté par le tuto, idempotent (ne rachète pas si on revient en arrière).
const _cineDone={};
function cineBuy(fn,id){
  const g=G(); if(g&&g.player&&g.player.acLeft<6)g.player.acLeft=8; // garantit l'AC pour la démo
  if(!_cineDone[id]){ _cineDone[id]=1; try{ if(typeof window[fn]==='function')window[fn](id); }catch(e){ console.error('[TUTO cineBuy]',fn,id,e); } }
  flashRes();
}
// Fin de l'entraînement : AC à la normale (2) et ressources au niveau de départ de la nation.
function resetToNormal(){
  const g=G(); if(!g||!g.player)return;
  const start=(g.player.civ&&g.player.civ.start)?g.player.civ.start:{energy:2,materials:6,science:3,morale:5};
  g.player.res={...start};
  g.player.acMax=2; g.player.acLeft=2;
  try{ if(window.uiTab)window.uiTab('map'); }catch(e){}   /* fin des démos de l'arbre : retour à la carte pour la suite */
  /* Le Sénat acheté pendant la démo avait monté le gouvernement : dès le tour 2 le joueur avait 5 AC
     alors que le coach venait de dire « je remets tes AC à 2 ». On remet aussi le gouvernement à zéro. */
  g.player.govPermPts=0; g.player.govFormPts=0; g.player.govForm=null; g.player.govFormAC=0; g.player.govFormMorale=0; g.player.govFormUpkeep=null;
  try{ if(window.recomputeGov)window.recomputeGov(g.player); }catch(e){}
  try{ if(window.render)window.render(); }catch(e){}
}
// Simule qu'une AUTRE nation a acheté la T1 d'une branche (déblocage global = pillage scientifique).
function simUnlock(branch){ const g=G(); if(!g)return; g.branchTiers=g.branchTiers||{}; g.branchTiers[branch]=Math.max(g.branchTiers[branch]||0,1); try{ if(window.render)window.render(); }catch(e){} }

/* ---------- Fenêtres spéciales : on affiche les VRAIES fenêtres du jeu (avec un contenu d'illustration) ---------- */
// « Mode neutre » : ferme TOUTES les fenêtres spéciales et de transition de tour (pour ne rien laisser bloquer l'écran).
function hideAllSpecialModals(){
  try{ _rendreCroiseur(); }catch(e){}
  ['forced-war-modal','war-modal','war-combat-modal',
   'invest-modal','invest2-modal','invest-active-modal','eot-modal','strategy-modal','event-modal','event-announce-modal','agenda-sel-modal','discovery-modal','route-token-modal'
  ].forEach(function(id){ const m=$(id); if(m)m.classList.add('hidden'); });
  const pm=$('peace-modal'); if(pm){ pm.classList.add('hidden'); pm.style.display='none'; }
  const ec=$('event-choice-modal'); if(ec)ec.style.display='none';
  ['sc-attack-notice','sc-ability-reminder','sc-stuck','calm-overlay'].forEach(function(id){ const e=$(id); if(e)e.remove(); });
}
function demoPanel(tab){ try{ if(window.uiTab)uiTab(tab); }catch(e){ console.error('[TUTO panel]',tab,e); } }
// Affiche la vraie fenêtre d'investissement (réutilise celle du jeu si déjà peuplée, sinon la (ré)ouvre).
let _demoOuverture=false;
function demoInvest(){
  const m=$('invest-modal'), opts=$('inv-opts');
  if(m && opts && opts.children && opts.children.length){ m.classList.remove('hidden'); return; }
  _demoOuverture=true;
  try{ if(window.showInvestmentModal)window.showInvestmentModal(); }catch(e){ console.error('[TUTO invest]',e); }
  _demoOuverture=false;
}
// Guerre populaire forcée (tension 10) : on peuple la vraie fenêtre avec un contenu d'illustration (boutons inertes).
function demoForcedWar(){
  const d=$('fw-desc'), c=$('fw-choices'), m=$('forced-war-modal');
  if(d)d.innerHTML=t('tuto.tension_atteint_10_envers_nation_populat','Ta <b>tension</b> a atteint <b>10</b> envers une nation : ta population <b>exige</b> la guerre. Tu dois frapper une de ses <b>routes</b> ou <b>colonies</b> maintenant — tu ne peux pas l\'éviter, sauf à <b>payer</b> pour l\'apaiser.');
  if(c)c.innerHTML=t('tuto.attaquer_route_attaquer_colonie_exiger_p','<button class="fw-btn" style="padding:8px;background:#2a0a0a;border:1px solid #a44;color:#f99;border-radius:6px">🛤️ Attaquer une route</button><button class="fw-btn" style="padding:8px;background:#2a0a0a;border:1px solid #a44;color:#f99;border-radius:6px">🏙️ Attaquer une colonie</button><button class="fw-btn" style="padding:8px;background:#0a2a1a;border:1px solid #4b8;color:#9fa;border-radius:6px">🕊️ Exiger la paix (payer)</button>');
  if(m){ m.style.display='flex'; m.classList.remove('hidden'); }
}
// Guerre déclarée par une IA (riposte) — fenêtre de résultat, contenu texte (sûr).
function demoWarDeclared(){
  try{ if(window.showWarModal)window.showWarModal(t('combat.guerre_declaree','⚔️ Guerre Déclarée !'),
    t('tuto.nation_rivale_declare_guerre_souvent_apr','Une nation rivale <b>t\'a déclaré la guerre</b> (souvent après une provocation ou un refus d\'accord).<br><br><em>C\'est elle l\'agresseur : elle frappe <b>maintenant</b> — prépare ta <b>défense</b>. Tu pourras <b>riposter à ton tour</b>.</em>'), null); }catch(e){ console.error('[TUTO warDecl]',e); }
}
// Assaut de colonie — combat résolu IMMÉDIATEMENT (fenêtre de résultat, sûr).
/* La VRAIE fenêtre d'assaut d'une colonie (Marc, 09/10 : « elle n'existe pas dans le jeu ») : le curseur des jetons
   engagés, et la case du Supercroiseur — prêté le temps de l'illustration, rendu à la fenêtre suivante. */
let _cruPrete=null;
function _rendreCroiseur(){ const g=G(); if(_cruPrete&&g&&g.player){ g.player.hasCruiser=_cruPrete.has; g.player.cruiserCooldown=_cruPrete.cd; } _cruPrete=null; }
function demoAssault(){
  const g=G(); if(!g||!g.player)return;
  const p=g.player;
  p.forceTokens=Math.max(p.forceTokens||0,6);
  p.res.materials=Math.max(p.res.materials||0,10); p.res.energy=Math.max(p.res.energy||0,10);
  if(!_cruPrete){ _cruPrete={has:p.hasCruiser,cd:p.cruiserCooldown}; p.hasCruiser=true; p.cruiserCooldown=0; }
  try{
    const ai=(g.ais||[])[0];
    const col=ai?((ai.colonies||[]).find(c=>c.nodeId!==ai.civ.home)||{nodeId:ai.civ.home}).nodeId:null;
    if(window.showWarCombatModal)window.showWarCombatModal(function(){});
    _warAttackColonyTarget=col;
    if(typeof _warShowAttackSlider==='function')_warShowAttackSlider();
  }catch(e){ console.error('[TUTO assault]',e); }
}
// Négociation de paix — la VRAIE fenêtre (retombe sur la 1re IA si pas de guerre active).
function demoPeace(){
  const g=G(); if(!g)return;
  g._warDeclaredBy='other'; g._warDeclareReason=t('tuto.tension_atteint_comble','La tension a atteint son comble.');
  try{ if(window.showPeaceOfferModal)window.showPeaceOfferModal(true, function(){}); }catch(e){ console.error('[TUTO peace]',e); }
}
// Fenêtre de combat — la VRAIE (retombe sur la 1re IA). On donne quelques jetons pour une belle illustration.
function demoCombat(){
  const g=G(); if(!g||!g.player)return;
  g.player.forceTokens=Math.max(g.player.forceTokens||0,6);
  try{ if(window.showWarCombatModal)window.showWarCombatModal(function(){}); }catch(e){ console.error('[TUTO combat]',e); }
}
// Retrouve la carte (tech/civique/gouv/militaire) dans le DOM via son onclick (les cartes n'ont pas d'id).
function findCardEl(id){
  return document.querySelector('[onclick*="showTechDetail(\''+id+'\')"]')
      || document.querySelector('[onclick*="showGeneralDetail(\''+id+'\')"]')
      || document.querySelector('[onclick*="showMarketDetail(\''+id+'\')"]');
}
function openDetail(kind,id){
  try{
    if(kind==='market' && window.showMarketDetail) window.showMarketDetail(id);
    else if(kind==='gen' && window.showGeneralDetail) window.showGeneralDetail(id);
    else if(window.showTechDetail) window.showTechDetail(id);
  }catch(e){ console.error('[TUTO openDetail]',kind,id,e); }
}
function cineClickBuy(){ try{ if(window.doBuyFromDetail)window.doBuyFromDetail(); }catch(e){ console.error('[TUTO buy]',e); } flashRes(); }
// ── Curseur simulé (une souris qu'on voit bouger et cliquer) ──
let _cursorEl=null;
function ensureCursor(){
  if(!_cursorEl){
    _cursorEl=el('<div id="tuto-cursor"></div>');
    _cursorEl.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.8 L12 14 L19 14 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.body.appendChild(_cursorEl);
  }
  _cursorEl.style.display='block'; return _cursorEl;
}
function hideCursor(){ if(_cursorEl)_cursorEl.style.display='none'; }
function _center(elm){ const r=elm.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; }
// Renvoie le 1er élément RÉELLEMENT visible (rect non nul) — évite les doublons cachés / rect (0,0).
function pickVisible(sel){
  const els=document.querySelectorAll(sel);
  for(const e of els){ const r=e.getBoundingClientRect(); if(r.width>2&&r.height>2&&r.bottom>0&&r.top<(window.innerHeight||900)) return e; }
  return els[0]||null;
}
function moveCursorTo(elm, cb, delay){
  ensureCursor();
  if(elm){ const r=elm.getBoundingClientRect(); if(r.width>1&&r.height>1){ _cursorEl.style.left=(r.left+r.width/2)+'px'; _cursorEl.style.top=(r.top+r.height/2)+'px'; } } // rect dégénéré → on ne saute PAS en (0,0)
  setTimeout(cb||function(){}, delay||720);
}
// Démo de défilement : je fais glisser la rivière à travers les sections (programmatique → toujours fiable, pas de calibrage).
function runRiverDemo(cb){
  const secs=[['sec-civ',1400],['sec-mil',1400],['top',1200]];
  let i=0;
  (function step(){
    if(i>=secs.length){ if(cb)cb(); return; }
    const sec=secs[i][0], wait=secs[i][1]; i++;
    tutoRiviere(sec);
    setTimeout(step, wait);
  })();
}
/* Les trois familles de cartes sont TROIS RIVIÈRES distinctes depuis le 2026-08-07 : faire défiler
   vers une ancre ne suffit plus, il faut CHANGER DE PAGE. On garde `techScrollTo` en second temps
   pour amener la carte à l'écran à l'intérieur de la rivière choisie. */
function tutoRiviere(sec){
  const nom = sec==='sec-civ' ? 'civ' : sec==='sec-mil' ? 'mil' : 'tech';
  /* 06/10 (appli) : sans l'onglet Techs ouvert, la démo se jouait derrière la carte — « Trois rivières de
     cartes » s'affichait sur le système solaire si l'élève avait cliqué Suivant au lieu de l'onglet. */
  try{ if(window.uiTab)window.uiTab('tech'); }catch(e){}
  try{ if(window.techRiviere)window.techRiviere(nom); }catch(e){}
  try{ if(window.techScrollTo)window.techScrollTo(sec); }catch(e){}
}
function cursorClick(elm, cb, hold){
  if(_cursorEl){ _cursorEl.classList.remove('click'); void _cursorEl.offsetWidth; _cursorEl.classList.add('click'); }
  if(elm){ const p=_center(elm); const ring=el('<div class="tuto-clickring"></div>'); ring.style.left=p.x+'px'; ring.style.top=p.y+'px'; document.body.appendChild(ring); setTimeout(function(){ring.remove();},560); }
  setTimeout(cb||function(){}, hold||340);
}
// Cinématique d'un achat, façon "humain" : curseur → onglet (la rivière défile) → carte → ouverture du détail →
// on descend voir le COÛT et on s'arrête un moment → curseur → bouton Acheter → clic. Lent et bien visible.
function cineDemo(kind,id,cb){
  if(_cineDone[id]){ if(cb)cb(); return; }          // déjà joué (retour arrière) → on ne rejoue pas, juste le coach
  _cineDone[id]=1;
  const g=G(); if(g&&g.player&&g.player.acLeft<6)g.player.acLeft=8; // garantit l'AC pour la démo
  hideCoach();
  const sec = kind==='market'?'sec-civ':kind==='gen'?'sec-mil':'top';
  // 1. on ouvre la BONNE RIVIÈRE (trois pages distinctes), puis on y fait défiler jusqu'à la carte
  tutoRiviere(sec);
  setTimeout(function(){
    const card=findCardEl(id); if(card)card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(function(){
      const card2=findCardEl(id);
      // 2. curseur → carte, clic → ouverture du détail
      moveCursorTo(card2, function(){
        cursorClick(card2, function(){
          openDetail(kind,id);
          // 3. on descend dans la fiche pour VOIR le coût, et on reste un moment
          setTimeout(function(){
            const dc=$('td-card'); if(dc)dc.scrollTo({top:dc.scrollHeight,behavior:'smooth'});
            const dm=$('tech-detail-modal'); if(dm)dm.scrollTo({top:dm.scrollHeight,behavior:'smooth'});
          }, 550);
          // 4. curseur → bouton Acheter (le coût est resté visible ~2 s), clic → achat
          setTimeout(function(){
            const btn=$('td-buy-btn');
            moveCursorTo(btn, function(){
              if(btn)btn.classList.add('tuto-glow');
              cursorClick(btn, function(){
                if(btn)btn.classList.remove('tuto-glow');
                cineClickBuy();
                setTimeout(function(){ hideCursor(); if(cb)cb(); }, 750); // 5. le coach jaune réapparaît
              }, 360);
            }, 720);
          }, 2100);
        }, 360);
      }, 780);
    }, 820);
  }, 900);
}
function hideCoach(){ if(_coachEl)_coachEl.classList.add('tuto-hidden'); }
function note(html){ let n=$('tuto-note'); if(!n){ n=el('<div id="tuto-note"></div>'); document.body.appendChild(n); } n.innerHTML=html; n.classList.add('show'); clearTimeout(n._h); n._h=setTimeout(()=>n.classList.remove('show'),4200); }

/* ---------- surbrillance ---------- */
let _glowEl=null;
function clearGlow(){ if(_glowEl){ _glowEl.classList.remove('tuto-glow'); _glowEl=null; } }
function glow(id){ clearGlow(); const e=$(id); if(e){ e.classList.add('tuto-glow'); _glowEl=e; } }
// Inhibition des boutons de VALIDATION du jeu : seul le bouton du tuto (ou un clic de CHOIX) valide → plus de désync.
function unInhibit(){ document.querySelectorAll('.tuto-inhibited').forEach(e=>e.classList.remove('tuto-inhibited')); }
function inhibit(sels){ if(!sels)return; sels.forEach(function(sel){ try{ document.querySelectorAll(sel).forEach(function(e){ e.classList.add('tuto-inhibited'); }); }catch(e){} }); }

/* ============================================================
   SÉQUENCE PRINCIPALE (tour 1, guidée)
   Chaque étape : {lab, tx, glow?, trig? (emoji d'action qui fait avancer)}
   ============================================================ */
const STEPS=[
 {lab:t('tuto.but','Le but'),
  tx:t('tuto.10_tours_marque_points_victoire_vp_te_gu','En <b>10 tours</b>, colonise, crée des routes commerciales, achète des technologies, anticipe les mouvements des autres nations, conquiers ou déclare la guerre. Celui qui marque le plus de <b>points de victoire (VP)</b> gagne. Je te guide sur les premiers tours.')},

 {lab:t('tuto.lab_agenda','Agenda secret'), glow:'agenda-sel-modal', pos:'top', confirm:confirmAgenda, sync:'agenda',
  tx:t('tuto.agenda_secret_objectif_cache_rapporte_vp','Des <b>agendas secrets</b> sont présentés au début de la partie : celui que tu choisis sera un objectif secret qui guidera ta stratégie et te rapportera des points de victoire à la fin. <b>Clique un agenda</b>, puis <b>Valider et continuer</b>.'),
  hint:t('tuto.choisis_puis_valider','Choisis, puis Valider')},

 /* ⚠️ ORDRE : l'ANNONCE D'ÉVÉNEMENT vient AVANT le tirage de la carte Stratégie depuis la v4.8 —
    c'est volontaire (connaître l'événement à venir donne son intérêt au choix de la carte).
    Les deux étapes ont donc été interverties. Contrôlé par `node server/tutorial-sync.js`. */
 {lab:t('web.evenements','Événements'), glow:'event-announce-modal', confirm:confirmEventAnnounce, sync:'event',
  tx:t('tuto.evenement_tombe_fin_tours_2_4_6_8_annonc','Tous les deux tours, un <b>événement</b> tiré au hasard a lieu. Il t\'est <b>annoncé un tour à l\'avance</b> — c\'est la fenêtre derrière moi. Parfois c\'est une menace, mais souvent c\'est une occasion de marquer des points de victoire supplémentaires. Tu n\'es pas obligé de t\'y conformer, mais tu passes à côté de ces points. Quand tu as fini de le lire, clique sur <b>Valider et continuer</b>.'),
  hint:t('tuto.lis_puis_valider','Lis, puis Valider')},

 {lab:t('web.carte_strategie','Carte Stratégie'), glow:'strategy-modal', pos:'top', confirm:confirmStrategy, sync:'strategy',
  tx:t('tuto.carte_strategie_tour_bonus_immediat_ress','Une <b>carte Stratégie</b> par tour : un bonus immédiat (ressources, AC, ordre du tour, jetons militaires, actes diplomatiques, actions gratuites…). Le joueur le plus faible en VP et en jetons militaires choisit en premier, dans une sélection tirée au hasard selon le nombre de nations en jeu. <b>Clique une carte</b> — le tour démarre.'),
  hint:t('tuto.choisis_carte','Choisis une carte')},

 {lab:t('tuto.ressources','Tes ressources'), glow:'top-bar', onShow:boostForTutorial,
  tx:t('tuto.haut_energie_materiaux_savoir_moral_ac_a','En haut : ⚡ énergie, 🪨 matériaux, 🔬 savoir, ❤️ moral, tes <b>AC</b> (actions du tour) et tes <b>🏆 VP</b>. Chaque action coûte des AC et des ressources.<br><i>Pour t\'entraîner, je te donne <b>5 AC</b> et des ressources en abondance.</i>')},

 {lab:t('tuto.carte_systeme_solaire','La carte du système solaire'), glow:'game-wrap',
  tx:t('tuto.voici_systeme_solaire_touche_planete_ouv','Voici le système solaire. <b>Touche une planète</b> pour ouvrir le plateau tactique à son emplacement : le Soleil en bas à gauche, chaque corps à sa distance, les lunes autour de leur planète. C\'est là que tu poses colonies et routes. Le bouton <b>← Carte</b> te ramène à la vue d\'ensemble du système solaire. En haut à droite, tu peux <b>zoomer</b>, et retirer les détails d\'ambiance en touchant la <b>flèche ondulée jaune</b>.'),
  hint:t('tuto.regarde_puis_suivant','Regarde, puis Suivant')},

 {lab:t('tuto.lab_coloniser','Coloniser'), glow:'btn-col', pos:'top', trig:'🏗️',
  tx:t('tuto.clique_lune_ou_asteroide_voisin_capitale','<b>Clique une lune ou un astéroïde voisin</b> de ta capitale, puis <b>🏗️ Coloniser</b> dans sa fiche.'),
  hint:t('tuto.colonise_ou_suivant','Colonise (ou Suivant)')},

 {lab:t('tuto.tuile_decouverte','Tuile Découverte'), glow:'discovery-modal', confirm:confirmDiscovery, sync:'discovery',
  tx:t('tuto.chaque_nouvelle_colonie_tire_tuile_decou','Chaque nouvelle colonie tire une <b>tuile Découverte</b> : ressources, jetons Force, bonus permanent, VP… ou rien. Regarde ce que tu as gagné, puis sélectionne <b>Valider et continuer</b>.'),
  hint:t('tuto.regarde_puis_valider','Regarde, puis Valider')},

 {lab:t('tuto.relier_route','Relier par une route'), glow:'btn-route', pos:'top', sync:'route',
  tx:t('tuto.colonie_isolee_rapporte_rien_faut_chaine','Une colonie <b>isolée ne rapporte rien</b> : il faut une chaîne de routes jusqu\'à ta capitale. Clique <b>🛤️ Route</b> (ou le <b>+</b> entre deux colonies sur la carte).'),
  hint:t('tuto.trace_route','Trace une route')},

 {lab:t('tuto.proteger_route','Protéger la route'), glow:'route-token-modal', requireChoice:'route-token-modal', sync:'routetoken',
  tx:t('tuto.jeton_route_pirates_v2','<b>Déploie un jeton</b> pour mieux protéger ta route commerciale. <b>Laisse-la non protégée</b> si tu veux conserver tes jetons militaires, ou si tu n\'as pas besoin de protéger tes routes : c\'est le cas du Ceinturien, ou si tu as acquis <b>IA Défensive</b>, <b>Réseau Orbital</b> ou <b>Liens Empathes</b>. <b>Choisis dans la fenêtre.</b>'),
  hint:t('tuto.choisis_option','Choisis une option')},

 {lab:t('tuto.pirates','Les pirates'),
  tx:t('tuto.pirates_v2','Les <b>pirates</b> vivent dans la ceinture principale, entre Mars et Jupiter, et dans la ceinture de Kuiper, qui commence après Triton. Au début de chaque tour, chaque route à <b>60 jours ou moins</b> d\'une ceinture risque d\'être pillée : <b>70 %</b> de chances sans jeton, <b>30 %</b> avec. S\'ils réussissent, ils volent 1 ressource (⚡, 🪨 ou 🔬) ; la route n\'est pas perdue. Les Ceinturiens sont épargnés.'),
  hint:t('tuto.hint_suivant','Suivant')},

 {lab:t('tuto.ameliorer','Améliorer'), glow:'game-wrap', pos:'top', trig:'⬆️',
  tx:t('tuto.colonie_reliee_peut_monter_niveau_clique','Une colonie <b>reliée</b> peut monter de niveau : <b>clique-la</b>, puis <b>« Niv.2 »</b> dans sa fiche. Niveau 2 = revenus ×1,5.'),
  hint:t('tuto.clique_niv_2_ou_suivant','Clique « Niv.2 » (ou Suivant)')},

 // ═══════ CINÉMATIQUE : arbre technologique (le tuto joue, tu regardes) ═══════
 {lab:t('tuto.technologies','Les technologies'), glow:'m-tabs', awaitClick:'.mtab[data-tab="tech"]', onShow:boostMaxCine,   /* 06/10 : #tech-tabs est caché tant que le panneau Techs est fermé (appli) — on attend le clic sur l'onglet du bas, comme pour Empire */
  tx:t('tuto.passons_technologies_clique_onglet_techs','Passons aux <b>technologies</b>. <b>Clique l\'onglet Techs</b> en bas : je prends la main ensuite. (AC et ressources au maximum pour la démo.)'),
  hint:t('tuto.clique_onglet_techs','Clique l\'onglet Techs')},

 {lab:t('tuto.3_onglets','Les 3 onglets'), glow:'tech-tabs', riverdemo:true,
  tx:t('tuto.trois_rivieres_cartes_techs_bonus_perman','Trois rivières de cartes :<br>• <b style="color:#5aa0e8">Techs</b> — bonus permanents et VP ;<br>• <b style="color:#8bc34a">Éco&Soc</b> (économie et société) — moral, savoir, tension, gouvernement ;<br>• <b style="color:#e87a7a">A. Milit.</b> (actions militaires) — jetons Force.<br>Regarde-moi acheter : <b>Suivant</b> à chaque étape.')},

 {lab:t('tuto.acheter_tech_niveau_1','Acheter une tech (niveau 1)'), glow:'tech-tabs', demo:{kind:'tech',id:'prop1'},
  tx:t('tuto.j_ai_ouvert_propulsion_ionique_niveau_1','J\'ai ouvert <b>Propulsion Ionique</b> (niveau 1, branche Navigation) et cliqué <b>Acheter</b> : <b>1 AC</b> + ressources, décomptés en haut. Le bénéfice d\'une tech est immédiat. Une fois achetée, elle est <b>à toi pour toujours</b>.')},

 {lab:t('tuto.lab_tech2','Tech niveau 2'), glow:'tech-tabs', demo:{kind:'tech',id:'nav2'},
  tx:t('tuto.niveau_2_ia_navigation_exige_niveau_1_me','Le <b>niveau 2</b> (IA de Navigation) exige le <b>niveau 1</b> de la même branche. 1 AC + ressources.')},

 {lab:t('tuto.lab_tech3','Tech niveau 3'), glow:'tech-tabs', demo:{kind:'tech',id:'hyper3'},
  tx:t('tuto.niveau_3_hyperpropulsion_exige_niveau_2','Le <b>niveau 3</b> (Hyperpropulsion) exige le niveau 2 et coûte <b>2 AC</b>. Chaque palier ouvre le suivant.')},

 {lab:t('tuto.pillage_scientifique','Le pillage scientifique'), glow:'tech-tabs', onShow:function(){simUnlock('expansion');},
  tx:t('tuto.si_autre_nation_possede_niveau_1_branche','Si une <b>autre nation</b> possède le niveau 1 d\'une branche, son <b>niveau 2</b> t\'est ouvert <b>sans acheter le 1</b>. Je viens de le simuler sur la branche <b>Expansion</b>.')},

 {lab:t('tuto.lab_t2_direct','T2 accessible directement'), glow:'tech-tabs', demo:{kind:'tech',id:'bio2'},
  tx:t('tuto.j_achete_donc_directement_biosphere_avan','J\'achète donc <b>directement</b> Biosphère Avancée (niveau 2) sans son niveau 1.')},

 {lab:t('tuto.mais_t3_exige_t2','Mais la T3 exige TA T2'), glow:'tech-tabs',
  tx:t('tuto.limite_niveau_3_exige_toujours_niveau_2','Limite : le <b>niveau 3</b> exige toujours <b>ton</b> niveau 2. Le pillage n\'ouvre jamais un niveau 3.')},

 {lab:t('tuto.recap_technos','Récap technos'), glow:'tech-tabs',
  tx:t('tuto.retenir_1_2_3_dans_ordre_niveau_2_branch','À retenir : <b>1 → 2 → 3</b> dans l\'ordre ; le niveau 2 d\'une branche est ouvert dès qu\'une nation a le 1 ; le 3 exige ton 2. Le <b>niveau 3 est exclusif</b> : aucune autre nation ne peut te le copier, sauf grâce à l\'investissement <b>Espionnage</b> ou à la technologie <b>Télépathie</b>.')},

 // ─── Actions civiles + gouvernement ───
 {lab:t('tuto.lab_civiles','Éco&Soc'), glow:'tech-tabs', demo:{kind:'market',id:'cm_culture'},
  tx:t('tuto.actions_civiles_vert_j_achete_campagne_c','<b>Éco&Soc</b> (vert) : j\'achète <b>Campagne Culturelle</b> (+3 ❤️). Ces cartes donnent du moral, du savoir, ou apaisent la tension. La plupart : <b>une fois par partie</b>.')},

 {lab:t('tuto.lab_gouv','Action gouvernementale'), glow:'tech-tabs', demo:{kind:'market',id:'gov_senat'},
  tx:t('tuto.j_achete_senat_solaire_points_gouverneme','J\'achète le <b>Sénat Solaire</b> : des <b>points de Gouvernement</b>.')},

 {lab:t('tuto.facteur_gouvernement','Le facteur Gouvernement'), glow:'top-bar',
  tx:t('tuto.gouvernement_5_points_niveau_2_10_3_15_4','<b>Gouvernement</b> : 5 points → niveau 2, 10 → 3, 15 → 4. Chaque niveau = <b>+1 AC par tour</b>. Certains gouvernements plafonnent le moral, comme <b>Tyrannie</b> ou <b>Domination des Corporations</b>. Attention aux bonus de certains événements, qui récompensent le bon moral de ta population.')},

 // ─── Actions militaires ───
 {lab:t('tuto.lab_militaires','A. Milit.'), glow:'tech-tabs', demo:{kind:'gen',id:'mil_invest'},
  tx:t('tuto.actions_militaires_rouge_j_achete_invest','<b>A. Milit.</b> (rouge) : j\'achète <b>Investissements militaires</b> (+2 jetons Force). Attention : 2 cartes sur 4 ont un effet temporaire — leurs jetons partent <b>au début du tour suivant</b>. Seul le <b>Supercroiseur</b> est permanent, et les <b>Flottes de Chasseurs</b> sont réduites de moitié après un tour.')},

 {lab:t('tuto.couts_achat_vs_chaque_tour','Coûts : à l\'achat vs chaque tour'), glow:'top-bar',
  tx:t('tuto.cartes_perdent_mais_certaines_ex_democra','Les cartes ne se perdent pas, mais certaines (ex. Démocratie Instantanée) coûtent <b>chaque tour</b>. Lis le coût avant d\'acheter.')},

 {lab:t('tuto.toi_jouer_technos','À toi de jouer les technos !'), glow:'tech-tabs', onShow:boostMaxCine,
  tx:t('tuto.toi_ouvre_carte_achete_veux_puis_suivant','À toi : ouvre une carte et <b>achète</b> ce que tu veux. Ne clique pas sur <b>Suivant</b> tant que tu ne t\'es pas un peu amusé.'),
  hint:t('tuto.essaie_puis_suivant','Essaie, puis Suivant')},

 // ─── Fin de l'entraînement : retour à la normale + règles AC / gouvernement / moral ───
 {lab:t('tuto.cout_actions','Coût des actions'), glow:'top-bar', onShow:resetToNormal,
  tx:t('tuto.fin_entrainement_remets_ac_2_gouvernemen','Fin de l\'entraînement : je remets tes <b>AC à 2</b>, ton gouvernement et tes ressources <b>au départ</b>.<br><br>Règle : chaque action coûte <b>1 AC ou plus</b> et des ressources, sauf le <b>pouvoir gratuit</b> de ta nation, qui coûte des ressources ou rien du tout.')},

 {lab:t('tuto.gouvernement_actions','Gouvernement → plus d\'actions'), glow:'top-bar',
  tx:t('tuto.terrien_monte_vite_gouvernement_grace_di','Le Terrien monte vite en gouvernement grâce à <b>Diplomatie Verte</b> : +3 points, 0 AC, 3 🪨. À 15 points, <b>5 AC par tour</b>.')},

 {lab:t('tuto.moral','Le moral'), glow:'top-bar',
  tx:t('tuto.moral_1_revenus_2_0_revenus_remonte_avec','<b>Moral ❤️ à 1</b> : revenus <b>÷ 2</b>.<br><b>Moral à 0</b> : aucun revenu.<br>Ton moral remonte avec les techs Spiritualité, les cartes Éco&Soc, les colonies améliorées.')},

 {lab:t('tuto.lab_pouvoir','Pouvoir gratuit'), glow:'btn-ability', pos:'top', trig:'💫',
  tx:t('tuto.chaque_nation_pouvoir_gratuit_0_ac_1_tou','Chaque nation a un <b>pouvoir gratuit</b> (0 AC, 1×/tour) :<br><span class="nat-e">🌍</span> <b>Diplomatie Verte</b><br><span class="nat-e">🔴</span> <b>Surtension</b> (+1 AC)<br><span class="nat-e">🟣</span> <b>Commerce avec les pirates</b><br><span class="nat-e">🟠</span> <b>Forge Orbitale</b><br><br><b>Touche le bouton ✦</b> (ton pouvoir, dans la barre du haut) pour lancer Diplomatie Verte.'),
  hint:t('tuto.hint_pouvoir','Touche ✦')},

 {lab:t('tuto.lab_valider','Valider / annuler chaque action'), pos:'top', onShow:function(){ _confirmOn=true; },
  tx:t('tuto.apres_chaque_action_fenetre_bas_droite_r','Après chaque action, une fenêtre en bas à droite résume le gain : <b>✓ Valider</b> ou <b>↩ Annuler</b>. Tant que tu n\'as pas validé, tu peux revenir en arrière. Seuls <b>raids et combats</b> sont définitifs.')},

 {lab:t('tuto.essaie_valider_ou_annuler','Essaie : valider ou annuler'), pos:'top', sync:'confirmvalidate',
  onShow:function(){ const g=G(); if(g&&g.player){ g.player.acLeft=Math.max(2,g.player.acLeft||0); g.player.res.materials=Math.max(g.player.res.materials||0,8); g.player.res.energy=Math.max(g.player.res.energy||0,6); g.player.res.science=Math.max(g.player.res.science||0,6); try{ if(window.render)window.render(); }catch(e){} } },
  tx:t('tuto.fais_action_colonie_tech_amelioration_es','<b>Fais une action</b> (colonie, tech, amélioration…). Essaie <b>↩ Annuler</b>, refais-la, puis <b>✓ Valider</b> : on continue dès la validation.'),
  hint:t('tuto.action_puis_valider','Une action, puis ✓ Valider')},

 {lab:t('tuto.fin_tour','Fin du tour'), confirm:confirmEndTurn, sync:'endturn',
  tx:t('tuto.bouton_fin_tour_quand_chacun_joue_ac_bil','Pas de bouton « fin de tour » : quand chacun a joué ses AC, le <b>bilan</b> arrive tout seul.<br><br>Tu ne sais plus quoi faire de l\'action qui te reste, ou tu n\'as plus assez de ressources ? Pense au <b>raid</b> sur une colonie ou la capitale d\'une autre nation. Il coûte <b>1 AC et 2 jetons</b>, qui partent en récupération deux tours, et il fait monter la tension de l\'autre envers toi (voir l\'onglet <b>Diplo</b>). En échange, il te rapporte des ressources et prive l\'autre de ce revenu en fin de tour.<br><br>Si tu ne veux vraiment rien faire, touche <b>Passer</b> (barre du haut, à côté de « À TOI ») : tu renonces à l\'action et la main passe.<br><br>Clique <b>Valider et continuer</b>.'),
  hint:t('tuto.valider_continuer','Valider et continuer')},

 {lab:t('tuto.bilan_tour','Le bilan de tour'), pos:'top', confirm:confirmEOT, sync:'eot',
  tx:t('tuto.bilan_revenus_colonies_reliees_entretien','Le <b>bilan</b> : revenus des colonies reliées, entretien, actions des autres nations. <b>Valider et continuer</b> → tour suivant.')},

 {lab:t('tuto.toi_jouer','À toi de jouer !'), free:true,
  tx:t('tuto.joue_tour_librement_coloniser_relier_ame','Joue ce tour librement : <b>coloniser → relier → améliorer → techs</b>. Valide chaque action. Quand tu n\'as plus d\'AC, le bilan arrive ; je m\'occupe du reste et je reprends la main pour t\'expliquer certaines <b>fenêtres spéciales</b>.'),
  hint:t('tuto.hint_joue','Joue ; valide chaque action')},
];
// Après le tour libre : on présente les fenêtres spéciales une à une. Certaines sont AFFICHÉES pour de vrai
// (avec un contenu d'illustration), sans avoir à les déclencher par le jeu — les IA étant passives ici.
const SPECIAL=[
 {lab:t('tuto.investissements','Les investissements'), glow:'invest-modal', pos:'top', onShow:demoInvest, inhibit:['#invest-modal .inv-opt','#invest-modal button'],
  tx:t('tuto.investissements_fin_tour_2_choisis_carte','<b>Investissements</b> : au début du tour 3, tu choisis une carte — un gros bonus et une contrepartie, actifs pendant les <b>tours 3 à 5</b>. Le coût est prélevé tout de suite : si tu ne peux pas payer, tu ne peux pas la choisir. <b>Espionnage</b> se paie plus tard, parce que la nation volée va probablement te déclarer la guerre.<br>De nouveaux investissements seront disponibles au début du tour 7. Je viens de choisir pour toi, mais normalement c\'est à toi de le faire. Regarde, puis <b>Suivant</b>.')},

 // ── Les 3 onglets du bas — Empire est ouvert PAR LE JOUEUR (fiable, pas de calibrage) ──
 {lab:t('tuto.clique_onglet_empire','Clique l\'onglet Empire 🏛️'), glow:'m-tabs', awaitClick:'.mtab[data-tab="empire"]',
  tx:t('tuto.clique_onglet_empire_bas','<b>Clique l\'onglet 🏛️ Empire</b> en bas.')},

 {lab:t('tuto.panneau_empire','Le panneau Empire'), glow:'m-tabs', onShow:function(){demoPanel('empire');},
  tx:t('tuto.tableau_bord_jetons_investissements_agen','Ton tableau de bord : jetons militaires <span class="ft-dot avail" style="width:9px;height:9px;vertical-align:-1px"></span>, investissements choisis, agenda secret que tu as sélectionné, et en bas les informations sur les <b>nations adverses</b> (VP, force, supercroiseur), plus détaillées si tu prends la tech <b>Réseau Orbital</b>.')},

 {lab:t('tuto.onglet_diplo_tension','Onglet Diplo ⚔️ — la tension'), glow:'m-tabs', onShow:function(){demoPanel('diplo');},
  tx:t('tuto.diplo_tension_monte_quand_te_raide_qu_ri','<b>Diplo</b> : la <b>tension</b> monte quand on te raide ou qu\'on attaque une de tes colonies, mais aussi quand un rival te domine ou te bloque dans ta progression, sur la carte ou dans les technologies. À <b>10</b>, ton peuple te force à entrer en guerre. Cette tension baisse si tu fais un <b>accord commercial</b> (−3 chacun, depuis une colonie adverse sur la carte) ou si tu choisis des actions <b>Éco&Soc</b> comme <b>Calmer la Population</b> ou <b>Mission diplomatique</b>. Tu peux aussi utiliser des <b>cartes Stratégie</b> en début de tour pour cela.')},

 {lab:t('tuto.lab_journal','Onglet Journal 📜'), glow:'m-tabs', onShow:function(){demoPanel('journal');},
  tx:t('tuto.journal_tout_passe_tour_tour_pourquoi_ro','<b>📜 Journal</b> : tout ce qui s\'est passé, tour par tour — pourquoi une route est tombée, pourquoi une guerre a éclaté, pourquoi tu ne peux pas faire une action que tu as essayé de faire. Les liens pour trouver les <b>règles</b> du jeu et pour <b>recommencer</b> une partie qui ne te plaît pas sont ici. Tu peux aussi y régler la <b>taille du texte</b> ou <b>signaler un problème</b>, pour que nous soyons au courant de ce qui ne va pas.')},

 {lab:t('tuto.evenements','Les événements 🎯'), glow:'top-bar', onShow:function(){demoPanel('map');},
  tx:t('tuto.evenements_tours_2_4_6_8_tires_hasard_ru','<b>🎯 Événements</b> (tours 2, 4, 6, 8, tirés au hasard) :<span style="font-size:.86em"><br>• <b>Ruée Minière</b> — le plus de colonies : +6 VP<br>• <b>Conférence Scientifique</b> — le plus de 🔬 : +6 VP<br>• <b>Développement Techno</b> — le plus de techs 2-3 : +6 VP<br>• <b>Suprématie Militaire</b> — le plus de jetons : +6 VP<br>• <b>Civ. attractive</b> — le plus de moral : +2🪨 +2🔬 +3 VP<br>• <b>Accords Commerciaux / Diplomatiques</b> — négociations<br>• <b>Tempêtes Solaires</b>, <b>Prolifération des Pirates</b> — menaces</span><br>Tour 10 : <b>Jugement Final</b>.')},

 // ── Les 3 situations de guerre (vraies fenêtres, contenu d'illustration) ──
 {lab:t('tuto.guerre_populaire_forcee','Guerre populaire forcée'), glow:'forced-war-modal', pos:'top', onShow:demoForcedWar, inhibit:['#forced-war-modal button'],
  tx:t('tuto.1_guerre_populaire_tension_10_peuple_obl','1ʳᵉ guerre : <b>populaire</b>. Quand ta tension avec une autre nation atteint <b>10</b>, ton peuple t\'oblige à frapper l\'adversaire sur une route ou une colonie. Si ça ne t\'arrange pas, tu peux aussi exiger de lui un <b>tribut de 3</b> (matériaux, complétés en énergie s\'il en manque) : il paie s\'il est plus faible que toi et en a les moyens ; sinon, la guerre commence.')},

 {lab:t('tuto.guerre_riposte','Guerre en riposte'), glow:'war-modal', pos:'top', onShow:demoWarDeclared, inhibit:['#war-modal button'],
  tx:t('tuto.2_nation_te_declare_guerre_premier_tour','2ᵉ : une nation <b>te déclare la guerre</b>. Au premier tour elle seule frappe, tu défends. Ensuite, <b>deux combats</b> par fin de tour : chacun attaque et subit.')},

 // ── L'initiative : ajoutée le 2026-08-23 avec la règle des deux combats (§14.3 des règles) ──
 {lab:t('tuto.frappe_premier','Qui frappe en premier ?'),
  tx:t('tuto.avec_deux_combats_nation_choisit_ordre_i','Avec deux combats, une nation choisit l\'ordre : c\'est l\'<b>initiative</b>. Elle va à qui a l\'<b>Hyperpropulsion</b>, sinon à qui a le <b>moins attaqué</b> dans le tour, sinon au plus avancé, puis au mieux armé. Le journal dit qui et pourquoi.'),
  hint:t('tuto.hint_suivant','Suivant')},

 {lab:t('tuto.attaque_colonie_immediate','Attaque de colonie (immédiate)'), glow:'war-combat-modal', pos:'top', onShow:demoAssault, inhibit:['#war-combat-modal button','#war-combat-modal input'],
  tx:t('tuto.3_toi_assailles_colonie_combat_resolu_im','3ᵉ cas de figure : c\'est <b>toi</b> qui assailles une colonie. Le combat est résolu <b>immédiatement</b> ; si tu gagnes, tu la <b>captures</b>. Une colonie se défend avec <b>1 jeton</b> <span class="ft-dot reserved" style="width:9px;height:9px;vertical-align:-1px"></span> (sa garnison permanente) <b>+ les jetons</b> <span class="ft-dot avail" style="width:9px;height:9px;vertical-align:-1px"></span> que le défenseur ajoute après que tu as choisi les tiens : il connaît donc la force de ton attaque. Une <b>capitale</b> est mieux défendue : <b>10</b> de base + les jetons que le défenseur ajoute. Sa prise vaut <b>+10 VP</b>.<br>Dans cette fenêtre, règle le nombre de <b>jetons engagés</b> et coche le <b>Supercroiseur</b> si tu en as un.')},

 // ── Négociation de paix (vraie fenêtre) ──
 {lab:t('tuto.negociation_paix','Négociation de paix 🕊️'), glow:'peace-modal', pos:'top', onShow:demoPeace, inhibit:['#peace-modal button'],
  tx:t('tuto.paix_chaque_fin_tour_guerre_peux_propose','<b>Paix</b> : à chaque fin de tour de guerre avec une nation, tu peux proposer la paix, en offrant ou non des ressources. L\'adversaire accepte selon sa situation. Personne n\'est obligé de la proposer ni de l\'accepter, mais ça peut être un bon mouvement selon les jetons ou les ressources qui te restent en fin de tour.')},

 // ── La fenêtre de combat (2 étapes : le choix, puis le coût) ──
 {lab:t('tuto.fenetre_combat','La fenêtre de combat ⚔️'), glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:t('tuto.combat_choisis_cible_puis_nombre_jetons','<b>Combat</b> : choisis une <b>cible</b> (route, colonie ou capitale), puis le nombre de <b>jetons</b> à engager. Le <b>Supercroiseur</b> ajoute <b>+5 jetons</b> à ton score d\'attaque ou de défense (ces 5 jetons n\'apparaissent pas dans ta réserve) ; ils se paient normalement en ressources. Il n\'est jamais détruit, mais s\'il est vaincu, il part en réparation pendant deux tours. <b>Renoncer</b> à te battre garde tes jetons : la guerre continue sans assaut de ta part. La force ennemie n\'est qu\'une estimation : sans la tech <b>Réseau Orbital</b>, ses jetons sont affichés avec une marge d\'erreur (<b>±3</b>).')},

 {lab:t('tuto.attaquer_route','Attaquer une route 🛤️'), glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:t('tuto.route_facile_attaquer_defend_te_suffit_e','Une <b>route est facile à attaquer</b> : elle ne se défend pas, il te suffit d\'engager <b>1 jeton</b> si elle est non protégée, <b>2</b> si un jeton la protège. Tu la <b>captures</b> (elle devient tienne) ou la <b>détruis</b> ; l\'adversaire perd son revenu.')},

 {lab:t('tuto.cout_guerre','Le coût de la guerre'), glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:t('tuto.chaque_jeton_engage_coute_1_1_part_recup','Chaque jeton engagé coûte <b>1🪨 + 1⚡</b> (<b>IA de Navigation</b> divise ce coût par 2). Si tu <b>gagnes</b>, la moitié de tes jetons engagés revient tout de suite, l\'autre moitié part en <b>récupération pendant 2 tours</b>. Si tu <b>perds</b>, la <b>moitié est détruite</b> et le reste part en récupération. En cas d\'<b>égalité</b>, le défenseur garde sa position : de chaque côté, la moitié des jetons engagés part en récupération, rien n\'est détruit, et chacun perd 1❤️. Avec l\'investissement <b>Stratégie Guerrière</b>, la récupération ne dure qu\'un tour. Une colonie se défend toujours avec sa <b>garnison</b> (1 jeton, 10 pour une capitale).')},
];

let _cur=0, _free=false, _special=false;
let _confirmOn=false; // popup ✓/↩ : off pendant la partie guidée, réactivé à l'étape « Valider / annuler »
function curArr(){ return _special?SPECIAL:STEPS; }
function showStep(){
  clearTimeout(_advTimer); _advTimer=null;
  const s=curArr()[_cur]; if(!s){ finish(); return; }
  _collapsed=false; // quand le tuto explique une nouvelle étape, la fenêtre est toujours agrandie
  unInhibit();
  if(_special)hideAllSpecialModals(); // ferme la fenêtre spéciale précédente avant d'ouvrir la suivante
  if(_awaitCleanup){ try{_awaitCleanup();}catch(e){} _awaitCleanup=null; }
  if(s.glow)glow(s.glow); else clearGlow();
  // Étape "clique toi-même" : on attend que le joueur clique l'élément visé (ex. le menu Tech) → ça évite tout calibrage.
  if(s.awaitClick){
    if(typeof s.onShow==='function'){ try{s.onShow();}catch(e){console.error('[TUTO onShow]',e);} }
    renderCoachForStep(s); // coach visible avec sa consigne (+ Suivant en secours)
    const tgt=$(s.awaitClick)||document.querySelector(s.awaitClick);
    if(tgt){ const h=function(){ if(_awaitCleanup){_awaitCleanup();_awaitCleanup=null;} scheduleAdvance(380); }; tgt.addEventListener('click',h,true); _awaitCleanup=function(){ try{tgt.removeEventListener('click',h,true);}catch(e){} }; }
    return;
  }
  // Démo défilement : coach caché → je fais défiler la rivière à travers les sections → coach réapparaît.
  if(s.riverdemo){
    if(typeof s.onShow==='function'){ try{s.onShow();}catch(e){console.error('[TUTO onShow]',e);} }
    hideCoach();
    runRiverDemo(function(){ renderCoachForStep(s); });
    return;
  }
  // Étape CINÉMATIQUE : coach caché → on défile vers la carte, on ouvre le détail, on clique Acheter → le coach réapparaît.
  if(s.demo){
    if(typeof s.onShow==='function'){ try{s.onShow();}catch(e){console.error('[TUTO onShow]',e);} }
    hideCoach();
    cineDemo(s.demo.kind, s.demo.id, function(){ renderCoachForStep(s); });
    return;
  }
  if(typeof s.onShow==='function'){ try{s.onShow();}catch(e){console.error('[TUTO onShow]',e);} }
  renderCoachForStep(s);
}
function renderCoachForStep(s){
  const hasConfirm=typeof s.confirm==='function';
  let onNext=null, nextText=t('tuto.suivant','Suivant ▶');
  if(s.requireChoice){
    nextText=t('tuto.continuer','Continuer ▶');
    onNext=function(){ const m=$(s.requireChoice); if(m && !m.classList.contains('hidden')){ note(t('tuto.choisis_abord_option_dans_fenetre_ci_des','Choisis d\'abord une option dans la fenêtre ci-dessous.')); } else if(_advTimer){ /* le choix vient d'être fait : l'avancée est déjà programmée, un second clic sauterait une étape */ } else { advance(); } };
  } else if(hasConfirm){
    nextText=t('tuto.valider_continuer_2','Valider et continuer ▶');
    /* ═══════ « VALIDER ET CONTINUER » POUVAIT NE RIEN FAIRE DU TOUT ═══════
       ⚠️ Une étape SYNCHRONISÉE (`sync`) ne s'avançait pas elle-même : elle comptait sur la fonction
       du jeu (`dismissEventAnnounce`, `confirmAgendaChoice`…) pour déclencher `syncAdvance`. Or ces
       fonctions de confirmation commencent toutes par « si la fenêtre n'est pas ouverte, je ne fais
       rien ». Quand la fenêtre n'était pas (ou plus) là — coach en avance sur le jeu, fenêtre déjà
       fermée à la main, retour en arrière dans le scénario — le bouton ne produisait AUCUN effet et
       AUCUNE avancée. L'élève restait bloqué, sans rien à cliquer.
       Marc, 24/08 : « le tutoriel bloque à l'étape 3 […] et si je reviens en arrière et j'essaie de
       cliquer sur continuer et valider sur la fenêtre 2, ça marche plus non plus. »
       On regarde donc si la fenêtre était ouverte AVANT la confirmation :
         · ouverte  → la confirmation la ferme, `syncAdvance` fera avancer (ne pas doubler) ;
         · absente  → personne ne nous fera avancer : on avance nous-mêmes.
       Un tutoriel n'a pas le droit d'avoir une étape sans issue — c'est la même règle que pour la
       fenêtre de combat (voir `test_impasse_guerre.js`). */
    onNext=function(){
      const etaitOuverte = s.sync ? fenetreOuverte(s.sync) : false;
      try{s.confirm();}catch(e){console.error('[TUTO]',e);}
      if(!s.sync || !etaitOuverte){ scheduleAdvance(350); }
    };
  }
  coach(t('tuto.ligne','{v}{v2}/{v3} · {v4}',{v:(_special?t('tuto.fenetre_speciale','Fenêtre spéciale '):t('tuto.etape','Étape ')),v2:_cur+1,v3:curArr().length,v4:s.lab}), s.tx, { hint:s.hint, nextText:nextText, onNext:onNext });
  positionCoach(s.glow, s.pos);
  if(s.inhibit)inhibit(s.inhibit); // désactive les boutons de validation du jeu de cette étape
  if(s.free){ _free=true; }
}
// Synchro : quand une VALIDATION du jeu se produit (bouton du jeu OU du tuto), on avance le tuto —
// mais seulement si la fenêtre concernée est bien fermée (action réellement validée). Fini le décalage.
/* La fenêtre du jeu associée à chaque étape « synchronisée ». Sortie de `syncAdvance` : le bouton
   du coach en a besoin lui aussi pour savoir s'il peut compter sur la synchro (voir plus bas). */
const FENETRE_DE={agenda:'agenda-sel-modal',strategy:'strategy-modal',event:'event-announce-modal',eot:'eot-modal',discovery:'discovery-modal',routetoken:'route-token-modal'};
function fenetreOuverte(key){ const id=FENETRE_DE[key]; if(!id)return false; const m=$(id); return !!(m && !m.classList.contains('hidden')); }
function syncAdvance(key){
  if(_finished||_free)return;
  const s=STEPS[_cur]; if(!s||s.sync!==key)return;
  const mid=FENETRE_DE[key];
  if(mid){ const m=$(mid); if(m && !m.classList.contains('hidden'))return; } // pas encore validé → on attend
  scheduleAdvance(220);
}
function wrapSync(fnName,key){
  if(typeof window[fnName]!=='function')return;
  const orig=window[fnName];
  window[fnName]=function(){ const r=orig.apply(this,arguments); try{syncAdvance(key);}catch(e){} return r; };
}
function advance(){ _cur++; if(_cur>=curArr().length){ if(_special){ finish(); } else { enterFreePlay(); } return; } showStep(); }
// Transition : après le tour libre, on passe aux explications des fenêtres spéciales.
function startSpecial(){
  if(_special||_finished)return;
  _special=true; _free=false; _cur=0; setMini(false);
  clearGlow(); hideCursor(); clearTimeout(_advTimer); _advTimer=null;
  showStep();
}
function onAction(emoji){
  const s=STEPS[_cur]; if(!s||_free)return;
  if(s.trig && emoji===s.trig){ scheduleAdvance(250); }
}

/* ---------- jeu libre (tours 2 à 4) + commentaires contextuels ---------- */
const _seen={};
function enterFreePlay(){
  _free=true; _collapsed=false; clearGlow(); unInhibit(); hideCursor(); // en jeu libre, les boutons du jeu redeviennent normaux
  coach(t('tuto.jeu_libre_tour','Jeu libre · ton tour'),
    t('tuto.joue_tour_valider_apres_chaque_action_qu','Joue ton tour : <b>✓ Valider</b> après chaque action. Quand tu n\'as plus d\'AC, le <b>bilan</b> arrive tout seul ; je m\'occupe de l\'investissement et de l\'événement, et je reprends la main pour t\'expliquer certaines <b>fenêtres spéciales</b>.'),
    {noNext:true});
  /* 06/10 (appli) : en haut, le coach recouvrait la fenêtre « Nouvelles pour toi » du tour 2 et ses boutons. En jeu libre il va en bas. */
  if(_coachEl&&!_userMoved){ _coachEl.style.top='auto'; _coachEl.style.bottom='14px'; }
  setMini(true);
}
function onLog(msg){
  msg=String(msg||'');
  if(!_free&&!_special)return;   // pendant la partie guidée, le coach explique déjà ; une note par-dessus le cachait (étape 1, 07/09)
  if(!_seen.event && /[ÉE]V[ÉE]NEMENT/i.test(msg)){ _seen.event=1;
    note(t('tuto.evenement_tours_pairs_evenement_survient','🎯 <b>Événement</b> : aux tours pairs, un événement survient — bonus, malus ou compétition entre nations. Lis-le : il peut rapporter des VP.')); }
  if(!_seen.tension && /tension/i.test(msg)){ _seen.tension=1;
    note(t('tuto.tension_monte_avec_rival_raids_proximite','<b>Tension</b> : elle monte avec un rival (raids, proximité, refus). À <b>10</b>, la guerre éclate. Un accord commercial ou « Calmer la population » la fait baisser.')); }
  if(!_seen.raid && /(Raid|pille)/i.test(msg)){ _seen.raid=1;
    note(t('tuto.raid_te_vole_ressources_tension_monte_pr','⚔️ <b>Raid</b> : on te vole des ressources et la tension monte. Protège tes routes avec des jetons Force, ou réponds.')); }
  if(!_seen.war && /GUERRE/i.test(msg)){ _seen.war=1;
    note(t('tuto.guerre_combat_resout_avec_jetons_force_c','🚨 <b>Guerre</b> : le combat se résout avec tes <b>jetons Force</b>. Tu choisis combien engager en attaque ou en défense. Tu peux proposer la paix ensuite.')); }
  /* (08/10, Marc) plus de note « Pouvoir gratuit utilisé » : le jeu ne confirme plus le pouvoir, le tutoriel non plus. */
}

/* ---------- fin ---------- */
let _finished=false;
/* Le moteur demande s'il est dans la partie GUIDÉE (pas de rappel « pouvoir gratuit » par-dessus le coach). */
window.scTutoGuide=function(){ return !_free&&!_special&&!_finished; };
window.scTutoActif=function(){ return !_finished; };
function finish(){
  if(_finished)return; _finished=true; setMini(false);
  clearGlow(); hideCoach(); unInhibit(); hideCursor(); hideAllSpecialModals();
  const ov=el(t('tuto.bravo_as_bases_colonise_relie_ameliore_c','<div id="tuto-final"><div class="big">🏆</div><h2>Bravo, tu as les bases !</h2><p>Colonise, relie, améliore, cherche des techs, gère ton moral, et cherche à avoir le plus de <b>VP</b> en 10 tours. Les événements, la tension et la guerre, tu les maîtriseras en jouant.</p><div style="max-width:min(440px,88vw);text-align:left;font-size:.88em;line-height:1.45"><b>Tes VP en fin de partie :</b><ul style="margin:6px 0 0;padding-left:1.2em"><li>Colonies : VP de la planète × niveau (moitié si isolée), +1 par colonie reliée</li><li>Routes : +1 par route vers tes propres colonies</li><li>Cartes : la valeur inscrite (techs 1, 3 ou 5 selon le niveau)</li><li>Technologies : +0,5 par tech</li><li>Revenus : par ressource, +2 au-delà de 5 par tour, +5 au-delà de 10</li><li>Agenda secret : sa prime s\'il est rempli</li><li>Événements : gagnants des événements, +2 par combat gagné, découvertes, surproduction</li><li>Capitale prise : +10</li><li>Bonus de certaines techs (Exploration Extra-Solaire, Éveil Collectif)</li></ul></div><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button onclick="location.reload()">↻ Refaire le tuto</button><button class="ghost" onclick="if(window.scOuvrirRegles)scOuvrirRegles();else location.href=\'regles.html\'">Règles du jeu</button><button class="ghost" onclick="location.href=\'index.html\'">Vers le jeu</button></div></div>'));
  document.body.appendChild(ov);
}

/* ---------- surveillance du tour (1 tour libre → fenêtres spéciales) ---------- */
let _cacheDepuis=0, _eotBouton=false;
function startWatch(){
  setInterval(()=>{
    const g=G(); if(!g||_finished)return;
    /* Le coach se cache le temps d'une cinématique et doit TOUJOURS revenir. Si la cinématique
       s'interrompt (exception, carte introuvable), l'élève n'a plus ni texte ni bouton : impasse.
       Après 12 s caché, on le rend avec l'étape courante. */
    if(_coachEl&&_coachEl.classList.contains('tuto-hidden')){ if(!_cacheDepuis)_cacheDepuis=Date.now(); else if(Date.now()-_cacheDepuis>12000){ _cacheDepuis=0; hideCursor(); const s=curArr()[_cur]; if(s)renderCoachForStep(s); } }
    else _cacheDepuis=0;
    if(_free&&!_special){
      /* ═══ LE TUTORIEL SOLDE LE TOUR 2 LUI-MÊME (Marc, 09/09) ═══
         Avant : on prenait la main dès que la fenêtre Investissements apparaissait, et on la
         cachait — mais pour le jeu c'était une vraie question sans réponse : il la reposait, le
         bilan arrivait par-dessus, et Empire / Diplo / Journal restaient inaccessibles. Désormais
         on RÉPOND : investissement choisi (et dit), événement fermé, bilan validé par le bouton du
         coach, carte Stratégie du tour 3 choisie par le jeu — puis le jeu est gelé au tour 3 et
         on présente les fenêtres spéciales sur un écran calme. */
      const vis=id=>{ const m=$(id); return !!(m&&!m.classList.contains('hidden')&&m.style.display!=='none'); };
      if(vis('invest-modal')||vis('invest2-modal')){
        const m=vis('invest-modal')?$('invest-modal'):$('invest2-modal');
        const o=m.querySelector('.inv-opt:not(.inv-nope)');
        /* 06/10 : depuis que chaque choix se VALIDE (§172), cliquer l'option ne faisait que la sélectionner — la fenêtre
           restait ouverte et le tutoriel tournait en rond (« Tour suivant » sans effet). On valide aussi. */
        if(o){ const nom=(o.querySelector('.inv-opt-name')||{}).textContent||t('tuto.investissement','un investissement'); o.click(); const _v=m.querySelector('.choix-valider button'); if(_v){ _v.disabled=false; _v.click(); } note(t('tuto.investissement_j_ai_pris_toi_explique_fe','💼 <b>Investissement</b> : j\'ai pris « {v} » pour toi — je t\'explique cette fenêtre juste après.',{v:nom.trim()})); }
        else { try{ const b=m.querySelector('button'); if(b)b.click(); }catch(e){} }
        return;
      }
      if(vis('event-modal')){ const n=$('ev-name'); note(t('tuto.evenement_tour_2_continue','🎯 <b>Événement du tour 2</b>{v} — je continue.',{v:(n&&n.textContent?' : '+n.textContent:'')})); try{ if(window.dismissEventModal)window.dismissEventModal(); }catch(e){} return; }
      { const ec=$('event-choice-modal'); if(ec&&ec.style.display!=='none'){ const b=Array.prototype.slice.call(ec.querySelectorAll('button.ea-btn')).pop(); if(b)b.click(); return; } }
      if(vis('event-announce-modal')&&g.turn>=3){ try{ if(window.dismissEventAnnounce)window.dismissEventAnnounce(); }catch(e){} return; }
      if(vis('invest-active-modal')){ const m=$('invest-active-modal'); const b=m.querySelector('button'); if(b)b.click(); else m.classList.add('hidden'); return; }
      if(vis('eot-modal')){ if(!_eotBouton){ _eotBouton=true; coach(t('tuto.jeu_libre_fin_tour','Jeu libre · fin du tour'), t('tuto.voici_bilan_tour_lis_puis_clique_tour_su','Voici le <b>bilan</b> du tour. Lis-le, puis clique <b>Tour suivant</b> — ici ou dans la fenêtre.'), {nextText:t('tuto.tour_suivant','Tour suivant ▶'), onNext:function(){ confirmEOT(); }}); } return; }
      if(g.turn>=3 && g.phase==='actions' && !vis('strategy-modal')){ startSpecial(); }
      else if(g.phase==='over'){ startSpecial(); }
    }
  }, 250);
}

/* ---------- neutraliser l'IA (apprentissage calme) ---------- */
function neutralizeAI(){
  if(typeof window.doAITurn==='function'){
    window.doAITurn=function(ai,oneShot){ // l'IA passe son tour pendant le tutoriel
      try{ if(ai) ai._passedRound=true; }catch(e){}
      return false;
    };
  }
}

/* ---------- brancher les hooks du jeu ---------- */
function hookGame(){
  if(typeof window.addAction==='function'){
    const _a=window.addAction;
    window.addAction=function(emoji,name,ac,res,gain){ const r=_a.apply(this,arguments); try{onAction(emoji);}catch(e){} return r; };
  }
  if(typeof window.addLog==='function'){
    const _l=window.addLog;
    window.addLog=function(msg,cls){ const r=_l.apply(this,arguments); try{onLog(msg);}catch(e){} return r; };
  }
  /* Apprentissage calme : les achats de la démo (technologies de rang 3, Sénat) rendent le rival
     jaloux — tension à 10 dès la fin du tour 2, guerre populaire, fenêtre de paix au milieu du tour
     libre, avant même que le coach ait présenté la guerre (vu au banc, 07/09). Sans tension, pas de
     guerre : les fenêtres de guerre sont montrées par le coach, avec un contenu d'illustration. */
  if(typeof window.updateTension==='function'){ window.updateTension=function(){}; }
  /* Pendant les fenêtres spéciales le jeu est gelé : il ne rouvre ni investissements, ni bilan, ni
     annonce — sauf la démo du coach (`demoInvest`, drapeau `_demoOuverture`). Et le chien de garde
     « tu sembles bloqué » du jeu n'a rien à dire pendant tout le tutoriel. */
  for(const fn of ['showInvestmentModal','showInvestmentModal2','showInvestmentActiveModal','showEOTModal','showEventAnnounce','showEventModal']){
    if(typeof window[fn]==='function'){ const orig=window[fn]; window[fn]=function(){ if(_special&&!_demoOuverture)return; return orig.apply(this,arguments); }; }
  }
  for(const fn of ['_armPlayerStuckWatch','_scMaybeStuck','_scShowStuckModal']){ if(typeof window[fn]==='function')window[fn]=function(){}; }
  // Synchro tuto ↔ validations du jeu (agenda/stratégie/événement/fin de tour/bilan)
  wrapSync('confirmAgendaChoice','agenda');
  wrapSync('applyStrategy','strategy');
  wrapSync('dismissEventAnnounce','event');
  wrapSync('dismissDiscovery','discovery');
  wrapSync('confirmRouteToken','routetoken');
  wrapSync('showEOTModal','endturn');
  wrapSync('continueAfterEOT','eot');
  wrapSync('scConfirmValidate','confirmvalidate'); // étape « Essaie » : avancer quand le joueur valide son action
  // Action par action : en TUTO le popup de confirmation (✓/↩) est DÉSACTIVÉ pendant la partie guidée
  // (sinon il bloque chaque action + casse les démos et la fenêtre « jeton de route »). Il est RÉACTIVÉ à
  // l'étape « Valider / annuler » (_confirmOn=true) pour que le joueur le découvre ensuite en jeu.
  const _origArmConfirm=window.scArmConfirm;
  window.scArmConfirm=function(){ if(_confirmOn && typeof _origArmConfirm==='function') return _origArmConfirm.apply(this,arguments); };
  // Stratégie en 1 clic dans le tuto : sélectionner une carte l'applique aussitôt (on court-circuite le bouton « Valider mon choix »).
  if(typeof window.selectStrategy==='function'){ const _selS=window.selectStrategy; window.selectStrategy=function(){ const r=_selS.apply(this,arguments); try{ if(window.confirmStrategy)window.confirmStrategy(); }catch(e){} return r; }; }
  if(typeof window.doEstablishRoute==='function'){ const _r=window.doEstablishRoute; window.doEstablishRoute=function(){ const x=_r.apply(this,arguments); try{routeCreatedAdvance();}catch(e){} return x; }; }
  // Garde-fou : en fin de tour libre, si le jeu tire le bonus (stratégie) du tour suivant AVANT que je reprenne
  // la main, on le supprime et on bascule directement sur les fenêtres spéciales — plus de bonus « tour 3 » parasite.
  if(typeof window.showStrategyModal==='function'){
    const _ssm=window.showStrategyModal;
    window.showStrategyModal=function(){
      const g=G();
      if(_special) return;   // jeu gelé pendant les fenêtres spéciales
      if(_free && !_special && g && g.turn>=3){
        /* Tour 3 : la carte est choisie par le jeu (la première), pour que le tour démarre et que
           l'écran soit libre ; `startWatch` gèle ensuite. */
        try{ if(Array.isArray(g._stratPool)&&g._stratPool.length){ const f=g._stratPool.filter(c=>c&&!c.calmTension&&!c.calmTheirs&&!c.initiative); const c=(f[0]||g._stratPool[0]); if(window.applyStrategy)window.applyStrategy(c.id); note(t('tuto.carte_strategie_tour_3_choisie_toi','<b>Carte Stratégie</b> du tour 3 : « {nom} », choisie pour toi.',{nom:c.name})); return; } }catch(e){ console.error('[TUTO strat T3]',e); }
        startSpecial(); return;
      }
      /* Les cartes qui ouvrent une SECONDE fenêtre (Calmer les tensions, Diplomatie : choisir une
         nation) ou qui changent l'ordre du tour (Initiative) n'apportent rien ici et déroutent :
         on les retire de la pioche du tutoriel, en gardant au moins deux cartes. */
      try{ if(g&&Array.isArray(g._stratPool)){ const f=g._stratPool.filter(c=>c&&!c.calmTension&&!c.calmTheirs&&!c.initiative); if(f.length>=2)g._stratPool=f; } }catch(e){}
      return _ssm.apply(this,arguments);
    };
  }
}

/* ---------- démarrage ---------- */
function revealGame(){
  const cs=$('civ-sel'); if(cs)cs.classList.add('hidden');
  ['top-bar','game-wrap','action-bar','bottom-bar'].forEach(id=>{const e=$(id); if(e)e.style.display='flex';});
  try{ if(window.initTechResize)window.initTechResize(); }catch(e){}
  try{ if(window.installBackGuard)window.installBackGuard(); }catch(e){}
}
function startTuto(){
  const w=$('tuto-welcome'); if(w)w.remove();
  neutralizeAI();
  hookGame();
  revealGame();
  try{ window.initGame('terriens',['martiens']); }catch(e){ console.error('[TUTO] initGame:',e); }
  startWatch();
  _cur=0; showStep();
}
function showWelcome(){
  injectCSS();
  const ov=el(t('tuto.apprendre_jouer_solar_jeu_strategie_spat','<div id="tuto-welcome"><h1>Apprendre à jouer</h1><p><b>Solar</b> — jeu de stratégie spatiale. Ce tutoriel te fait jouer une vraie partie, guidée pas à pas sur les <b>4 premiers tours</b>.</p><p>À chaque étape, fais l\'action indiquée sur l\'élément <b style="color:#ffd34d">en surbrillance</b>, ou clique « Suivant » pour avancer.</p><button id="tuto-go">Commencer ▶</button></div>'));
  document.body.appendChild(ov);
  $('tuto-go').onclick=startTuto;
}

ready(showWelcome);
window.SC_TUTO={ G, advance, finish, cur:function(){ return (_special?'S':'E')+_cur+(_free?' libre':''); } }; // debug
})();
