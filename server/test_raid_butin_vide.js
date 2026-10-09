/* ============================================================================
   TEST — L'IA NE PROPOSE PAS UN RAID DONT LE BUTIN EST NUL
   ----------------------------------------------------------------------------
   POURQUOI. Partie 1C29, tour 6 : les Ceinturiens pillent trois fois les Martiens dans le même
   tour — Phobos +2🪨, puis Europe « rien à prendre », puis Vesta « rien à prendre ». Deux actions
   et deux jetons partis pour rien, et la tension montée jusqu'à la guerre populaire.
   Le butin est calculable AVANT le coup (`butinDeRaid` : production d'un tour de la colonie,
   plafonnée à ce que la victime a en caisse). Le tacticien énumérait quand même le raid.

   RÈGLE (GO de Marc, 14/09) : un raid à butin vide n'est pas énuméré. Le joueur humain, lui,
   garde le droit de tenter un raid perdu d'avance (c'est son choix, le journal le lui dit).

   Usage : node test_raid_butin_vide.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['ceinturiens', 'martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const hum = G.player, cei = G.ais[0], mar = G.ais[1];
  hum._isAI = false; cei._isAI = true; mar._isAI = true;
  cei._profil = 'opportuniste';
  cei.acLeft = 4; cei.forceTokens = 6; cei.res.materials = 10; cei.res.energy = 10; cei.res.morale = 8;
  /* La victime : AUCUNE colonie reliée → aucune production à prendre → butin nul partout.
     (Depuis la règle B du 21/09, le raid prend la PRODUCTION du tour et non le stock : des caisses
     vides ne suffisent plus à rendre un raid inutile, une colonie qui ne produit rien, si.) */
  mar.colonies.push({ nodeId: 'vesta', level: 1, connected: false });
  /* 09/10 : une colonie non reliée produit quand même (règle de Marc) — le butin nul vient désormais de colonies
     DÉJÀ PILLÉES ce tour. */
  for (const c of mar.colonies) c._raidTour = G.turn;
  mar.res.energy = 0; mar.res.materials = 0; mar.res.science = 0;
  /* L'humain garde des caisses pleines : témoin d'une cible pillable. */
  hum.res.energy = 10; hum.res.materials = 10; hum.res.science = 10;
  return { sb, G, hum, cei, mar };
}

console.log('═'.repeat(84));
console.log('RAID — pas de raid proposé quand il n\'y a rien à prendre');
console.log('═'.repeat(84) + '\n');

/* ── 1. Victime aux caisses vides : aucun raid proposé contre elle ─────────── */
console.log('1. Cible aux caisses vides : aucun raid proposé contre elle');
{
  const m = montage();
  const b = m.mar.colonies.map(c => c.nodeId + '=' + JSON.stringify(m.sb.butinDeRaid(m.mar, c.nodeId).butin)).join(' ');
  note('butins calculés sur les Martiens : ' + b);
  const coups = m.sb.coupsPossibles(m.cei) || [];
  const surMar = coups.filter(c => c && c.type === 'raid' && c.cible === 'martiens');
  note(coups.length + ' coup(s) · raids sur les Martiens : ' + (surMar.map(c => c.libelle).join(' / ') || 'aucun'));
  if (surMar.length === 0) ok('aucun raid à butin vide proposé');
  else ko(surMar.length + ' raid(s) proposé(s) contre une nation sans rien à prendre');
}

/* ── 2. CONTRE-ÉPREUVE — cible pillable : le raid reste proposé ────────────── */
console.log('\n2. CONTRE-ÉPREUVE — contre une cible aux caisses pleines, le raid reste proposé');
{
  const m = montage();
  const coups = m.sb.coupsPossibles(m.cei) || [];
  const surHum = coups.filter(c => c && c.type === 'raid' && c.cible === 'terriens');
  note('raids sur les Terriens : ' + (surHum.map(c => c.libelle).join(' / ') || 'aucun'));
  if (surHum.length > 0) ok('le raid est toujours proposé quand il rapporte');
  else ko('plus aucun raid proposé — correction trop large');
}

/* ── 3. CONTRE-ÉPREUVE — l'humain garde le droit de tenter un raid vide ────── */
console.log('\n3. CONTRE-ÉPREUVE — la règle (`doRaidTarget`) laisse l\'humain tenter un raid vide');
{
  const m = montage();
  m.hum.acLeft = 3; m.hum.forceTokens = 6;
  /* 09/10 : butin nul obtenu par une colonie qui produit 1🪨 et des Drones de surveillance (−1 par ressource volée). */
  for (const c of m.mar.colonies) delete c._raidTour;
  m.mar.colonies.push({ nodeId: 'deimos', level: 1, connected: false });
  m.mar.cards.push(m.sb.CARDS_POOL ? m.sb.CARDS_POOL.find(c => c.id === 'drones1') : require('vm').runInContext("CARDS_POOL.find(c=>c.id==='drones1')", m.sb));
  const ac = m.hum.acLeft;
  m.sb.doRaidTarget('martiens', 'deimos');
  const j = (m.G.log || []).map(l => String(l.msg)).filter(t => /rien à prendre/.test(t));
  note('AC ' + ac + ' → ' + m.hum.acLeft + ' · journal « rien à prendre » : ' + j.length);
  if (m.hum.acLeft === ac - 1 && j.length === 1) ok('le raid humain passe, et le journal dit qu\'il n\'a rien rapporté');
  else ko('le raid humain à butin vide est bloqué ou muet (AC ' + ac + '→' + m.hum.acLeft + ', journal ' + j.length + ')');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ tout est vert — l\'IA ne pille que ce qui existe');
