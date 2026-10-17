/* ============================================================================
   TEST — LES ORDINATEURS N'OUBLIENT PAS QU'ON LES A AGRESSÉS
   ----------------------------------------------------------------------------
   RÈGLE (Marc, 16/09, §134 étape 4) : « Tes IA devraient pouvoir avoir un peu de mémoire à ce sujet
   sur une partie. Si tu les as raidées ou attaquées au moins une fois et que tu n'as jamais fait
   l'action diplomatie avec eux, ils devraient avoir des réactions plus négatives envers toi quand tu
   demandes quelque chose. Ce serait logique. »

   CE QUI MANQUAIT. La tension était la seule trace d'une agression, et elle s'efface : le temps la
   fait redescendre, une paix la divise par deux, un sommet la baisse de 5 partout. Deux tours après
   avoir pillé une nation, on pouvait lui proposer un accord commercial comme si de rien n'était.
   Rien, dans le jeu, ne distinguait un voisin qui ne vous a jamais touché d'un voisin qui vous a
   pris une colonie et n'a jamais fait le moindre geste depuis.

   LA RANCUNE. Un compteur par couple ORIENTÉ (qui en veut à qui), rangé dans `G.rancunes`,
   incrémenté à chaque raid et à chaque assaut SUBI. Il ne se dégrade pas avec le temps — c'est le
   but. Il pèse sur les réponses de la nation agressée sous la forme d'une SURCHARGE de tension
   ressentie au moment de décider : +1 dès la première agression, +2 à partir de la troisième.

   LA PORTE DE SORTIE EST TOUJOURS OUVERTE, ET C'EST ESSENTIEL. La carte 🕊️ Diplomatie, dirigée vers
   cette nation, remet la rancune à zéro — elle ne dépend pas de l'accord de l'autre, donc une
   diplomatie bloquée peut toujours se débloquer. Un pacte de non-agression signé l'efface aussi,
   des deux côtés. Sans cette issue, une nation agressée une fois refuserait tout jusqu'à la fin de
   la partie, ce qui serait une punition, pas une règle.

   ⚠️ CE QUI NE DOIT PAS CHANGER, et qui est verrouillé ici : une nation incapable de se battre, ou
   dont le peuple n'en veut plus, accepte la paix QUOI QU'IL ARRIVE. La rancune ne crée jamais de
   guerre sans fin.
   Usage : node test_memoire_agressions.js
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

/* Le joueur (Martiens) face à deux nations. La cible a une colonie sur Déimos — trajet court, donc
   un assaut à 1 action — et de quoi être pillée. */
function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player, cible = G.ais.find(a => a.civ.id === 'ceinturiens'), tiers = G.ais.find(a => a.civ.id === 'jupiteriens');
  moi._isAI = false; cible._isAI = true; tiers._isAI = true;
  G.turn = 6; G.phase = 'actions';
  moi.acLeft = 5; moi.acMax = 5; moi.forceTokens = 14;
  moi.res = { energy: 20, materials: 20, science: 8, morale: 9 };
  cible.forceTokens = opts.jetonsCible === undefined ? 0 : opts.jetonsCible;
  cible.res = { energy: 8, materials: 8, science: 4, morale: 9 };
  if (!cible.colonies.some(c => c.nodeId === 'deimos')) cible.colonies.push({ nodeId: 'deimos', level: 1, connected: true });
  return { sb, G, moi, cible, tiers };
}
const ranc = (m, v, a) => vm.runInContext('rancuneDe("' + v + '","' + a + '")', m.sb);
const surch = (m, v, a) => vm.runInContext('surchargeRancune("' + v + '","' + a + '")', m.sb);
const avis = (m, qui, prop) => vm.runInContext('accordAcceptable(allPlayers().find(p=>p.civ.id==="' + qui + '"),allPlayers().find(p=>p.civ.id==="' + prop + '"))', m.sb);

console.log('§1 Un assaut laisse une rancune, un raid aussi — et l\'agresseur n\'en garde aucune');
{
  const m = montage();
  if (ranc(m, 'ceinturiens', 'martiens') === 0) ok('au départ, aucune rancune');
  else ko('rancune non nulle au départ : ' + ranc(m, 'ceinturiens', 'martiens'));
  m.sb.attackColony('deimos', m.moi); m.sb.resolveWarCombat(12, m.moi);
  const apresAssaut = ranc(m, 'ceinturiens', 'martiens');
  if (apresAssaut === 1) ok('après un assaut : 1'); else ko('après un assaut : ' + apresAssaut + ' (attendu 1)');
  m.sb.doRaidTarget('ceinturiens', 'eris', m.moi);
  const apresRaid = ranc(m, 'ceinturiens', 'martiens');
  if (apresRaid === 2) ok('après un raid de plus : 2'); else ko('après le raid : ' + apresRaid + ' (attendu 2)');
  if (ranc(m, 'martiens', 'ceinturiens') === 0) ok('l\'agresseur, lui, n\'en veut à personne');
  else ko('l\'agresseur a gagné de la rancune : ' + ranc(m, 'martiens', 'ceinturiens'));
  if (ranc(m, 'jupiteriens', 'martiens') === 0) ok('et la nation qui n\'a rien subi n\'est pas concernée');
  else ko('une nation tierce a gagné de la rancune');
}

console.log('§2 Un assaut RATÉ compte aussi — « jamais pardonné »');
{
  const m = montage({ jetonsCible: 8 });
  m.cible.res.materials = 12; m.cible.res.energy = 12;
  m.sb.attackColony('deimos', m.moi); m.sb.resolveWarCombat(1, m.moi);
  const tenue = m.cible.colonies.some(c => c.nodeId === 'deimos');
  note('colonie tenue : ' + tenue + ' · rancune : ' + ranc(m, 'ceinturiens', 'martiens'));
  if (!tenue) ko('la colonie est tombée — le montage ne prouve rien');
  else if (ranc(m, 'ceinturiens', 'martiens') === 1) ok('une attaque repoussée laisse la même rancune qu\'une réussie');
  else ko('rancune après un assaut raté : ' + ranc(m, 'ceinturiens', 'martiens'));
}

console.log('§3 La surcharge : +1 dès la première agression, +2 à partir de la troisième, pas plus');
{
  const m = montage();
  const vu = [];
  for (let k = 0; k <= 4; k++) {
    vu.push([k, surch(m, 'ceinturiens', 'martiens')]);
    vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="ceinturiens"),allPlayers().find(p=>p.civ.id==="martiens"))', m.sb);
  }
  note(vu.map(x => x[0] + '→+' + x[1]).join(' · '));
  const attendu = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2 };
  let bon = true;
  for (const [n, s] of vu) if (s !== attendu[n]) { bon = false; ko(n + ' agression(s) → surcharge +' + s + ' (attendu +' + attendu[n] + ')'); }
  if (bon) ok('0→+0, 1→+1, 2→+1, 3→+2, 4→+2 : le barème tient et il est plafonné');
}

console.log('§4 La rancune durcit la réponse à une demande d\'accord');
{
  /* Tension 6 : sous le seuil de refus (7), l'accord passe. Avec une agression au compteur, la
     surcharge de +1 fait basculer la même situation dans le refus. */
  const m = montage();
  vm.runInContext('setTens("ceinturiens","martiens",6)', m.sb);
  const sansRancune = avis(m, 'ceinturiens', 'martiens');
  note('tension 6, aucune rancune → ' + (sansRancune.ok ? 'accepté' : 'refusé (' + sansRancune.raison + ')'));
  if (sansRancune.ok) ok('à tension 6 sans rancune, l\'accord est recevable');
  else ko('refusé alors qu\'aucune rancune n\'existe : ' + sansRancune.raison);
  vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="ceinturiens"),allPlayers().find(p=>p.civ.id==="martiens"))', m.sb);
  const avecRancune = avis(m, 'ceinturiens', 'martiens');
  note('tension 6, une agression → ' + (avecRancune.ok ? 'accepté' : 'refusé (' + avecRancune.raison + ')'));
  if (!avecRancune.ok) ok('la même demande est refusée une fois l\'agression enregistrée');
  else ko('la rancune ne change rien à la réponse');
  if (!avecRancune.ok && /agress|oubli|rancun/i.test(avecRancune.raison)) ok('et le motif DIT que c\'est l\'agression : « ' + avecRancune.raison + ' »');
  else if (!avecRancune.ok) ko('le refus ne dit pas pourquoi : « ' + avecRancune.raison + ' »');
}

console.log('§5 À tension basse, une rancune seule ne bloque pas tout');
{
  const m = montage();
  vm.runInContext('setTens("ceinturiens","martiens",2)', m.sb);
  vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="ceinturiens"),allPlayers().find(p=>p.civ.id==="martiens"))', m.sb);
  vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="ceinturiens"),allPlayers().find(p=>p.civ.id==="martiens"))', m.sb);
  vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="ceinturiens"),allPlayers().find(p=>p.civ.id==="martiens"))', m.sb);
  const a = avis(m, 'ceinturiens', 'martiens');
  note('tension 2 + 3 agressions (surcharge +2) → ' + (a.ok ? 'accepté' : 'refusé (' + a.raison + ')'));
  if (a.ok) ok('une nation peu tendue reste ouverte malgré la rancune — la diplomatie n\'est pas morte');
  else ko('la rancune bloque même à tension 2 : « ' + a.raison + ' »');
}

console.log('§6 La carte 🕊️ Diplomatie remet la rancune à zéro');
{
  const m = montage();
  m.sb.attackColony('deimos', m.moi); m.sb.resolveWarCombat(12, m.moi);
  m.sb.doRaidTarget('ceinturiens', 'eris', m.moi);
  const avant = ranc(m, 'ceinturiens', 'martiens');
  vm.runInContext('applyCalmTension("ceinturiens","diplomatie",3)', m.sb);
  const apres = ranc(m, 'ceinturiens', 'martiens');
  note('rancune ' + avant + ' → ' + apres);
  if (avant >= 2 && apres === 0) ok('la mission diplomatique efface l\'ardoise');
  else ko('rancune après la mission diplomatique : ' + apres + ' (partie de ' + avant + ')');
  const dit = (m.G.log || []).map(e => String((e && e.msg) || e)).find(x => /rancune|oubli|pardon/i.test(x));
  if (dit) ok('et le journal le dit : « ' + dit.replace(/<[^>]+>/g, '').slice(0, 90) + ' »');
  else ko('rien au journal : le joueur ne peut pas savoir que son geste a compté');
}

console.log('§7 Un pacte de non-agression signé efface la rancune des DEUX côtés');
{
  const m = montage();
  m.sb.attackColony('deimos', m.moi); m.sb.resolveWarCombat(12, m.moi);
  vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="martiens"),allPlayers().find(p=>p.civ.id==="ceinturiens"))', m.sb);
  const a0 = ranc(m, 'ceinturiens', 'martiens'), b0 = ranc(m, 'martiens', 'ceinturiens');
  vm.runInContext('poserPacte(G.player, allPlayers().find(p=>p.civ.id==="ceinturiens"), 4); apaiserRancune(G.player, allPlayers().find(p=>p.civ.id==="ceinturiens"), {mutuel:true});', m.sb);
  const a1 = ranc(m, 'ceinturiens', 'martiens'), b1 = ranc(m, 'martiens', 'ceinturiens');
  note('avant ' + a0 + '/' + b0 + ' → après ' + a1 + '/' + b1);
  if (a0 > 0 && b0 > 0 && a1 === 0 && b1 === 0) ok('les deux ardoises sont effacées');
  else ko('rancunes après le pacte : ' + a1 + ' et ' + b1);
}

console.log('§8 VERROU — la rancune ne fabrique jamais de guerre sans fin');
{
  const m = montage();
  const ia = m.cible;
  for (let k = 0; k < 5; k++) vm.runInContext('ajouterRancune(allPlayers().find(p=>p.civ.id==="ceinturiens"),allPlayers().find(p=>p.civ.id==="martiens"))', m.sb);
  /* Une nation qui ne peut plus se battre accepte la paix, rancune ou pas. */
  ia.forceTokens = 0; ia.res.materials = 0; ia.res.energy = 0;
  const v1 = vm.runInContext('iaVeutLaPaix(allPlayers().find(p=>p.civ.id==="ceinturiens"), G.player)', m.sb);
  if (v1 === true) ok('incapable de se battre : elle veut la paix, malgré 5 agressions au compteur');
  else ko('une nation à sec refuse la paix par rancune — guerre sans fin possible');
  /* Le peuple qui n'en veut plus, non plus. */
  ia.forceTokens = 8; ia.res.materials = 8; ia.res.energy = 8; ia.res.morale = 1;
  const v2 = vm.runInContext('iaVeutLaPaix(allPlayers().find(p=>p.civ.id==="ceinturiens"), G.player)', m.sb);
  if (v2 === true) ok('moral à 1 : elle veut la paix, malgré la rancune');
  else ko('moral à 1 et refus de la paix par rancune');
}

console.log('§9 La rancune survit à une sauvegarde');
{
  const m = montage();
  m.sb.attackColony('deimos', m.moi); m.sb.resolveWarCombat(12, m.moi);
  const avant = ranc(m, 'ceinturiens', 'martiens');
  const copie = vm.runInContext('JSON.parse(JSON.stringify(G.rancunes||{}))', m.sb);
  const relu = ((copie['ceinturiens'] || {})['martiens']) || 0;
  note('rancune en mémoire ' + avant + ' · une fois sérialisée ' + relu);
  if (avant > 0 && relu === avant) ok('elle passe la sérialisation sans perte (objet simple, pas de Set ni de Map)');
  else ko('perdue à la sérialisation : ' + avant + ' → ' + relu);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_memoire_agressions : les nations se souviennent, et un geste suffit à leur faire oublier.');
