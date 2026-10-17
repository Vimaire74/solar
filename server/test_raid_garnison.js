/* ============================================================================
   TEST — LA GARNISON N'EST PAS ENGAGEABLE (raid, assaut, routes)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 13/09 : « le jeu te laisse faire des raids même si t'as plus de jetons Force
   disponibles ». Vérifié : la barre du haut affiche les jetons ENGAGEABLES (`engageableTokens` =
   réserve − 1 jeton de garnison par colonie connectée hors capitale), mais la règle du raid
   (`doRaidTarget`), l'entrée de l'assaut, la pose d'un jeton sur une route et l'énumération des
   coups de l'IA (`coupsPossibles`) vérifiaient la réserve BRUTE `forceTokens`. Avec 2 jetons et
   2 colonies connectées, la barre disait 0 et le raid passait quand même, en puisant dans la
   garnison. L'IA avait le même défaut.

   RÈGLE (décision de Marc, 13/09, « corrige ces non-sens avec les jetons ») : la garnison est
   réservée ; seuls les jetons engageables peuvent être dépensés — raid, assaut, protection ou
   attaque de route, pour l'humain comme pour l'IA.

   Usage : node test_raid_garnison.js
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

/* Terriens avec 2 colonies connectées hors capitale (garnison 2) et `jetons` en réserve brute. */
function montage(jetons, opts) {
  opts = opts || {};
  const sb = loadLogic(HTML); _sbTotal = sb;
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  for (const p of [moi, ia]) {
    p.acLeft = 6; p.res.energy = 30; p.res.materials = 30; p.res.science = 30; p.res.morale = 8;
    p.forceTokens = 8; p.forceCooldown = p.forceCooldown || [];
  }
  const qui = opts.ia ? ia : moi;
  const libres = ['ceres', 'vesta'];
  for (const id of libres) qui.colonies.push({ nodeId: id, level: 1, connected: true });
  qui.forceTokens = jetons;
  return { sb, G, moi, ia, qui };
}
/* RÈGLE B DU RAID (Marc, 21/09) : le raid ne prend plus dans le STOCK mais dans le revenu de fin de
   tour de la colonie. « Ce que la victime aura » = stock + revenu ⚡🪨🔬 à venir : c'est ce total
   qu'un raid fait baisser. */
let _sbTotal = null;
const total = n => (n.res.energy || 0) + (n.res.materials || 0) + (n.res.science || 0)
  + (function () { try { const r = _sbTotal.revenusBruts(n) || {}; return (r.energy || 0) + (r.materials || 0) + (r.science || 0); } catch (e) { return 0; } })();

console.log('═'.repeat(84));
console.log('GARNISON — ce que la barre affiche est ce qu\'on peut dépenser');
console.log('═'.repeat(84) + '\n');

/* ── 1. Raid humain : 2 jetons, 2 colonies → 0 engageable → refusé ────────── */
console.log('1. Raid humain avec 0 jeton engageable (2 en réserve, 2 de garnison) → refusé');
{
  const m = montage(2);
  const eng = m.sb.engageableTokens(m.moi);
  const avantCible = total(m.ia), avantJetons = m.moi.forceTokens, avantAC = m.moi.acLeft;
  m.sb.doRaidTarget(m.ia.civ.id, null);
  note('engageables affichés : ' + eng + ' · jetons ' + avantJetons + ' → ' + m.moi.forceTokens
     + ' · AC ' + avantAC + ' → ' + m.moi.acLeft + ' · ressources de la cible ' + avantCible + ' → ' + total(m.ia));
  if (eng !== 0) ko('montage invalide : engageables = ' + eng);
  else if (m.moi.forceTokens === avantJetons && m.moi.acLeft === avantAC && total(m.ia) === avantCible) ok('raid refusé — la garnison reste en place');
  else ko('le raid a puisé dans la garnison (la barre affichait 0)');
}

/* ── 2. CONTRE-ÉPREUVE — 4 jetons, 2 de garnison → 2 engageables → raid OK ── */
console.log('\n2. CONTRE-ÉPREUVE — avec 2 jetons engageables, le raid passe');
{
  const m = montage(4);
  const avantCible = total(m.ia), avantJetons = m.moi.forceTokens;
  m.sb.doRaidTarget(m.ia.civ.id, null);
  note('jetons ' + avantJetons + ' → ' + m.moi.forceTokens + ' · ressources de la cible ' + avantCible + ' → ' + total(m.ia));
  if (m.moi.forceTokens === avantJetons - 2 && total(m.ia) < avantCible) ok('raid joué : 2 jetons partis, la cible est pillée');
  else ko('le raid ne passe plus avec des jetons engageables — correction trop large');
}

/* ── 3. Protection de route : 0 engageable → refusée ; 1 engageable → posée ─ */
console.log('\n3. Poser un jeton sur une route ne puise pas dans la garnison');
{
  const m = montage(2);
  m.moi.routes.push({ from: 'lune', to: 'ceres', tokens: 0 });
  const r = m.moi.routes[0];
  const refuse = m.sb.deployerJetonSurRoute(m.moi, r, {});
  note('0 engageable : deployerJetonSurRoute → ' + refuse + ' · jetons sur la route : ' + (r.tokens || 0));
  if (!refuse && !(r.tokens || 0)) ok('refusé à 0 engageable');
  else ko('le jeton de garnison est parti sur la route');

  const m2 = montage(3);
  m2.moi.routes.push({ from: 'lune', to: 'ceres', tokens: 0 });
  const r2 = m2.moi.routes[0];
  const pose = m2.sb.deployerJetonSurRoute(m2.moi, r2, {});
  note('1 engageable : deployerJetonSurRoute → ' + pose + ' · jetons sur la route : ' + (r2.tokens || 0) + ' · réserve ' + m2.moi.forceTokens);
  if (pose && (r2.tokens || 0) === 1 && m2.moi.forceTokens === 2) ok('posé à 1 engageable — la garnison (2) reste');
  else ko('la pose ne passe plus avec un jeton engageable');
}

/* ── 4. L'IA : l'énumération ne propose ni raid ni assaut sans jeton engageable ── */
console.log('\n4. Le tacticien ne propose ni raid ni assaut à une IA sans jeton engageable');
{
  const m = montage(2, { ia: true });
  m.ia._profil = 'opportuniste';
  const coups = m.sb.coupsPossibles(m.ia) || [];
  const agress = coups.filter(c => c && (c.type === 'raid' || c.type === 'assaut'));
  note(coups.length + ' coup(s) · ' + agress.length + ' raid/assaut avec ' + m.sb.engageableTokens(m.ia) + ' engageable(s)');
  if (agress.length === 0) ok('aucun raid ni assaut proposé');
  else ko(agress.length + ' coup(s) agressif(s) proposés sur la garnison : ' + agress.map(c => c.libelle).join(' / '));
}

/* ── 5. CONTRE-ÉPREUVE IA — avec des jetons engageables, raid et assaut restent proposés ── */
console.log('\n5. CONTRE-ÉPREUVE — avec 3 engageables, l\'IA se voit proposer raid et assaut');
{
  const m = montage(5, { ia: true });
  m.ia._profil = 'opportuniste';
  const coups = m.sb.coupsPossibles(m.ia) || [];
  const raids = coups.filter(c => c && c.type === 'raid').length;
  const assauts = coups.filter(c => c && c.type === 'assaut').length;
  note(raids + ' raid(s), ' + assauts + ' assaut(s) proposés');
  if (raids > 0 && assauts > 0) ok('raid et assaut toujours proposés');
  else ko('l\'IA a perdu ses coups agressifs — correction trop large');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ tout est vert — la garnison n\'est jamais dépensée');
