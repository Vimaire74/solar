/* ============================================================================
   TEST — ÉGALITÉ AU COMBAT : MÊME RÈGLE PAR TOUS LES CHEMINS (Marc, 02/10)
   ----------------------------------------------------------------------------
   RÈGLE (Marc) : « à égalité, le défenseur conserve sa colonie ou capitale, les deux nations
   perdent la moitié de leurs jetons en récupération mais aucun jeton n'est définitivement perdu,
   moral −1 pareil. Pas de gain en VP. Même traitement pour joueur ou IA. »

   AVANT : trois résolutions, deux règles. Quand le joueur attaque (`resolveWarCombat`), l'égalité
   était un match nul conforme. Quand l'ordinateur attaque un humain (`resolveAiAssaultOnPlayer`,
   fenêtre de défense) ou reprend une colonie pendant son tour (`resolveAiAssault`), l'égalité
   valait VICTOIRE DU DÉFENSEUR : +2 VP, l'assaillant perdait la moitié de ses jetons pour de bon,
   lui seul perdait du moral.

   CE QUE CE BANC VERROUILLE, pour chacun des trois chemins, à puissances strictement égales :
     · la cible reste au défenseur ;
     · aucun VP « Combat gagné » d'aucun côté ;
     · −1 moral des deux côtés ;
     · jetons : moitié des engagés en récupération, l'autre moitié revenue, RIEN de perdu ;
     · aucune victoire comptée dans la guerre (`winsBy`).
   CONTRE-ÉPREUVE : une puissance de plus d'un côté redonne un vainqueur (le banc voit la différence).

   Usage : node test_egalite_combat.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const eng = new Engine(HTML);
  const sb = eng.sb;
  sb.initGame('terriens', ['jupiteriens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const hum = G.player, jup = G.ais[0];
  hum._isAI = false; jup._isAI = true;
  for (const p of [hum, jup]) { p.res.morale = 8; p.forceCooldown = []; p.hasCruiser = false; p.stratBonus = null; p.cards = []; p.techs = []; }
  jup.acLeft = 3; jup.forceTokens = 4; jup.res.materials = 30; jup.res.energy = 30;
  jup.colonies.push({ nodeId: 'vesta', level: 2, connected: true });
  hum.colonies.push({ nodeId: 'ceres', level: 2, connected: true });
  hum.forceTokens = 3; hum.res.materials = 20; hum.res.energy = 20;
  sb.declarerGuerre(jup, hum, 'banc', 'other');
  sb.setDecisionSink(function () {});
  return { eng, sb, G, hum, jup };
}
const vp = (n) => (n._vpDetail || []).filter(d => /Combat gagné/.test(d.raison)).reduce((s, d) => s + d.n, 0);
const recup = (n) => (n.forceCooldown || []).reduce((s, c) => s + (c.count || 0), 0);
const total = (n) => (n.forceTokens || 0) + recup(n);

function verifier(nom, m, { defenseur, attaquant, engDef, engAtt, cibleChez, noeud }) {
  const tenue = cibleChez.colonies.some(c => c.nodeId === noeud);
  if (tenue) ok(nom + ' : la cible reste au défenseur'); else ko(nom + ' : la cible a changé de main');
  if (vp(m.hum) === 0 && vp(m.jup) === 0) ok(nom + ' : aucun VP de combat'); else ko(nom + ' : VP — humain ' + vp(m.hum) + ', IA ' + vp(m.jup));
  if (m.hum.res.morale === 7 && m.jup.res.morale === 7) ok(nom + ' : −1 moral des deux côtés'); else ko(nom + ' : moral humain ' + m.hum.res.morale + ', IA ' + m.jup.res.morale + ' (attendu 7 / 7)');
  // jetons : rien de perdu, moitié (arrondie bas) en récupération
  const attendu = (n, eng, avant) => (total(n) === avant) && (recup(n) === Math.floor(eng / 2));
  if (attendu(defenseur.n, engDef, defenseur.avant)) ok(nom + ' : défenseur — ' + engDef + ' engagés, ' + recup(defenseur.n) + ' en récupération, aucun perdu');
  else ko(nom + ' : défenseur — total ' + total(defenseur.n) + ' (avant ' + defenseur.avant + '), récupération ' + recup(defenseur.n) + ' pour ' + engDef + ' engagés');
  if (attendu(attaquant.n, engAtt, attaquant.avant)) ok(nom + ' : assaillant — ' + engAtt + ' engagés, ' + recup(attaquant.n) + ' en récupération, aucun perdu');
  else ko(nom + ' : assaillant — total ' + total(attaquant.n) + ' (avant ' + attaquant.avant + '), récupération ' + recup(attaquant.n) + ' pour ' + engAtt + ' engagés');
  const w = m.sb._warBetween(m.hum.civ.id, m.jup.civ.id);
  const wins = w ? ((w.winsBy[m.hum.civ.id] || 0) + (w.winsBy[m.jup.civ.id] || 0)) : 0;
  if (wins === 0) ok(nom + ' : aucune victoire comptée'); else ko(nom + ' : ' + wins + ' victoire(s) comptée(s)');
}

console.log('═'.repeat(84));
console.log('ÉGALITÉ AU COMBAT — le défenseur tient, personne ne gagne, rien n\'est perdu');
console.log('═'.repeat(84) + '\n');

console.log('1. L\'ordinateur assaille l\'humain, fenêtre de défense : 4⚔️ contre 3 jetons + 1 garnison');
{
  const m = montage();
  const col = m.hum.colonies.find(c => c.nodeId === 'ceres');
  m.G._aadFenetreVue = true;
  m.sb.resolveAiAssaultOnPlayer(m.jup, { type: 'colony', obj: col, name: 'Cérès' }, 4, 3, null, m.hum);
  verifier('assaut sur humain', m, { defenseur: { n: m.hum, avant: 3 }, attaquant: { n: m.jup, avant: 4 }, engDef: 3, engAtt: 4, cibleChez: m.hum, noeud: 'ceres' });
}

console.log('\n2. L\'ordinateur reprend une colonie pendant son tour (défense automatique) : 4 contre 3 + 1');
{
  const m = montage();
  m.jup._warRecapture = 'ceres';
  m.sb.resolveAiAssault(m.jup, 'ceres', 4);
  verifier('reprise IA', m, { defenseur: { n: m.hum, avant: 3 }, attaquant: { n: m.jup, avant: 4 }, engDef: 3, engAtt: 4, cibleChez: m.hum, noeud: 'ceres' });
}

console.log('\n3. L\'humain attaque Vesta : 4 jetons contre 3 engagés + 1 garnison');
{
  const m = montage();
  m.hum.forceTokens = 4; m.jup.forceTokens = 3;
  vm.runInContext(`_warAttackColonyTarget='vesta';`, m.sb);
  m.G._aiWarCommitted = 3;
  const r = m.sb.resolveWarCombat(4, m.hum);
  note('résultat : ' + String(r && r.cls));
  verifier('assaut humain', m, { defenseur: { n: m.jup, avant: 3 }, attaquant: { n: m.hum, avant: 4 }, engDef: 3, engAtt: 4, cibleChez: m.jup, noeud: 'vesta' });
}

console.log('\n4. CONTRE-ÉPREUVE : 5⚔️ contre 4 — la colonie tombe, le banc le voit');
{
  const m = montage();
  const col = m.hum.colonies.find(c => c.nodeId === 'ceres');
  m.G._aadFenetreVue = true; m.jup.forceTokens = 5;
  m.sb.resolveAiAssaultOnPlayer(m.jup, { type: 'colony', obj: col, name: 'Cérès' }, 5, 3, null, m.hum);
  if (!m.hum.colonies.some(c => c.nodeId === 'ceres')) ok('Cérès prise à 5 contre 4'); else ko('Cérès tient à 5 contre 4 — le banc ne mesure rien');
  if (vp(m.jup) === 2) ok('+2 VP au vainqueur'); else ko('VP vainqueur : ' + vp(m.jup));
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ Aucun écart'); process.exit(0);
