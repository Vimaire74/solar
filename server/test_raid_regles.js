/* ============================================================================
   TEST — LE RAID, RÈGLES DU 04/09
   ----------------------------------------------------------------------------
   Marc, après la partie 3CF5 (un Conquérant qui le raidait chaque tour) : « quand les IA jouent
   mieux, c'est la cata des règles ». Quatre décisions :
     1. plus AUCUN malus de moral au raid — la tension fait le travail ;
     2. tension +3 chez la victime (au lieu de +5), +1 chez le pillard ;
     3. une colonie ne se pille qu'une fois par tour ;
     4. 🔍 Drones Surveillance : −1 sur CHAQUE ressource volée, jamais sous zéro, et rien n'est rendu
        sur une ressource que la colonie ne produit pas.
   Et une cinquième, du même souffle : plus de destruction de route pendant le tour d'une IA
   (`aiRouteRaid`) — attaquer une route est un choix de la fenêtre de guerre de fin de tour.

   Usage : node test_raid_regles.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['ceinturiens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  const p = G.player, v = G.ais[0];
  p._isAI = false; v._isAI = true;
  p.acLeft = 4; p.forceTokens = 8; p.res.materials = 5; p.res.energy = 5;
  v.colonies.push({ nodeId: 'io', level: 2, connected: true });
  v.res.energy = 10; v.res.materials = 10; v.res.science = 10; v.res.morale = 6;
  return { sb, G, p, v };
}

console.log('═'.repeat(84));
console.log('LE RAID — MORAL INTACT, TENSION +3, UNE FOIS PAR COLONIE, DRONES −1 PARTOUT');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2. Moral intact, tension +3 / +1 ──────────────────────────────────── */
console.log('1. Un raid ne touche pas au moral de la victime ; tension +3 chez elle, +1 chez le pillard');
{
  const m = montage();
  const t0 = m.sb.getTens(m.v.civ.id, m.p.civ.id), t1 = m.sb.getTens(m.p.civ.id, m.v.civ.id), mo = m.v.res.morale;
  m.sb.doRaidTarget(m.v.civ.id, 'io', m.p);
  note('moral victime ' + mo + ' → ' + m.v.res.morale + ' · tension victime +' + (m.sb.getTens(m.v.civ.id, m.p.civ.id) - t0) + ' · pillard +' + (m.sb.getTens(m.p.civ.id, m.v.civ.id) - t1));
  if (m.v.res.morale === mo) ok('moral intact');
  else ko('moral touché par le raid (' + mo + ' → ' + m.v.res.morale + ')');
  if (m.sb.getTens(m.v.civ.id, m.p.civ.id) - t0 === 3) ok('tension victime +3');
  else ko('tension victime +' + (m.sb.getTens(m.v.civ.id, m.p.civ.id) - t0) + ' au lieu de +3');
  if (m.sb.getTens(m.p.civ.id, m.v.civ.id) - t1 === 1) ok('tension pillard +1');
  else ko('tension pillard +' + (m.sb.getTens(m.p.civ.id, m.v.civ.id) - t1));
}

/* ── 3. Une colonie ne se pille qu'une fois par tour ───────────────────────── */
console.log('\n2. La même colonie ne se pille pas deux fois dans le tour — ni au clic, ni dans les coups de l\'IA');
{
  const m = montage();
  m.sb.doRaidTarget(m.v.civ.id, 'io', m.p);
  const ac = m.p.acLeft, e = m.p.res.energy;
  m.sb.doRaidTarget(m.v.civ.id, 'io', m.p);
  note('second raid sur Io : AC dépensé ' + (ac - m.p.acLeft) + ' · butin ' + (m.p.res.energy - e));
  if (ac === m.p.acLeft && e === m.p.res.energy) ok('refusé, rien dépensé, rien volé');
  else ko('un second raid sur la même colonie est passé');
  if (!m.sb.coupsPossibles(m.p).some(c => c.type === 'raid' && c.node === 'io')) ok('et l\'IA ne se le propose même plus');
  else ko('l\'énumérateur propose encore un raid sur Io déjà pillée');
  /* CONTRE-ÉPREUVE : au tour suivant, Io redevient pillable. */
  m.G.turn = 5; m.p.acLeft = 4;
  const e2 = m.p.res.energy;
  m.sb.doRaidTarget(m.v.civ.id, 'io', m.p);
  if (m.p.res.energy > e2) ok('au tour suivant, Io se pille à nouveau');
  else ko('Io reste interdite au tour suivant');
}

/* ── 4. Drones : −1 par ressource, jamais sous zéro ────────────────────────── */
console.log('\n3. Drones Surveillance : −1 sur chaque ressource volée, sans passer sous zéro');
{
  const m = montage();
  const col = m.v.colonies.find(c => c.nodeId === 'io');
  const brut = m.sb.revenuDuneColonie(m.v, col);
  const sans = m.sb.butinDeRaid(m.v, 'io').butin;
  vm.runInContext("G.ais[0].cards.push(CARDS_POOL.find(c=>c.id==='drones1'))", m.sb);
  const avec = m.sb.butinDeRaid(m.v, 'io').butin;
  note('production Io Nv.2 : ' + JSON.stringify(brut) + ' · butin sans Drones : ' + JSON.stringify(sans) + ' · avec : ' + JSON.stringify(avec));
  let bon = true;
  for (const k of ['energy', 'materials', 'science']) {
    const attendu = Math.max(0, (sans[k] || 0) - 1);
    if ((avec[k] || 0) !== attendu) bon = false;
  }
  if (bon) ok('chaque ressource volée perd 1, et une ressource à 1 tombe à 0 (pas en négatif)');
  else ko('butin avec Drones ' + JSON.stringify(avec) + ' ≠ attendu (chaque −1, plancher 0)');
  if (!('morale' in avec)) ok('rien d\'ajouté sur ce qui ne se vole pas');
}

/* ── 5. Plus de route détruite pendant le tour d'une IA ───────────────────── */
console.log('\n4. Une IA en guerre ne détruit plus de route pendant sa phase d\'actions');
{
  const m = montage();
  const ia = m.v, moi = m.p;
  ia._isAI = true; ia.acLeft = 3; ia.forceTokens = 6; ia.res.materials = 8; ia.res.energy = 8;
  moi.routes.push({ from: 'lune', to: 'phobos', tokens: 0 });
  m.G.wars = [{ a: ia.civ.id, b: moi.civ.id, winsBy: {}, turnsLeft: 99, justDeclared: false, live: true, declaredBy: 'ai' }];
  let detruites = 0;
  /* 20 tours d'IA : l'ancien bloc frappait à 50 % — sur 20 essais, la probabilité de n'en voir
     aucune était d'une sur un million. */
  for (let i = 0; i < 20; i++) {
    ia._aiSetupDone = false; ia.acLeft = 3; ia._attacksThisTurn = 0;
    const av = moi.routes.length;
    try { m.sb.doAITurn(ia, true); } catch (e) {}
    if (moi.routes.length < av) { detruites++; moi.routes.push({ from: 'lune', to: 'phobos', tokens: 0 }); }
  }
  note('routes détruites pendant 20 mises en place de tour IA : ' + detruites);
  if (detruites === 0) ok('aucune — l\'attaque de route reste un choix de fin de tour');
  else ko(detruites + ' route(s) détruite(s) pendant la phase d\'actions de l\'IA');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le raid coûte de la tension, pas du moral ; une colonie par tour ; Drones −1 partout ;');
console.log('   et les routes ne tombent qu\'en fin de tour.');
console.log('═'.repeat(84));
