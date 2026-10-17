/* ============================================================================
   TEST — ON DOIT POUVOIR ATTAQUER UN JOUEUR HUMAIN
   ----------------------------------------------------------------------------
   POURQUOI. Marc et Laurent, partie 140A du 23/08 : « les conquêtes ne marchent plus, on peut pas
   attaquer quelqu'un en direct, ça ne fait rien […] l'autre n'est jamais prévenu et ne peut pas
   défendre non plus. » Trois assauts au tour 10, aucun effet ; et l'IA, qui avait annoncé
   « Jupitériens marche sur Titan », n'a jamais frappé.

   DEUX DÉFAUTS DANS `ACTIONS.attack`, tous deux de perspective :
     1. le propriétaire du nœud était cherché avec `getNodeOwnerAI`, qui ne rend un résultat QUE si
        la nation est tenue par l'ordinateur (`o._isAI !== false`). Contre un humain : `null`, puis
        `return` silencieux — pas d'AC, pas de ressources, pas de guerre, pas de message ;
     2. la guerre était retrouvée par « n'importe quelle guerre impliquant le propriétaire », et non
        « la guerre entre LUI et MOI ». Avec une guerre déjà en cours ailleurs, l'assaut se greffait
        sur le mauvais conflit.

   ⚠️ CE BANC VÉRIFIE L'EFFET, PAS L'ABSENCE D'ERREUR. Le défaut ne levait aucune exception : il ne
   faisait RIEN, ce qui est le mode de panne le plus difficile à voir. On mesure donc des
   conséquences observables — une guerre déclarée entre les deux bonnes nations, une fenêtre de
   défense envoyée au bon joueur, des AC dépensés.

   Usage : node test_conquete_humain.js
   ========================================================================== */
'use strict';
const path = require('path');
const { Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Deux humains + une IA, comme la partie de Marc. La cible appartient à L'AUTRE HUMAIN. */
function montage(html, o) {
  o = o || {};
  const eng = new Engine(html);
  const sb = eng.sb;
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player;
  const laurent = G.ais.find(a => a.civ.id === 'ceinturiens');
  const ia = G.ais.find(a => a.civ.id === 'jupiteriens');
  moi._isAI = false; laurent._isAI = false; ia._isAI = true;
  G.turn = 8; G.phase = 'actions';
  moi.acLeft = 5; moi.forceTokens = 10; moi.res.materials = 12; moi.res.energy = 12; moi.res.morale = 8;
  laurent.forceTokens = 4; laurent.res.materials = 6; laurent.res.energy = 6;
  ia.forceTokens = 4; ia.res.materials = 6; ia.res.energy = 6;
  /* La colonie visée : à Laurent, hors capitale, connectée. */
  if (!laurent.colonies.some(c => c.nodeId === 'titan')) laurent.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  if (!ia.colonies.some(c => c.nodeId === 'ceres')) ia.colonies.push({ nodeId: 'ceres', level: 2, connected: true });
  /* Cas « une guerre existe déjà ailleurs » : c'est ce qui a fait dérailler l'assaut de Marc contre
     l'IA au tour 10 de sa partie. */
  if (o.guerreTierce) { try { sb.declarerGuerre(ia, laurent, 'guerre entre eux deux', 'ai'); } catch (e) {} }
  const vus = [];
  sb.setDecisionSink(p => vus.push(p));
  return { eng, sb, G, moi, laurent, ia, vus };
}

console.log('═'.repeat(80));
console.log('CONQUÊTES — ATTAQUER UN HUMAIN, ET LA BONNE NATION');
console.log('═'.repeat(80) + '\n');

/* ── 1. Attaquer la colonie d'un joueur humain ────────────────────────────── */
console.log('1. J\'ATTAQUE LA COLONIE DE LAURENT (humain)');
{
  const m = montage(HTML);
  const acAvant = m.moi.acLeft;
  m.eng.apply({ type: 'attack', node: 'titan', tokens: 3 });
  const guerre = m.sb._warBetween('martiens', 'ceinturiens');
  const defense = m.vus.find(p => p.kind === 'defense');
  note('AC : ' + acAvant + ' → ' + m.moi.acLeft + ' · guerre martiens↔ceinturiens : ' + (guerre ? 'oui' : 'non')
    + ' · fenêtres émises : ' + (m.vus.map(p => p.kind).join(', ') || 'aucune'));
  if (guerre) ok('la guerre est déclarée entre les deux BONNES nations');
  else ko('aucune guerre déclarée : l\'assaut est retombé en silence');
  if (defense) ok('une fenêtre de défense est envoyée');
  else ko('le défenseur n\'est pas prévenu — il ne peut pas défendre');
  if (defense && defense.nation === 'ceinturiens') ok('et elle est adressée à Laurent, le défenseur');
  else if (defense) ko('la fenêtre de défense part à « ' + defense.nation +' » au lieu de ceinturiens');
  if (m.moi.acLeft === acAvant - 1) ok('l\'assaut a bien coûté 1 AC');
  else ko('AC dépensés : ' + (acAvant - m.moi.acLeft) + ' (attendu 1)');
}

/* ── 2. CONTRE-ÉPREUVE — la cause exacte, isolée ──────────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — pourquoi l\'ancien code sortait en silence');
{
  /* ⚠️ LE TÉMOIN FIGÉ NE SERT À RIEN ICI, ET IL FAUT LE DIRE. `server/temoin_v9.69/` ne contient
     que `moteur.js` et `index.html` : le défaut, lui, vivait dans `game-core.js`, qui n'est pas
     figé. Rejouer l'assaut sur le témoin fait donc tourner l'ANCIEN moteur avec le NOUVEAU serveur —
     et cela passe au vert sans rien prouver. Mon premier jet est tombé dans ce piège.
     On isole donc la cause elle-même : les deux fonctions qui répondent à la question « qui défend
     ce nœud ? », et leur désaccord sur un propriétaire humain. C'est ce désaccord, et lui seul, qui
     faisait sortir `ACTIONS.attack` sans rien faire. */
  const m = montage(HTML);
  const ancien = m.sb.getNodeOwnerAI('titan');          // ce que l'ancien code appelait
  const nouveau = m.sb.defenseurPrincipal('titan', m.moi);
  note('titan appartient à Laurent (humain) — getNodeOwnerAI : ' + (ancien ? ancien.civ.id : 'null')
    + ' · defenseurPrincipal : ' + (nouveau ? nouveau.civ.id : 'null'));
  if (!ancien) ok('`getNodeOwnerAI` rend null sur une colonie humaine — la cause du silence est reproduite');
  else ko('`getNodeOwnerAI` rend « ' + ancien.civ.id + ' » : le défaut ne se reproduit plus, ce banc ne prouve rien');
  if (nouveau && nouveau.civ.id === 'ceinturiens') ok('`defenseurPrincipal` désigne bien Laurent');
  else ko('`defenseurPrincipal` ne désigne pas le défenseur humain');
  /* Et sur une colonie d'IA, les deux doivent s'accorder : sinon on aurait corrigé un cas en
     cassant l'autre. */
  const aIa = m.sb.getNodeOwnerAI('ceres'), nIa = m.sb.defenseurPrincipal('ceres', m.moi);
  if (aIa && nIa && aIa.civ.id === nIa.civ.id) ok('contre-épreuve : sur une colonie d\'IA, les deux fonctions s\'accordent');
  else ko('divergence sur une colonie d\'IA : ' + (aIa ? aIa.civ.id : 'null') + ' vs ' + (nIa ? nIa.civ.id : 'null'));
}

/* ── 3. Une guerre entre deux AUTRES nations ne doit pas capter mon assaut ── */
console.log('\n3. UNE GUERRE EXISTE DÉJÀ ENTRE L\'IA ET LAURENT — j\'attaque l\'IA');
{
  const m = montage(HTML, { guerreTierce: true });
  const avant = (m.G.wars || []).length;
  m.eng.apply({ type: 'attack', node: 'ceres', tokens: 3 });
  const mienne = m.sb._warBetween('martiens', 'jupiteriens');
  const leur = m.sb._warBetween('jupiteriens', 'ceinturiens');
  /* ⚠️ ADAPTÉ LE 16/09, LA RÈGLE A CHANGÉ VOLONTAIREMENT (§134 étape 3). Ce banc demandait « MA
     guerre contre l'IA est-elle déclarée ? » — un assaut n'ouvre plus de guerre, la question n'a
     plus d'objet. CE QU'IL VÉRIFIAIT VRAIMENT reste entier et c'est ce qu'on garde : mon assaut
     doit engager MON couple de nations, et pas se greffer sur la guerre de deux autres. La trace
     en est maintenant la TENSION — celle de l'IA agressée envers moi — au lieu d'un enregistrement
     de guerre. La contre-épreuve, elle, ne bouge pas d'un mot : la guerre des deux autres est intacte. */
  const rancune = m.sb.getTens('jupiteriens', 'martiens');
  note('guerres : ' + avant + ' → ' + (m.G.wars || []).length
    + ' · martiens↔jupiteriens : ' + (mienne ? 'GUERRE' : 'non') + ' · jupiteriens↔ceinturiens : ' + (leur ? 'oui' : 'non')
    + ' · rancune jupiteriens→martiens : ' + rancune + '/10');
  if (!mienne) ok('aucune guerre ouverte par mon assaut — c\'est une escarmouche');
  else ko('mon assaut a ouvert une vraie guerre');
  if (rancune >= 6) ok('c\'est bien MOI que l\'IA tient pour responsable (tension ' + rancune + ')');
  else ko('l\'assaut ne m\'est pas imputé — tension jupiteriens→martiens : ' + rancune
    + ' : il s\'est peut-être greffé sur la guerre des autres');
  /* CONTRE-ÉPREUVE : on ne doit pas non plus avoir DÉTRUIT la guerre des deux autres. */
  if (leur) ok('contre-épreuve : la guerre entre les deux autres nations est intacte');
  else ko('contre-épreuve ÉCHOUÉE : la guerre entre l\'IA et Laurent a disparu');
}

/* ── 4. Attaquer une colonie qui n'appartient à personne d'autre ──────────── */
console.log('\n4. CONTRE-ÉPREUVE — une cible sans défenseur doit être refusée, pas silencieuse');
{
  const m = montage(HTML);
  const acAvant = m.moi.acLeft;
  const libre = m.moi.colonies[0] ? m.moi.colonies[0].nodeId : 'phobos';   // ma propre colonie
  m.eng.apply({ type: 'attack', node: libre, tokens: 3 });
  const dit = (m.G.log || []).some(l => /Assaut impossible/i.test(String((l && l.msg) || l)));
  note('AC : ' + acAvant + ' → ' + m.moi.acLeft + ' · message d\'impossibilité : ' + dit);
  if (m.moi.acLeft === acAvant) ok('aucune AC gaspillée sur une cible invalide');
  else ko('l\'assaut impossible a quand même coûté ' + (acAvant - m.moi.acLeft) + ' AC');
  if (dit) ok('et le refus est DIT — plus de sortie silencieuse');
  else ko('refus silencieux : le joueur ne saura pas pourquoi rien ne se passe');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ On attaque un humain comme une IA, la bonne guerre est déclarée, le défenseur est');
console.log('  prévenu, et une cible invalide est refusée à voix haute.');
