/* ============================================================================
   TEST — LA FENÊTRE DE COMBAT N'INVENTE PLUS DE MENACE
   ----------------------------------------------------------------------------
   Marc, partie 09A0 (05/09) : « j'ai dû faire une défense pour Cérès, mettre des jetons en aveugle
   sans voir la force de l'attaque, et après c'est passé à la fin de tour sans me dire ce qui s'est
   passé — le Ceinturien ne m'a pas attaqué finalement. J'espère que mes jetons n'ont pas été
   déduits. »

   CE QU'IL Y AVAIT. La fenêtre de combat de fin de tour tirait au HASARD une posture adverse
   (`Math.random()>0.35`) et une cible au hasard, puis affichait « l'ennemi menace Cérès — tu peux
   défendre ». L'assaut réel de l'ordinateur se décide ailleurs, plus tard, avec sa propre fenêtre
   de défense qui annonce la vraie force. Dans le modèle « assaut » (toutes les guerres sont `live`),
   « défendre » ici ne fait rien : la réponse vaut « tenir ».

   RÈGLES VERROUILLÉES ICI :
     1. pour une guerre `live`, la fenêtre de combat n'annonce AUCUNE menace (`aiThreat` nul) —
        vingt tirages de suite, jamais ;
     2. CONTRE-ÉPREUVE — la réponse « défendre » y coûte zéro : ni jeton, ni ressource (c'est ce que
        Marc craignait) — et le journal dit « tient sa position », pas « défense » ;
     3. la vraie défense passe toujours par la fenêtre `defense`, avec la force annoncée
        (garanti par `test_menace_annoncee`, rappelé ici par un contrôle).

   Usage : node test_menace_fantome.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens']);
  const G = sb.__G;
  G.turn = 9; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  moi.forceTokens = 8; moi.res.materials = 15; moi.res.energy = 15;
  moi.colonies.push({ nodeId: 'ceres', level: 3, connected: true });
  ia.forceTokens = 6; ia.res.materials = 10; ia.res.energy = 10;
  G.wars = [{ a: ia.civ.id, b: moi.civ.id, winsBy: {}, turnsLeft: 99, live: true, declaredBy: 'ai', justDeclared: false }];
  G.warWith = ia.civ.id; G.warTurnsLeft = 99;
  sb.setDecisionSink(function () {});
  return { sb, G, moi, ia };
}
function fenetre(m) {
  m.G._pendings = [];
  m.sb.showWarCombatModal('guerreCombatLiveChoisi');
  return (m.G._pendings || []).find(p => p.kind === 'war_combat');
}

console.log('═'.repeat(84));
console.log('FENÊTRE DE COMBAT — PAS DE MENACE INVENTÉE, PAS DE DÉFENSE FANTÔME');
console.log('═'.repeat(84) + '\n');

/* ── 1. Vingt tirages, zéro menace ────────────────────────────────────────── */
console.log('1. Guerre en cours : la fenêtre de combat n\'annonce jamais de menace inventée');
{
  let menaces = 0, n = 0;
  for (let i = 0; i < 20; i++) {
    const m = montage();
    const q = fenetre(m);
    if (!q) continue;
    n++;
    if (q.payload && q.payload.aiThreat) menaces++;
  }
  note(n + ' fenêtres posées · ' + menaces + ' avec une « menace »');
  if (n >= 20 && menaces === 0) ok('aucune menace fantôme en 20 tirages — le hasard n\'y est plus (avant : ~65 % des cas)');
  else if (n < 20) ko('la fenêtre de combat n\'a pas été posée (' + n + '/20)');
  else ko(menaces + ' fenêtre(s) sur ' + n + ' annoncent encore une menace inventée');
}

/* ── 2. CONTRE-ÉPREUVE — « défendre » ne coûte rien ────────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — répondre « défendre » avec des jetons ne déduit ni jeton ni ressource');
{
  const m = montage();
  const q = fenetre(m);
  const jet = m.moi.forceTokens, mat = m.moi.res.materials, en = m.moi.res.energy;
  const av = (m.G.log || []).length;
  if (q) m.sb.resolveDecision(q.id, { action: 'defend', tokens: 4, cruiser: false });
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  note('jetons ' + jet + ' → ' + m.moi.forceTokens + ' · 🪨 ' + mat + ' → ' + m.moi.res.materials + ' · ⚡ ' + en + ' → ' + m.moi.res.energy);
  note('journal : ' + (j.find(t => /tiens|défense|Défense/i.test(t)) || '—').slice(0, 90));
  /* La réponse enchaîne la suite de fin de tour (revenus compris) : les ressources peuvent MONTER.
     Ce qu'on vérifie, c'est qu'aucun jeton n'est parti et qu'aucune ressource n'a BAISSÉ. */
  if (m.moi.forceTokens === jet && m.moi.res.materials >= mat && m.moi.res.energy >= en) ok('rien n\'a été déduit — Marc n\'a rien perdu dans 09A0');
  else ko('une défense fantôme a coûté quelque chose');
  if (!j.some(t => /Coût défense/.test(t))) ok('aucune ligne « Coût défense » : pas de combat fictif');
  else ko('une « défense » a été comptabilisée contre personne');
}

/* ── 3. La vraie défense existe toujours, avec la force annoncée ───────────── */
console.log('\n3. La vraie fenêtre de défense reste celle de l\'assaut réel, force annoncée');
{
  const m = montage();
  m.G._pendings = [];
  const cible = { type: 'colony', obj: m.moi.colonies.find(c => c.nodeId === 'ceres'), name: 'Cérès' };
  m.sb.showAiAssaultDefenseModal(m.ia, cible, 5, 'stRien', m.moi);
  const q = (m.G._pendings || []).find(p => p.kind === 'defense');
  note('fenêtre de défense : ' + (q ? ('posée, force annoncée ' + q.payload.threat) : 'absente'));
  if (q && typeof q.payload.threat === 'number' && q.payload.threat >= 5) ok('quand l\'ordinateur attaque VRAIMENT, la force est annoncée — on ne défend plus en aveugle');
  else ko('la fenêtre de défense réelle n\'annonce pas la force');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La fenêtre de combat ne ment plus : pas de menace au hasard, pas de défense contre un fantôme.');
console.log('═'.repeat(84));
