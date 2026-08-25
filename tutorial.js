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
    width:min(456px,92vw);max-height:82dvh;display:flex;flex-direction:column;background:linear-gradient(#101a34,#0b1428);
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
function confirmEndTurn(){ try{ if(window.endTurn)window.endTurn(); }catch(e){} } // le bouton « Fin de tour » n'existe plus → on termine le tour directement
function confirmEOT(){ try{ if(window.continueAfterEOT)window.continueAfterEOT(); }catch(e){} }
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
  try{ if(window.render)window.render(); }catch(e){}
}
// Simule qu'une AUTRE nation a acheté la T1 d'une branche (déblocage global = pillage scientifique).
function simUnlock(branch){ const g=G(); if(!g)return; g.branchTiers=g.branchTiers||{}; g.branchTiers[branch]=Math.max(g.branchTiers[branch]||0,1); try{ if(window.render)window.render(); }catch(e){} }

/* ---------- Fenêtres spéciales : on affiche les VRAIES fenêtres du jeu (avec un contenu d'illustration) ---------- */
// « Mode neutre » : ferme TOUTES les fenêtres spéciales et de transition de tour (pour ne rien laisser bloquer l'écran).
function hideAllSpecialModals(){
  ['forced-war-modal','war-modal','war-combat-modal','attack-modal',
   'invest-modal','invest2-modal','eot-modal','strategy-modal','event-modal','event-announce-modal','agenda-sel-modal','discovery-modal'
  ].forEach(function(id){ const m=$(id); if(m)m.classList.add('hidden'); });
  const pm=$('peace-modal'); if(pm){ pm.classList.add('hidden'); pm.style.display='none'; }
}
function demoPanel(tab){ try{ if(window.uiTab)uiTab(tab); }catch(e){ console.error('[TUTO panel]',tab,e); } }
// Affiche la vraie fenêtre d'investissement (réutilise celle du jeu si déjà peuplée, sinon la (ré)ouvre).
function demoInvest(){
  const m=$('invest-modal'), opts=$('inv-opts');
  if(m && opts && opts.children && opts.children.length){ m.classList.remove('hidden'); return; }
  try{ if(window.showInvestmentModal)window.showInvestmentModal(); }catch(e){ console.error('[TUTO invest]',e); }
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
  tx:"Bienvenue en jeu ! Rappel : en <b>10 tours</b>, accumule le plus de <b>🏆 points de victoire</b>. Ce tutoriel te guide sur les 4 premiers tours."},

 {lab:'Agenda secret', glow:'agenda-sel-modal', pos:'top', confirm:confirmAgenda, sync:'agenda',
  tx:"D'abord, choisis ton <b>AGENDA SECRET</b> : un objectif caché (ex. avoir X colonies) qui rapporte des VP en fin de partie. <b>Clique sur un agenda</b> dans la fenêtre, puis sur <b>Valider et continuer</b> (ça confirme pour toi).",
  hint:'Choisis un agenda, puis Valider'},

 /* ⚠️ ORDRE : l'ANNONCE D'ÉVÉNEMENT vient AVANT le tirage de la carte Stratégie depuis la v4.8 —
    c'est volontaire (connaître l'événement à venir donne son intérêt au choix de la carte).
    Les deux étapes ont donc été interverties. Contrôlé par `node server/tutorial-sync.js`. */
 {lab:'Événements', glow:'event-announce-modal', confirm:confirmEventAnnounce, sync:'event',
  tx:"Un <b>ÉVÉNEMENT</b> a lieu <b>tous les 2 tours</b> (fin des tours 2, 4, 6, 8). Bonne nouvelle : il t'est <b>annoncé à l'avance</b> — c'est la fenêtre affichée — pour que tu t'y prépares. Son <b>effet et son évaluation</b> se produisent à la <b>fin du tour pair</b> (fin du tour 2, puis 4…). Lis-le, puis clique Valider et continuer : tu choisiras ta carte Stratégie juste après, en connaissance de cause.",
  hint:'Lis l\'événement, puis Valider'},

 {lab:'Carte Stratégie', glow:'strategy-modal', pos:'top', confirm:confirmStrategy, sync:'strategy',
  tx:"Maintenant que tu sais ce qui arrive, tire ta <b>CARTE STRATÉGIE</b> : un bonus temporaire (ressources, AC, force…). C'est pour cela que l'événement t'est annoncé <b>avant</b> — choisis la carte qui te prépare le mieux. <b>Clique sur une carte</b> pour la choisir — le tour démarre aussitôt. Tu peux aussi cliquer <b>« Valider et continuer »</b> (ça choisit pour toi).",
  hint:'Choisis une carte, ou Valider et continuer'},

 {lab:'Tes ressources', glow:'top-bar', onShow:boostForTutorial,
  tx:"Te voilà en jeu. En haut : ⚡énergie, 🪨matériaux, 🔬savoir, ❤️moral, tes <b>AC</b> (actions par tour) et tes <b>🏆 VP</b>. Chaque action coûte des AC et des ressources. <i>Pour ce tutoriel, je t'ai donné <b>5 AC et des ressources au maximum</b> afin que tu puisses tout essayer sans manquer — on parlera de la gestion des ressources et des AC plus tard.</i>"},

 {lab:'La carte du système solaire', glow:'game-wrap',
  tx:"Voici la carte de notre <b>système solaire</b> : d'abord une belle <b>vue d'ensemble</b>, pour la beauté du système. Pour jouer, <b>clique sur une planète</b> → tu zoomes sur sa <b>carte interactive</b> (le secteur), où tu poses colonies et routes. C'est là que se déroule le jeu.",
  hint:'Regarde la carte, puis Suivant'},

 {lab:'Coloniser', glow:'btn-col', pos:'top', trig:'🏗️',
  tx:"Étends ton empire : <b>sélectionne une lune ou un astéroïde voisin</b> sur la carte, puis clique <b>🏗️ Coloniser</b>.",
  hint:'Colonise une lune / un astéroïde (ou Suivant)'},

 {lab:'Tuile Découverte', glow:'discovery-modal', confirm:confirmDiscovery, sync:'discovery',
  tx:"En colonisant un nouveau monde, tu tires une <b>tuile Découverte</b> au hasard — c'est ta récompense d'exploration. Tu peux tomber sur : 🪨/🔬/⚡ <b>immédiats</b>, des <b>jetons Force</b>, un <b>bonus permanent par tour</b> (ex. Minerais Rares), des <b>VP</b>… ou parfois rien du tout. Regarde ce que tu as trouvé, puis Valider et continuer.",
  hint:'Regarde ta découverte, puis Valider'},

 {lab:'Relier par une route', glow:'btn-route', pos:'top', sync:'route',
  tx:"Une colonie distante <b>ne rapporte des ressources que si elle est connectée par des routes ininterrompues jusqu'à ta colonie de départ</b>. Une colonie <b>isolée ne rapporte rien</b>. Relie-la : clique <b>🛤️ Route</b>, <b>ou clique directement sur le « + »</b> qui apparaît entre deux de tes colonies sur la carte.",
  hint:'Trace une route'},

 {lab:'Protéger la route', glow:'route-token-modal', requireChoice:'route-token-modal', sync:'routetoken',
  tx:"Une fois la route tracée, <b>à toi de choisir</b> dans la fenêtre : <b>⚔️ Déployer 1 jeton Force</b> → route protégée des <b>pirates</b> (une route non protégée peut être <b>pillée et détruite</b>, à reconstruire) ; ou <b>Laisser non protégée</b> → gratuit mais vulnérable. <b>Clique l'une des deux options</b> pour continuer.",
  hint:'Choisis ⚔️ Déployer ou Laisser non protégée'},

 {lab:'Les pirates',
  tx:"Un mot sur les <b>pirates</b> : ils rôdent depuis la ceinture de Kuiper (Triton), une menace neutre <b>secrètement soutenue par les Ceinturiens</b>. Ils ne visent que <b>tes routes</b> (jamais les colonies). <b>Comment ?</b> Une route <b>non protégée</b> peut être pillée et <b>détruite</b> — tu devras la reconstruire ; une route avec un <b>jeton Force</b> résiste bien mieux. <b>Quand ?</b> Le risque monte avec le temps : faible au début (~10% par route au tour 1), puis <b>+10% par tour</b> environ. Chaque attaque monte aussi ta tension avec les Ceinturiens. Bref : protège tes routes importantes avant le milieu de partie.",
  hint:'Compris, puis Suivant'},

 {lab:'Améliorer', glow:'game-wrap', pos:'top', trig:'⬆️',
  tx:"Fais produire plus une colonie <b>reliée</b> : <b>clique dessus sur la carte</b>, puis clique le bouton <b>« Niv.2 »</b> (ou <b>« Niv.3 »</b>) dans son menu — c'est l'amélioration (le mot « améliorer » n'y figure pas, juste le niveau visé). Niveau 2 = revenus ×1,5.",
  hint:'Clique « Niv.2 » sur une colonie (ou Suivant)'},

 // ═══════ CINÉMATIQUE : arbre technologique (le tuto joue, tu regardes) ═══════
 {lab:'Les technologies', glow:'tech-tabs', awaitClick:'tech-tabs', onShow:boostMaxCine,
  tx:"On va maintenant apprendre à utiliser les <b>technologies</b>. L'<b>arbre</b> est en <b>bas de l'écran</b>. <b>Clique sur le menu Tech</b> (les onglets tout en bas) pour l'ouvrir — je prends la main juste après. (AC et ressources au max pour la démo.)",
  hint:'Clique le menu Tech en bas'},

 {lab:'Les 3 onglets', glow:'tech-tabs', riverdemo:true,
  tx:"Je viens de faire <b>défiler la rivière de cartes</b>. Elle a <b>3 onglets</b> :<br>• <b style='color:#5aa0e8'>Techs</b> (bleu) → bonus <b>permanents</b> et <b>VP</b> ;<br>• <b style='color:#8bc34a'>Actions civiles</b> (vert) → <b>moral</b>, <b>savoir</b>, apaisent la <b>tension</b> ;<br>• <b style='color:#e87a7a'>Actions militaires</b> (rouge) → <b>jetons Force</b> (défense/guerre).<br>Maintenant regarde-moi en acheter — clique <b>Suivant</b> à chaque étape."},

 {lab:'Acheter une tech (niveau 1)', glow:'tech-tabs', demo:{kind:'tech',id:'prop1'},
  tx:"Je viens d'ouvrir la fiche de la 1ʳᵉ tech de la branche <b>Navigation</b> — <b>Propulsion Ionique (niv. 1)</b> — et de cliquer <b>Acheter</b>. Regarde en haut le coût se <b>décompter</b> : <b>1 AC</b> + ses ressources. Une tech achetée est <b>à toi pour toujours</b> — on ne peut jamais la perdre."},

 {lab:'Tech niveau 2', glow:'tech-tabs', demo:{kind:'tech',id:'nav2'},
  tx:"J'achète maintenant la <b>niveau 2</b> (IA de Navigation). <b>Règle essentielle :</b> il fallait d'abord posséder la <b>T1</b> de cette branche pour débloquer la T2. Coût : 1 AC + ressources."},

 {lab:'Tech niveau 3', glow:'tech-tabs', demo:{kind:'tech',id:'hyper3'},
  tx:"Puis la <b>niveau 3</b> (Hyperpropulsion), qui exige la <b>T2</b>. Note qu'une <b>T3 coûte 2 AC</b> (les autres 1). Voilà 3 techs de la même branche : <b>T1 → T2 → T3</b>, chacune ouvrant la suivante."},

 {lab:'Le pillage scientifique', glow:'tech-tabs', onShow:function(){simUnlock('expansion');},
  tx:"Autre cas important. Si une <b>autre nation</b> a déjà acheté la <b>T1</b> d'une branche, ce savoir se <b>diffuse</b> (pillage scientifique entre nations) : sa <b>T2</b> te devient accessible <b>immédiatement</b>, même sans avoir acheté la T1 toi-même. Je viens de simuler ça sur la branche <b>Expansion</b>."},

 {lab:'T2 accessible directement', glow:'tech-tabs', demo:{kind:'tech',id:'bio2'},
  tx:"Du coup j'achète <b>directement la T2</b> (Biosphère Avancée) de cette branche, <b>sans en posséder la T1</b>. C'est tout le bénéfice du pillage scientifique."},

 {lab:'Mais la T3 exige TA T2', glow:'tech-tabs',
  tx:"<b>Attention :</b> ça ne vaut que pour la T2. Pour la <b>T3</b>, tu dois <b>impérativement avoir acheté la T2 toi-même</b>. Le pillage débloque la T2, <b>jamais</b> la T3 directement. (Ici je viens d'acheter cette T2, donc sa T3 me serait ouverte.)"},

 {lab:'Récap technos', glow:'tech-tabs',
  tx:"En résumé : <b>T1 → T2 → T3</b>, il faut toujours le palier juste en dessous ; le <b>pillage</b> d'une autre nation peut t'ouvrir une T2 ; la <b>T3</b> exige toujours <b>ta</b> T2. Et une tech <b>ne se perd jamais</b>."},

 // ─── Actions civiles + gouvernement ───
 {lab:'Actions civiles', glow:'tech-tabs', demo:{kind:'market',id:'cm_culture'},
  tx:"Passons aux <b>Actions civiles</b> (onglet vert). Je viens d'acheter <b>Campagne Culturelle</b> (+3 ❤️ moral). Ces actions donnent surtout du <b>moral, du savoir</b> ou apaisent la <b>tension</b>. La plupart s'achètent <b>1× par partie</b> ; quelques-unes sont répétables."},

 {lab:'Action gouvernementale', glow:'tech-tabs', demo:{kind:'market',id:'gov_senat'},
  tx:"J'achète maintenant une <b>action de gouvernement</b> : le <b>Sénat Solaire</b> (+points de Gouvernement)."},

 {lab:'Le facteur Gouvernement', glow:'top-bar',
  tx:"Le <b>Gouvernement</b> est central : accumuler des <b>points de Gouvernement</b> fait monter ton <b>niveau</b>, ce qui <b>augmente ton nombre d'AC par tour</b> (donc plus d'actions !). Certaines formes de gouvernement rapportent aussi du <b>moral</b>. Un bon gouvernement = plus d'actions et une population plus heureuse."},

 // ─── Actions militaires ───
 {lab:'Actions militaires', glow:'tech-tabs', demo:{kind:'gen',id:'mil_invest'},
  tx:"Enfin les <b>Actions militaires</b> (onglet rouge — renforts de <b>jetons Force</b>, utiles en défense et en guerre). Je viens d'acheter <b>Investissements militaires</b> (+2 jetons). <b>Point crucial :</b> sur les 4 cartes militaires, <b>3 sont TEMPORAIRES</b> — leurs jetons disparaissent au tour suivant, il faut <b>les repayer</b> à chaque fois. Seul le <b>Supercroiseur</b> est permanent."},

 {lab:'Coûts : à l\'achat vs chaque tour', glow:'top-bar',
  tx:"Dernier point clé. Tes cartes <b>ne se perdent jamais</b>. Mais surveille le coût : <b>la plupart</b> ne coûtent qu'à l'<b>achat</b> ; <b>d'autres</b> (par ex. certaines formes de gouvernement comme la Démocratie Instantanée) coûtent aussi <b>quelques ressources chaque tour</b> (entretien). Lis toujours la description avant d'acheter."},

 {lab:'À toi de jouer les technos !', glow:'tech-tabs', onShow:boostMaxCine,
  tx:"À toi : ouvre les onglets, <b>ouvre une carte et achète</b> ce que tu veux (AC et ressources au max). Quand tu as fini, clique <b>Suivant</b>.",
  hint:'Essaie, puis Suivant'},

 // ─── Fin de l'entraînement : retour à la normale + règles AC / gouvernement / moral ───
 {lab:'Coût des actions', glow:'top-bar', onShow:resetToNormal,
  tx:"Fin de l'entraînement libre. Je remets tes <b>AC à la normale (2)</b> et tes <b>ressources à leur niveau de départ</b>. Retiens : <b>chaque action coûte 1 AC ou plus</b> — sauf le <b>pouvoir spécial gratuit</b> de ta nation. Et chaque action coûte aussi des <b>ressources</b>, toujours <b>indiquées sur l'action elle-même</b>."},

 {lab:'Gouvernement → plus d\'actions', glow:'top-bar',
  tx:"Les <b>actions de gouvernement</b> augmentent ton nombre d'actions : <b>+1 action par tranche de 5 points de Gouvernement</b> (5 pts → 3 AC, 10 → 4, 15 → 5, le maximum). Le <b>Terrien</b> 🌍 peut y arriver via son <b>action gratuite Diplomatie Verte</b> : <b>+3 points de Gouvernement</b> à chaque fois (0 AC, 3 🪨)."},

 {lab:'Le moral', glow:'top-bar',
  tx:"Surveille ton <b>moral</b> ❤️. <b>S'il tombe à 1</b> : tes <b>revenus sont divisés par 2</b> ce tour. <b>S'il tombe à 0</b> : <b>plus aucun revenu</b> ET tes <b>AC divisés par 2</b> (guerre civile !). Le moral <b>remonte</b> avec des <b>technologies</b> (Spiritualité & Nature), des <b>actions civiles</b>, ou des <b>améliorations de colonies</b>."},

 {lab:'Pouvoir gratuit', glow:'btn-ability', pos:'top', trig:'💫',
  tx:"Chaque nation a un <b>pouvoir gratuit</b> (0 AC, utilisable <b>1×/tour</b>) :<br>• 🌍 <b>Terrien — Diplomatie Verte</b> : +3 points de <b>Gouvernement</b> (−3🪨).<br>• 🔴 <b>Martien — Surtension</b> : <b>+1 action</b> ce tour (−2⚡).<br>• ☠️ <b>Ceinturien — Commerce avec les pirates</b> : gratuit, récupère des <b>ressources</b> de contrebande.<br>• 🟠 <b>Jupitérien — Forge Orbitale</b> : améliore une <b>lune joviène</b> au niveau 2 (−1🪨 −1⚡).<br><br>Tu joues le <b>Terrien</b> : <b>clique 💫</b> pour lancer ta <b>Diplomatie Verte</b>.",
  hint:'Clique 💫 (Diplomatie Verte)'},

 {lab:'Valider / annuler chaque action', pos:'top', onShow:function(){ _confirmOn=true; },
  tx:"<b>Le jeu se joue action par action.</b> Après <b>chaque</b> action, une petite fenêtre apparaît en <b>bas à droite</b> avec un <b>résumé de ce que l'action te rapporte</b> (ressources immédiates, 🏆 VP, ou revenus par tour) et deux boutons : <b>✓ Valider</b> et <b>↩ Annuler</b>.<br><br>Tu dois <b>valider chaque action</b> avant que les <b>autres nations</b> puissent jouer la leur. Tant que tu n'as pas validé, tu peux <b>↩ Annuler</b> pour revenir en arrière — pratique en cas d'erreur.<br><br>Presque tout est annulable (colonie, route, amélioration, techno, action civile/militaire, pouvoir). Seules les actions à <b>résultat définitif</b> ne le sont pas : les <b>raids</b> et les <b>attaques / combats</b> de guerre."},

 {lab:'Essaie : valider ou annuler', pos:'top', sync:'confirmvalidate',
  onShow:function(){ const g=G(); if(g&&g.player){ g.player.acLeft=Math.max(2,g.player.acLeft||0); g.player.res.materials=Math.max(g.player.res.materials||0,8); g.player.res.energy=Math.max(g.player.res.energy||0,6); g.player.res.science=Math.max(g.player.res.science||0,6); try{ if(window.render)window.render(); }catch(e){} } },
  tx:"<b>À toi d'essayer !</b> Fais <b>n'importe quelle action</b> (coloniser, acheter une techno, améliorer une colonie…). La fenêtre <b>✓ Valider / ↩ Annuler</b> apparaît alors <b>en bas à droite</b>, avec le résumé des bonus.<br><br>Amuse-toi à cliquer <b>↩ Annuler</b> pour revenir en arrière, puis refais une action et clique <b>✓ Valider</b>. Dès qu'une action est <b>validée</b>, on passe à la suite.",
  hint:'Fais une action, puis ✓ Valider'},

 {lab:'Fin du tour', confirm:confirmEndTurn, sync:'endturn',
  tx:"Il n'y a pas de bouton « Fin de tour ». Quand <b>tout le monde a fini de jouer les actions de son tour</b> — et certains en auront <b>plus que d'autres</b> — le <b>bilan de fin de tour arrive automatiquement</b> ; il faut le <b>valider</b> pour continuer.",
  hint:'Clique Valider et continuer'},

 {lab:'Le bilan de tour', pos:'top', confirm:confirmEOT, sync:'eot',
  tx:"Ce bilan s'affiche à chaque fin de tour : <b>revenus</b> (colonies reliées × niveau), <b>entretien</b> des colonies et routes, et ce que les autres nations ont fait. Clique <b>Valider et continuer</b> pour passer au tour suivant."},

 {lab:'À toi de jouer !', free:true,
  tx:"Tu connais la boucle : <b>coloniser → relier → améliorer → technos</b>. Joue maintenant librement <b>ce tour</b>. <b>N'oublie pas de valider chaque action</b> en cliquant sur <b>✓ Valider</b>. Les <b>raids</b> et les <b>actions de conquête</b> (attaques) n'ont <b>pas besoin d'être validés</b> : ils se font d'office et <b>ne peuvent pas être annulés</b>. Quand tu n'as plus d'actions, le <b>Bilan du tour</b> arrive tout seul — pense à <b>faire défiler vers le bas</b> pour cliquer <b>« Tour suivant »</b>. Je reviens juste après pour te présenter les <b>fenêtres spéciales</b>.",
  hint:'Joue ce tour ; valide chaque action'},
];
// Après le tour libre : on présente les fenêtres spéciales une à une. Certaines sont AFFICHÉES pour de vrai
// (avec un contenu d'illustration), sans avoir à les déclencher par le jeu — les IA étant passives ici.
const SPECIAL=[
 {lab:'Les investissements 💼', glow:'invest-modal', pos:'top', onShow:demoInvest, inhibit:['#invest-modal .inv-opt','#invest-modal button'],
  tx:"Voici la fenêtre <b>💼 Investissements</b>. Tu la vois à la <b>FIN du tour 2</b> : tu choisis une <b>carte investissement</b> (un <b>bonus puissant</b> assorti d'une <b>contrepartie</b>). L'<b>effet ET la contrepartie</b> s'appliquent <b>à partir du tour 3</b>, et l'investissement reste <b>actif 3 tours : du tour 3 au tour 5</b>. Un investissement de <b>niveau 2</b> se choisit à la <b>fin du tour 6</b> et vaut <b>du tour 7 au tour 9</b>. En haut, ce que chaque <b>nation</b> a choisi. Regarde les options, puis clique <b>Suivant</b>."},

 // ── Les 3 onglets du bas — Empire est ouvert PAR LE JOUEUR (fiable, pas de calibrage) ──
 {lab:'Clique l\'onglet Empire 🏛️', glow:'m-tabs', awaitClick:'.mtab[data-tab="empire"]',
  tx:"Passons aux onglets du bas. <b>Clique toi-même sur l'onglet 🏛️ Empire</b> pour l'ouvrir."},

 {lab:'Le panneau Empire', glow:'m-tabs', onShow:function(){demoPanel('empire');},
  tx:"C'est ton <b>tableau de bord</b>. <b>Fais défiler</b> pour tout voir. Repère surtout : ton nombre de <b>jetons militaires</b> ⚔️, tes <b>investissements enregistrés</b> ici, le rappel de ton <b>agenda secret</b> 🎯, et tout en bas les <b>informations sur les nations adverses</b> (leurs VP, leur force estimée)."},

 {lab:'Onglet Diplo ⚔️ — la tension', glow:'m-tabs', onShow:function(){demoPanel('diplo');},
  tx:"L'onglet <b>⚔️ Diplo</b> gère tes <b>relations</b>. La <b>tension</b> monte avec un rival quand : il te <b>raide</b>, vous êtes <b>trop proches</b> (colonies voisines), ou l'un <b>refuse un accord</b>. À <b>10 de tension</b> → la <b>guerre</b> éclate. Pour la faire <b>redescendre</b> : un <b>accord commercial</b> (−3 des deux côtés) — qui se conclut <b>depuis la carte, en cliquant sur une colonie adverse</b> — ou l'action civile <b>« Calmer la population »</b> (−3). Surveille cet onglet pour éviter les guerres surprises."},

 {lab:'Onglet Journal 📜', glow:'m-tabs', onShow:function(){demoPanel('journal');},
  tx:"L'onglet <b>📜 Journal</b> garde l'<b>historique</b> complet, tour par tour. C'est ici que tu comprends <b>pourquoi une action n'a pas marché</b>, <b>pourquoi tu as perdu une route</b>, ou <b>pourquoi une guerre a éclaté</b>. En cas de doute, reviens toujours au Journal.<br><br>C'est aussi depuis le Journal que tu trouves le lien <b>📖 Règles du jeu</b> (les règles complètes, à consulter à tout moment) et le bouton <b>« Recommencer à zéro »</b> pour relancer une nouvelle partie."},

 {lab:'Les événements 🎯', glow:'top-bar', onShow:function(){demoPanel('map');},
  tx:"<b>🎯 Événements</b> : à chaque <b>tour pair</b> (T2, T4, T6, T8), un événement est tiré <b>AU HASARD</b> (annoncé au tour précédent) parmi :<span style=\"font-size:.86em\"><br>• <b>Ruée Minière</b> — le plus de colonies → +6 VP<br>• <b>Conférence Scientifique</b> — la plus grosse prod. de 🔬 → +6 VP<br>• <b>Développement Techno</b> — le plus de techs niv.2-3 → +6 VP<br>• <b>Suprématie Militaire</b> — le plus de jetons Force → +6 VP<br>• <b>Civ. la plus attractive</b> — le plus de moral → +2🪨 +2🔬 +3 VP<br>• <b>Accords Commerciaux / Diplomatiques</b> — occasions de négocier<br>• <b>Tempêtes Solaires</b> (menace) — chacun perd 1 jeton, 1 route, 2🪨 (sauf IA Défensive)<br>• <b>Prolifération des Pirates</b> (menace) — frappe les routes de la nation la plus riche en 🪨</span><br>Le <b>tour 10 = Jugement Final</b> (décompte des VP)."},

 // ── Les 3 situations de guerre (vraies fenêtres, contenu d'illustration) ──
 {lab:'Guerre populaire forcée', glow:'forced-war-modal', pos:'top', onShow:demoForcedWar, inhibit:['#forced-war-modal button'],
  tx:"Voici la 1ʳᵉ situation de guerre : la <b>Guerre Populaire Forcée</b>. Quand ta <b>tension atteint 10</b> avec une nation, ta population <b>t'oblige</b> à l'attaquer (une route ou une colonie), ou à payer pour l'apaiser. Tu ne peux pas simplement l'ignorer."},

 {lab:'Guerre en riposte', glow:'war-modal', pos:'top', onShow:demoWarDeclared, inhibit:['#war-modal button'],
  tx:"2ᵉ situation : une <b>IA te déclare la guerre</b> (souvent après une provocation). <b>C'est elle l'agresseur</b> : au <b>premier tour de guerre, elle seule frappe</b> et tu te défends. Dès le <b>tour suivant</b>, chacun mène son assaut et subit celui de l'autre : <b>deux combats</b> par fin de tour. Comme chaque jeton engagé se paie, il faut <b>répartir jetons et ressources</b> entre l'attaque et la défense."},

 // ── L'initiative : ajoutée le 2026-08-23 avec la règle des deux combats (§14.3 des règles) ──
 {lab:'Qui frappe en premier ? 🎖️',
  tx:"Quand il y a deux combats, l'ordre décide de tout — et le jeu désigne une nation pour le <b>choisir</b>. C'est l'<b>initiative</b>. Elle revient, dans cet ordre : à qui possède l'<b>🌀 Hyperpropulsion</b> ; sinon à celui qui a <b>le moins attaqué</b> l'autre pendant le tour (on ne frappe pas dans la journée pour imposer encore le tempo du soir) ; sinon au plus <b>avancé technologiquement</b>, puis au mieux <b>armé</b>, puis au mieux <b>approvisionné</b>. Le journal te dit à chaque fois qui l'a et pourquoi.<br><br><b>Défendre en premier</b>, c'est savoir ce qu'il te reste avant de choisir ton assaut. <b>Attaquer en premier</b>, c'est frapper avec tous tes jetons pendant que tu les as encore.",
  hint:'Compris, puis Suivant'},

 {lab:'Attaque de colonie (immédiate)', glow:'war-modal', pos:'top', onShow:demoAssault, inhibit:['#war-modal button'],
  tx:"3ᵉ situation : <b>toi</b> tu lances un <b>assaut</b> sur une colonie ennemie. Le combat est résolu <b>immédiatement</b> (une seule manche), en comparant les puissances. Si tu gagnes, tu <b>captures la colonie</b> sur-le-champ."},

 // ── Négociation de paix (vraie fenêtre) ──
 {lab:'Négociation de paix 🕊️', glow:'peace-modal', pos:'top', onShow:demoPeace, inhibit:['#peace-modal button'],
  tx:"La <b>Négociation de Paix</b>. Elle t'est proposée à la <b>fin de chaque tour où tu es en guerre</b> (et au moment où une guerre est <b>déclarée</b>) : pour chaque conflit, tu choisis de <b>proposer la paix</b> en offrant des <b>ressources</b>, ou de <b>poursuivre</b>. Tu peux même <b>proposer la paix sans offrir de ressources</b> : si la paix <b>arrange la nation ennemie</b>, elle peut l'accepter quand même. L'adversaire décide selon sa situation et la générosité de ton offre. <b>Chaque nation tranche de même</b> pour ses propres guerres en fin de tour. Tu n'es jamais obligé de faire la paix, ni d'accepter celle qu'on te propose."},

 // ── La fenêtre de combat (2 étapes : le choix, puis le coût) ──
 {lab:'La fenêtre de combat ⚔️', glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:"Voici la <b>fenêtre de combat</b>. Tu choisis d'abord une <b>cible</b> (colonie ou route ennemie), puis un <b>curseur</b> te laisse fixer <b>combien de jetons Force engager</b>. Si tu possèdes le <b>⚓ Supercroiseur</b>, une case te propose de le <b>déployer</b> : +5⚔️, mais il se paie, et le curseur se rabaisse pour t'en réserver le prix.<br><br>Tu peux toujours <b>te retirer</b> : le bouton <b>🚪 Renoncer à l'assaut</b> (ou <b>🕊️ Tenir position</b> si tu subis) conserve tes jetons — la guerre continue, tu ne frappes simplement pas ce tour-ci. La <b>force de l'ennemi</b> ne t'est montrée qu'en <b>estimation (± 3)</b> — exacte seulement si tu as du <b>renseignement</b> (espionnage / tech d'intel)."},

 {lab:'Attaquer une route 🛤️', glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:"Attaquer une <b>route</b> est bien plus facile qu'une colonie (un seul assaut suffit — l'ennemi ne peut pas défendre une route). La fenêtre montre <b>toutes</b> ses routes : <b>🔓 non protégée → 1 jeton</b> (aucun coût) ; <b>🛡️ protégée → 2 jetons</b> (tu <b>détruis son jeton défenseur</b>, et <b>1 seul des tiens</b> part en récupération). Ensuite tu choisis : <b>la récupérer</b> (elle devient tienne — top pour prolonger ton réseau vers une colonie lointaine) ou <b>la détruire</b>. Dans les deux cas, l'adversaire <b>perd son revenu</b> et doit la reconstruire."},

 {lab:'Le coût de la guerre', glow:'war-combat-modal', pos:'top', onShow:demoCombat, inhibit:['#war-combat-modal button'],
  tx:"⚠️ <b>La guerre coûte cher.</b> Tu immobilises <b>1 jeton (1🪨 + 1⚡) par jeton adverse en défense</b> — <b>garnison de base incluse</b> : chaque colonie défend toujours avec <b>1 jeton réservé</b>, donc même une colonie « non défendue » te coûte au moins <b>1 jeton</b>. Ces jetons partent en <b>récupération 2 tours</b> (1 avec « Stratégie Guerrière ») ; si tu <b>perds</b>, la moitié est <b>détruite</b>. Quand tu <b>captures</b> une colonie, son <b>jeton de garnison est détruit</b>. Note : chaque colonie que tu possèdes <b>réserve 1 jeton</b> (non engageable en attaque). La tech <b>IA de Navigation</b> divise par 2 le coût de la guerre."},
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
    onNext=function(){ const m=$(s.requireChoice); if(m && !m.classList.contains('hidden')){ note('👉 Choisis d\'abord une option dans la fenêtre ci-dessous.'); } else { advance(); } };
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
    "Continue à jouer normalement. Astuce : garde un œil sur ton <b>moral</b> (❤️). <b>Valide chaque action</b> avec <b>✓ Valider</b> (les raids et les attaques se font d'office, sans validation). Quand tu n'as plus d'actions, le <b>Bilan</b> arrive tout seul — <b>fais défiler vers le bas</b> pour cliquer <b>« Tour suivant »</b>. Je reprends la main ensuite pour les <b>fenêtres spéciales</b>.",
    {noNext:true});
}
function onLog(msg){
  msg=String(msg||'');
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
function startWatch(){
  setInterval(()=>{
    const g=G(); if(!g||_finished)return;
    if(_free){
      // Dès que la fenêtre d'investissement (fin du tour 2) apparaît, OU si le tour a avancé, on reprend la main.
      const im=$('invest-modal'), im2=$('invest2-modal');
      const investShowing=(im&&!im.classList.contains('hidden'))||(im2&&!im2.classList.contains('hidden'));
      if(investShowing || g.turn>=3 || g.phase==='over'){ startSpecial(); }
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
      if(_free && !_special && g && g.turn>=3){ startSpecial(); return; }
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
window.SC_TUTO={ G, advance, finish }; // debug
})();
