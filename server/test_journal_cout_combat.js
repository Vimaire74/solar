/* ============================================================================
   TEST — « COÛT COMBAT » NOMME L'ATTAQUANT, PAS « TOI »
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 14/09 (Martiens) : dans son journal, « ⚔️ Coût combat (toi) : 2 jeton(s)
   engagé(s) » pour l'assaut des Jupitériens sur Éris — un combat entre deux IA où il n'était pas.
   Le « (toi) » était écrit en dur dans `resolveWarCombat`, quel que soit l'attaquant. Ajouté à sa
   confusion sur la fenêtre de paix (il a cru traiter avec les Terriens), c'est le motif de
   perspective (POINT_DEPART §7.2-1) et la règle « toujours NOMMER la nation » (`_evName`).

   Usage : node test_journal_cout_combat.js
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
  sb.initGame('martiens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const moi = G.player, jup = G.ais[0], cei = G.ais[1];
  moi._isAI = false; jup._isAI = true; cei._isAI = true;
  for (const p of [moi, jup, cei]) { p.forceTokens = 6; p.res.materials = 10; p.res.energy = 10; p.res.morale = 8; p.forceCooldown = []; }
  cei.colonies.push({ nodeId: 'pluto', level: 1, connected: true });
  sb.setDecisionSink(function () {});
  return { sb, G, moi, jup, cei };
}
const lignes = (m, av) => (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, '')).filter(t => /Coût combat/.test(t));

console.log('═'.repeat(84));
console.log('JOURNAL — « Coût combat » dit QUI paie');
console.log('═'.repeat(84) + '\n');

/* ── 1. Combat IA → IA : l'attaquant est nommé, pas « toi » ────────────────── */
console.log('1. Jupitériens assaillent Pluton (Ceinturiens) : la ligne nomme les Jupitériens');
{
  const m = montage();
  m.sb.declarerGuerre(m.jup, m.cei, 'banc', 'ai');
  vm.runInContext('_warAttackColonyTarget="pluto"', m.sb);
  const av = (m.G.log || []).length;
  m.sb.resolveWarCombat(3, m.jup);
  const l = lignes(m, av);
  note(l.join(' | ') || '(aucune ligne « Coût combat »)');
  if (l.length && l.every(t => /Jupitériens/.test(t) && !/\(toi\)/.test(t))) ok('la ligne nomme l\'attaquant et ne dit pas « toi »');
  else ko('ligne « Coût combat » fausse pour un combat IA → IA : ' + (l.join(' | ') || 'absente'));
}

/* ── 2. CONTRE-ÉPREUVE — quand c'est le joueur, il est nommé, SANS « (toi) » ──
   Marc, 22/09 : « abandonne le you » — le journal est lu par tous, et « Jovians (you) » est apparu
   au nom d'une IA quand la perspective avait tourné. La nation suffit. */
console.log('\n2. CONTRE-ÉPREUVE — Martiens assaillent Pluton : la ligne dit « Martiens », sans « (toi) »');
{
  const m = montage();
  m.sb.declarerGuerre(m.moi, m.cei, 'banc', 'player');
  m.G.warWith = m.cei.civ.id;
  vm.runInContext('_warAttackColonyTarget="pluto"', m.sb);
  const av = (m.G.log || []).length;
  m.sb.resolveWarCombat(3, m.moi);
  const l = lignes(m, av);
  note(l.join(' | ') || '(aucune ligne)');
  if (l.length && l.every(t => /Martiens/.test(t) && !/\(toi\)/.test(t))) ok('le joueur est nommé, sans « (toi) »');
  else ko('ligne « Coût combat » du joueur : ' + (l.join(' | ') || 'absente'));
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ tout est vert — le journal dit qui paie le combat');
