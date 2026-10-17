/* ============================================================================
   TEST — ATTAQUER UNE COLONIE N'OUVRE PLUS LA GUERRE : ÇA FAIT MONTER LA TENSION
   ----------------------------------------------------------------------------
   RÈGLE (Marc, 16/09, §134 étape 3). Dans ses mots : « ma volonté a toujours été celle-ci. Tout
   passe par la tension. Si elle est à 10, c'est la guerre populaire forcée. Donc c'est ça qui
   déclenche la guerre obligatoire, mais EN FIN DE TOUR, donc pas immédiatement à l'attaque d'une
   colonie. Car on perd déjà du moral en perdant la défense d'une colonie, ça fait beaucoup d'un
   coup sinon. […] Donc les joueurs ou les IA vont temporiser. »

   AVANT : `attackColony` → `playerAssaultColony` → `declarerGuerre`. Attaquer DÉCLARAIT la guerre
   sur-le-champ, avec toutes ses conséquences (accords révoqués, routes rompues, tension à 10 des
   deux côtés, usure au tour suivant). Marc ne savait pas que ce chemin existait — c'est le cœur de
   sa demande.
   APRÈS : l'assaut est une ESCARMOUCHE. Combat, pertes, capture éventuelle, moral — mais aucun état
   de guerre. Ce qui monte, c'est la tension de l'ATTAQUÉ vers l'attaquant :
        colonie prise → 8 · attaque repoussée → 6 · l'attaquant ne s'ajoute rien.
   « Faut que ça monte vite, c'est un acte très agressif. » « Même ratée : les actes d'agression des
   nations sur Terre ne sont jamais pardonnés. »
   La guerre reste ouverte par le seul chemin voulu : la tension à 10 jugée EN FIN DE TOUR.

   ⚠️ CE QUI NE CHANGE PAS, et qui est verrouillé ici pour ne pas dériver :
     · le RAID reste à 1 action, 2 jetons, +3 de tension, un seul par colonie et par tour
       (Marc, 16/09 : « le raid reste comme il est, c'est trop cher de monter les actions du raid ») ;
     · (21/09, partie BCE3) 8 et 6 s'AJOUTENT à chaque assaut, plafonnés à 10 — ce ne sont plus des
       planchers. Marc : « si je prends une deuxième colonie, ça devrait faire +8 à nouveau […] quelle
       nation accepterait de se faire prendre une lune ? » Trois colonies prises au tour 7 n'avaient
       porté la tension des Martiens qu'à 8 ;
     · aucune escarmouche ne survit à la nuit, donc aucune n'engendre d'usure de guerre.
   Usage : node test_assaut_sans_guerre.js
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

/* Deux nations HUMAINES (l'assaut d'un humain sur un humain est le chemin que Marc décrit), plus une
   troisième tenue par l'ordinateur pour les sections IA. La cible reçoit une colonie sur DÉIMOS
   (52 jours depuis Phobos, donc 1 action) : trajet court, pour isoler la règle de guerre du barème
   de distance (§136). ⚠️ PAS sur Phobos : c'est la CAPITALE martienne, et un nœud partagé avec sa
   propre capitale est un cas particulier du jeu — il aurait faussé la mesure sans qu'on le voie. */
function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player;
  const cible = G.ais.find(a => a.civ.id === 'ceinturiens');
  const tiers = G.ais.find(a => a.civ.id === 'jupiteriens');
  moi._isAI = false; cible._isAI = (opts.cibleIA === true); tiers._isAI = true;
  G.turn = 6; G.phase = 'actions';
  moi.acLeft = 5; moi.acMax = 5; moi.spentThisTurn = 0;
  moi.forceTokens = opts.jetonsMoi === undefined ? 14 : opts.jetonsMoi;
  moi.res = { energy: 20, materials: 20, science: 8, morale: 9 };
  cible.forceTokens = opts.jetonsCible === undefined ? 0 : opts.jetonsCible;
  cible.res = { energy: opts.resCible === undefined ? 0 : opts.resCible,
                materials: opts.resCible === undefined ? 0 : opts.resCible, science: 4, morale: 9 };
  if (!cible.colonies.some(c => c.nodeId === 'deimos')) cible.colonies.push({ nodeId: 'deimos', level: 1, connected: true });
  /* Titan : LOIN de la capitale jupitérienne (Io), pour la section ordinateur contre ordinateur —
     un voisin immédiat coûterait 1 action et ne dirait rien du barème de distance. */
  if (!cible.colonies.some(c => c.nodeId === 'titan')) cible.colonies.push({ nodeId: 'titan', level: 1, connected: true });
  vm.runInContext('updateConnections(G.ais.find(a=>a.civ.id==="ceinturiens"))', sb);
  return { sb, G, moi, cible, tiers };
}
const enGuerre = (m, a, b) => !!vm.runInContext('_warBetween("' + a + '","' + b + '")', m.sb);
const tens = (m, a, b) => vm.runInContext('getTens("' + a + '","' + b + '")', m.sb);
/* Un assaut complet du plateau : le clic (`attackColony`) puis la résolution du combat. En vrai jeu,
   le joueur choisit ses jetons dans une fenêtre entre les deux ; ici on la court-circuite. */
function assaut(m, jetons) {
  m.sb.attackColony('deimos', m.moi);
  return m.sb.resolveWarCombat(jetons === undefined ? 12 : jetons, m.moi);
}

console.log('§1 Un assaut n\'ouvre plus la guerre');
{
  const m = montage();
  const avant = (m.G.wars || []).length;
  assaut(m);
  note('guerres avant ' + avant + ' → après ' + (m.G.wars || []).length);
  if (!enGuerre(m, 'martiens', 'ceinturiens')) ok('les deux nations ne sont PAS en guerre après l\'assaut');
  else ko('une guerre a été ouverte par l\'assaut — c\'est exactement ce que la règle supprime');
  const dit = (m.G.log || []).map(e => String((e && e.msg) || e)).find(x => /GUERRE DÉCLARÉE/.test(x));
  if (!dit) ok('le journal n\'annonce aucune déclaration de guerre');
  else ko('le journal annonce : « ' + dit.replace(/<[^>]+>/g, '') + ' »');
  if (!m.G.warWith) ok('l\'écran n\'affiche pas d\'adversaire de guerre');
  else ko('G.warWith est posé : ' + m.G.warWith);
}

console.log('§2 Colonie prise : la tension de l\'attaqué monte à 8, celle de l\'attaquant ne bouge pas');
{
  const m = montage();
  const t0 = tens(m, 'martiens', 'ceinturiens');
  const r = assaut(m, 12);
  const prise = !m.cible.colonies.some(c => c.nodeId === 'deimos');
  note('combat ' + r.pPow + ' contre ' + r.aPow + ' — Déimos prise : ' + prise);
  if (prise) ok('la colonie a bien changé de main'); else ko('Phobos n\'est pas tombée — le montage ne prouve rien');
  const tv = tens(m, 'ceinturiens', 'martiens');
  if (tv === 8) ok('tension de l\'attaqué vers l\'attaquant : 8'); else ko('tension de l\'attaqué : ' + tv + ' au lieu de 8');
  const ta = tens(m, 'martiens', 'ceinturiens');
  if (ta === t0) ok('l\'attaquant ne s\'ajoute rien (' + ta + ')'); else ko('l\'attaquant a gagné de la tension : ' + t0 + ' → ' + ta);
}

console.log('§3 Attaque repoussée : la tension monte quand même, à 6');
{
  /* La cible se défend : garnison + jetons payables. L'assaillant n'engage qu'un jeton. */
  const m = montage({ jetonsCible: 8, resCible: 12 });
  const t0 = tens(m, 'martiens', 'ceinturiens');
  const r = assaut(m, 1);
  const tenue = m.cible.colonies.some(c => c.nodeId === 'deimos');
  note('combat ' + r.pPow + ' contre ' + r.aPow + ' — Déimos tenue : ' + tenue);
  if (tenue) ok('l\'attaque a bien échoué'); else ko('la colonie est tombée — le montage ne prouve rien');
  const tv = tens(m, 'ceinturiens', 'martiens');
  if (tv === 6) ok('tension de l\'attaqué : 6 (« même ratée, jamais pardonnée »)');
  else ko('tension de l\'attaqué : ' + tv + ' au lieu de 6');
  const ta = tens(m, 'martiens', 'ceinturiens');
  if (ta === t0) ok('l\'attaquant ne s\'ajoute rien (' + ta + ')'); else ko('l\'attaquant a gagné de la tension : ' + t0 + ' → ' + ta);
}

console.log('§4 +8 et +6 S\'AJOUTENT (Marc, 21/09) : une tension déjà montée monte encore, jusqu\'à 10');
{
  const m = montage({ jetonsCible: 8, resCible: 12 });
  vm.runInContext('setTens("ceinturiens","martiens",3)', m.sb);
  assaut(m, 1);                                    // attaque ratée → +6
  const tv = tens(m, 'ceinturiens', 'martiens');
  if (tv === 9) ok('3 + 6 = 9 après une attaque ratée');
  else ko('tension ' + tv + ' au lieu de 9 — l\'assaut repoussé ne s\'ajoute pas (ancien plancher)');
  assaut(m, 1);                                    // seconde attaque ratée → plafond 10
  const tv2 = tens(m, 'ceinturiens', 'martiens');
  if (tv2 === 10) ok('seconde attaque ratée : plafonnée à 10'); else ko('tension ' + tv2 + ' au lieu de 10');
}
console.log('§4bis Deux colonies prises : 0 → 8 → 10');
{
  const m = montage();
  vm.runInContext('setTens("ceinturiens","martiens",0)', m.sb);
  vm.runInContext('tensionApresAssaut(G.player, G.ais.find(a=>a.civ.id==="ceinturiens")||[G.player].concat(G.ais).find(n=>n.civ.id==="ceinturiens"), true)', m.sb);
  const t1 = tens(m, 'ceinturiens', 'martiens');
  vm.runInContext('tensionApresAssaut(G.player, [G.player].concat(G.ais).find(n=>n.civ.id==="ceinturiens"), true)', m.sb);
  const t2 = tens(m, 'ceinturiens', 'martiens');
  if (t1 === 8 && t2 === 10) ok('première colonie : 8 · deuxième : 10 (guerre populaire en fin de tour)');
  else ko('après deux colonies prises : ' + t1 + ' puis ' + t2 + ' (attendu 8 puis 10)');
}

console.log('§5 Ordinateur contre ordinateur : même règle, et le coût suit la distance');
{
  const m = montage({ cibleIA: true });
  const ia = m.tiers;                               // Jupitériens assaillent les Ceinturiens
  vm.runInContext(`(function(){
    const ia=G.ais.find(a=>a.civ.id==='jupiteriens');
    ia._isAI=true; ia.acLeft=5; ia.forceTokens=14; ia.res={energy:20,materials:20,science:6,morale:9};
  })()`, m.sb);
  const avantAC = vm.runInContext('G.ais.find(a=>a.civ.id==="jupiteriens").acLeft', m.sb);
  const coutPrevu = vm.runInContext('coutAssautAC(G.ais.find(a=>a.civ.id==="jupiteriens"),"titan")', m.sb);
  const jours = vm.runInContext('joursVersCible(G.ais.find(a=>a.civ.id==="jupiteriens"),"titan")', m.sb);
  const fait = vm.runInContext('resoudreAssautIA(G.ais.find(a=>a.civ.id==="jupiteriens"),"titan",{ouvrirGuerre:true})', m.sb);
  const apresAC = vm.runInContext('G.ais.find(a=>a.civ.id==="jupiteriens").acLeft', m.sb);
  note('assaut résolu : ' + fait + ' · ' + jours + ' j de voyage → ' + coutPrevu + ' action(s) · AC ' + avantAC + ' → ' + apresAC);
  if (fait) ok('l\'assaut a bien eu lieu'); else ko('l\'ordinateur a renoncé — le montage ne prouve rien');
  if (!enGuerre(m, 'jupiteriens', 'ceinturiens')) ok('aucune guerre ouverte entre les deux ordinateurs');
  else ko('l\'assaut d\'un ordinateur ouvre encore la guerre');
  if (avantAC - apresAC === coutPrevu) ok('le prélèvement d\'actions suit le barème de distance (' + coutPrevu + ')');
  else ko('prélevé ' + (avantAC - apresAC) + ' action(s) au lieu de ' + coutPrevu + ' — le barème de distance est ignoré ici');
  const tv = tens(m, 'ceinturiens', 'jupiteriens');
  if (tv === 8 || tv === 6) ok('tension de l\'attaqué portée à ' + tv);
  else ko('tension de l\'attaqué : ' + tv + ' (attendu 8 si la colonie tombe, 6 sinon)');
  const ta = tens(m, 'jupiteriens', 'ceinturiens');
  if (ta === 0) ok('l\'attaquant ne s\'ajoute rien'); else ko('l\'attaquant a gagné ' + ta + ' de tension');
}

console.log('§6 Aucune escarmouche ne survit à la nuit, donc aucune usure de guerre');
{
  const m = montage();
  const moral0 = m.moi.res.morale, moralC0 = m.cible.res.morale;
  assaut(m);
  const moralApresCombat = m.moi.res.morale;
  m.G.turn = 7; m.sb.startTurn();
  note('moral attaquant ' + moral0 + ' → après combat ' + moralApresCombat + ' → au tour 7 ' + m.moi.res.morale);
  if ((m.G.wars || []).length === 0) ok('aucune guerre en cours à l\'ouverture du tour suivant');
  else ko((m.G.wars || []).length + ' guerre(s) ont passé la nuit : ' + JSON.stringify((m.G.wars || []).map(w => w.a + '/' + w.b)));
  if (moralApresCombat - m.moi.res.morale < 4) ok('l\'attaquant ne paie pas l\'usure de guerre (−4)');
  else ko('l\'usure a été prélevée : −' + (moralApresCombat - m.moi.res.morale));
  note('moral de l\'attaqué ' + moralC0 + ' → ' + m.cible.res.morale + ' (perte de colonie, pas usure)');
}

console.log('§7 La guerre reste possible : tension à 10 en fin de tour → guerre populaire forcée');
{
  const m = montage();
  vm.runInContext('setTens("ceinturiens","martiens",10)', m.sb);
  const avant = (m.G.wars || []).length;
  let ouverte = false;
  try { ouverte = !!vm.runInContext('guerrePopulaireAuto(G.ais.find(a=>a.civ.id==="ceinturiens"), G.player)', m.sb); } catch (e) { note('guerrePopulaireAuto a levé : ' + e.message.split('\n')[0]); }
  const apres = (m.G.wars || []).length;
  note('guerres ' + avant + ' → ' + apres + ' (retour : ' + ouverte + ')');
  if (apres > avant || ouverte) ok('à 10 de tension, la guerre populaire s\'ouvre encore');
  else ko('plus aucun chemin n\'ouvre la guerre — la règle de Marc serait cassée dans l\'autre sens');
}

console.log('§8 VERROU — le raid ne change pas : 1 action, 2 jetons, +3 de tension, un par colonie');
{
  const m = montage({ cibleIA: true });
  m.cible.res = { energy: 8, materials: 8, science: 4, morale: 9 };
  const ac0 = m.moi.acLeft, jt0 = m.moi.forceTokens, t0 = tens(m, 'ceinturiens', 'martiens');
  m.sb.doRaidTarget('ceinturiens', 'eris', m.moi);
  const dAC = ac0 - m.moi.acLeft, dJT = jt0 - m.moi.forceTokens, dT = tens(m, 'ceinturiens', 'martiens') - t0;
  note('raid : −' + dAC + ' action, −' + dJT + ' jeton(s), tension +' + dT);
  if (dAC === 1) ok('1 action (le barème de distance ne s\'applique pas au raid)'); else ko(dAC + ' action(s) au lieu de 1');
  if (dJT === 2) ok('2 jetons'); else ko(dJT + ' jeton(s) au lieu de 2');
  if (dT === 3) ok('tension +3'); else ko('tension +' + dT + ' au lieu de +3');
  const ac1 = m.moi.acLeft;
  m.sb.doRaidTarget('ceinturiens', 'eris', m.moi);
  if (m.moi.acLeft === ac1) ok('un second raid sur la MÊME colonie est refusé, rien n\'est dépensé');
  else ko('la colonie a été pillée deux fois dans le tour');
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_assaut_sans_guerre : l\'assaut ne déclare plus la guerre, il fait monter la tension.');
