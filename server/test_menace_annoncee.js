/* ============================================================================
   TEST — LA FENÊTRE DE DÉFENSE ANNONCE LA PUISSANCE RÉELLE DE L'ASSAILLANT
   ----------------------------------------------------------------------------
   Marc, partie E682, tour 9 : « la fenêtre de guerre me dit qu'il attaque avec 6 jetons et tout à
   coup il a plus de jetons ». Journal : « Défense : 2 jeton(s) engagé(s) » puis « Colonie Triton
   CAPTURÉE (8🛡️ vs 11⚔️) ». 8 = 2 jetons + 5 croiseur + 1 garnison ; 11 = 6 jetons + 5 du
   SUPERCROISEUR ADVERSE — que la fenêtre ne montrait pas. Marc a défendu contre un chiffre qui
   n'était pas le bon, et perdu une colonie pour cette raison.

   RÈGLE VERROUILLÉE ICI : ce qui est annoncé est ce qui se bat.
     1. la menace affichée = jetons + Empathes + carte Stratégie + Supercroiseur ;
     2. le déploiement du croiseur assaillant est DÉCIDÉ AVANT l'annonce (`G._aiCruAtt`) et repris
        tel quel à la résolution — pas re-décidé après coup ;
     3. CONTRE-ÉPREUVE : sans croiseur (ou croiseur en réparation), l'annonce redescend aux seuls
        jetons — on n'invente pas une menace ;
     4. rien de caché : les CARTES sont publiques, seule l'économie ne l'est pas (§14.7) ; sans
        Réseau Orbital le total reste marqué « estimé ».

   Usage : node test_menace_annoncee.js
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
  sb.initGame('ceinturiens', ['terriens']);
  const G = sb.__G;
  G.turn = 9; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.res.materials = 12; moi.res.energy = 12; moi.res.science = 6; moi.res.morale = 6;
  moi.forceTokens = 10;
  moi.colonies.push({ nodeId: 'triton', level: 2, connected: true });
  ia.res.materials = 12; ia.res.energy = 12; ia.forceTokens = 8;
  G.wars = [{ a: ia.civ.id, b: moi.civ.id, winsBy: {}, turnsLeft: 99, live: true, declaredBy: 'ai' }];
  /* ⚠️ ON FORCE LE MODE « DÉCISION ROUTÉE » (`setDecisionSink`). Sans lui, la fenêtre passe par le
     chemin SOLO qui écrit dans `document.body` — absent du bac à sable, et le banc meurt sur une
     exception au lieu de mesurer. Routée, la question devient une DONNÉE lisible : c'est aussi
     exactement ce que reçoit un joueur en ligne. */
  sb.setDecisionSink(function () {});
  return { sb, G, moi, ia };
}
/* Déclenche la fenêtre de défense et rend la charge utile de la question posée. */
function fenetre(m, aiCommit) {
  const cible = { type: 'colony', obj: m.moi.colonies.find(c => c.nodeId === 'triton'), name: 'Triton' };
  m.G._pendings = [];
  m.sb.showAiAssaultDefenseModal(m.ia, cible, aiCommit, 'stRien', m.moi);
  const q = (m.G._pendings || [])[0];
  return q ? (q.payload || {}) : null;
}

console.log('═'.repeat(84));
console.log('LA MENACE ANNONCÉE EST CELLE QUI SE BAT');
console.log('═'.repeat(84) + '\n');

/* ── 1. Avec le Supercroiseur adverse ─────────────────────────────────────── */
console.log('1. L\'assaillant a un Supercroiseur payable : la fenêtre annonce 6 + 5, pas 6');
{
  const m = montage();
  vm.runInContext("G.ais[0].cards.push(CARDS_POOL.find(c=>c.id==='mil3')); G.ais[0].hasCruiser=true; G.ais[0].cruiserPower=5;", m.sb);
  const o = fenetre(m, 6);
  note('menace annoncée : ' + (o && o.threat) + ' · détail : ' + (o && o.threatDetail) + ' · croiseur signalé : ' + (o && o.attackerCruiser));
  if (o && o.threat === 11) ok('11 annoncés (6 jetons + 5 Supercroiseur)');
  else ko('menace annoncée ' + (o && o.threat) + ' au lieu de 11 — le défaut de E682');
  if (o && o.attackerCruiser) ok('et le croiseur est signalé explicitement');
  else ko('le croiseur adverse n\'est pas signalé');
  if (o && /Supercroiseur/.test(o.threatDetail || '')) ok('le détail dit d\'où viennent les points');
  else ko('aucun détail de la menace');
}

/* ── 2. Ce qui est annoncé est ce qui se bat ──────────────────────────────── */
console.log('\n2. Le combat se résout avec le croiseur annoncé — pas une seconde décision');
{
  const m = montage();
  vm.runInContext("G.ais[0].cards.push(CARDS_POOL.find(c=>c.id==='mil3')); G.ais[0].hasCruiser=true; G.ais[0].cruiserPower=5;", m.sb);
  const o = fenetre(m, 6);
  /* Entre l'annonce et la résolution, l'IA se retrouve SANS LE SOU : sans report de la décision,
     `cruiserAfford` redeviendrait faux et le combat se jouerait à 6 au lieu des 11 annoncés. */
  m.ia.res.materials = 0; m.ia.res.energy = 0;
  const avantLog = (m.G.log || []).length;
  const q = (m.G._pendings || [])[0];
  m.sb.resolveDecision(q.id, { defTokens: 2, cruiser: true });
  const nouv = (m.G.log || []).slice(0, Math.max(0, (m.G.log || []).length - avantLog)).map(l => (l && l.msg) || String(l));
  const combat = nouv.find(t => /vs .*⚔️|⚔️\)/.test(t)) || nouv.join(' | ');
  note('annoncé ' + (o && o.threat) + ' · ligne de combat : ' + String(combat).slice(0, 120));
  if (nouv.some(t => /déploie son Supercroiseur/.test(t))) ok('le croiseur annoncé est bien déployé au combat');
  else ko('le croiseur annoncé n\'a pas été déployé : l\'annonce et le combat divergent');
}

/* ── 3. CONTRE-ÉPREUVE — pas de croiseur, pas de menace inventée ──────────── */
console.log('\n3. CONTRE-ÉPREUVE — sans croiseur, ou croiseur en réparation, l\'annonce redescend');
{
  const m = montage();
  const o = fenetre(m, 6);
  note('sans croiseur : menace ' + (o && o.threat) + ' · signalé : ' + (o && o.attackerCruiser));
  if (o && o.threat === 6 && !o.attackerCruiser) ok('6 annoncés, aucun croiseur signalé');
  else ko('menace ' + (o && o.threat) + ' alors que l\'assaillant n\'a pas de croiseur');

  const m2 = montage();
  vm.runInContext("G.ais[0].cards.push(CARDS_POOL.find(c=>c.id==='mil3')); G.ais[0].hasCruiser=true; G.ais[0].cruiserPower=5; G.ais[0].cruiserCooldown=G.turn+2;", m2.sb);
  const o2 = fenetre(m2, 6);
  note('croiseur en réparation : menace ' + (o2 && o2.threat));
  if (o2 && o2.threat === 6) ok('un croiseur en réparation ne compte pas dans la menace');
  else ko('menace ' + (o2 && o2.threat) + ' avec un croiseur indisponible');

  const m3 = montage();
  vm.runInContext("G.ais[0].cards.push(CARDS_POOL.find(c=>c.id==='mil3')); G.ais[0].hasCruiser=true; G.ais[0].cruiserPower=5;", m3.sb);
  m3.ia.res.materials = 0; m3.ia.res.energy = 0;      // il ne peut pas le payer
  const o3 = fenetre(m3, 6);
  note('croiseur impayable : menace ' + (o3 && o3.threat));
  if (o3 && o3.threat === 6) ok('un croiseur qu\'il ne peut pas payer ne compte pas non plus');
  else ko('menace ' + (o3 && o3.threat) + ' avec un croiseur impayable');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le défenseur voit la vraie force de l\'assaut, croiseur compris, et le combat s\'y tient.');
console.log('═'.repeat(84));
