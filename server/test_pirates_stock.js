/* ============================================================================
   TEST — LES PIRATES VISENT LE STOCK D'AVANT LE REVENU, PAS D'APRÈS
   ----------------------------------------------------------------------------
   POURQUOI. Partie 4112 (Marc, 18/09), tour 8 : « L'événement Prolifération des pirates est évalué
   après le revenu, ce serait mieux avant car on mesure la quantité de matériel en stock et donc on
   peut essayer de diminuer son stock pour pas être agressé. » Un joueur qui dépense ses matériaux
   pendant ses actions pour ne pas être « le plus riche » se voyait quand même désigné, parce que
   la mesure tombait après le revenu qu'il n'avait pas encore touché.
   L'événement se résout toujours après le revenu — c'est la MESURE qui change de moment : le stock
   est photographié dans `stFinDeTour` juste avant `doRevenues` (`_stockAvantRevenu`), et l'événement
   lit cette photo.
   Usage : node test_pirates_stock.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  const jup = G.player, ter = G.ais[0];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup].concat(G.ais)) { n.res.morale = 8; n.res.materials = 2; n.res.energy = 5; n.routes = []; n.rpt = n.rpt || {}; }
  sb.setDecisionSink(() => {});
  return { sb, G, jup, ter };
}
const lignes = m => (m.G.log || []).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, ''));

console.log('§1 L\'événement seul : la photo d\'avant revenu désigne la cible');
{
  const m = montage();
  /* Après revenu, le Jupitérien est le plus riche (12) ; avant, c'était le Terrien (8 contre 3). */
  m.jup.res.materials = 12; m.jup._stockAvantRevenu = { materials: 3 };
  m.ter.res.materials = 6;  m.ter._stockAvantRevenu = { materials: 8 };
  for (const a of m.G.ais.slice(1)) { a.res.materials = 1; a._stockAvantRevenu = { materials: 1 }; }
  m.ter.routes = [{ from: 'lune', to: 'ceres', tokens: 0 }];
  const msg = vm.runInContext('EVENTS.find(e=>e.id==="pirates").resolve(G)', m.sb);
  note(String(msg).replace(/<[^>]+>/g, '').slice(0, 110));
  if (/Terriens/.test(msg)) ok('le Terrien (8🪨 avant revenu) est visé, pas le Jupitérien (12🪨 après)');
  else ko('mauvaise cible : ' + msg);
  if (m.ter.routes.length === 0) ok('sa route sans jeton est bien détruite');
  else ko('route intacte');
}

console.log('§2 Sans photo (partie reprise d\'avant ce changement) : repli sur le stock courant');
{
  const m = montage();
  m.jup.res.materials = 12; m.ter.res.materials = 6;
  for (const n of [m.jup].concat(m.G.ais)) delete n._stockAvantRevenu;
  const msg = vm.runInContext('EVENTS.find(e=>e.id==="pirates").resolve(G)', m.sb);
  if (/Jupitériens/.test(msg)) ok('sans photo, la cible est le plus riche du moment (Jupitérien)');
  else ko('repli défaillant : ' + msg);
}

console.log('§3 Fin de tour réelle : la photo est prise avant le revenu');
{
  const m = montage();
  /* Le Jupitérien a un gros revenu de matériaux mais un petit stock ; le Terrien un gros stock. */
  m.jup.res.materials = 2; m.jup.rpt.materials = 12;
  m.ter.res.materials = 9; m.ter.rpt.materials = 0;
  m.ter.routes = [{ from: 'lune', to: 'ceres', tokens: 0 }];
  m.G.curEvent = vm.runInContext('EVENTS.find(e=>e.id==="pirates")', m.sb);
  try { vm.runInContext('stFinDeTour()', m.sb); } catch (e) { note('stFinDeTour : ' + e.message.split('\n')[0]); }
  note('photo Jupitérien : ' + JSON.stringify(m.jup._stockAvantRevenu) + ' · stock après : ' + m.jup.res.materials);
  if (m.jup._stockAvantRevenu && m.jup._stockAvantRevenu.materials === 2) ok('photo prise à 2🪨, avant le revenu de +12');
  else ko('photo absente ou prise après le revenu');
  const l = lignes(m).find(x => /Prolif/i.test(x) && /vis|cible/i.test(x));
  note(l ? l.slice(0, 120) : '(pas de ligne)');
  if (l && /Terriens/.test(l)) ok('la cible est le Terrien, riche AVANT revenu');
  else ko('cible inattendue : ' + l);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_pirates_stock : les pirates jugent le stock d\'avant revenu.');
