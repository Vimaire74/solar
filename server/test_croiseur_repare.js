/* ============================================================================
   TEST — QUAND LE SUPERCROISEUR PERD, LE JOUEUR EST PRÉVENU DE SA RÉPARATION
   ----------------------------------------------------------------------------
   Marc, 04/09, après E682 : « Il faut un message dans le jeu qui dise : tu as perdu le combat avec
   ton supercroiseur, il est dès lors en récupération deux tours (ou 1 avec investissement tour 7).
   Comme ça personne n'est surpris. »
   Au tour 10 de E682, son croiseur n'était pas proposé : il était en réparation depuis la défense
   perdue du tour 9. La RÈGLE était juste — c'est le SILENCE qui était le défaut.

   RÈGLES VERROUILLÉES ICI :
     1. défense perdue avec le croiseur engagé → réparation ET un message qui dit combien de tours
        et à quel tour il revient (fenêtre de combat en mode routé, donc lisible ici) ;
     2. le compte est le vrai : 2 tours normalement, 1 avec l'investissement « Stratégie Guerrière » ;
     3. CONTRE-ÉPREUVE — défense GAGNÉE avec le croiseur : aucune réparation, aucun message (sinon
        on annoncerait une punition qui n'existe pas) ;
     4. l'assaut de reprise d'une IA (défense automatique, sans fenêtre de combat) prévient par la
        même porte que les raids subis : le joueur ne peut pas rater l'information ;
     5. UNE SEULE PORTE : plus personne n'écrit `cruiserCooldown` à la main hors de
        `croiseurEnReparation` — c'est ce qui garantit qu'aucun chemin ne redevient muet.

   Usage : node test_croiseur_repare.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const MOTEUR = path.join(__dirname, '..', 'moteur.js');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['terriens']);
  const G = sb.__G;
  G.turn = 7; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 20; moi.res.energy = 20; moi.res.science = 6; moi.res.morale = 6;
  moi.forceTokens = 6; moi.hasCruiser = true; moi.cruiserPower = 5;
  moi.colonies.push({ nodeId: 'triton', level: 2, connected: true });
  ia.res.materials = 20; ia.res.energy = 20; ia.forceTokens = 12;
  G.wars = [{ a: ia.civ.id, b: moi.civ.id, winsBy: {}, turnsLeft: 99, live: true, declaredBy: 'ai' }];
  sb.setDecisionSink(function () {});    // mode routé : les fenêtres deviennent des DONNÉES lisibles
  return { sb, G, moi, ia };
}
/* Joue une défense complète : fenêtre annoncée, réponse du joueur, combat. Rend tout ce que le
   joueur a reçu — corps de la fenêtre de combat, avertissements différés, journal. */
function defendre(m, aiCommit, defTokens) {
  const cible = { type: 'colony', obj: m.moi.colonies.find(c => c.nodeId === 'triton'), name: 'Triton' };
  m.G._pendings = [];
  const avantLog = (m.G.log || []).length;
  m.sb.showAiAssaultDefenseModal(m.ia, cible, aiCommit, 'stRien', m.moi);
  const q = (m.G._pendings || [])[0];
  if (q) m.sb.resolveDecision(q.id, { defTokens, cruiser: true });
  const notices = (m.G._pendings || []).map(p => JSON.stringify(p.payload || {})).join(' | ');
  const hits = ((m.G._ilPlayerHits) || []).map(h => (h.title || '') + ' ' + (h.body || '')).join(' | ');
  const journal = (m.G.log || []).slice(0, Math.max(0, (m.G.log || []).length - avantLog)).map(l => (l && l.msg) || String(l)).join(' | ');
  return { vu: notices + ' | ' + hits, journal, cooldown: m.moi.cruiserCooldown };
}

console.log('═'.repeat(84));
console.log('SUPERCROISEUR VAINCU — LA RÉPARATION EST ANNONCÉE, PAS SUBIE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Défense perdue : réparation annoncée, avec le compte des tours ─────── */
console.log('1. Défense perdue avec le croiseur engagé : 2 tours de réparation, annoncés au joueur');
{
  const m = montage();
  const r = defendre(m, 14, 2);        // 14 jetons contre 2 + 5 croiseur + 1 garnison : perdue d'avance
  note('cooldown posé : ' + r.cooldown + ' (tour ' + m.G.turn + ') · message reçu : ' + /Supercroiseur/.test(r.vu));
  if (r.cooldown === m.G.turn + 2) ok('croiseur en réparation jusqu\'au tour ' + r.cooldown);
  else ko('cooldown ' + r.cooldown + ' au lieu de ' + (m.G.turn + 2));
  if (/Supercroiseur/.test(r.vu) && /réparation/.test(r.vu)) ok('le joueur lit que son Supercroiseur part en réparation');
  else ko('AUCUN message : c\'est exactement le silence de E682');
  if (/2 tours/.test(r.vu)) ok('le message dit combien de tours (2)');
  else ko('le message ne dit pas la durée');
  if (new RegExp('tour ' + (m.G.turn + 2)).test(r.vu)) ok('et à quel tour il revient (tour ' + (m.G.turn + 2) + ')');
  else ko('le message ne dit pas le tour de retour');
  if (/pas perdu/.test(r.vu) || /pas détruit/.test(r.vu)) ok('et qu\'il n\'est pas détruit — l\'angoisse en moins');
  else ko('rien ne dit que le croiseur est conservé');
}

/* ── 2. Avec « Stratégie Guerrière » : 1 tour, et le message le dit ────────── */
console.log('\n2. Avec l\'investissement « Stratégie Guerrière » (tour 7) : 1 tour, annoncé comme tel');
{
  const m = montage();
  m.moi.investBonus2 = { fastCooldown: true, turnsLeft: 4 };
  const r = defendre(m, 14, 2);
  note('cooldown : ' + r.cooldown + ' · message : ' + (r.vu.match(/réparation [^—<"]*/) || [''])[0]);
  if (r.cooldown === m.G.turn + 1) ok('un seul tour de réparation');
  else ko('cooldown ' + r.cooldown + ' au lieu de ' + (m.G.turn + 1));
  if (/1 tour(?!s)/.test(r.vu)) ok('le message annonce 1 tour, pas 2 — le compte affiché est le vrai');
  else ko('le message annonce encore 2 tours alors que la réparation dure 1 tour');
}

/* ── 3. CONTRE-ÉPREUVE — défense gagnée : rien du tout ─────────────────────── */
console.log('\n3. CONTRE-ÉPREUVE — défense GAGNÉE avec le croiseur : ni réparation, ni message');
{
  const m = montage();
  const r = defendre(m, 2, 6);         // 6 + 5 + 1 contre 2 : la défense tient
  note('cooldown : ' + (r.cooldown || 'aucun') + ' · message « réparation » : ' + /réparation/.test(r.vu));
  if (!r.cooldown) ok('le croiseur reste disponible');
  else ko('réparation imposée après une défense GAGNÉE');
  if (!/Supercroiseur vaincu/.test(r.vu)) ok('et aucun message de réparation — on n\'annonce pas une punition inexistante');
  else ko('un message de réparation après une victoire');
}

/* ── 4. Assaut de reprise (défense automatique, sans fenêtre) ──────────────── */
console.log('\n4. Reprise d\'une IA (défense automatique, pas de fenêtre de combat) : le joueur est prévenu quand même');
{
  const m = montage();
  const col = m.moi.colonies.find(c => c.nodeId === 'triton');
  m.G._pendings = [];
  m.ia.acLeft = 2;
  /* `resolveAiAssault` : la reprise d'une colonie pendant le TOUR de l'IA. Le croiseur du joueur y
     défend TOUT SEUL, sans fenêtre — c'est le chemin le plus silencieux du moteur, donc celui qui
     avait le plus besoin d'un message. */
  m.sb.resolveAiAssault(m.ia, 'triton', 14);
  const vu = (m.G._pendings || []).map(p => JSON.stringify(p.payload || {})).join(' | ')
           + ' | ' + ((m.G._ilPlayerHits) || []).map(h => (h.title || '') + ' ' + (h.body || '')).join(' | ');
  note('colonie perdue : ' + !m.moi.colonies.some(c => c.nodeId === 'triton') + ' · cooldown : ' + m.moi.cruiserCooldown + ' · message : ' + /Supercroiseur/.test(vu));
  if (m.moi.cruiserCooldown === m.G.turn + 2) ok('le croiseur a défendu et part en réparation 2 tours');
  else ko('cooldown ' + m.moi.cruiserCooldown + ' : le croiseur n\'a pas défendu comme prévu sur ce chemin');
  if (/Supercroiseur/.test(vu) && /réparation/.test(vu)) ok('et le joueur en est averti — même sans fenêtre de combat');
  else ko('réparation posée EN SILENCE sur ce chemin : le joueur ne le saura qu\'en cherchant son croiseur');
}

/* ── 5. UNE SEULE PORTE ────────────────────────────────────────────────────── */
console.log('\n5. Plus personne n\'écrit `cruiserCooldown` à la main : une seule porte, donc aucun chemin muet');
{
  const src = fs.readFileSync(MOTEUR, 'utf8');
  const lignes = src.split('\n');
  const ecrits = [];
  lignes.forEach((l, i) => {
    if (/\.cruiserCooldown\s*=/.test(l) && !/^\s*\/\//.test(l)) ecrits.push((i + 1) + ' : ' + l.trim().slice(0, 70));
  });
  note('affectations de `cruiserCooldown` dans moteur.js : ' + ecrits.length);
  for (const e of ecrits) note('   · ' + e);
  if (ecrits.length === 1 && /p\.cruiserCooldown=retour/.test(ecrits[0])) ok('une seule, dans `croiseurEnReparation` — le message ne peut plus être oublié');
  else ko(ecrits.length + ' affectations : un chemin peut remettre le croiseur en réparation sans rien dire');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un Supercroiseur vaincu part en réparation en le disant : durée, tour de retour, et qu\'il est vivant.');
console.log('═'.repeat(84));
