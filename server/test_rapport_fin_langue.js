/* ============================================================================
   TEST — LE DÉTAIL DU DÉCOMPTE FINAL ET LE COMPTE RENDU DE COMBAT, DANS LA LANGUE DU LECTEUR
   ----------------------------------------------------------------------------
   Partie BCE3 (Marc, 21/09) : « Sinon le rapport de fin était en français… » Les en-têtes étaient
   anglais, mais tout le détail de `calcVP` était écrit en dur (« Io Nv.3 : 3 (nœud) × 3 (niveau) »,
   « condition remplie », « Découverte : Relique Alien »), et la ligne de combat portait
   « revenu(s) tout de suite » / « PERDU(S) définitivement » / « garnison » figés en français.
   RÈGLES :
     1. `calcVPDetRendu(p, en)` : aucun mot français dans le détail (colonies, cartes, revenus,
        agenda, événements, bonus) ;
     2. `calcVPDetRendu(p, null)` : le français, avec les VRAIS noms (pas « io », « bio1 ») ;
     3. un VP gagné par `gagnerVP` garde sa clé (`raison_i18n`) : « Discovery: Alien Relic » en anglais ;
     4. la ligne de combat rendue en anglais ne contient plus de français ;
     5. le serveur archive le rendu par langue et le rapport l'utilise.
   Usage : node test_rapport_fin_langue.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const bac = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'lang', 'en.js'), 'utf8'), bac);
const EN = bac.window.SOLAR_LANG_DICT;
const FR = /nœud|niveau|connectée|isolée|technologie\(s\)|au-delà|condition (NON )?remplie|Découverte|Relique|Combat gagné|Accord commercial|garnison|revenu\(s\)|PERDU|récupération|Hub Jovien|Biosphère|arrondi|par colonie/;

const sb = loadLogic(HTML);
sb.initGame('jupiteriens', ['martiens']);
const G = sb.__G; G.turn = 9;
const p = G.player;
const pool = vm.runInContext('CARDS_POOL', sb);
for (const id of ['bio1', 'drones1', 'reseau2', 'iadef3', 'extra3']) { const c = pool.find(x => x.id === id); if (c) p.cards.push(c); }
p.colonies.push({ nodeId: 'io', level: 3, connected: true }, { nodeId: 'lune', level: 1, connected: false });
p.routes.push({ from: 'jupiter', to: 'io', tokens: 1 });
p.res = { energy: 20, materials: 20, science: 12, morale: 12 };
const disc = vm.runInContext('(typeof DISCOVERIES!=="undefined"?DISCOVERIES:[]).find(d=>d.vp)||null', sb);
vm.runInContext('gagnerVP(G.player,2,J("vp.combat_gagne_contre","Combat gagné contre {nation}",{nation:_i18nRef(G.ais[0].civ,"name")}))', sb);
if (disc) vm.runInContext('gagnerVP(G.player,1,J("vp.decouverte","Découverte : {nom}",{nom:_i18nRef((typeof DISCOVERIES!=="undefined"?DISCOVERIES:[]).find(d=>d.vp),"name")}))', sb);

console.log('1. Rendu anglais : aucun mot français dans le détail');
let en = null;
try { en = sb.calcVPDetRendu(p, EN); } catch (e) { ko('calcVPDetRendu absente : ' + e.message); }
if (en) {
  const tout = Object.values(en.det).flat().concat(en.extraDetail, [en.name, en.agenda || '']);
  const fr = tout.filter(l => FR.test(l));
  if (!fr.length) ok(tout.length + ' lignes, toutes en anglais'); else ko('restent en français : ' + fr.slice(0, 4).join(' ‖ '));
  if (en.name === 'Jovians') ok('nation : « Jovians »'); else ko('nom de nation : ' + en.name);
}

console.log('2. Rendu français : les vrais noms, pas les identifiants');
{ const fr = sb.calcVPDetRendu(p, null); const col = (fr.det.colonies || []).join(' | ');
  if (/Io Nv\.3/.test(col) && !/@noeud/.test(col)) ok(col.slice(0, 70)); else ko('colonies en français : ' + col.slice(0, 120));
  const cartes = (fr.det.cartes || []).join(' | ');
  if (/Biosphère Autonome/.test(cartes) && !/@carte|bio1/.test(cartes)) ok('cartes nommées en français'); else ko('cartes : ' + cartes.slice(0, 120)); }

console.log('3. Les VP d\'événement se traduisent');
if (en) { const ev = en.det.evt.join(' | ');
  if (/Combat won against|won against/i.test(ev) || !/Combat gagné/.test(ev)) ok(ev.slice(0, 100)); else ko('événements : ' + ev); }

console.log('4. Ligne de combat en anglais');
{ const n0 = G.log.length;
  vm.runInContext('journalCombat(G.ais[0],3,false,4,_jJoindre([J("combat.bonus_garnison","+{n} garnison",{n:1})]," "),false)', sb);
  const e = G.log[0] && G.log[0].msg !== undefined ? G.log[0] : G.log[G.log.length - 1];
  const rendu = vm.runInContext('(function(e,d){const a=globalThis.SOLAR_LANG_DICT;globalThis.SOLAR_LANG_DICT=d;try{return String(_logTexte(e));}finally{globalThis.SOLAR_LANG_DICT=a;}})', sb)(e, EN);
  if (!FR.test(rendu)) ok(rendu.replace(/<[^>]+>/g, '').slice(0, 110)); else ko('ligne de combat : ' + rendu.replace(/<[^>]+>/g, '')); }

console.log('5. Le serveur archive le rendu par langue et s\'en sert');
{ const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  if (/calcVPDetRendu\(p, lg === 'fr' \? null : DICTS\[lg\]\)/.test(src) && /d\.rendu\[lang\]/.test(src)) ok('rendu par langue archivé et lu par corpsRapport');
  else ko('le rapport serveur n\'utilise pas le rendu par langue'); }

console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert'));
process.exit(ecarts.length ? 1 : 0);
