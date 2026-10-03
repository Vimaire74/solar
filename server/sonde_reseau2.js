/* SONDE (1 partie) : pourquoi le Conquérant n'achète pas Réseau Orbital ? Pour chaque décision du Conquérant
   où reseau2 est évalué : note de reseau2 décomposée vs coup retenu. Usage : node sonde_reseau2.js [graine] */
'use strict';
const path=require('path'); const {GameDriver}=require('./driver.js');
let x=(parseInt(process.argv[2]||'0',10)+1)>>>0; Math.random=function(){x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296;};
const d=new GameDriver(path.join(__dirname,'..','index.html'));
d.boot(['terriens','martiens','jupiteriens','ceinturiens'].map(c=>({civId:c,isAI:true})),()=>{});
const sb=d.sb,G=sb.__G; G._cerveauIA='tacticien';
const tous=[G.player].concat(G.ais||[]); const conq=tous.find(p=>p.civ.id===(process.env.CONQ||'martiens'))||tous[1]; const A=['batisseur','opportuniste','batisseur']; let k=0;
for(const p of tous)p._profil=(p===conq)?'guerrier':A[k++%3];
const o=sb.doAITurn; sb.doAITurn=function(n,s){G._cerveauIA='tacticien'; if(n===conq)n._profil='guerrier'; else if(n._profil==='guerrier')n._profil='batisseur'; return o.call(null,n,s);};
let lastR=null, r2=null;
const os=sb.simulerCoup; sb.simulerCoup=function(){ const r=os.apply(null,arguments); lastR=r; return r; };
const ol=sb.valeurLevier; sb.valeurLevier=function(c,n){ const v=ol(c,n);
  if(n===conq&&c&&c.card==='reseau2'&&lastR){ const f=(nm,...a)=>{try{return +(sb[nm](...a)||0).toFixed(1);}catch(e){return 0;}};
    r2={sim:+(lastR.valeur||0).toFixed(1),debl:f('valeurDeblocage','reseau2'),deni:f('valeurDeni','reseau2',n),proj:f('valeurProjet',c,n),but:f('valeurBut',c,n),temp:f('valeurTemperament',c,n),lev:+v.toFixed(1)};
    r2.tot=+(r2.sim+r2.debl+r2.deni+r2.proj+r2.but+r2.temp+r2.lev).toFixed(1); }
  return v; };
const ot=sb._tracerDecisionIA; sb._tracerDecisionIA=function(n,m,mv,s,sv){
  if(n===conq){ const lib=c=>c?(c.type+':'+(c.card||c.nodeId||c.id||'')):'-';
    console.log('T'+G.turn+' '+n.civ.id+' res '+JSON.stringify(n.res)+' → '+lib(m)+' '+(+mv).toFixed(1)+(r2?'  | reseau2 '+JSON.stringify(r2):'  | reseau2 NON évalué')); }
  r2=null; return ot.apply(null,arguments); };
let r=d.pump(),g=0;
while(g++<120000&&r&&G.turn<=G.maxTurns){ try{ if(r.kind==='decision'){r=d.answer(r.pending.id,{});continue;} if(r.kind==='action'){r=d.act(r.civId,{type:'pass'});continue;} if(r.kind==='confirm'){r=d.commit(r.civId);continue;} }catch(e){break;} break; }
let _vp='?';try{_vp=tous.map(p=>p.civ.id+' '+sb.calcVP(p).total).join(' · ');}catch(e){}
console.log('VP:',_vp);
console.log('chaîne:',['drones1','reseau2','iadef3'].filter(id=>(conq.cards||[]).some(c=>c&&c.id===id)).join(' › ')||'RIEN', '· iadef3 prise par', [...tous].filter(p=>(p.cards||[]).some(c=>c&&c.id==='iadef3')).map(p=>p.civ.id+'@?').join(',')||'personne');
