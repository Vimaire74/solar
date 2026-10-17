/* ============================================================================
   TEST — FORGE ORBITALE SUR UNE LUNE JOVIENNE NON CONNECTÉE
   ----------------------------------------------------------------------------
   RÈGLE (Marc, 15/09) : « Forge Orbitale doit pouvoir se faire sur une colonie jovienne même non
   connectée. » Le jeu ne proposait que les lunes reliées par une route (`c.connected`) — quatre
   endroits (useAbility, _forgeUpgrade, doAITurn, le pouvoir côté serveur game-core.js). Les règles
   (regles.html) n'ont jamais parlé de connexion : « une lune de Jupiter passe au niveau 2 ».

   Usage : node test_forge_non_connectee.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic, Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const LUNES = ['io', 'europe', 'ganymede', 'callisto'];

function montage(humain) {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens']);
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  const jup = G.player; jup._isAI = !humain; G.ais.forEach(a => a._isAI = true);
  jup.acLeft = 3; jup.res.materials = 6; jup.res.energy = 6; jup.abilityUsed = false;
  /* Europe colonisée, PAS reliée (aucune route) ; Io (base) reste connectée mais on la met Nv.2 pour
     qu'Europe soit la SEULE candidate. */
  const io = jup.colonies.find(c => c.nodeId === 'io'); if (io) io.level = 2;
  jup.colonies.push({ nodeId: 'europe', level: 1, connected: false });
  sb.updateConnections(jup);
  const eu = jup.colonies.find(c => c.nodeId === 'europe');
  return { sb, G, jup, eu };
}

console.log('§1 Humain : useAbility propose Europe (non connectée) et _forgeUpgrade la monte Nv.2');
{
  const { sb, G, jup, eu } = montage(true);
  if (eu.connected) ko('montage : Europe devrait être NON connectée'); else ok('montage : Europe Nv.1, non connectée');
  let propose = null;
  sb.showForgeChoiceModal = function (eligible) { propose = eligible.map(c => c.nodeId); };
  sb.useAbility();
  if (propose && propose.includes('europe')) ok('useAbility propose Europe : ' + JSON.stringify(propose));
  else ko('useAbility ne propose pas Europe (proposé : ' + JSON.stringify(propose) + ') — ' + (G.log[0] && G.log[0].msg));
  const m0 = jup.res.materials, e0 = jup.res.energy;
  sb._forgeUpgrade('europe');
  if (eu.level === 2 && jup.abilityUsed && jup.res.materials === m0 - 1 && jup.res.energy === e0 - 1) ok('Europe → Nv.2, pouvoir consommé, −1🪨 −1⚡');
  else ko('_forgeUpgrade refusé : niveau ' + eu.level + ', abilityUsed ' + jup.abilityUsed + ' — ' + (G.log[0] && G.log[0].msg));
  const io = jup.colonies.find(c => c.nodeId === 'io');
  void io;
}

console.log('§2 IA (doAITurn) : la Forge s\'applique aussi à une lune non connectée');
{
  const { sb, G, jup, eu } = montage(false);
  jup.res.materials = 8; jup.res.energy = 8;
  sb.doAITurn(jup, true);
  if (eu.level === 2 || (G.aiActions || []).some(a => /Forge/.test(a.name))) ok('l\'IA a forgé Europe (Nv.' + eu.level + ')');
  else ko('l\'IA n\'a pas forgé Europe (Nv.' + eu.level + ')');
}

console.log('§3 Serveur (Engine.apply power) : un Jupitérien en ligne forge sa lune non connectée');
{
  const eng = new Engine(HTML);
  eng.newGame('jupiteriens', ['terriens', 'martiens']);
  const sb = eng.sb, G = sb.__G; G.turn = 4; G.phase = 'actions';
  const jup = G.player; jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  jup.acLeft = 3; jup.res.materials = 6; jup.res.energy = 6; jup.abilityUsed = false;
  const io = jup.colonies.find(c => c.nodeId === 'io'); if (io) io.level = 2;
  jup.colonies.push({ nodeId: 'europe', level: 1, connected: false });
  sb.updateConnections(jup);
  const eu = jup.colonies.find(c => c.nodeId === 'europe');
  eng.apply({ type: 'power' });
  if (eu.level === 2 && jup.abilityUsed) ok('power → Europe Nv.2 via le serveur');
  else ko('power serveur : Europe Nv.' + eu.level + ', abilityUsed ' + jup.abilityUsed + ' — ' + (G.log[0] && G.log[0].msg));
}

console.log('§4 Contre-test : une lune déjà Nv.2 ou une colonie NON jovienne ne sont jamais proposées');
{
  const { sb, jup } = montage(true);
  jup.colonies.find(c => c.nodeId === 'europe').level = 2;
  jup.colonies.push({ nodeId: 'ceres', level: 1, connected: false });
  let propose = null; sb.showForgeChoiceModal = function (el) { propose = el.map(c => c.nodeId); };
  sb.useAbility();
  if (!propose) ok('rien à proposer : Io et Europe Nv.2, Cérès n\'est pas jovienne → pas de fenêtre');
  else ko('proposé à tort : ' + JSON.stringify(propose));
  void LUNES;
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_forge_non_connectee : la Forge Orbitale ne regarde plus les routes.');
