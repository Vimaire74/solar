/* ============================================================================
   TEST — LA GUERRE POPULAIRE PROPOSE LES MÊMES CIBLES QUE LA FENÊTRE D'ASSAUT
   ----------------------------------------------------------------------------
   Marc, partie 083E tour 7 : « il me donne un choix restreint de possibilités d'attaque, surtout des
   routes et seulement Titan […] puis en cliquant sur Titan je vois un autre menu de guerre qui me
   propose TOUTES ses colonies, curieux non ? »
   Oui. La fenêtre de guerre populaire calculait « la colonie la plus proche » de son côté, puis
   passait la main à la fenêtre d'assaut, qui applique la vraie règle de portée. Deux règles pour une
   seule décision : on choisissait Titan et on prenait Ganymède.

   RÈGLES VERROUILLÉES ICI :
     1. les colonies proposées par la guerre populaire = `_getReachableWarTargets` — exactement la
        liste de la fenêtre de combat, ni plus ni moins ;
     2. elles sont triées par distance, la plus proche en tête (on ne perd pas le raccourci utile) ;
     3. on peut réellement en choisir une AUTRE que la plus proche, et c'est bien celle-là qui est
        assaillie (sinon la liste serait décorative) ;
     4. CONTRE-ÉPREUVE — quand la règle de portée ne rend qu'une cible (nations non voisines), la
        fenêtre n'en propose qu'une : on n'a pas « ouvert » la règle, on l'a unifiée ;
     5. `colTarget` reste envoyé (pilote, bot, bancs, clients anciens) et vaut la plus proche.

   Usage : node test_guerre_populaire_cibles.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Terriens (Lune) contre Martiens. On donne aux Martiens plusieurs colonies, dont une VOISINE d'une
   colonie terrienne : la règle de portée ouvre alors tout ce qui est à ≤ 4 nœuds. */
function montage(voisines) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 7; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.forceTokens = 8; moi.res.materials = 15; moi.res.energy = 15;
  ia.res.materials = 10; ia.res.energy = 10; ia.forceTokens = 3;
  if (voisines) {
    moi.colonies.push({ nodeId: 'ceres', level: 2, connected: true });
    for (const n of ['ganymede', 'titan', 'triton']) if (!ia.colonies.some(c => c.nodeId === n)) ia.colonies.push({ nodeId: n, level: 2, connected: true });
  }
  ia.routes.push({ from: ia.civ.home, to: 'ceres', tokens: 1 });
  sb.setDecisionSink(function () {});
  /* Tension à 10 : c'est la condition de la guerre populaire. */
  sb.setTens(moi.civ.id, ia.civ.id, 10);
  return { sb, G, moi, ia };
}
function fenetre(m) {
  m.G._pendings = [];
  m.sb.triggerGuereeForcee('player', m.ia);
  const q = (m.G._pendings || []).find(p => p.kind === 'forced_war');
  return q ? (q.payload || {}) : null;
}

console.log('═'.repeat(84));
console.log('GUERRE POPULAIRE — LES CIBLES ANNONCÉES SONT CELLES QU\'ON PEUT ATTAQUER');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2. La liste est celle de la règle de portée, triée ────────────────── */
console.log('1. Nations voisines : la fenêtre propose TOUTES les colonies à portée, la plus proche en tête');
{
  const m = montage(true);
  const attendu = m.sb._getReachableWarTargets(m.moi, m.ia).map(c => c.nodeId).sort();
  const o = fenetre(m);
  const propose = ((o && o.cols) || []).map(c => c.node);
  note('règle de portée : ' + JSON.stringify(attendu) + ' · proposé : ' + JSON.stringify(propose));
  if (o && propose.length === attendu.length && propose.slice().sort().join() === attendu.join())
    ok(propose.length + ' colonies proposées — exactement celles de la fenêtre de combat');
  else ko('la fenêtre propose ' + JSON.stringify(propose) + ' au lieu de ' + JSON.stringify(attendu) + ' — le défaut de 083E');
  const d = ((o && o.cols) || []).map(c => c.dist);
  if (d.length && d.every((x, i) => i === 0 || x >= d[i - 1])) ok('triées par distance (' + d.join(' ≤ ') + ')');
  else ko('ordre des distances : ' + JSON.stringify(d));
  if (o && o.colTarget === propose[0]) ok('`colTarget` vaut toujours la plus proche — pilote, bot et bancs continuent de marcher');
  else ko('colTarget = ' + (o && o.colTarget) + ' ≠ première de la liste');
}

/* ── 3. Choisir une autre que la plus proche, et l'assaillir vraiment ──────── */
console.log('\n2. On peut choisir une AUTRE colonie que la plus proche — et c\'est bien elle qui est visée');
{
  const m = montage(true);
  const o = fenetre(m);
  const cols = (o && o.cols) || [];
  if (cols.length < 2) { ko('moins de deux cibles : le point ne peut pas être mesuré'); }
  else {
    const autre = cols[cols.length - 1].node;
    note('plus proche : ' + cols[0].node + ' · choisie : ' + autre);
    const q = (m.G._pendings || []).find(p => p.kind === 'forced_war');
    m.sb.resolveDecision(q.id, { colony: autre });
    const vise = m.sb.__G._flux && m.sb.__G._flux.donnees && m.sb.__G._flux.donnees.assautCible;
    note('cible réellement retenue par le moteur : ' + vise);
    if (vise === autre) ok('l\'assaut porte sur la colonie choisie, pas sur la plus proche');
    else ko('cible retenue « ' + vise +' » au lieu de « ' + autre + ' »');
  }
}

/* ── 4. CONTRE-ÉPREUVE — hors de portée, une seule cible ───────────────────── */
console.log('\n3. CONTRE-ÉPREUVE — nations non voisines : la règle ne rend qu\'une cible, la fenêtre non plus');
{
  const m = montage(false);
  const attendu = m.sb._getReachableWarTargets(m.moi, m.ia).map(c => c.nodeId);
  const o = fenetre(m);
  const propose = ((o && o.cols) || []).map(c => c.node);
  note('portée : ' + JSON.stringify(attendu) + ' · proposé : ' + JSON.stringify(propose));
  if (propose.length === attendu.length) ok('même nombre de cibles (' + propose.length + ') — on a unifié, pas élargi');
  else ko('la fenêtre propose ' + propose.length + ' cible(s) pour ' + attendu.length + ' à portée');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une seule règle de portée : ce que la guerre populaire propose est ce qu\'on peut attaquer.');
console.log('═'.repeat(84));
