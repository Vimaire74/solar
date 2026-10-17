/* ============================================================================
   TEST — L'IA DÉFENSIVE BLOQUE VRAIMENT LES RAIDS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie 0768 (03/09) : « un bug, les raids continuent contre moi alors que j'ai
   IA Défensive ». Vérifié dans son journal : il achète la technologie au tour 7, et les Martiens
   pillent Cérès au tour 9 puis au tour 10 (+2⚡ +7🪨 +2🔬 à chaque fois). La carte annonce pourtant,
   en toutes lettres : « +4 jetons. Immunité raids/pirates. »

   ⚠️ CINQUIÈME OCCURRENCE DU MOTIF §64, ET LA PREMIÈRE QUI COÛTE UNE RÈGLE DU JEU AU JOUEUR.
   Le contrôle d'immunité existait — mais dans l'ANCIENNE enveloppe de raid de l'IA
   (`if(hasSpec(best,'ia_immune')){ … bloque le raid … }`), celle que le cerveau `tacticien`
   n'emprunte plus. Depuis qu'il est le cerveau par défaut, l'IA passe par `coupsPossibles`
   (qui proposait un raid sur CHAQUE colonie adverse, immunisée ou non) puis par `appliquerCoup` →
   `doRaidTarget`, la fonction de règle — qui vérifiait le pacte de non-agression mais PAS
   l'immunité. La technologie la plus chère de sa branche ne servait donc plus à rien contre les
   raids, en silence.

   Les quatre précédentes étaient des défauts d'affichage ou de comptage. Celle-ci change le jeu :
   Marc a payé 5🔬 2⚡ 2🪨 et deux points d'action pour une protection qui n'existait pas.

   LA CORRECTION EST À DEUX ÉTAGES, ET LES DEUX COMPTENT :
     · dans `doRaidTarget` — la RÈGLE, qui vaut pour tout le monde, y compris un joueur humain qui
       cliquerait sur une nation protégée ;
     · dans `coupsPossibles` — l'ÉNUMÉRATION, pour que l'IA ne perde pas son temps à évaluer un coup
       qu'elle n'a pas le droit de jouer (et ne le retienne pas comme « meilleur »).

   Usage : node test_ia_defensive_raids.js
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
  const sb = loadLogic(HTML); _sbTotal = sb;
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  /* Le tempérament est tiré au sort à initGame ; bâtisseur et guerrier ne pillent jamais, ce qui
     faisait passer le point 4 au rouge une fois sur trois. On le fixe. */
  ia._profil = 'opportuniste';
  for (const p of [moi, ia]) {
    p.acLeft = 6; p.res.energy = 30; p.res.materials = 30; p.res.science = 30; p.res.morale = 8;
    p.forceTokens = 8;
  }
  return { sb, G, moi, ia };
}
/* Donne l'IA Défensive à une nation, par la carte réelle du jeu. */
function iaDefensive(sb, nat) {
  const c = vm.runInContext("CARDS_POOL.find(c=>c.spec==='ia_immune')", sb);
  if (c) nat.cards = (nat.cards || []).concat([c]);
  return !!c;
}
/* RÈGLE B DU RAID (Marc, 21/09) : le raid ne prend plus dans le STOCK mais dans le revenu de fin de
   tour de la colonie. « Ce que la victime aura » = stock + revenu ⚡🪨🔬 à venir : c'est ce total
   qu'un raid fait baisser. */
let _sbTotal = null;
const total = n => (n.res.energy || 0) + (n.res.materials || 0) + (n.res.science || 0)
  + (function () { try { const r = _sbTotal.revenusBruts(n) || {}; return (r.energy || 0) + (r.materials || 0) + (r.science || 0); } catch (e) { return 0; } })();

console.log('═'.repeat(84));
console.log('IA DÉFENSIVE — « Immunité raids » doit vouloir dire quelque chose');
console.log('═'.repeat(84) + '\n');

/* ── 1. Une IA ne peut PAS piller une nation protégée ──────────────────────── */
console.log('1. Un raid d\'IA sur une nation protégée ne vole rien');
{
  const m = montage();
  if (!iaDefensive(m.sb, m.moi)) { ko('technologie `ia_immune` introuvable — scénario invalide'); }
  else {
    const cible = (m.moi.colonies[0] || {}).nodeId;
    const avant = total(m.moi), jetonsAvant = m.ia.forceTokens;
    m.sb.appliquerCoup(m.ia, { type: 'raid', cible: m.moi.civ.id, node: cible });
    note('ressources du protégé : ' + avant + ' → ' + total(m.moi)
       + ' · jetons du pillard : ' + jetonsAvant + ' → ' + m.ia.forceTokens);
    if (total(m.moi) === avant) ok('rien n\'a été volé — la technologie protège');
    else ko('le protégé a perdu ' + (avant - total(m.moi)) + ' ressource(s) : l\'immunité ne s\'applique pas');
  }
}

/* ── 2. CONTRE-ÉPREUVE — sans la technologie, le raid réussit ──────────────── */
console.log('\n2. CONTRE-ÉPREUVE — sans IA Défensive, le raid fonctionne toujours');
{
  /* ⚠️ SANS CE POINT, ON « CORRIGERAIT » EN CASSANT LES RAIDS POUR TOUT LE MONDE : le §1 passerait
     au vert et le jeu perdrait une de ses mécaniques. */
  const m = montage();
  const cible = (m.moi.colonies[0] || {}).nodeId;
  const avant = total(m.moi);
  m.sb.appliquerCoup(m.ia, { type: 'raid', cible: m.moi.civ.id, node: cible });
  note('ressources de la victime non protégée : ' + avant + ' → ' + total(m.moi));
  if (total(m.moi) < avant) ok('le raid pille normalement une nation sans protection');
  else ko('plus aucun raid ne fonctionne — la correction est trop large');
}

/* ── 3. L'IA ne se voit même pas proposer ce coup ──────────────────────────── */
console.log('\n3. Le coup n\'est plus proposé à l\'IA quand la cible est protégée');
{
  /* Interdire le coup au dernier moment suffirait à protéger Marc, mais l'IA continuerait à
     l'évaluer, à le comparer aux autres, et parfois à le RETENIR comme son meilleur coup — pour
     ne rien faire ensuite. Elle perdrait une action par tour sans que rien ne le dise. */
  const m = montage();
  iaDefensive(m.sb, m.moi);
  const coups = m.sb.coupsPossibles(m.ia) || [];
  const raids = coups.filter(c => c && c.type === 'raid' && c.cible === m.moi.civ.id);
  note(coups.length + ' coup(s) proposés · dont ' + raids.length + ' raid(s) sur la nation protégée');
  if (raids.length === 0) ok('aucun raid proposé contre une nation protégée');
  else ko(raids.length + ' raid(s) encore proposés — l\'IA gaspillera des actions');
}

/* ── 4. CONTRE-ÉPREUVE — les raids restent proposés sur une cible ordinaire ── */
console.log('\n4. CONTRE-ÉPREUVE — sur une cible NON protégée, le raid reste proposé');
{
  const m = montage();
  const coups = m.sb.coupsPossibles(m.ia) || [];
  const raids = coups.filter(c => c && c.type === 'raid' && c.cible === m.moi.civ.id);
  note(raids.length + ' raid(s) proposés sur la nation non protégée');
  if (raids.length > 0) ok('l\'IA sait toujours proposer un raid quand il est permis');
  else ko('plus aucun raid proposé nulle part — l\'énumération est cassée');
}

/* ── 5. La règle vaut aussi pour un joueur humain ──────────────────────────── */
console.log('\n5. Un joueur humain ne peut pas piller une nation protégée non plus');
{
  /* La règle est dans la fonction de règle, donc elle vaut pour tout le monde. Si elle n'était que
     dans l'énumération de l'IA, un humain pourrait encore le faire — et ce serait une règle à deux
     vitesses, exactement ce qu'on répare depuis deux jours. */
  const m = montage();
  iaDefensive(m.sb, m.ia);
  const cible = (m.ia.colonies[0] || {}).nodeId;
  const avant = total(m.ia);
  m.sb.doRaidTarget(m.ia.civ.id, cible, m.moi);
  note('ressources de l\'IA protégée : ' + avant + ' → ' + total(m.ia));
  if (total(m.ia) === avant) ok('le joueur non plus ne peut pas piller un protégé');
  else ko('le joueur, lui, passe encore : règle à deux vitesses');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ « Immunité raids » protège vraiment, pour tout le monde, et l\'IA ne perd plus');
console.log('   d\'action à viser une nation qu\'elle ne peut pas piller.');
console.log('═'.repeat(84));
