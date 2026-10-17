/* ============================================================================
   TEST — LA MISSION DIPLOMATIQUE : UNE ACTION SOCIALE QUI APAISE L'AUTRE, PAS SOI
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 17/09, après la partie 66C3 qu'il a gagnée en jouant cinq fois la carte
   Stratégie 🕊️ Diplomatie : « on peut ajouter dans les actions sociales une nouvelle tech :
   Diplomatie, répétable comme les 3 ressources, −2 matériaux, permet de réduire la tension de 3
   avec une nation à choix. »
   Il existait déjà 🕊️ Calmer la Population (1🪨 1⚡ → +1 moral et −3 à MA tension envers une nation).
   Ce qui manquait, c'est l'autre sens — baisser SA tension envers MOI, celle qui décide si on me
   déclare la guerre — et il n'existait que par une carte Stratégie qu'il faut avoir la chance de
   piocher. La mission diplomatique est cette action, achetable chaque tour.

   GARDE-FOU (proposé, accepté avec le « vas-y » de Marc) : UNE FOIS PAR NATION ET PAR TOUR.
   Répétable et sans limite, avec 5 AC on effaçait 15 points de tension par tour — la tension
   devenait gratuite à gérer, et tout le travail sur la guerre perdait sa portée. On peut apaiser
   trois nations dans le tour, pas la même trois fois.

   CE QUI EST VÉRIFIÉ : l'effet et son sens (§1), le prix et l'action (§2), le garde-fou (§3), les
   refus sans dépense (§4), le sens INVERSE de Calmer la Population — les deux cartes ne font pas
   doublon (§5), et l'ordinateur qui en fait le même usage par la même fonction (§6).
   Usage : node test_mission_diplomatique.js
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
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 5; G.phase = 'actions';
  const moi = G.player, ter = G.ais[0], mar = G.ais[1];
  moi._isAI = false; G.ais.forEach(a => a._isAI = true);
  moi.acLeft = 5; moi.res = { energy: 8, materials: 8, science: 4, morale: 6 };
  sb.setTens('terriens', 'player', 8); sb.setTens('player', 'terriens', 5);
  sb.setTens('martiens', 'player', 7);
  return { sb, G, moi, ter, mar };
}
const tens = (m, a, b) => vm.runInContext('getTens("' + a + '","' + b + '")', m.sb);
const carte = m => vm.runInContext('CIVIC_MARKET.find(c=>c.id==="cm_diplomatie")||null', m.sb);

console.log('§1 La carte existe, elle est sociale et répétable, et elle apaise SA tension envers moi');
{
  const m = montage();
  const c = carte(m);
  if (c) ok('cm_diplomatie est au marché civique : « ' + c.name + ' »'); else ko('cm_diplomatie absente du marché civique');
  if (c && c.type === 'social' && c.repeatable) ok('sociale et répétable, comme les trois cartes de ressources'); else if (c) ko('type ' + c.type + ', répétable ' + c.repeatable);
  if (c && c.cost && c.cost.materials === 2 && !c.cost.energy && !c.cost.science) ok('coût : 2 matériaux, rien d\'autre'); else if (c) ko('coût : ' + JSON.stringify(c.cost));
  const av = tens(m, 'terriens', 'jupiteriens'), avMoi = tens(m, 'jupiteriens', 'terriens');
  const fait = vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  const ap = tens(m, 'terriens', 'jupiteriens'), apMoi = tens(m, 'jupiteriens', 'terriens');
  note('Terriens → moi : ' + av + ' → ' + ap + ' · moi → Terriens : ' + avMoi + ' → ' + apMoi + ' · retour ' + fait);
  if (fait === true) ok('la mission est acceptée'); else ko('refusée : ' + fait);
  if (av - ap === 3) ok('SA tension envers moi baisse de 3'); else ko('sa tension : ' + av + ' → ' + ap);
  if (apMoi === avMoi) ok('MA tension envers elle ne bouge pas — ce n\'est pas Calmer la Population'); else ko('ma tension a bougé : ' + avMoi + ' → ' + apMoi);
}

console.log('§2 Elle coûte 1 action et 2 matériaux, et s\'inscrit au carnet');
{
  const m = montage();
  const ac = m.moi.acLeft, mat = m.moi.res.materials, en = m.moi.res.energy;
  vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  if (ac - m.moi.acLeft === 1) ok('1 action'); else ko('actions : ' + ac + ' → ' + m.moi.acLeft);
  if (mat - m.moi.res.materials === 2 && en === m.moi.res.energy) ok('2 matériaux, l\'énergie intacte'); else ko('matériaux ' + mat + ' → ' + m.moi.res.materials + ', énergie ' + en + ' → ' + m.moi.res.energy);
  const l = (m.G.log || []).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, '')).find(x => /Mission diplomatique/i.test(x) && /Terriens/.test(x));
  if (l) ok('journal : « ' + l.slice(0, 90) + ' »'); else ko('rien au journal');
}

console.log('§3 GARDE-FOU — une fois par nation et par tour, mais plusieurs nations dans le tour');
{
  const m = montage();
  vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  const ac1 = m.moi.acLeft, t1 = tens(m, 'terriens', 'jupiteriens');
  const deux = vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  note('seconde mission chez les Terriens le même tour : ' + deux + ' · AC ' + ac1 + ' → ' + m.moi.acLeft + ' · tension ' + t1 + ' → ' + tens(m, 'terriens', 'jupiteriens'));
  if (deux !== true && m.moi.acLeft === ac1 && tens(m, 'terriens', 'jupiteriens') === t1) ok('refusée, rien dépensé, tension inchangée');
  else ko('la même nation a été apaisée deux fois dans le tour');
  const autre = vm.runInContext('diplomatieCivique(G.player, "martiens")', m.sb);
  if (autre === true && tens(m, 'martiens', 'jupiteriens') === 4) ok('une AUTRE nation, elle, peut être apaisée dans le même tour (Martiens 7 → 4)');
  else ko('seconde nation : ' + autre + ', tension Martiens ' + tens(m, 'martiens', 'jupiteriens'));
  m.G.turn = 6;
  const lendemain = vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  if (lendemain === true) ok('et le tour suivant, les Terriens peuvent l\'être de nouveau'); else ko('bloquée au tour suivant : ' + lendemain);
}

console.log('§4 Refus propres : sans action, sans matériaux, hors phase — rien n\'est dépensé');
{
  const m = montage();
  m.moi.acLeft = 0;
  let r = vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  if (r !== true && tens(m, 'terriens', 'jupiteriens') === 8) ok('0 AC : refusée'); else ko('0 AC : ' + r);
  m.moi.acLeft = 3; m.moi.res.materials = 1;
  r = vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  if (r !== true && m.moi.acLeft === 3) ok('1 matériau : refusée, aucune action prise'); else ko('1 matériau : ' + r + ', AC ' + m.moi.acLeft);
  m.moi.res.materials = 8; m.G.phase = 'ai';
  r = vm.runInContext('diplomatieCivique(G.player, "terriens")', m.sb);
  if (r !== true) ok('hors phase d\'actions : refusée'); else ko('acceptée hors phase');
}

console.log('§5 Calmer la Population garde son sens à elle : les deux cartes ne font pas doublon');
{
  const m = montage();
  const av = tens(m, 'jupiteriens', 'terriens'), avLeur = tens(m, 'terriens', 'jupiteriens');
  vm.runInContext('applyCalmTension("terriens","civic",3)', m.sb);
  note('Calmer la Population — moi → Terriens : ' + av + ' → ' + tens(m, 'jupiteriens', 'terriens') + ' · eux → moi : ' + avLeur + ' → ' + tens(m, 'terriens', 'jupiteriens'));
  if (av - tens(m, 'jupiteriens', 'terriens') === 3 && tens(m, 'terriens', 'jupiteriens') === avLeur) ok('elle baisse MA tension, pas la leur — l\'inverse exact de la mission');
  else ko('Calmer la Population ne fait plus ce qu\'elle faisait');
}

console.log('§6 L\'ordinateur en fait le même usage, par la même fonction : il apaise qui lui en veut le plus');
{
  const m = montage();
  const ia = m.ter;                                    // Terriens : les Martiens leur en veulent à 9, les Ceinturiens à 4
  ia.acLeft = 3; ia.res.materials = 6;
  m.sb.setTens('martiens', 'terriens', 9); m.sb.setTens('ceinturiens', 'terriens', 4);
  const c = carte(m);
  vm.runInContext('aiBuyCivic(G.ais[0], CIVIC_MARKET.find(x=>x.id==="cm_diplomatie"))', m.sb);
  note('après : Martiens → Terriens ' + tens(m, 'martiens', 'terriens') + ' · Ceinturiens → Terriens ' + tens(m, 'ceinturiens', 'terriens') + ' · AC ' + ia.acLeft + ' · matériaux ' + ia.res.materials);
  if (tens(m, 'martiens', 'terriens') === 6) ok('elle a choisi les Martiens, les plus remontés : 9 → 6'); else ko('Martiens → Terriens : ' + tens(m, 'martiens', 'terriens'));
  if (tens(m, 'ceinturiens', 'terriens') === 4) ok('et n\'a pas touché aux Ceinturiens'); else ko('Ceinturiens touchés : ' + tens(m, 'ceinturiens', 'terriens'));
  if (ia.acLeft === 2 && ia.res.materials === 4) ok('elle a payé le même prix qu\'un joueur : 1 action, 2 matériaux'); else ko('prix IA : AC ' + ia.acLeft + ', matériaux ' + ia.res.materials);
  void c;
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_mission_diplomatique : on apaise l\'autre pour 2 matériaux, une fois par nation et par tour.');
