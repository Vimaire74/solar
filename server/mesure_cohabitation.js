/* ============================================================================
   MESURE — DEUX NATIONS SUR LE MÊME NŒUD : QUE FAIT LA GUERRE ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il installe la situation et raconte ce qui arrive.

   POURQUOI. Marc, 2026-08-14 : « qu'est-ce qui se passe si une nation attaque sa
   colonie partagée extra solaire ? Et si une autre nation l'attaque ou la prend, il
   se passe quoi ? On doit résoudre ça aussi. »

   LA SITUATION. `Exploration Extra-Solaire` est le SEUL moyen d'avoir deux colonies
   de nations différentes sur un même nœud. Tout le reste du moteur a été écrit en
   supposant « un nœud = un propriétaire » : `getNodeOwnerAI(nodeId)` rend UNE nation,
   la capture fait `defenseur.colonies.filter(c=>c.nodeId!==cible)` puis
   `attaquant.colonies.push(...)`. Aucune de ces lignes ne sait qu'on peut être deux.

   ON NE LIT PAS LE CODE POUR RÉPONDRE. On monte les trois scènes et on regarde.

   Usage : node mesure_cohabitation.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

function scene() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) {
    p.res = { energy: 25, materials: 25, science: 25, morale: 7 };
    p.acLeft = 5; p.acMax = 5; p.forceTokens = 8;
  }
  G.turn = 8; G.phase = 'actions';
  return { sb, G };
}
const nat = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const surLeNoeud = (G, id) => [G.player].concat(G.ais)
  .filter(p => p.colonies.some(c => c.nodeId === id))
  .map(p => p.civ.id + ':Nv' + p.colonies.filter(c => c.nodeId === id).map(c => c.level).join('+')
    + (p.colonies.filter(c => c.nodeId === id).length > 1 ? ' ⚠️×' + p.colonies.filter(c => c.nodeId === id).length : ''));

console.log('═'.repeat(78));
console.log('COHABITATION SUR UN NŒUD — CE QUE LA GUERRE EN FAIT');
console.log('═'.repeat(78));
console.log('Éris : Martiens s\'y installent d\'abord (Nv.2), Terriens arrivent par Extra-Solaire.\n');

/* ── Scène 0 : qui le moteur considère-t-il comme « le propriétaire » ? ────── */
{
  const { sb, G } = scene();
  const moi = G.player, mars = nat(G, 'martiens');
  mars.colonies.push({ nodeId: 'eris', level: 2, connected: true });
  sb._extraSolarColonize(moi, 'eris');
  console.log('── 0. « À qui est ce nœud ? »');
  console.log('   occupants réels      : ' + surLeNoeud(G, 'eris').join('  ·  '));
  const o = sb.ownerNation('eris');
  console.log('   ownerNation("eris")  : ' + (o ? o.civ.id : 'aucune') + '   ← une seule réponse pour deux occupants');
  const a = sb.getNodeOwnerAI('eris');
  console.log('   getNodeOwnerAI       : ' + (a ? a.civ.id : 'aucune'));
  console.log('');
}

/* ── Scène 1 : un cohabitant attaque « sa » colonie partagée ───────────────── */
{
  const { sb, G } = scene();
  const moi = G.player, mars = nat(G, 'martiens');
  mars.colonies.push({ nodeId: 'eris', level: 2, connected: true });
  sb._extraSolarColonize(moi, 'eris');
  console.log('── 1. TERRIENS (cohabitant) attaquent Éris');
  const avant = surLeNoeud(G, 'eris').join('  ·  ');
  let ennemi = null;
  try { ennemi = sb.getNodeOwnerAI('eris'); } catch (e) {}
  console.log('   cible désignée par le moteur : ' + (ennemi ? ennemi.civ.id : 'AUCUNE'));
  if (ennemi && ennemi.civ.id === moi.civ.id) console.log('   ⚠️ LE MOTEUR DÉSIGNE L\'ATTAQUANT LUI-MÊME — guerre contre soi.');
  try { sb.playerAssaultColony('eris'); } catch (e) { console.log('   ⚠️ playerAssaultColony a levé : ' + e.message.split('\n')[0]); }
  const guerres = (G.wars || []).map(w => w.a + ' vs ' + w.b);
  console.log('   avant : ' + avant);
  console.log('   après : ' + surLeNoeud(G, 'eris').join('  ·  '));
  console.log('   guerres ouvertes : ' + (guerres.length ? guerres.join(', ') : 'aucune'));
  console.log('');
}

/* ── Scène 2 : une TIERCE nation capture le nœud partagé ───────────────────── */
{
  const { sb, G } = scene();
  const moi = G.player, mars = nat(G, 'martiens'), jup = nat(G, 'jupiteriens');
  mars.colonies.push({ nodeId: 'eris', level: 2, connected: true });
  sb._extraSolarColonize(moi, 'eris');
  console.log('── 2. JUPITÉRIENS (tiers) capturent Éris — on force la victoire');
  console.log('   avant : ' + surLeNoeud(G, 'eris').join('  ·  '));
  /* On rejoue la capture telle que le moteur l'écrit, sans passer par le hasard du combat :
     c'est la SUITE de la victoire qu'on veut observer, pas le dé. */
  const defenseur = sb.ownerNation('eris');
  const cible = defenseur.colonies.find(c => c.nodeId === 'eris');
  console.log('   défenseur désigné : ' + defenseur.civ.id + ' (Nv.' + cible.level + ')');
  defenseur.colonies = defenseur.colonies.filter(c => c.nodeId !== 'eris');
  vm.runInContext('updateConnections(allPlayers().find(p=>p.civ.id==="' + defenseur.civ.id + '"))', sb);
  jup.colonies.push({ nodeId: 'eris', level: Math.max(1, cible.level - 1), connected: true });
  console.log('   après : ' + surLeNoeud(G, 'eris').join('  ·  '));
  console.log('   → l\'autre cohabitant est TOUJOURS là : la « capture » n\'a pris qu\'une des deux.');
  console.log('');
}

/* ── Scène 3 : le cohabitant capture, alors qu'il a DÉJÀ une colonie ───────── */
{
  const { sb, G } = scene();
  const moi = G.player, mars = nat(G, 'martiens');
  mars.colonies.push({ nodeId: 'eris', level: 3, connected: true });
  sb._extraSolarColonize(moi, 'eris');
  console.log('── 3. Le COHABITANT gagne l\'assaut : que devient sa colonie de Nv.1 ?');
  console.log('   avant : ' + surLeNoeud(G, 'eris').join('  ·  '));
  const tc = mars.colonies.find(c => c.nodeId === 'eris');
  mars.colonies = mars.colonies.filter(c => c.nodeId !== 'eris');
  const newLvl = Math.max(1, tc.level - 1);
  // Chemin du joueur (L5493) : garde-fou `if(!déjà présent)`
  if (!moi.colonies.some(c => c.nodeId === 'eris')) moi.colonies.push({ nodeId: 'eris', level: newLvl, connected: true });
  const apres = moi.colonies.find(c => c.nodeId === 'eris');
  console.log('   après (chemin JOUEUR) : ' + surLeNoeud(G, 'eris').join('  ·  ')
    + '   — niveau ' + apres.level + ', non améliorable : ' + (apres.noUpgrade ? 'OUI' : 'non'));
  console.log('   → le vainqueur détruit une colonie de Nv.' + tc.level + ' et reste bloqué à Nv.1,');
  console.log('     avec l\'interdiction d\'améliorer alors qu\'il n\'y a plus personne avec qui cohabiter.');

  // Chemin de l'IA (L6102) : AUCUN garde-fou
  const { sb: sb2, G: G2 } = scene();
  const ia = nat(G2, 'martiens'), autre = nat(G2, 'jupiteriens');
  autre.colonies.push({ nodeId: 'eris', level: 3, connected: true });
  sb2._extraSolarColonize(ia, 'eris');
  const t2 = autre.colonies.find(c => c.nodeId === 'eris');
  autre.colonies = autre.colonies.filter(c => c.nodeId !== 'eris');
  ia.colonies.push({ nodeId: 'eris', level: Math.max(1, t2.level - 1), connected: true });   // ligne 6102, telle quelle
  console.log('   après (chemin IA)     : ' + surLeNoeud(G2, 'eris').join('  ·  '));
  console.log('   → le chemin de l\'IA n\'a AUCUN garde-fou : elle se retrouve avec DEUX colonies');
  console.log('     sur le même nœud, comptées deux fois en points de victoire.');
  const vp = sb2.calcVP(ia);
  console.log('   points de colonies de cette IA : ' + vp.colVP);
}

console.log('\n' + '═'.repeat(78));
console.log('CE QUE LA MESURE ÉTABLIT — à trancher par Marc, ce sont des règles, pas des défauts');
console.log('═'.repeat(78));
