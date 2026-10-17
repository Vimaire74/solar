/* ============================================================================
   TEST — TOUTE VICTOIRE DE COMBAT VAUT +2 VP, QUEL QUE SOIT LE CHEMIN
   ----------------------------------------------------------------------------
   POURQUOI. Partie 1C29 (Marc, 13/09) : il repousse deux assauts surprise (T8 Martiens 6 contre 2,
   T10 Ceinturiens 14 contre 12) → 0 VP. Les Martiens tiennent Phobos deux fois au T8 → +2 chacune.
   La feuille de score dit pourtant « victoires de combat (+2 chacune) ».
   La différence n'est pas la règle mais le CHEMIN : seul `resolveWarCombat` (combat de fin de tour,
   assaut humain en phase d'actions) donne les +2 au vainqueur. L'assaut surprise d'une IA pendant
   sa phase d'actions — `_resolveAiAssaultOnPlayer` contre un humain, `resoudreAssautIA` contre une
   IA — ne donnait rien à personne : ni au défenseur qui tient, ni à l'IA qui capture.
   Sixième occurrence du motif §64 (la règle vivait dans UNE enveloppe sur trois).

   RÈGLE (GO de Marc, 14/09) : +2 VP au vainqueur de tout combat, défenseur ou assaillant, humain
   ou IA. Motif dans `_vpDetail` : « Combat gagné contre X ».

   Usage : node test_combat_vp_equitable.js
   ========================================================================== */
'use strict';
const path = require('path');
const { Engine, loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const eng = new Engine(HTML);
  const sb = eng.sb;
  sb.initGame('terriens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const hum = G.player, jup = G.ais[0], cei = G.ais[1];
  hum._isAI = false; jup._isAI = true; cei._isAI = true;
  for (const p of [hum, jup, cei]) { p.res.morale = 8; p.forceCooldown = p.forceCooldown || []; }
  jup.acLeft = 3; jup.forceTokens = 6; jup.res.materials = 30; jup.res.energy = 30;
  jup.colonies.push({ nodeId: 'vesta', level: 2, connected: true });     // voisin de Lune et de Cérès
  hum.colonies.push({ nodeId: 'ceres', level: 2, connected: true });
  hum.forceTokens = 8; hum.res.materials = 20; hum.res.energy = 20;
  cei.colonies.push({ nodeId: 'triton', level: 2, connected: true });
  cei.forceTokens = 2; cei.res.materials = 2; cei.res.energy = 2;
  const vus = [];
  sb.setDecisionSink(function (q) { vus.push(q); });
  return { eng, sb, G, hum, jup, cei, vus };
}
const gains = (n, motif) => (n._vpDetail || []).filter(d => new RegExp(motif).test(d.raison)).reduce((s, d) => s + d.n, 0);

console.log('═'.repeat(84));
console.log('COMBAT — le vainqueur touche +2 VP, par tous les chemins');
console.log('═'.repeat(84) + '\n');

/* ── 1. Assaut surprise d'une IA sur l'humain, repoussé → +2 au défenseur ─── */
console.log('1. L\'humain repousse un assaut surprise (fenêtre de défense) → +2 VP pour lui');
{
  const m = montage();
  m.G._pendings = [];
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'ceres' });
  const q = (m.G._pendings || []).find(p => p.kind === 'defense');
  if (!q) ko('aucune fenêtre de défense posée — le montage n\'atteint pas le chemin');
  else {
    m.sb.resolveDecision(q.id, { defTokens: 8, cruiser: false });
    const tenue = m.hum.colonies.some(c => c.nodeId === 'ceres');
    const g = gains(m.hum, 'Combat gagné');
    note('Cérès tenue = ' + tenue + ' · VP « Combat gagné » du défenseur : ' + g);
    if (!tenue) ko('Cérès est tombée avec 8 jetons contre 6 : le point ne mesure rien');
    else if (g === 2) ok('+2 VP au défenseur humain qui tient');
    else ko('le défenseur humain qui tient reçoit ' + g + ' VP au lieu de 2');
    const gIA = gains(m.jup, 'Combat gagné');
    if (gIA === 0) ok('l\'assaillant battu ne touche rien');
    else ko('l\'assaillant battu a touché ' + gIA + ' VP');
  }
}

/* ── 2. Même chemin, l'IA capture → +2 à l'IA, rien au défenseur ───────────── */
console.log('\n2. Même fenêtre, l\'IA capture → +2 VP pour l\'IA, 0 pour le défenseur');
{
  const m = montage();
  m.G._pendings = [];
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'ceres' });
  const q = (m.G._pendings || []).find(p => p.kind === 'defense');
  if (!q) ko('aucune fenêtre de défense posée');
  else {
    m.sb.resolveDecision(q.id, { defTokens: 0, cruiser: false });
    const prise = m.jup.colonies.some(c => c.nodeId === 'ceres');
    const g = gains(m.jup, 'Combat gagné'), gH = gains(m.hum, 'Combat gagné');
    note('Cérès prise = ' + prise + ' · VP IA : ' + g + ' · VP humain : ' + gH);
    if (!prise) ko('Cérès n\'a pas été prise (6 contre 0 + garnison 1) : le point ne mesure rien');
    else if (g === 2 && gH === 0) ok('+2 VP à l\'IA qui capture, rien au vaincu');
    else ko('IA ' + g + ' VP / humain ' + gH + ' VP');
  }
}

/* ── 3. Assaut IA → IA : le vainqueur touche +2 (capture) ──────────────────── */
console.log('\n3. Assaut IA → IA en phase d\'actions : +2 VP au vainqueur');
{
  const m = montage();
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'triton' });
  const prise = m.jup.colonies.some(c => c.nodeId === 'triton');
  const g = gains(m.jup, 'Combat gagné'), gC = gains(m.cei, 'Combat gagné');
  note('Triton prise = ' + prise + ' · VP Jupitériens : ' + g + ' · VP Ceinturiens : ' + gC);
  if (!prise) ko('Triton n\'a pas été prise : le point ne mesure rien');
  else if (g === 2 && gC === 0) ok('+2 VP à l\'IA qui capture une colonie d\'IA');
  else ko('Jupitériens ' + g + ' VP / Ceinturiens ' + gC + ' VP');
}

/* ── 4. Assaut IA → IA repoussé : +2 au défenseur IA ───────────────────────── */
console.log('\n4. Assaut IA → IA repoussé : +2 VP au défenseur');
{
  const m = montage();
  m.cei.forceTokens = 12; m.cei.res.materials = 12; m.cei.res.energy = 12;
  m.jup.forceTokens = 3;
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'triton' });
  const prise = m.jup.colonies.some(c => c.nodeId === 'triton');
  const g = gains(m.jup, 'Combat gagné'), gC = gains(m.cei, 'Combat gagné');
  const renonce = (m.G.log || []).some(l => /renonce/i.test(String(l.msg)));
  note('Triton prise = ' + prise + ' · renoncement = ' + renonce + ' · VP Jupitériens : ' + g + ' · VP Ceinturiens : ' + gC);
  if (renonce) note('(l\'IA a renoncé avant le combat : pas de combat, donc pas de VP — cohérent)');
  else if (prise) ko('Triton prise avec 3 jetons contre 12 : arithmétique fausse');
  else if (gC === 2 && g === 0) ok('+2 VP au défenseur IA qui tient');
  else ko('défenseur ' + gC + ' VP / assaillant ' + g + ' VP');
  /* Une IA renonce par construction quand elle perdrait (elle compte AVANT d'engager) : ce point
     n'est atteint que si l'estimation se trompe. Il reste pour documenter le cas, sans écart. */
}

/* ── 5. CONTRE-ÉPREUVE — le combat de fin de tour donne toujours +2, pas 4 ── */
console.log('\n5. CONTRE-ÉPREUVE — le chemin déjà juste (assaut humain → `resolveWarCombat`) ne compte pas double');
{
  const m = montage();
  m.hum.forceTokens = 12; m.hum.acLeft = 5;   // 10 contre 6 + garnison 1
  const av = gains(m.hum, 'Combat gagné');
  m.eng.apply({ type: 'attack', node: 'vesta', tokens: 10 });
  /* L'assaut humain sur une IA se résout par la fenêtre de combat (`war_combat`) ; on répond. */
  for (let i = 0; i < 4; i++) {
    const q = m.vus.find(x => !x._fait && (x.kind === 'war_combat' || x.kind === 'defense'));
    if (!q) break;
    q._fait = true;
    m.sb.resolveDecision(q.id, q.kind === 'war_combat' ? { tokens: 10, cruiser: false } : { defTokens: 0 });
  }
  const g = gains(m.hum, 'Combat gagné') - av;
  const prise = m.hum.colonies.some(c => c.nodeId === 'vesta');
  note('fenêtres : ' + (m.vus.map(x => x.kind).join(', ') || 'aucune') + ' · Vesta prise par l\'humain = ' + prise + ' · VP « Combat gagné » gagnés : ' + g);
  if (prise && g === 2) ok('exactement +2 — pas de double comptage');
  else if (!prise) ko('Vesta non prise par ce montage (' + g + ' VP) : le point ne mesure rien');
  else ko('l\'assaut humain rapporte ' + g + ' VP au lieu de 2');
}

/* ── 6. Une ROUTE n'est pas un combat : aucun VP, dans les deux sens ─────────── */
console.log('\n6. Attaque de route par la fenêtre de défense : aucun VP, ni au défenseur ni à l\'assaillant');
{
  /* Marc, 14/09 : « exclus une attaque de route de cette victoire, c'est un peu facile ». */
  for (const [defTokens, libelle] of [[8, 'route tenue'], [0, 'route perdue']]) {
    const m = montage();
    m.hum.routes.push({ from: 'lune', to: 'ceres', tokens: 1 });
    const r = m.hum.routes[0];
    m.sb.resolveAiAssaultOnPlayer(m.jup, { type: 'route', obj: r, name: 'Lune→Cérès' }, 4, defTokens, null, m.hum);
    const gH = gains(m.hum, 'Combat gagné'), gIA = gains(m.jup, 'Combat gagné');
    note(libelle + ' (défense ' + defTokens + ') : jetons sur la route ' + (r.tokens || 0) + ' · VP humain ' + gH + ' · VP IA ' + gIA);
    if (gH === 0 && gIA === 0) ok(libelle + ' : aucun VP distribué');
    else ko(libelle + ' : ' + gH + ' VP humain / ' + gIA + ' VP IA pour une route');
  }
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ tout est vert — chaque combat gagné vaut +2, par tous les chemins');
