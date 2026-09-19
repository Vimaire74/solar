/* ============================================================================
   TEST — LE RAID COÛTE 2 JETONS À TOUT LE MONDE, CEINTURIENS COMPRIS
   ----------------------------------------------------------------------------
   Marc, 16/09 (après la partie 96F6) : « c'est peut-être un peu fort, il a déjà plusieurs avantages
   donc supprime ce pouvoir partout où tu le trouves ».
   Les Ceinturiens raidaient à 1 jeton au lieu de 2, et le même rabais s'appliquait au SEUIL de jetons
   exigé pour lancer un assaut. Ils gardent leurs autres avantages : +1⚡/tour, immunité aux pirates,
   Éris/Pluton à 2 VP au niveau 1, et le pouvoir « Commerce avec les pirates ».
   Usage : node test_raid_deux_jetons.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const nouvelles = (G, av) => G.log.slice(0, G.log.length - av).map(e => String((e && e.msg) || e));

/* Une partie où `qui` est le joueur humain, avec de quoi raider la première IA. */
function montage(qui, jetons) {
  const sb = loadLogic(HTML);
  sb.initGame(qui, ['jupiteriens', 'terriens'].filter(x => x !== qui).slice(0, 2));
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  const moi = G.player, cible = G.ais[0];
  moi._isAI = false; G.ais.forEach(a => a._isAI = true);
  moi.acLeft = 3; moi.forceTokens = jetons; moi.forceCooldown = [];
  moi.res = { energy: 8, materials: 8, science: 4, morale: 6 };
  /* une colonie à piller chez la cible, reliée, pour que le raid ait une prise */
  cible.colonies.push({ nodeId: 'vesta', level: 2, connected: true });
  sb.updateConnections(cible);
  return { sb, G, moi, cible };
}

console.log('§1 Avec UN seul jeton, plus personne ne peut raider — Ceinturiens compris');
for (const qui of ['ceinturiens', 'martiens']) {
  const { sb, G, moi, cible } = montage(qui, 1);
  const av = G.log.length, jetonsAvant = moi.forceTokens, acAvant = moi.acLeft;
  sb.doRaidTarget(cible.civ.id, 'vesta', moi);
  const refus = nouvelles(G, av).some(x => /Raid : besoin 2 jeton/.test(x));
  const intact = moi.forceTokens === jetonsAvant && moi.acLeft === acAvant;
  if (refus && intact) ok(qui + ' : raid refusé, « besoin 2 jeton(s) », rien dépensé');
  else ko(qui + ' : refus=' + refus + ' jetons ' + jetonsAvant + '→' + moi.forceTokens + ' AC ' + acAvant + '→' + moi.acLeft + ' — ' + JSON.stringify(nouvelles(G, av)));
}

console.log('§2 Avec deux jetons, le raid a lieu et en coûte DEUX (même pour les Ceinturiens)');
for (const qui of ['ceinturiens', 'martiens']) {
  const { sb, G, moi, cible } = montage(qui, 4);
  const av = G.log.length;
  sb.doRaidTarget(cible.civ.id, 'vesta', moi);
  const ligne = nouvelles(G, av).find(x => /⚔️ Raid sur/.test(x));
  const enRecup = (moi.forceCooldown || []).reduce((s, fc) => s + fc.count, 0);
  if (!ligne) { ko(qui + ' : le raid n\'a pas eu lieu — ' + JSON.stringify(nouvelles(G, av))); continue; }
  if (moi.forceTokens === 2) ok(qui + ' : 4 → 2 jetons (2 dépensés)'); else ko(qui + ' : reste ' + moi.forceTokens + ' jetons au lieu de 2');
  if (enRecup === 2) ok(qui + ' : 2 jetons en récupération'); else ko(qui + ' : ' + enRecup + ' jeton(s) en récupération au lieu de 2');
  if (/2 jeton en récupération/.test(ligne)) ok(qui + ' : le journal annonce 2 jetons'); else ko(qui + ' : journal « ' + ligne.replace(/<[^>]+>/g, '') + ' »');
}

console.log('§3 L\'assaut exige lui aussi 2 jetons engageables pour un Ceinturien');
{
  const { sb, G, moi, cible } = montage('ceinturiens', 1);
  const av = G.log.length, acAvant = moi.acLeft;
  sb.attackColony('vesta', moi);
  const refus = nouvelles(G, av).some(x => /Assaut : besoin d.au moins 2 jeton/.test(x));
  if (refus && moi.acLeft === acAvant) ok('assaut refusé à 1 jeton, « au moins 2 jeton(s) », AC intact');
  else ko('refus=' + refus + ' AC ' + acAvant + '→' + moi.acLeft + ' — ' + JSON.stringify(nouvelles(G, av)));
}

console.log('§4 La fiche de la nation ne promet plus un raid à 1 jeton');
{
  const sb = loadLogic(HTML);
  const vm = require('vm');
  const passif = vm.runInContext('CIVS.ceinturiens.passive', sb);
  if (!/raid/i.test(passif)) ok('passif sans mention du raid : « ' + passif.replace(/<[^>]+>/g, '') + ' »');
  else ko('le passif parle encore du raid : « ' + passif.replace(/<[^>]+>/g, '') + ' »');
  for (const garde of [/immunis/i, /ceinture|⚡|energy/i]) {
    if (garde.test(passif)) ok('avantage conservé (' + garde + ')'); else ko('avantage perdu par erreur (' + garde + ') : « ' + passif + ' »');
  }
  /* Le panneau Empire annonce le coût du raid en toutes lettres : il doit dire 2, lui aussi. */
  const moteur = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const ligneEmpire = (moteur.match(/Raid : −1 AC, −[^<']*/) || [''])[0];   // v10.77 : le libellé passe par t('force.raid_cout', …)
  if (/−2 jeton/.test(ligneEmpire)) ok('panneau Empire : « ' + ligneEmpire.trim() + ' »');
  else ko('panneau Empire annonce encore : « ' + ligneEmpire.trim() + ' »');
  const regles = fs.readFileSync(path.join(__dirname, '..', 'regles.html'), 'utf8');
  if (!/Raid à 1 jeton/i.test(regles)) ok('regles.html ne dit plus « Raid à 1 jeton »');
  else ko('regles.html promet encore « Raid à 1 jeton »');
}

console.log('§5 Le cerveau IA ne propose pas de raid à un Ceinturien qui n\'a qu\'un jeton');
{
  const vm = require('vm');
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  const cei = G.ais.find(a => a.civ.id === 'ceinturiens') || null;
  if (!cei) { ko('montage : pas de Ceinturien'); }
  else {
    cei.forceTokens = 1; cei.acLeft = 2; cei.res = { energy: 6, materials: 6, science: 3, morale: 5 };
    const raids = vm.runInContext('coupsPossibles(G.ais.find(a=>a.civ.id==="ceinturiens")).filter(c=>c.type==="raid").length', sb);
    if (raids === 0) ok('aucun raid proposé au Ceinturien à 1 jeton'); else ko(raids + ' raid(s) encore proposé(s) à 1 jeton');
  }
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_raid_deux_jetons : le raid coûte 2 jetons à toutes les nations.');
