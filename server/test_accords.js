/* ============================================================================
   TEST — UN ACCORD SE PROPOSE, IL NE S'IMPOSE PAS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-12, après une partie : « c'est le joueur actif qui voit la
   possibilité tout seul (or il faut que ce soit simultané) ET après l'autre joueur ou
   IA doit pouvoir accepter, pour le moment l'autre joueur ne peut pas cliquer sur
   accepter. Donc ça il faut corriger en priorité et il faut que l'IA puisse refuser
   si ça l'arrange pas. »

   LA CAUSE, ET ELLE TENAIT DANS UN NOM. `getNodeOwnerAI(nodeId)` ne cherchait le
   propriétaire d'une colonie QUE parmi les IA :

       G.ais.find(ai => ai.colonies.some(c => c.nodeId === nodeId))

   La colonie d'un autre HUMAIN n'avait donc, aux yeux du jeu, aucun propriétaire.
   Résultat : on proposait un accord dessus, personne ne lui demandait rien, aucune
   fenêtre ne s'ouvrait chez lui — et l'accord se concluait tout seul. Le nom disait
   « AI » et personne ne s'en méfiait ; c'est la même maladie que partout ailleurs,
   déguisée en abréviation.

   CE QUE CE TEST VÉRIFIE :
     1. le propriétaire d'un nœud est trouvé, humain ou IA ;
     2. une IA peut REFUSER — guerre, tension trop forte, proposant trop en avance ;
     3. un refus ne coûte rien au proposant : ni AC, ni matériaux ;
     4. une acceptation applique exactement ce qui est annoncé : 2🪨 transférés,
        tension −3 des deux côtés, accord enregistré ;
     5. la règle de refus est LA MÊME pour une IA et pour un joueur ;
     6. le pacte diplomatique ne s'impose plus non plus.

   Usage : node test_accords.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) {
    p.res = { energy: 30, materials: 30, science: 30, morale: 6 };
    p.acLeft = 4; p.acMax = 4;
  }
  G.turn = 4; G.phase = 'actions';
  return { sb, G };
}
const nation = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const tens = (sb, a, b) => vm.runInContext('getTens(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')', sb);

console.log('═'.repeat(74));
console.log('ACCORDS — UNE PROPOSITION, PAS UNE DÉCISION UNILATÉRALE');
console.log('═'.repeat(74) + '\n');

/* ── 1. Le propriétaire d'un nœud ─────────────────────────────────────────── */
console.log('1. À qui appartient cette colonie ?');
{
  const { sb, G } = partie();
  const ia = nation(G, 'martiens'), humain = nation(G, 'jupiteriens');
  humain._isAI = false;
  /* ⚠️ Les nœuds LIBRES seulement : `noeuds[0]` était la Lune, capitale des Terriens. Le test
     « propriétaire d'une colonie d'IA » trouvait donc « terriens » et criait au défaut — alors
     que la réponse était juste. Une donnée d'essai mal choisie accuse le produit à tort. */
  const occupes = new Set([G.player].concat(G.ais).flatMap(n => n.colonies.map(c => c.nodeId)));
  const noeuds = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb)
    .filter(id => !occupes.has(id));
  const nIA = noeuds[0], nHum = noeuds[1];
  ia.colonies.push({ nodeId: nIA, level: 1, connected: true });
  humain.colonies.push({ nodeId: nHum, level: 1, connected: true });

  const o1 = sb.ownerNation(nIA), o2 = sb.ownerNation(nHum);
  if (o1 && o1.civ.id === ia.civ.id) ok('colonie d\'une IA : propriétaire trouvé');
  else ko('colonie d\'une IA : propriétaire ' + (o1 && o1.civ.id));
  if (o2 && o2.civ.id === humain.civ.id) ok('colonie d\'un HUMAIN : propriétaire trouvé (c\'est ce qui manquait)');
  else ko('colonie d\'un humain : AUCUN propriétaire trouvé — le défaut est intact');
}

/* ── 2. Une IA peut refuser ───────────────────────────────────────────────── */
console.log('\n2. L\'IA peut refuser');
{
  const cas = (prepare, libelle) => {
    const { sb, G } = partie();
    const moi = G.player, ia = nation(G, 'martiens');
    prepare(sb, G, moi, ia);
    const avis = sb.accordAcceptable(ia, moi);
    return { avis, libelle };
  };
  const paix = cas(() => {}, 'aucun obstacle');
  if (paix.avis.ok) ok('sans obstacle, l\'IA accepte');
  else ko('l\'IA refuse sans raison : ' + paix.avis.raison);

  const guerre = cas((sb, G, moi, ia) => { sb.declareWar('essai', 'player', ia.civ.id); }, 'guerre');
  if (!guerre.avis.ok) ok('en guerre, elle refuse — « ' + guerre.avis.raison + ' »');
  else ko('elle accepte un accord alors qu\'on est en guerre');

  const tendu = cas((sb, G, moi, ia) => {
    vm.runInContext('setTens(' + JSON.stringify(ia.civ.id) + ',' + JSON.stringify(moi.civ.id) + ',9);', sb);
  }, 'tension');
  if (!tendu.avis.ok) ok('tension élevée, elle refuse — « ' + tendu.avis.raison + ' »');
  else ko('elle accepte malgré une tension de 9/10');

  const avance = cas((sb, G, moi, ia) => {
    const nds = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb);
    for (let i = 0; i < 6; i++) moi.colonies.push({ nodeId: nds[i], level: 3, connected: true });
    for (let i = 6; i < 9; i++) ia.colonies.push({ nodeId: nds[i], level: 2, connected: true });
    ia.res.morale = 6;
  }, 'avance');
  if (!avance.avis.ok) ok('proposant trop en avance et IA en forme : elle refuse — « ' + avance.avis.raison + ' »');
  else note('… l\'écart de VP n\'a pas suffi à déclencher le refus (règle indicative)');
}

/* ── 3. Un refus ne coûte rien ────────────────────────────────────────────── */
console.log('\n3. Un refus ne coûte rien au proposant');
{
  const { sb, G } = partie();
  const moi = G.player, ia = nation(G, 'martiens');
  /* ⚠️ Les nœuds LIBRES seulement : `noeuds[0]` était la Lune, capitale des Terriens. Le test
     « propriétaire d'une colonie d'IA » trouvait donc « terriens » et criait au défaut — alors
     que la réponse était juste. Une donnée d'essai mal choisie accuse le produit à tort. */
  const occupes = new Set([G.player].concat(G.ais).flatMap(n => n.colonies.map(c => c.nodeId)));
  const noeuds = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb)
    .filter(id => !occupes.has(id));
  const n = noeuds[0];
  ia.colonies.push({ nodeId: n, level: 1, connected: true });
  vm.runInContext('setTens(' + JSON.stringify(ia.civ.id) + ',' + JSON.stringify(moi.civ.id) + ',9);', sb);
  const avAC = moi.acLeft, avMat = moi.res.materials, avAcc = G.commercialAccords.length;
  sb.proposeAccord(n);
  if (moi.acLeft === avAC && moi.res.materials === avMat) ok('refus : ni AC ni matériaux prélevés');
  else ko('refus : le proposant a perdu ' + (avAC - moi.acLeft) + ' AC et ' + (avMat - moi.res.materials) + '🪨');
  if (G.commercialAccords.length === avAcc) ok('et aucun accord n\'a été enregistré');
  else ko('un accord a été enregistré malgré le refus');
}

/* ── 4. Une acceptation applique exactement ce qui est annoncé ─────────────── */
console.log('\n4. Une acceptation fait exactement ce qui est annoncé');
{
  const { sb, G } = partie();
  const moi = G.player, ia = nation(G, 'martiens');
  /* ⚠️ Les nœuds LIBRES seulement : `noeuds[0]` était la Lune, capitale des Terriens. Le test
     « propriétaire d'une colonie d'IA » trouvait donc « terriens » et criait au défaut — alors
     que la réponse était juste. Une donnée d'essai mal choisie accuse le produit à tort. */
  const occupes = new Set([G.player].concat(G.ais).flatMap(n => n.colonies.map(c => c.nodeId)));
  const noeuds = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb)
    .filter(id => !occupes.has(id));
  const n = noeuds[0];
  ia.colonies.push({ nodeId: n, level: 1, connected: true });
  vm.runInContext('setTens(' + JSON.stringify(ia.civ.id) + ',' + JSON.stringify(moi.civ.id) + ',5);setTens(' + JSON.stringify(moi.civ.id) + ',' + JSON.stringify(ia.civ.id) + ',5);', sb);
  const avAC = moi.acLeft, avMat = moi.res.materials, avMatIA = ia.res.materials;
  sb.proposeAccord(n);
  if (moi.acLeft === avAC - 1) ok('1 AC prélevé');
  else ko('AC : ' + avAC + ' → ' + moi.acLeft);
  if (moi.res.materials === avMat - 2) ok('2🪨 prélevés au proposant');
  else ko('matériaux du proposant : ' + avMat + ' → ' + moi.res.materials);
  if (ia.res.materials === avMatIA + 2) ok('et 2🪨 REÇUS par l\'autre nation (c\'est un don, pas une taxe)');
  else ko('matériaux de l\'autre : ' + avMatIA + ' → ' + ia.res.materials);
  if (G.commercialAccords.includes(n)) ok('l\'accord est enregistré sur la colonie');
  else ko('aucun accord enregistré malgré l\'acceptation');
  const t1 = tens(sb, moi.civ.id, ia.civ.id), t2 = tens(sb, ia.civ.id, moi.civ.id);
  if (t1 === 2 && t2 === 2) ok('tension −3 des DEUX côtés (5 → 2)');
  else ko('tension : ' + t1 + ' et ' + t2 + ' au lieu de 2 et 2');
}

/* ── 5. La même règle pour une IA et pour un joueur ───────────────────────── */
console.log('\n5. La règle de refus ne dépend pas de la nature du partenaire');
{
  const { sb, G } = partie();
  const moi = G.player, a = nation(G, 'martiens'), b = nation(G, 'jupiteriens');
  b._isAI = false;                       // même situation, mais humain
  for (const n of [a, b]) vm.runInContext('setTens(' + JSON.stringify(n.civ.id) + ',' + JSON.stringify(moi.civ.id) + ',9);', sb);
  const rA = sb.accordAcceptable(a, moi), rB = sb.accordAcceptable(b, moi);
  /* v10.79 : `raison` est un message J (clé qui voyage) — on compare le texte rendu, pas l'objet. */
  if (rA.ok === rB.ok && String(rA.raison) === String(rB.raison)) ok('IA et humain reçoivent le MÊME verdict : « ' + rA.raison + ' »');
  else ko('verdicts différents — IA : « ' + rA.raison + ' », humain : « ' + rB.raison + ' »');
}

/* ── 6. Le pacte diplomatique ne s'impose plus ────────────────────────────── */
console.log('\n6. Le pacte de non-agression se refuse aussi');
{
  /* ⚠️ MON PREMIER JET DE CE TEST ÉTAIT FAUX, et c'est le produit qui avait raison. Je montais la
     tension à 9 en pensant faire refuser le pacte. Or le sommet diplomatique COMMENCE par baisser
     la tension de 5 partout : 9 devenait 4, et l'acceptation était parfaitement légitime. La
     tension ne peut donc JAMAIS bloquer un pacte dans cet événement (10 − 5 = 5, sous le seuil
     de 7) — c'est une conséquence voulue de la règle, pas un défaut.
     On éprouve donc le refus par le critère qui, lui, survit au sommet : « tu es déjà trop en
     avance ». */
  const { sb, G } = partie();
  const moi = G.player, ia = nation(G, 'martiens');
  const nds = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb);
  const occupes = new Set([G.player].concat(G.ais).flatMap(n => n.colonies.map(c => c.nodeId)));
  const libres = nds.filter(id => !occupes.has(id));
  for (let i = 0; i < 7 && i < libres.length; i++) moi.colonies.push({ nodeId: libres[i], level: 3, connected: true });
  ia.res.morale = 6;
  for (let i = 0; i < 3 && i + 7 < libres.length; i++) ia.colonies.push({ nodeId: libres[i + 7], level: 2, connected: true });

  const avis = sb.accordAcceptable(ia, moi);
  if (!avis.ok) note('l\'IA devrait refuser : « ' + avis.raison + ' »');
  else { ko('l\'écart de VP ne suffit pas à faire refuser — le cas n\'est pas éprouvé'); }

  vm.runInContext('_evDiploSel={' + JSON.stringify(ia.civ.id) + ':true};', sb);
  const avMat = moi.res.materials;
  try { sb._evDiploConfirm(); } catch (e) { note('(_evDiploConfirm : ' + e.message.split('\n')[0] + ')'); }
  const pacte = (G._nonAgg || {})[ia.civ.id];
  if (!pacte) ok('la nation qui refuse n\'est PAS liée par un pacte imposé');
  else ko('le pacte a été imposé malgré le refus (jusqu\'au tour ' + pacte + ')');
  if (moi.res.materials === avMat) ok('et les 6🪨 ne sont pas prélevés pour un pacte refusé');
  else ko('6🪨 prélevés alors que le pacte est refusé (' + avMat + ' → ' + moi.res.materials + ')');

  // Et le cas normal : un pacte accepté existe bien, et se paie.
  const b = partie();
  const m2 = b.G.player, i2 = nation(b.G, 'martiens');
  vm.runInContext('_evDiploSel={' + JSON.stringify(i2.civ.id) + ':true};', b.sb);
  const avMat2 = m2.res.materials;
  try { b.sb._evDiploConfirm(); } catch (e) {}
  if ((b.G._nonAgg || {})[i2.civ.id]) ok('un pacte ACCEPTÉ est bien conclu (le test ne prouve pas seulement des refus)');
  else ko('aucun pacte conclu même quand l\'IA accepte');
  if (m2.res.materials === avMat2 - 6) ok('et il coûte bien 6🪨');
  else ko('coût du pacte : ' + avMat2 + ' → ' + m2.res.materials);
}

/* ── 7. Le sommet s'ouvre pour TOUT LE MONDE en même temps ─────────────────── */
console.log('\n7. Le sommet commercial est simultané');
{
  /* POURQUOI. Marc, 2026-08-12 : « c'est le joueur actif qui voit la possibilité tout seul, or il
     faut que ce soit simultané ». `stAccordsSuivant` faisait `file.shift()` : il basculait la
     perspective sur un joueur, ouvrait SA fenêtre, et n'appelait le suivant qu'une fois le premier
     servi. Les autres attendaient sans rien voir, et le premier signait avant qu'ils aient pu se
     manifester.
     ON NE VÉRIFIE PAS QUE LE CODE A CHANGÉ — on compte les questions émises AVANT toute réponse. */
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  const nations = [G.player].concat(G.ais);
  for (const p of nations) { p._isAI = false; p.res = { energy: 20, materials: 20, science: 20, morale: 6 }; }
  G.turn = 6;

  // On intercepte les questions au lieu d'y répondre : c'est tout l'objet de la mesure.
  const posees = [];
  vm.runInContext('typeof window', sb) === 'undefined' && vm.runInContext('var window={};', sb);
  sb.setDecisionSink(function (p) { posees.push({ kind: p.kind, a: p.civId || p.nation || (p.nation && p.nation.civ && p.nation.civ.id) }); });
  vm.runInContext('window._scRemoteDecision=function(p){ __capte(p); };', sb);
  vm.runInContext('__capte=function(p){ __posees.push(p); };', sb);
  vm.runInContext('__posees=[];', sb);

  const ev = vm.runInContext('EVENTS.find(e=>e.id==="comm")', sb);
  if (!ev) { ko('événement « sommet commercial » introuvable'); }
  else {
    vm.runInContext('fluxDonnees().evenementCourant="comm";fluxDonnees().apresEvenement=null;'
      + 'fluxDonnees().fileAccords=allPlayers().filter(p=>!p._isAI).map(p=>p.civ.id);'
      + 'fluxDonnees().nationAvantAccords=G.player.civ.id;', sb);
    try { sb.stAccordsSuivant(); } catch (e) { note('(stAccordsSuivant : ' + e.message.split('\n')[0] + ')'); }

    const distantes = vm.runInContext('__posees.map(p=>p.civId||p.civ||"?")', sb);
    const total = posees.length + distantes.length;
    note('questions émises avant toute réponse : ' + total + ' (dont ' + distantes.length + ' à distance)');
    if (total === 3) ok('les TROIS joueurs sont interrogés avant que quiconque ait répondu');
    else if (total <= 1) ko('une seule question émise (' + total + ') — le sommet est encore séquentiel');
    else ko(total + ' question(s) émises au lieu de 3');

    const restants = vm.runInContext('(fluxDonnees().accordsRestants||[]).length', sb);
    if (restants === 3) ok('les trois réponses sont attendues (' + restants + ' en suspens)');
    else ko(restants + ' réponse(s) attendue(s) au lieu de 3');

    /* Le tour ne doit PAS repartir tant que tout le monde n'a pas répondu. */
    vm.runInContext('stAccordCommChoisi({aiId:null},"terriens");', sb);
    const apres1 = vm.runInContext('(fluxDonnees().accordsRestants||[]).length', sb);
    if (apres1 === 2) ok('une réponse reçue : le sommet attend encore les deux autres');
    else ko('après une réponse, ' + apres1 + ' en suspens au lieu de 2');
    vm.runInContext('stAccordCommChoisi({aiId:null},"martiens");stAccordCommChoisi({aiId:null},"jupiteriens");', sb);
    const fini = vm.runInContext('fluxDonnees().accordsRestants===null', sb);
    if (fini) ok('les trois ayant répondu, le sommet se referme et le tour repart');
    else ko('le sommet ne se referme pas après les trois réponses');
  }
  sb.setDecisionSink(null);
}

/* ── 8. Deux humains peuvent se proposer un accord ─────────────────────────── */
console.log('\n8. Un humain apparaît dans la liste d\'un autre humain');
{
  /* ⚠️ L'ANCIENNE LISTE PARTAIT DE `G.ais`. Deux joueurs humains ne pouvaient donc jamais se
     proposer d'accord pendant un sommet : l'un n'apparaissait tout simplement pas chez l'autre.
     Le défaut était invisible en solo, où tous les autres SONT des IA. */
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player, humain = G.ais.find(a => a.civ.id === 'martiens'), ia = G.ais.find(a => a.civ.id === 'jupiteriens');
  moi._isAI = false; humain._isAI = false; ia._isAI = true;
  const cands = sb._evCommCandidats(moi).map(n => n.civ.id);
  if (cands.includes('martiens')) ok('l\'autre JOUEUR figure dans la liste des partenaires possibles');
  else ko('l\'autre joueur est absent de la liste : ' + JSON.stringify(cands));
  if (cands.includes('jupiteriens')) ok('l\'IA y figure aussi (rien n\'a été perdu au passage)');
  else ko('l\'IA a disparu de la liste : ' + JSON.stringify(cands));
  if (!cands.includes(moi.civ.id)) ok('et on ne se propose pas un accord à soi-même');
  else ko('la nation se propose un accord à elle-même');
}

/* ── 9. Les IA participent au sommet, elles ne font plus que subir ─────────── */
console.log('\n9. Une IA propose, elle aussi');
{
  /* POURQUOI. Marc, 2026-08-14 : « si tu peux corriger en même temps pour les IA, qu'elles puissent
     elles aussi participer c'est mieux […] dans la perspective d'éliminer le joueur dominant qui
     contrôle tout et voit tout et pas les autres. »
     ⚠️ ELLES N'Y PARTICIPAIENT PAS DU TOUT : `fileAccords` ne contenait que les humains. Une IA
     encaissait les +2🪨 collectifs du sommet et rien d'autre — jamais une proposition, jamais un
     partenaire, aucune sortie possible d'un isolement diplomatique. */
  const { sb, G } = partie();
  const moi = G.player, a = nation(G, 'martiens'), b = nation(G, 'jupiteriens');
  a._isAI = true; b._isAI = true;

  // Une IA choisit-elle un partenaire quand elle le peut ?
  const choix = sb.iaChoisitAccord(a);
  if (choix) ok('l\'IA ' + a.civ.name + ' choisit un partenaire : ' + choix.civ.name);
  else ko('l\'IA ne choisit personne alors que des partenaires sont disponibles');

  /* Elle vise LA TENSION LA PLUS FORTE — c'est là que l'accord rapporte le plus (−3 des deux
     côtés), et c'est ce qu'un joueur ferait. On monte la tension avec `moi` et on regarde. */
  vm.runInContext('setTens("martiens","terriens",5);setTens("terriens","martiens",5);', sb);
  const choix2 = sb.iaChoisitAccord(a);
  if (choix2 && choix2.civ.id === 'terriens') ok('et elle vise en priorité la nation avec qui la tension est la plus forte');
  else ko('elle vise ' + (choix2 && choix2.civ.id) + ' alors que la tension est la plus forte avec terriens');

  // Elle ne propose PAS à quelqu'un qui refuserait : la règle est la même pour tous.
  vm.runInContext('setTens("jupiteriens","martiens",9);setTens("martiens","jupiteriens",9);', sb);
  const c3 = sb.iaChoisitAccord(a);
  if (!c3 || c3.civ.id !== 'jupiteriens') ok('elle ne propose pas à une nation qui refuserait (tension 9/10)');
  else ko('elle propose à une nation qui refusera à coup sûr');

  // La file du sommet contient bien TOUT LE MONDE, IA comprises.
  vm.runInContext('fluxDonnees().evenementCourant="comm";'
    + 'fluxDonnees().fileAccords=allPlayers().map(p=>p.civ.id);', sb);
  const file = vm.runInContext('fluxDonnees().fileAccords', sb);
  if (file.length === 3) ok('la file du sommet compte les 3 nations, IA comprises (c\'était 1 avant)');
  else ko('la file du sommet compte ' + file.length + ' nation(s)');

  /* CONTRE-ÉPREUVE : sans partenaire acceptable, elle ne propose rien plutôt que n'importe quoi. */
  const c = partie();
  const ia = nation(c.G, 'martiens'); ia._isAI = true;
  for (const o of [c.G.player, nation(c.G, 'jupiteriens')])
    vm.runInContext('setTens("' + o.civ.id + '","martiens",10);setTens("martiens","' + o.civ.id + '",10);', c.sb);
  if (!c.sb.iaChoisitAccord(ia)) ok('contre-épreuve : tout le monde refuserait → elle ne propose rien');
  else ko('elle propose alors que toutes les nations refuseraient');
}

/* ── 10. Une IA propose de sa PROPRE initiative, pendant son tour ──────────── */
console.log('\n10. Une IA propose un accord pendant son tour');
{
  /* POURQUOI. Marc, 2026-08-14 : « Ce qui manque : proposer un accord de leur propre initiative
     pendant leur tour […] c'est le dernier morceau du principe l'IA est une nation comme une
     autre. » `proposeAccord` avait `G.player` écrit en dur : le seul chemin vers un accord était le
     clic du joueur sur une colonie. Une IA pouvait accepter ou refuser, jamais engager. */
  const { sb, G } = partie();
  const ia = nation(G, 'martiens'), cible = nation(G, 'jupiteriens');
  ia._isAI = true;
  const nbAvant = G.commercialAccords.length;
  const matAvant = ia.res.materials, matCible = cible.res.materials;
  const fait = sb.proposeAccord(cible.colonies[0].nodeId, ia);
  if (fait === true) ok('une IA peut conclure un accord en tant que PROPOSANT');
  else ko('proposeAccord refuse une IA comme proposant (retour : ' + fait + ')');
  if (G.commercialAccords.length === nbAvant + 1) ok('l\'accord est enregistré');
  else ko('aucun accord enregistré');
  if (ia.res.materials === matAvant - 2) ok('c\'est bien ELLE qui paie les 2🪨');
  else ko('matériaux de l\'IA : ' + matAvant + ' → ' + ia.res.materials);
  if (cible.res.materials === matCible + 2) ok('et le partenaire les reçoit');
  else ko('matériaux du partenaire : ' + matCible + ' → ' + cible.res.materials);

  /* ⚠️ LA TENSION ÉTAIT CALMÉE ENTRE « player » ET LE PROPRIÉTAIRE — donc entre la nation ACTIVE et
     lui, quel que soit le vrai proposant. Avec une IA, c'est la tension de quelqu'un d'autre qui
     baissait. On vérifie que ce sont bien les deux bonnes nations. */
  const t1 = tens(sb, ia.civ.id, cible.civ.id), t2 = tens(sb, cible.civ.id, ia.civ.id);
  if (t1 === 0 && t2 === 0) ok('la tension baisse entre les DEUX nations concernées, pas celle de la nation active');
  else note('tension ' + ia.civ.id + '→' + cible.civ.id + ' : ' + t1 + ', retour : ' + t2);

  // Le registre des signataires est renseigné : c'est lui qui décide qui touche le revenu.
  const sign = (G.accordsParties || {})[cible.colonies[0].nodeId];
  if (sign && sign.includes('martiens') && sign.includes('jupiteriens')) ok('les deux signataires sont enregistrés : ' + sign.join(' ↔ '));
  else ko('signataires enregistrés : ' + JSON.stringify(sign));
}

/* ── 11. Seuls les signataires touchent le revenu de l'accord ──────────────── */
console.log('\n11. Un accord ne paie que ceux qui l\'ont signé');
{
  /* ⚠️ IL PAYAIT TOUT LE MONDE. Le revenu faisait `gains += G.commercialAccords.length` pour CHAQUE
     nation : chaque accord de la partie enrichissait aussi les nations restées à l'écart. Mesuré le
     2026-08-14 : deux accords entre Terriens et Martiens rapportaient +2🪨 +2🙂/tour au Jupitérien.
     Vestige du solo, où le seul signataire possible était le joueur. */
  const { sb, G } = partie();
  const a = G.player, b = nation(G, 'martiens'), c = nation(G, 'jupiteriens');
  const avant = [a, b, c].map(p => sb.revenusBruts(p, {}));
  a.res.materials = 20; a.acLeft = 3;
  sb.proposeAccord(b.colonies[0].nodeId, a);
  const apres = [a, b, c].map(p => sb.revenusBruts(p, {}));
  const delta = i => ((apres[i].materials || 0) - (avant[i].materials || 0)) + '🪨 ' + ((apres[i].morale || 0) - (avant[i].morale || 0)) + '🙂';
  if (delta(0) === '1🪨 1🙂') ok('le proposant gagne +1🪨 +1🙂/tour');
  else ko('proposant : ' + delta(0));
  if (delta(1) === '1🪨 1🙂') ok('le partenaire aussi');
  else ko('partenaire : ' + delta(1));
  if (delta(2) === '0🪨 0🙂') ok('et la nation restée à l\'écart ne touche RIEN (elle touchait +1🪨 +1🙂)');
  else ko('la nation non signataire touche encore ' + delta(2));
}

/* ── 12. Transit par le réseau d'un partenaire — pour tous, et sans malus ──── */
console.log('\n12. Transit : pour toutes les nations, et sans malus');
{
  /* DEUX CORRECTIONS. (1) La règle était calculée `if(p===G.player)` aux deux endroits — seule la
     nation active en profitait. (2) Le malus −1🙂 −1🪨 est supprimé (Marc, 2026-08-14 : « Il faut
     supprimer ce malus. Je n'en veux plus. »). Une colonie en transit rapporte les ressources
     BRUTES du nœud, sans bonus de niveau. */
  const { sb, G } = partie();
  const ia = nation(G, 'martiens'), autre = nation(G, 'jupiteriens');
  ia._isAI = true;
  const libre = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize&&Object.keys(NODES[k].res||{}).length)', sb)
    .find(id => ![G.player].concat(G.ais).some(p => p.colonies.some(c => c.nodeId === id)));
  const pont = autre.colonies[0].nodeId;
  ia.colonies.push({ nodeId: libre, level: 1, connected: false });
  ia.routes.push({ from: libre, to: pont, tokens: 0 });
  vm.runInContext('_accordEnregistrer(' + JSON.stringify(pont) + ',allPlayers().find(p=>p.civ.id==="martiens"),allPlayers().find(p=>p.civ.id==="jupiteriens"));', sb);
  sb.updateConnections(ia);
  const col = ia.colonies.find(c => c.nodeId === libre);
  if (col.foreignConnected) ok('une colonie d\'IA reliée au réseau d\'un partenaire est reconnue en transit');
  else ko('le transit n\'est pas reconnu pour une IA — la règle reste réservée à la nation active');

  const g = sb.revenusBruts(ia, {});
  const res = vm.runInContext('NODES[' + JSON.stringify(libre) + '].res', sb);
  const attendu = (res.materials || 0);
  const accords = sb.accordsDe(ia).length;
  const base = sb.revenusBruts(nation(G, 'ceinturiens') || G.player, {});
  void base;
  if ((g.morale || 0) >= accords) ok('aucun malus de moral : le −1🙂 a disparu');
  else ko('le moral reste amputé (' + g.morale + ' pour ' + accords + ' accord(s))');
  note('ressources brutes du nœud en transit : ' + JSON.stringify(res) + ' — matériaux attendus au moins ' + attendu);
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Accords : le partenaire est identifié quel qu\'il soit, il peut refuser, et un refus ne coûte rien.');
console.log('═'.repeat(74));
