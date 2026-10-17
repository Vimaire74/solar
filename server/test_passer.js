/* ============================================================================
   TEST — LE BOUTON « PASSER » RENONCE À UNE ACTION, PAS À LA MANCHE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09 : « Il faut que le bouton passe seulement une
   action. » Le bouton envoyait `{type:'pass'}` — le même message que « Fin de
   Tour » — qui met `_passedRound = true` : le joueur était SORTI de la manche
   entière et ne rejouait qu'au tour suivant. Il existe maintenant `{type:'skip'}`.

   CE QUE CE TEST VÉRIFIE :
     1. `skip` consomme EXACTEMENT 1 AC ;
     2. il ne met PAS `_passedRound` tant qu'il reste des AC ;
     3. la main passe bien au joueur suivant ;
     4. le renoncement est journalisé ;
     5. le joueur REJOUE dans la même manche — c'est le point qui distingue
        `skip` de `pass`, et le seul qui échouerait sur l'ancien comportement ;
     6. `skip` en boucle ne bloque pas la partie. Ce point n'est pas décoratif :
        `roundComplete()` exige que TOUS aient `_passedRound`, donc un `skip`
        gratuit permettrait de passer indéfiniment sans que la manche se termine.
        C'est pour cela que l'AC est consomme.

   Usage : node test_passer.js
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');
let ok=true; const say=(c,m)=>{ if(!c)ok=false; console.log((c?'  ok  ':'  KO  ')+m); };
function reponse(p){const pay=(p&&p.payload)||{};for(const k of Object.keys(pay)){const v=pay[k];if(Array.isArray(v)&&v.length){const o=v[0];const id=(o&&o.id!==undefined)?o.id:0;return{choice:id,index:0,[k.replace(/s$/,'')]:id};}}return{};}
const d=new GameDriver(HTML);
d.boot([{civId:'terriens',isAI:false},{civId:'martiens',isAI:false},{civId:'jupiteriens',isAI:true},{civId:'ceinturiens',isAI:true}],()=>{});
let r=d.pump(),n=0;
while(r&&r.kind!=='over'&&n++<500){
  if(r.kind==='decision') r=d.answer(r.pending.id,reponse(r.pending));
  else if(r.kind==='confirm') r=d.commit(r.civId);
  else if(r.kind==='action') break;
  else break;
}
if(!r||r.kind!=='action'){ say(false,'pas de tour d\'action humain ('+(r&&r.kind)+')'); }
else{
  const nat=d.nation(r.civId), civ=r.civId;
  const ac0=nat.acLeft, ptr0=d._aptr, log0=(d.sb.__G.log||[]).length;
  r=d.act(civ,{type:'skip'});
  say(nat.acLeft===ac0-1,'skip consomme exactement 1 AC ('+ac0+' → '+nat.acLeft+')');
  say(ac0-1>0?nat._passedRound===false:nat._passedRound===true,'reste dans la manche tant qu\'il a des AC (_passedRound='+nat._passedRound+')');
  const suivant=(r&&r.kind==='action')?r.civId:(r&&r.kind==='decision'?'(question)':'('+(r&&r.kind)+')');
  say(!(r&&r.kind==='action'&&r.civId===civ),'la main passe à l\'autre joueur, pas à moi → '+suivant);
  void ptr0;
  const j=(d.sb.__G.log||[]).slice(0,(d.sb.__G.log||[]).length-log0).map(x=>String(x.msg||x));
  say(j.some(x=>/passe une action/.test(x)),'journalisé : '+JSON.stringify(j.find(x=>/passe une action/.test(x))||j[0]));
  // Le joueur doit REJOUER au passage suivant (contrairement à 'pass')
  let m=0, rejoue=false;
  while(r&&m++<200){
    if(r.kind==='decision'){r=d.answer(r.pending.id,reponse(r.pending));continue;}
    if(r.kind==='confirm'){r=d.commit(r.civId);continue;}
    if(r.kind==='action'){ if(r.civId===civ){ rejoue=true; break; } r=d.act(r.civId,{type:'pass'}); continue; }
    break;
  }
  say(rejoue||nat.acLeft<=0,'il rejoue dans la même manche (pas éjecté comme avec « pass »)');
  // skip en boucle : la manche doit finir par se clore
  let k=0;
  while(r&&k++<300){
    if(r.kind==='decision'){r=d.answer(r.pending.id,reponse(r.pending));continue;}
    if(r.kind==='confirm'){r=d.commit(r.civId);continue;}
    if(r.kind==='action'){r=d.act(r.civId,{type:'skip'});continue;}
    break;
  }
  say(k<300,'skip en boucle ne bloque pas la partie (route finale='+(r&&r.kind)+', tour='+d.sb.__G.turn+')');
}
console.log(ok?'\n✅ PASSER = renoncer à UNE action':'\n❌ défaut'); process.exit(ok?0:1);
