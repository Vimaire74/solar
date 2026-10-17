/* ============================================================================
   TEST — L'ESPIONNAGE MONTRE AUSSI CE QUE TU AS DÉJÀ (grisé, non cochable)
   ----------------------------------------------------------------------------
   Partie BCE3 (Marc, 21/09) : en espionnant les Ceinturiens (Drones → Réseau Orbital → IA
   Défensive), la fenêtre ne montrait que l'IA Défensive — Marc possédait déjà les deux autres, et
   elles étaient cachées. « Comme s'il ne les avait pas prises. C'est ça qui m'a mis le doute. »
   RÈGLES :
     1. `espDejaPossedees` liste Drones et Réseau Orbital chez les Ceinturiens, marqués « déjà à toi » ;
     2. la charge utile de la question d'espionnage les porte (`deja`) ;
     3. ils ne sont JAMAIS sélectionnables : `espSelectionDepuisOptions` ignore leurs identifiants ;
     4. CONTRE-ÉPREUVE : l'IA Défensive reste une option cochable.
   Usage : node test_espionnage_deja.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

const sb = loadLogic(HTML);
sb.initGame('jupiteriens', ['ceinturiens']);
const G = sb.__G; G.turn = 4;
const moi = G.player, cei = G.ais[0];
const pool = vm.runInContext('CARDS_POOL', sb);
const carte = id => pool.find(c => c.id === id);
for (const id of ['drones1', 'reseau2', 'iadef3']) cei.cards.push(carte(id));
for (const id of ['drones1', 'reseau2']) moi.cards.push(carte(id));

console.log('1. Les technologies déjà possédées sont listées');
let deja = [];
try { deja = sb.espDejaPossedees(moi); } catch (e) { ko('espDejaPossedees absente : ' + e.message); }
const noms = deja.map(d => String(d.name));
if (noms.some(n => /Drones/.test(n)) && noms.some(n => /Réseau Orbital/.test(n)) && noms.every(n => /déjà à toi/.test(n)))
  ok('Drones et Réseau Orbital, « déjà à toi »');
else ko('liste « déjà à toi » : ' + (noms.join(' · ') || 'vide'));

console.log('2. La question d\'espionnage les transporte');
{ moi._inv1 = 'inv_esp'; moi._espFait = false; moi._espTour = null; moi._isAI = false;
  G._pendings = []; sb.setDecisionSink(function () {});
  try { vm.runInContext('stEspionnage()', sb); } catch (e) {}
  const q = (G._pendings || []).find(p => p.kind === 'espionage');
  if (q && Array.isArray(q.payload.deja) && q.payload.deja.length === 2) ok('payload.deja : 2 entrées');
  else ko('payload.deja absent ou incomplet (' + (q ? JSON.stringify(q.payload.deja || null).slice(0, 80) : 'aucune question') + ')'); }

console.log('3. Jamais sélectionnables');
{ const r = sb.espSelectionDepuisOptions(moi, ['une:ceinturiens:drones1', 'deja:ceinturiens:drones1']);
  if (!r) ok('aucune sélection possible sur une technologie déjà à soi'); else ko('sélection acceptée : ' + JSON.stringify(r).slice(0, 80)); }

console.log('4. CONTRE-ÉPREUVE — l\'IA Défensive reste cochable');
{ const opts = sb._espOptions(moi).filter(o => o.kind === 'une');
  if (opts.length === 1 && opts[0].ids[0] === 'iadef3') ok('une seule option : IA Défensive');
  else ko('options cochables : ' + opts.map(o => o.ids.join('+')).join(', ')); }

console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert'));
process.exit(ecarts.length ? 1 : 0);
