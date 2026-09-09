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
  const nextTxt=opts.nextText||'Suivant ▶';
  const backBtn = opts.noBack ? '' : '<button id="tuto-back" class="skip">◀ Retour</button>';
  const nextBtn = opts.noNext ? '' : '<button id="tuto-next">'+nextTxt+'</button>';
  _coachEl.innerHTML=
    '<div id="tuto-head"><span id="tuto-title">'+(stepLabel||'Tutoriel')+'</span>'+
      '<button id="tuto-min" title="Réduire / agrandir">'+(_collapsed?'+':'–')+'</button></div>'+
    '<div id="tuto-body"'+(_collapsed?' style="display:none"':'')+'>'+
      '<div class="tx">'+html+'</div>'+
      '<div class="go">'+backBtn+'<span class="hint">'+(opts.hint||'')+'</span>'+nextBtn+'</div>'+
    '</div>';
  const nx=$('tuto-next'); if(nx)nx.onclick=opts.onNext||(()=>advance());
  const bk=$('tuto-back'); if(bk)bk.onclick=()=>back();
  $('tuto-min').onclick=toggleCollapse;
  _coachEl.classList.remove('tuto-hidden');
}
function toggleCollapse(){ _collapsed=!_collapsed; const b=$('tuto-body'); if(b)b.style.display=_collapsed?'none':''; const m=$('tuto-min'); if(m)m.textContent=_collapsed?'+':'–'; }
function back(){ if(_finished)return; clearTimeout(_advTimer); _advTimer=null; if(_free)_free=false; _cur=Math.max(0,_cur-1); showStep(); }
function _pt(e){ const t=(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0]); return t?{x:t.clientX,y:t.clientY}:{x:e.clientX,y:e.clientY}; }
function makeDraggable(){
  const start=(e)=>{ if(!e.target.closest('#tuto-head')||e.target.id==='tuto-min')return;
    const p=_pt(e); const r=_coachEl.getBoundingClientRect(); const ox=p.x-r.left, oy=p.y-r.top;
    const mv=(ev)=>{ const q=_pt(ev); _coachEl.style.left=(q.x-ox)+'px'; _coachEl.style.top=(q.y-oy)+'px'; _coachEl.style.right='auto'; _coachEl.style.bottom='auto'; _coachEl.style.transform='none'; _userMoved=true; if(ev.cancelable)ev.preventDefault(); };
    const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.removeEventListener('touchmove',mv); document.removeEventListener('touchend',up); };
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
  if(d)d.innerHTML="Ta <b>tension</b> a atteint <b>10</b> envers une nation : ta population <b>exige</b> la guerre. Tu dois frapper une de ses <b>routes</b> ou <b>colonies</b> maintenant — tu ne peux pas l'éviter, sauf à <b>payer</b> pour l'apaiser.";
  if(c)c.innerHTML='<button class="fw-btn" style="padding:8px;background:#2a0a0a;border:1px solid #a44;color:#f99;border-radius:6px">🛤️ Attaquer une route</button>'+
                   '<button class="fw-btn" style="padding:8px;background:#2a0a0a;border:1px solid #a44;color:#f99;border-radius:6px">🏙️ Attaquer une colonie</button>'+
                   '<button class="fw-btn" style="padding:8px;background:#0a2a1a;border:1px solid #4b8;color:#9fa;border-radius:6px">🕊️ Exiger la paix (payer)</button>';
  if(m){ m.style.display='flex'; m.classList.remove('hidden'); }
}
// Guerre déclarée par une IA (riposte) — fenêtre de résultat, contenu texte (sûr).
function demoWarDeclared(){
  try{ if(window.showWarModal)window.showWarModal('⚔️ Guerre Déclarée !',
    "Une nation rivale <b>t'a déclaré la guerre</b> (souvent après une provocation ou un refus d'accord).<br><br><em>C'est elle l'agresseur : elle frappe <b>maintenant</b> — prépare ta <b>défense</b>. Tu pourras <b>riposter à ton tour</b>.</em>", null); }catch(e){ console.error('[TUTO warDecl]',e); }
}
// Assaut de colonie — combat résolu IMMÉDIATEMENT (fenêtre de résultat, sûr).
function demoAssault(){
  try{ if(window.showWarModal)window.showWarModal('⚔️ Assaut sur une colonie',
    "Quand <b>tu</b> attaques une colonie ennemie, le combat est résolu <b>immédiatement</b> (une seule manche) : si tu gagnes, tu <b>captures</b> la colonie.<br><br>Puissance — Toi : <strong>6</strong> | Ennemi : <strong>4</strong>",
    {txt:'🏆 Victoire ! Colonie capturée.', cls:'win'}); }catch(e){ console.error('[TUTO assault]',e); }
}
// Négociation de paix — la VRAIE fenêtre (retombe sur la 1re IA si pas de guerre active).
function demoPeace(){
  const g=G(); if(!g)return;
  g._warDeclaredBy='other'; g._warDeclareReason='La tension a atteint son comble.';
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
 {lab:'Le but',
  tx:"En <b>10 tours</b>, marque le plus de <b>🏆 points de victoire (VP)</b>. Je te guide sur les premiers tours."},

 {lab:'Agenda secret', glow:'agenda-sel-modal', pos:'top', confirm:confirmAgenda, sync:'agenda',
  tx:"Ton <b>agenda secret</b> : un objectif caché qui rapporte des VP en fin de partie. <b>Clique un agenda</b>, puis <b>Valider et continuer</b>.",
  hint:"Choisis, puis Valider"},

 /* ⚠️ ORDRE : l'ANNONCE D'ÉVÉNEMENT vient AVANT le tirage de la carte Stratégie depuis la v4.8 —
    c'est volontaire (connaître l'événement à venir donne son intérêt au choix de la carte).
    Les deux étapes ont donc été interverties. Contrôlé par `node server/tutorial-sync.js`. */
 {lab:'Événements', glow:'event-announce-modal', confirm:confirmEventAnnounce, sync:'event',
  tx:"Un <b>événement</b> tombe à la fin des tours <b>2, 4, 6 et 8</b>. Il t'est <b>annoncé un tour à l'avance</b> — c'est la fenêtre derrière moi. Lis-la, puis <b>Valider et continuer</b>.",
  hint:"Lis, puis Valider"},

 {lab:'Carte Stratégie', glow:'strategy-modal', pos:'top', confirm:confirmStrategy, sync:'strategy',
  tx:"Une <b>carte Stratégie</b> par tour : un bonus immédiat (ressources, AC, jetons…). Tu connais l'événement qui vient : choisis en conséquence. <b>Clique une carte</b> — le tour démarre.",
  hint:"Choisis une carte"},

 {lab:'Tes ressources', glow:'top-bar', onShow:boostForTutorial,
  tx:"En haut : ⚡ énergie, 🪨 matériaux, 🔬 savoir, ❤️ moral, tes <b>AC</b> (actions du tour) et tes <b>🏆 VP</b>. Chaque action coûte des AC et des ressources.<br><i>Pour t'entraîner, je te donne <b>5 AC</b> et des ressources en abondance.</i>"},

 {lab:'La carte du système solaire', glow:'game-wrap',
  tx:"Voici le système solaire. <b>Touche une planète</b> pour zoomer sur son secteur : c'est là que tu poses colonies et routes.",
  hint:"Regarde, puis Suivant"},

 {lab:'Coloniser', glow:'btn-col', pos:'top', trig:'🏗️',
  tx:"<b>Clique une lune ou un astéroïde voisin</b> de ta capitale, puis <b>🏗️ Coloniser</b> dans sa fiche.",
  hint:"Colonise (ou Suivant)"},

 {lab:'Tuile Découverte', glow:'discovery-modal', confirm:confirmDiscovery, sync:'discovery',
  tx:"Chaque nouvelle colonie tire une <b>tuile Découverte</b> : ressources, jetons Force, bonus permanent, VP… ou rien. Regarde, puis <b>Valider et continuer</b>.",
  hint:"Regarde, puis Valider"},

 {lab:'Relier par une route', glow:'btn-route', pos:'top', sync:'route',
  tx:"Une colonie <b>isolée ne rapporte rien</b> : il faut une chaîne de routes jusqu'à ta capitale. Clique <b>🛤️ Route</b> (ou le <b>+</b> entre deux colonies sur la carte).",
  hint:"Trace une route"},

 {lab:'Protéger la route', glow:'route-token-modal', requireChoice:'route-token-modal', sync:'routetoken',
  tx:"<b>⚔️ Déployer 1 jeton</b> : la route est protégée des pirates. <b>Laisser non protégée</b> : gratuit, mais elle peut être détruite. <b>Choisis dans la fenêtre.</b>",
  hint:"Choisis une option"},

 {lab:'Les pirates',
  tx:"Les <b>pirates</b> ne visent que les <b>routes non protégées</b> : 20 % de risque par route au tour 1, <b>+10 % par tour</b>. Une route pillée est détruite (à reconstruire). Protège les routes qui comptent.",
  hint:"Suivant"},

 {lab:'Améliorer', glow:'game-wrap', pos:'top', trig:'⬆️',
  tx:"Une colonie <b>reliée</b> peut monter de niveau : <b>clique-la</b>, puis <b>« Niv.2 »</b> dans sa fiche. Niveau 2 = revenus ×1,5.",
  hint:"Clique « Niv.2 » (ou Suivant)"},

 // ═══════ CINÉMATIQUE : arbre technologique (le tuto joue, tu regardes) ═══════
 {lab:'Les technologies', glow:'tech-tabs', awaitClick:'tech-tabs', onShow:boostMaxCine,
  tx:"Passons aux <b>technologies</b>. <b>Clique l'onglet Techs</b> en bas : je prends la main ensuite. (AC et ressources au maximum pour la démo.)",
  hint:"Clique l'onglet Techs"},

 {lab:'Les 3 onglets', glow:'tech-tabs', riverdemo:true,
  tx:"Trois rivières de cartes :<br>• <b style='color:#5aa0e8'>Techs</b> — bonus permanents et VP ;<br>• <b style='color:#8bc34a'>Actions civiles</b> — moral, savoir, tension ;<br>• <b style='color:#e87a7a'>Actions militaires</b> — jetons Force.<br>Regarde-moi acheter : <b>Suivant</b> à chaque étape."},

 {lab:'Acheter une tech (niveau 1)', glow:'tech-tabs', demo:{kind:'tech',id:'prop1'},
  tx:"J'ai ouvert <b>Propulsion Ionique</b> (niveau 1, branche Navigation) et cliqué <b>Acheter</b> : <b>1 AC</b> + ressources, décomptés en haut. Une tech est <b>à toi pour toujours</b>."},

 {lab:'Tech niveau 2', glow:'tech-tabs', demo:{kind:'tech',id:'nav2'},
  tx:"Le <b>niveau 2</b> (IA de Navigation) exige le <b>niveau 1</b> de la même branche. 1 AC + ressources."},

 {lab:'Tech niveau 3', glow:'tech-tabs', demo:{kind:'tech',id:'hyper3'},
  tx:"Le <b>niveau 3</b> (Hyperpropulsion) exige le niveau 2 et coûte <b>2 AC</b>. Chaque palier ouvre le suivant."},

 {lab:'Le pillage scientifique', glow:'tech-tabs', onShow:function(){simUnlock('expansion');},
  tx:"Si une <b>autre nation</b> possède le niveau 1 d'une branche, son <b>niveau 2</b> t'est ouvert <b>sans acheter le 1</b>. Je viens de le simuler sur la branche <b>Expansion</b>."},

 {lab:'T2 accessible directement', glow:'tech-tabs', demo:{kind:'tech',id:'bio2'},
  tx:"J'achète donc <b>directement</b> Biosphère Avancée (niveau 2) sans son niveau 1."},

 {lab:'Mais la T3 exige TA T2', glow:'tech-tabs',
  tx:"Limite : le <b>niveau 3</b> exige toujours <b>ton</b> niveau 2. Le pillage n'ouvre jamais un niveau 3."},

 {lab:'Récap technos', glow:'tech-tabs',
  tx:"À retenir : <b>1 → 2 → 3</b> dans l'ordre ; le niveau 2 d'une branche est ouvert dès qu'une nation a le 1 ; le 3 exige ton 2 ; une tech ne se perd jamais."},

 // ─── Actions civiles + gouvernement ───
 {lab:'Actions civiles', glow:'tech-tabs', demo:{kind:'market',id:'cm_culture'},
  tx:"<b>Actions civiles</b> (vert) : j'achète <b>Campagne Culturelle</b> (+3 ❤️). Elles donnent du moral, du savoir, ou apaisent la tension. La plupart : <b>une fois par partie</b>."},

 {lab:'Action gouvernementale', glow:'tech-tabs', demo:{kind:'market',id:'gov_senat'},
  tx:"J'achète le <b>Sénat Solaire</b> : des <b>points de Gouvernement</b>."},

 {lab:'Le facteur Gouvernement', glow:'top-bar',
  tx:"<b>Gouvernement</b> : 5 points → niveau 2, 10 → 3, 15 → 4. Chaque niveau = <b>+1 AC par tour</b>. Plus d'actions, c'est tout le jeu."},

 // ─── Actions militaires ───
 {lab:'Actions militaires', glow:'tech-tabs', demo:{kind:'gen',id:'mil_invest'},
  tx:"<b>Actions militaires</b> (rouge) : j'achète <b>Investissements militaires</b> (+2 jetons Force). Attention : 3 cartes sur 4 sont <b>temporaires</b> — leurs jetons partent au tour suivant. Seul le <b>Supercroiseur</b> reste."},

 {lab:'Coûts : à l\'achat vs chaque tour', glow:'top-bar',
  tx:"Les cartes ne se perdent pas, mais certaines (ex. Démocratie Instantanée) coûtent <b>chaque tour</b>. Lis le coût avant d'acheter."},

 {lab:'À toi de jouer les technos !', glow:'tech-tabs', onShow:boostMaxCine,
  tx:"À toi : ouvre une carte et <b>achète</b> ce que tu veux. Puis <b>Suivant</b>.",
  hint:"Essaie, puis Suivant"},

 // ─── Fin de l'entraînement : retour à la normale + règles AC / gouvernement / moral ───
 {lab:'Coût des actions', glow:'top-bar', onShow:resetToNormal,
  tx:"Fin de l'entraînement : je remets tes <b>AC à 2</b>, ton gouvernement et tes ressources <b>au départ</b>. Règle : chaque action coûte <b>1 AC ou plus</b> et des ressources, sauf le <b>pouvoir gratuit</b> de ta nation."},

 {lab:'Gouvernement → plus d\'actions', glow:'top-bar',
  tx:"Le Terrien monte vite en gouvernement grâce à <b>Diplomatie Verte</b> : +3 points, 0 AC, 3 🪨. À 15 points, <b>5 AC par tour</b>."},

 {lab:'Le moral', glow:'top-bar',
  tx:"<b>Moral ❤️</b> à 1 : revenus <b>÷ 2</b>. À 0 : plus de revenus. Il remonte avec les techs Spiritualité, les actions civiles, les colonies améliorées."},

 {lab:'Pouvoir gratuit', glow:'btn-ability', pos:'top', trig:'💫',
  tx:"Chaque nation a un <b>pouvoir gratuit</b> (0 AC, 1×/tour) : 🌍 Diplomatie Verte, 🔴 Surtension (+1 AC), ☠️ Commerce avec les pirates, 🟠 Forge Orbitale. <b>Clique 💫</b> pour lancer Diplomatie Verte.",
  hint:"Clique 💫"},

 {lab:'Valider / annuler chaque action', pos:'top', onShow:function(){ _confirmOn=true; },
  tx:"Après chaque action, une fenêtre en bas à droite résume le gain : <b>✓ Valider</b> ou <b>↩ Annuler</b>. Tant que tu n'as pas validé, tu peux revenir en arrière. Seuls <b>raids et combats</b> sont définitifs."},

 {lab:'Essaie : valider ou annuler', pos:'top', sync:'confirmvalidate',
  onShow:function(){ const g=G(); if(g&&g.player){ g.player.acLeft=Math.max(2,g.player.acLeft||0); g.player.res.materials=Math.max(g.player.res.materials||0,8); g.player.res.energy=Math.max(g.player.res.energy||0,6); g.player.res.science=Math.max(g.player.res.science||0,6); try{ if(window.render)window.render(); }catch(e){} } },
  tx:"<b>Fais une action</b> (colonie, tech, amélioration…). Essaie <b>↩ Annuler</b>, refais-la, puis <b>✓ Valider</b> : on continue dès la validation.",
  hint:"Une action, puis ✓ Valider"},

 {lab:'Fin du tour', confirm:confirmEndTurn, sync:'endturn',
  tx:"Pas de bouton « fin de tour » : quand chacun a joué ses AC, le <b>bilan</b> arrive tout seul. Clique <b>Valider et continuer</b>.",
  hint:"Valider et continuer"},

 {lab:'Le bilan de tour', pos:'top', confirm:confirmEOT, sync:'eot',
  tx:"Le <b>bilan</b> : revenus des colonies reliées, entretien, actions des autres nations. <b>Valider et continuer</b> → tour suivant."},

 {lab:'À toi de jouer !', free:true,
  tx:"Joue ce tour librement : <b>coloniser → relier → améliorer → techs</b>. Valide chaque action. Quand tu n'as plus d'AC, le bilan arrive ; je m'occupe du reste et je reviens pour les <b>fenêtres spéciales</b>.",
  hint:"Joue ; valide chaque action"},
];
// Après le tour libre : on présente les fenêtres spéciales une à une. Certaines sont AFFICHÉES pour de vrai
// (avec un contenu d'illustration), sans avoir à les déclencher par le jeu — les IA étant passives ici.
const SPECIAL=[
 {lab:'Les investissements 💼', glow:'invest-modal', pos:'top', onShow:demoInvest, inhibit:['#invest-modal .inv-opt','#invest-modal button'],
  tx:"<b>💼 Investissements</b> : à la <b>fin du tour 2</b>, tu choisis une carte — un gros bonus et une contrepartie, actifs <b>tours 3 à 5</b> (second choix à la fin du tour 6). Je viens de choisir pour toi ; en vraie partie, c'est toi. Regarde, puis <b>Suivant</b>."},

 // ── Les 3 onglets du bas — Empire est ouvert PAR LE JOUEUR (fiable, pas de calibrage) ──
 {lab:'Clique l\'onglet Empire 🏛️', glow:'m-tabs', awaitClick:'.mtab[data-tab="empire"]',
  tx:"<b>Clique l'onglet 🏛️ Empire</b> en bas."},

 {lab:'Le panneau Empire', glow:'m-tabs', onShow:function(){demoPanel('empire');},
  tx:"Ton tableau de bord : jetons ⚔️, investissements, agenda 🎯, et en bas les <b>nations adverses</b> (VP, force, supercroiseur)."},

 {lab:'Onglet Diplo ⚔️ — la tension', glow:'m-tabs', onShow:function(){demoPanel('diplo');},
  tx:"<b>⚔️ Diplo</b> : la <b>tension</b> monte quand on te raide, qu'un rival te domine ou te bloque. À <b>10</b>, guerre. Elle baisse avec un <b>accord commercial</b> (−3 chacun, depuis une colonie adverse sur la carte) ou <b>Calmer la population</b> (−3)."},

 {lab:'Onglet Journal 📜', glow:'m-tabs', onShow:function(){demoPanel('journal');},
  tx:"<b>📜 Journal</b> : tout ce qui s'est passé, tour par tour — pourquoi une route est tombée, pourquoi une guerre a éclaté. Le lien <b>Règles</b> et <b>Recommencer</b> sont ici."},

 {lab:'Les événements 🎯', glow:'top-bar', onShow:function(){demoPanel('map');},
  tx:"<b>🎯 Événements</b> (tours 2, 4, 6, 8, tirés au hasard) :<span style=\"font-size:.86em\"><br>• <b>Ruée Minière</b> — le plus de colonies : +6 VP<br>• <b>Conférence Scientifique</b> — le plus de 🔬 : +6 VP<br>• <b>Développement Techno</b> — le plus de techs 2-3 : +6 VP<br>• <b>Suprématie Militaire</b> — le plus de jetons : +6 VP<br>• <b>Civ. attractive</b> — le plus de moral : +2🪨 +2🔬 +3 VP<br>• <b>Accords Commerciaux / Diplomatiques</b> — négociations<br>• <b>Tempêtes Solaires</b>, <b>Prolifération des Pirates</b> — menaces</span><br>Tour 10 : <b>Jugement Final</b>."},

 // ── Les 3 situations de guerre (vraies fenêtres, contenu d'illustration) ──
 {lab:'Guerre populaire forcée', glow:'forced-war-modal', pos:'top', onShow:demoForcedWar, inhibit:['#forced-war-modal button'],
  tx:"1ʳᵉ guerre : <b>populaire</b>. Tension à <b>10</b> → ton peuple t'oblige à frapper une route ou une colonie, sauf à payer pour l'apaiser."},

 {lab:'Guerre en riposte', glow:'war-modal', pos:'top', onShow:demoWarDeclared, inhibit:['#war-modal button'],
  tx:"2ᵉ : une nation <b>te déclare la guerre</b>. Au premier tour elle seule frappe, tu défends. Ensuite, <b>deux combats</b> par fin de tour : chacun attaque et subit."},

 // ── L'initiative : ajoutée le 2026-08-23 avec la règle des deux combats (§14.3 des règles) ──
 {lab:'Qui frappe en premier ? 🎖️',
  tx:"Avec deux combats, une nation choisit l'ordre : c'est l'<b>initiative</b>. Elle va à qui a l'<b>Hyperpropulsion</b>, sinon à qui a le <b>moins attaqué</b> dans le tour, sinon au plus avancé, puis au mieux armé. Le journal dit qui et pourquoi.",
  hint:"Suivant"},

 {lab:'Attaque de colonie (immédiate)', glow:'war-modal', pos:'top', onShow:demoAssault, inhibit:['#war-modal button'],
  tx:"3ᵉ : <b>toi</b> tu assailles une colonie. Combat résolu <b>immédiatement</b> ; si tu gagnes, tu la <b>captures</b>. Une colonie se défend à <b>1</b> (sa garnison permanente) <b>+ les jetons</b> que le défenseur ajoute ; une capitale à <b>10 + les jetons</b>, et sa prise vaut <b>+10 VP</b>."},

 // ── Négociation de paix (vraie fenêtre) ──
 {lab:'Négociation de paix 🕊️', glow:'peace-modal', pos:'top', onShow:demoPeace, inhibit:['#peace-modal button'],
  tx:"<b>Paix</b> : à chaque fin de tour de guerre, tu peux la proposer, avec ou sans ressources. L'adversaire accepte selon sa situation. Personne n'est obligé de la faire ni de l'accepter."},

 // ── La fenêtre de combat (2 étapes : le choix, puis le coût) ──
 {lab:'La fenêtre de combat ⚔️', glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:"<b>Combat</b> : choisis une <b>cible</b>, puis le nombre de <b>jetons</b> à engager. Le <b>⚓ Supercroiseur</b> ajoute +5⚔️ (il se paie). <b>Renoncer</b> garde tes jetons : la guerre continue sans assaut. La force ennemie n'est qu'une <b>estimation (±3)</b> sans renseignement."},

 {lab:'Attaquer une route 🛤️', glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:"Une <b>route est facile à attaquer</b> : elle ne se défend pas, il te suffit d'engager <b>1 jeton</b> si elle est non protégée, <b>2</b> si un jeton la protège. Tu la <b>captures</b> (elle devient tienne) ou la <b>détruis</b> ; l'adversaire perd son revenu."},

 {lab:'Le coût de la guerre', glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:"⚠️ Chaque jeton engagé coûte <b>1🪨 + 1⚡</b> et part en <b>récupération pendant 2 tours</b> ; si tu perds, la <b>moitié est détruite</b>. Une colonie se défend toujours avec sa <b>garnison</b> (1 jeton, 10 pour une capitale). <b>IA de Navigation</b> divise le coût par 2."},
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
  let onNext=null, nextText='Suivant ▶';
  if(s.requireChoice){
    nextText='Continuer ▶';
    onNext=function(){ const m=$(s.requireChoice); if(m && !m.classList.contains('hidden')){ note('👉 Choisis d\'abord une option dans la fenêtre ci-dessous.'); } else if(_advTimer){ /* le choix vient d'être fait : l'avancée est déjà programmée, un second clic sauterait une étape */ } else { advance(); } };
  } else if(hasConfirm){
    nextText='Valider et continuer ▶';
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
  coach((_special?'Fenêtre spéciale ':'Étape ')+(_cur+1)+'/'+curArr().length+' · '+s.lab, s.tx, { hint:s.hint, nextText:nextText, onNext:onNext });
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
  _special=true; _free=false; _cur=0;
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
  coach('Jeu libre · ton tour',
    "Joue ton tour : <b>✓ Valider</b> après chaque action. Quand tu n'as plus d'AC, le <b>bilan</b> arrive tout seul ; je m'occupe de l'investissement et de l'événement, et je reprends la main pour les <b>fenêtres spéciales</b>.",
    {noNext:true});
}
function onLog(msg){
  msg=String(msg||'');
  if(!_free&&!_special)return;   // pendant la partie guidée, le coach explique déjà ; une note par-dessus le cachait (étape 1, 07/09)
  if(!_seen.event && /[ÉE]V[ÉE]NEMENT/i.test(msg)){ _seen.event=1;
    note("🎯 <b>Événement</b> : aux tours pairs, un événement survient — bonus, malus ou compétition entre nations. Lis-le : il peut rapporter des VP."); }
  if(!_seen.tension && /tension/i.test(msg)){ _seen.tension=1;
    note("😤 <b>Tension</b> : elle monte avec un rival (raids, proximité, refus). À <b>10</b>, la guerre éclate. Un accord commercial ou « Calmer la population » la fait baisser."); }
  if(!_seen.raid && /(Raid|pille)/i.test(msg)){ _seen.raid=1;
    note("⚔️ <b>Raid</b> : on te vole des ressources et la tension monte. Protège tes routes avec des jetons Force, ou réponds."); }
  if(!_seen.war && /GUERRE/i.test(msg)){ _seen.war=1;
    note("🚨 <b>Guerre</b> : le combat se résout avec tes <b>jetons Force</b>. Tu choisis combien engager en attaque ou en défense. Tu peux proposer la paix ensuite."); }
  if(!_seen.power && /💫/.test(msg)){ _seen.power=1;
    note("💫 <b>Pouvoir gratuit utilisé !</b> "+msg.replace(/^💫\s*/,'')+". C'est <b>gratuit (0 AC)</b> et disponible <b>1×/tour</b> — regarde le changement en haut de l'écran."); }
}

/* ---------- fin ---------- */
let _finished=false;
function finish(){
  if(_finished)return; _finished=true;
  clearGlow(); hideCoach(); unInhibit(); hideCursor(); hideAllSpecialModals();
  const ov=el('<div id="tuto-final">'+
    '<div class="big">🏆</div><h2>Bravo, tu as les bases !</h2>'+
    '<p>Colonise, relie, améliore, cherche des technos, gère ton moral, et vise le plus de <b>VP</b> en 10 tours. Les événements, la tension et la guerre, tu les maîtriseras en jouant.</p>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">'+
    '<button onclick="location.reload()">↻ Refaire le tuto</button>'+
    '<button class="ghost" onclick="location.href=\'index.html\'">🎮 Vers le jeu</button>'+
    '</div></div>');
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
        if(o){ const nom=(o.querySelector('.inv-opt-name')||{}).textContent||'un investissement'; o.click(); note('💼 <b>Investissement</b> : j\'ai pris « '+nom.trim()+' » pour toi — je t\'explique cette fenêtre juste après.'); }
        else { try{ const b=m.querySelector('button'); if(b)b.click(); }catch(e){} }
        return;
      }
      if(vis('event-modal')){ const n=$('ev-name'); note('🎯 <b>Événement du tour 2</b>'+(n&&n.textContent?' : '+n.textContent:'')+' — je continue.'); try{ if(window.dismissEventModal)window.dismissEventModal(); }catch(e){} return; }
      { const ec=$('event-choice-modal'); if(ec&&ec.style.display!=='none'){ const b=Array.prototype.slice.call(ec.querySelectorAll('button.ea-btn')).pop(); if(b)b.click(); return; } }
      if(vis('event-announce-modal')&&g.turn>=3){ try{ if(window.dismissEventAnnounce)window.dismissEventAnnounce(); }catch(e){} return; }
      if(vis('invest-active-modal')){ const m=$('invest-active-modal'); const b=m.querySelector('button'); if(b)b.click(); else m.classList.add('hidden'); return; }
      if(vis('eot-modal')){ if(!_eotBouton){ _eotBouton=true; coach('Jeu libre · fin du tour', "Voici le <b>bilan</b> du tour. Lis-le, puis clique <b>Tour suivant</b> — ici ou dans la fenêtre.", {nextText:'Tour suivant ▶', onNext:function(){ confirmEOT(); }}); } return; }
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
        try{ if(Array.isArray(g._stratPool)&&g._stratPool.length){ const f=g._stratPool.filter(c=>c&&!c.calmTension&&!c.calmTheirs&&!c.initiative); const c=(f[0]||g._stratPool[0]); if(window.applyStrategy)window.applyStrategy(c.id); note('🃏 <b>Carte Stratégie</b> du tour 3 : « '+c.name+' », choisie pour toi.'); return; } }catch(e){ console.error('[TUTO strat T3]',e); }
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
  const ov=el('<div id="tuto-welcome">'+
    '<div class="big">🌌</div><h1>Apprendre à jouer</h1>'+
    '<p><b>Solar</b> — jeu de stratégie spatiale. Ce tutoriel te fait jouer une vraie partie, guidée pas à pas sur les <b>4 premiers tours</b>.</p>'+
    '<p>À chaque étape, fais l\'action indiquée sur l\'élément <b style="color:#ffd34d">en surbrillance</b>, ou clique « Suivant » pour avancer.</p>'+
    '<button id="tuto-go">Commencer ▶</button></div>');
  document.body.appendChild(ov);
  $('tuto-go').onclick=startTuto;
}

ready(showWelcome);
window.SC_TUTO={ G, advance, finish, cur:function(){ return (_special?'S':'E')+_cur+(_free?' libre':''); } }; // debug
})();
