/* ============================================================================
   TEST — PAS DE GUERRE DÉCLARÉE POUR UN ASSAUT QU'ON NE PEUT PAS MENER
   ----------------------------------------------------------------------------
   POURQUOI. Partie 1C29, tour 9 : « GUERRE DÉCLARÉE : Martiens contre Terriens — Assaut surprise
   sur Lune ! » → « Martiens frappe Lune par surprise ! » → « Martiens maintient la guerre mais n'a
   pas les moyens d'attaquer ce tour. » → « paie : 1 AC (aucune ressource) ».
   Marc : « la perte des revenus et actions n'intervient-elle pas trop tôt ? … sinon c'est aberrant ».
   Ordre réel dans `resoudreAssautIA` (cible humaine) : `declarerGuerre` → usure −4🙂 aux DEUX camps
   → AC débité → « frappe par surprise » → et SEULEMENT ENSUITE `maybeAiAssaultPlayer` vérifie
   moral ≥ 1, jetons, ressources — et refuse. Tout était payé, par les deux camps, pour rien.

   RÈGLE (GO de Marc, 14/09) : on vérifie AVANT de déclarer. Une IA dont le moral ne survivrait pas
   à l'usure de la déclaration (moral − 4 < 1) n'ouvre pas de guerre par assaut surprise : rien
   n'est déclaré, rien n'est payé, et le tacticien ne lui propose même pas le coup.

   Usage : node test_assaut_sans_moyens.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(moral) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 9; G.phase = 'actions';
  const hum = G.player, mar = G.ais[0], cei = G.ais[1];
  hum._isAI = false; mar._isAI = true; cei._isAI = true;
  hum.res.morale = 8; hum.forceTokens = 2; hum.res.materials = 5; hum.res.energy = 5;
  mar.acLeft = 3; mar.forceTokens = 4; mar.res.materials = 6; mar.res.energy = 6; mar.res.morale = moral;
  mar._profil = 'guerrier';
  mar.colonies.push({ nodeId: 'vesta', level: 1, connected: true });   // voisin de Lune
  const vus = [];
  sb.setDecisionSink(function (q) { vus.push(q); });
  return { sb, G, hum, mar, cei, vus };
}
const journal = (m, av) => (m.G.log || []).slice(av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));

console.log('═'.repeat(84));
console.log('ASSAUT SURPRISE — on vérifie les moyens AVANT de déclarer la guerre');
console.log('═'.repeat(84) + '\n');

/* ── 1. Moral 4 : l'usure le mettrait à 0 → pas de déclaration, rien de payé ── */
console.log('1. Moral 4 (l\'usure de −4 le mettrait à 0) : ni guerre, ni usure, ni AC dépensé');
{
  const m = montage(4);
  const ac = m.mar.acLeft, moralH = m.hum.res.morale, moralM = m.mar.res.morale, jet = m.mar.forceTokens;
  const av = (m.G.log || []).length;
  m.sb.appliquerCoup(m.mar, { type: 'assaut', node: m.hum.civ.home });
  const j = journal(m, av);
  const guerre = !!m.sb._warBetween('martiens', 'terriens');
  note('guerre ouverte = ' + guerre + ' · moral humain ' + moralH + ' → ' + m.hum.res.morale
     + ' · moral martien ' + moralM + ' → ' + m.mar.res.morale + ' · AC ' + ac + ' → ' + m.mar.acLeft
     + ' · fenêtres : ' + (m.vus.map(q => q.kind).join(', ') || 'aucune'));
  if (j.length) note('journal : ' + j.slice(0, 3).join(' | ').slice(0, 200));
  if (!guerre) ok('aucune guerre déclarée');
  else ko('la guerre a été déclarée alors que l\'assaut ne pouvait pas suivre');
  if (m.hum.res.morale === moralH && m.mar.res.morale === moralM) ok('aucune usure prélevée');
  else ko('usure prélevée pour rien (humain ' + moralH + '→' + m.hum.res.morale + ', martien ' + moralM + '→' + m.mar.res.morale + ')');
  if (m.mar.acLeft === ac && m.mar.forceTokens === jet) ok('ni AC ni jeton dépensé');
  else ko('l\'IA a payé (AC ' + ac + '→' + m.mar.acLeft + ', jetons ' + jet + '→' + m.mar.forceTokens + ')');
}

/* ── 2. Le tacticien ne propose pas ce coup ────────────────────────────────── */
console.log('\n2. À moral 4, le tacticien ne propose pas l\'assaut surprise sur l\'humain');
{
  const m = montage(4);
  const coups = m.sb.coupsPossibles(m.mar) || [];
  const assauts = coups.filter(c => c && c.type === 'assaut');
  note(coups.length + ' coup(s) · assauts : ' + (assauts.map(c => c.libelle).join(' / ') || 'aucun'));
  if (assauts.length === 0) ok('aucun assaut proposé — l\'IA ne perd pas son action à l\'évaluer');
  else ko(assauts.length + ' assaut(s) proposé(s) que l\'IA ne peut pas mener');
}

/* ── 3. CONTRE-ÉPREUVE — moral 8 : la guerre s'ouvre et l'assaut a lieu ────── */
console.log('\n3. CONTRE-ÉPREUVE — à moral 8, la guerre s\'ouvre et la fenêtre de défense est posée');
{
  const m = montage(8);
  const ac = m.mar.acLeft;
  m.sb.appliquerCoup(m.mar, { type: 'assaut', node: m.hum.civ.home });
  const guerre = !!m.sb._warBetween('martiens', 'terriens');
  const def = m.vus.find(q => q.kind === 'defense');
  note('guerre ouverte = ' + guerre + ' · fenêtre de défense posée = ' + !!def + ' · AC ' + ac + ' → ' + m.mar.acLeft);
  if (guerre && def) ok('l\'assaut surprise fonctionne toujours quand les moyens sont là');
  else ko('l\'assaut surprise ne passe plus (guerre ' + guerre + ', fenêtre ' + !!def + ') — correction trop large');
  const coups = m.sb.coupsPossibles(montage(8).mar) || [];
  if (coups.some(c => c && c.type === 'assaut')) ok('et le tacticien le propose toujours');
  else ko('le tacticien ne propose plus aucun assaut');
}

/* ── 4. CONTRE-ÉPREUVE — guerre déjà ouverte : moral 2 suffit (pas d'usure de déclaration) ── */
console.log('\n4. CONTRE-ÉPREUVE — guerre déjà en cours : pas de nouvelle usure, moral 2 suffit pour assaillir');
{
  const m = montage(2);
  m.sb.declarerGuerre(m.mar, m.hum, 'banc', 'ai');
  m.mar.res.morale = 2; m.hum.res.morale = 8;
  const w = m.sb._warBetween('martiens', 'terriens'); if (w) { w.live = true; w.justDeclared = false; }
  m.vus.length = 0;
  m.sb.appliquerCoup(m.mar, { type: 'assaut', node: m.hum.civ.home });
  const def = m.vus.find(q => q.kind === 'defense');
  note('fenêtre de défense posée = ' + !!def + ' · moral martien après : ' + m.mar.res.morale);
  if (def) ok('en guerre déjà ouverte, l\'assaut n\'est pas bloqué par le seuil de déclaration');
  else ko('l\'assaut en guerre ouverte est bloqué à moral 2 — le seuil de déclaration s\'applique à tort');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ tout est vert — une guerre ne s\'ouvre que si l\'assaut peut suivre');
