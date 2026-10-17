/* ============================================================================
   TEST — LA COLONIE EXTRA-SOLAIRE PARTAGÉE EST-ELLE UNE VRAIE COLONIE ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-14 : « Quand un joueur ou une IA partage une colonie avec
   tech extra solaire, est-ce que la colonie est comptée comme colonie en terme de VP ?
   Et si elle est connectée est-elle comptée pour les agendas et autres types de calculs
   de points de victoire ? Ça devrait. La colonie devrait être de niveau 1, non
   augmentable ceci dit. »

   LA SITUATION. `Exploration Extra-Solaire` donne une colonie sur Éris, Pluton ou
   Triton. Si la planète est DÉJÀ tenue par quelqu'un, on ne la lui prend pas : les deux
   nations y cohabitent, un accord commercial est imposé, et la colonie du nouvel
   arrivant est marquée `noUpgrade`. Reste la question de Marc : cette colonie de
   seconde main compte-t-elle vraiment, ou est-elle décorative ?

   ON NE RÉPOND PAS EN LISANT LE CODE. On installe la situation et on regarde les
   chiffres bouger — c'est la seule méthode qui n'a pas menti cette semaine.

   CE QUE CE TEST VÉRIFIE :
     1. la colonie existe, au niveau 1, marquée non améliorable ;
     2. l'accord commercial forcé est bien enregistré ;
     3. le score de colonies (colVP) AUGMENTE grâce à elle ;
     4. connectée, elle compte pour l'agenda « Explorateur » (5+ colonies connectées) ;
     5. elle compte pour les autres calculs à base de colonies (spec `colony_vp`) ;
     6. elle n'est PAS améliorable — et une colonie normale, elle, l'est ;
     7. sur une planète LIBRE, la colonie est normale (améliorable, sans accord).

   Usage : node test_extrasolaire.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) {
    p.res = { energy: 30, materials: 30, science: 30, morale: 8 };
    p.acLeft = 6; p.acMax = 6;
  }
  G.turn = 8; G.phase = 'actions';
  return { sb, G };
}
const nation = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const agenda = (sb, id) => vm.runInContext('AGENDAS_POOL.find(a=>a.id===' + JSON.stringify(id) + ')', sb);

console.log('═'.repeat(74));
console.log('COLONIE EXTRA-SOLAIRE PARTAGÉE — COMPTE-T-ELLE VRAIMENT ?');
console.log('═'.repeat(74) + '\n');

/* ── 1-3. La planète est déjà tenue : cohabitation ─────────────────────────── */
console.log('1. Planète déjà tenue par une autre nation');
let refPartage = null;
{
  const { sb, G } = partie();
  const moi = G.player, autre = nation(G, 'martiens');
  autre.colonies.push({ nodeId: 'eris', level: 2, connected: true });

  const vpAvant = sb.calcVP(moi);
  const nbAvant = moi.colonies.length;
  sb._extraSolarColonize(moi, 'eris');
  const col = moi.colonies.find(c => c.nodeId === 'eris');

  if (col) ok('la colonie existe sur Éris malgré l\'occupant');
  else { ko('aucune colonie créée — le reste du test n\'a plus de sens'); }
  if (col && col.level === 1) ok('elle est de niveau 1');
  else if (col) ko('niveau ' + col.level + ' au lieu de 1');
  if (col && col.noUpgrade) ok('elle est marquée NON AMÉLIORABLE');
  else if (col) ko('elle n\'est pas marquée non améliorable');
  if (moi.colonies.length === nbAvant + 1) ok('elle compte dans la liste des colonies');
  else ko('la liste des colonies n\'a pas grandi');
  if (G.commercialAccords.includes('eris')) ok('l\'accord commercial forcé est enregistré');
  else ko('aucun accord commercial enregistré sur Éris');

  // L'occupant garde la sienne, intacte : on ne lui prend rien.
  const sienne = autre.colonies.find(c => c.nodeId === 'eris');
  if (sienne && sienne.level === 2) ok('l\'occupant garde sa colonie, au même niveau (on ne lui prend rien)');
  else ko('la colonie de l\'occupant a été altérée : ' + JSON.stringify(sienne));

  const vpApres = sb.calcVP(moi);
  refPartage = { col, vpAvant, vpApres };
  if (vpApres.colVP > vpAvant.colVP) ok('le score de colonies AUGMENTE : ' + vpAvant.colVP + ' → ' + vpApres.colVP);
  else ko('le score de colonies ne bouge pas (' + vpAvant.colVP + ' → ' + vpApres.colVP + ') — elle serait décorative');
  note('connectée : ' + (refPartage.col && refPartage.col.connected ? 'oui' : 'non — Éris est très loin, c\'est normal sans route'));
}

/* ── 4. Connectée, elle compte pour les agendas ────────────────────────────── */
console.log('\n2. Connectée, elle compte pour les agendas');
{
  const { sb, G } = partie();
  const moi = G.player, autre = nation(G, 'martiens');
  autre.colonies.push({ nodeId: 'eris', level: 2, connected: true });
  const explorateur = agenda(sb, 'ag1');            // 5+ colonies connectées → +8 VP
  if (!explorateur) { ko('agenda « Explorateur » introuvable'); }
  else {
    moi.agenda = explorateur;
    /* On amène la nation à QUATRE colonies connectées : l'agenda ne doit pas encore
       marquer. La cinquième sera l'extra-solaire — si elle compte, le score bascule. */
    const libres = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb)
      .filter(id => id !== 'eris' && !moi.colonies.some(c => c.nodeId === id) && !autre.colonies.some(c => c.nodeId === id));
    for (const c of moi.colonies) c.connected = true;
    while (moi.colonies.filter(c => c.connected).length < 4) moi.colonies.push({ nodeId: libres.shift(), level: 1, connected: true });

    const avant = sb.calcVP(moi).agendasVP;
    if (avant === 0) ok('à 4 colonies connectées, l\'agenda ne marque pas encore (0 VP)');
    else note('l\'agenda marque déjà ' + avant + ' VP à 4 colonies — le test perd sa netteté');

    sb._extraSolarColonize(moi, 'eris');
    /* ⚠️ ON RELIE APRÈS, PAS AVANT. `_extraSolarColonize` termine par `updateConnections(p)`, qui
       RECALCULE la connexion de TOUTES les colonies d'après les routes réelles. Les quatre colonies
       que ce test avait déclarées connectées à la main repassaient donc à « non connectées », et le
       compte tombait à 1 au lieu de 5. Le test criait « la colonie partagée ne compte pas pour les
       agendas » — accusation fausse, née de ma propre mise en scène. */
    const col = moi.colonies.find(c => c.nodeId === 'eris');
    for (const c of moi.colonies) c.connected = true;
    const nbCo = moi.colonies.filter(c => c.connected).length;
    note('colonies connectées après la colonisation : ' + nbCo + ' (dont Éris)');
    const apres = sb.calcVP(moi).agendasVP;
    if (apres === 8) ok('la 5ᵉ colonie étant l\'extra-solaire, l\'agenda marque : ' + avant + ' → ' + apres + ' VP');
    else ko('l\'agenda reste à ' + apres + ' VP — la colonie partagée ne compte PAS pour les agendas');
  }
}

/* ── 5. Elle compte pour les autres calculs à base de colonies ─────────────── */
console.log('\n3. Elle compte pour les autres calculs de VP');
{
  const { sb, G } = partie();
  const moi = G.player, autre = nation(G, 'martiens');
  autre.colonies.push({ nodeId: 'eris', level: 2, connected: true });
  /* `colony_vp` : +1 VP par colonie CONNECTÉE. C'est le calcul le plus direct pour
     savoir si une colonie « compte comme colonie ». */
  const carte = vm.runInContext('CARDS_POOL.find(c=>c.spec===\'colony_vp\'||c.spec2===\'colony_vp\')', sb);
  if (!carte) { note('aucune carte `colony_vp` dans le jeu — vérification sautée'); }
  else {
    moi.cards.push(carte);
    for (const c of moi.colonies) c.connected = true;
    const avant = sb.calcVP(moi).extraVP;
    sb._extraSolarColonize(moi, 'eris');
    for (const c of moi.colonies) c.connected = true;   // même précaution : updateConnections vient de passer
    const apres = sb.calcVP(moi).extraVP;
    if (apres === avant + 1) ok('« ' + carte.name + ' » (+1 VP par colonie connectée) la compte : ' + avant + ' → ' + apres);
    else ko('« ' + carte.name + ' » ne la compte pas : ' + avant + ' → ' + apres);
  }
}

/* ── 6. Non améliorable — et une colonie normale l'est ─────────────────────── */
console.log('\n4. Non améliorable, mais seulement elle');
{
  const { sb, G } = partie();
  const moi = G.player, autre = nation(G, 'martiens');
  autre.colonies.push({ nodeId: 'eris', level: 2, connected: true });
  sb._extraSolarColonize(moi, 'eris');
  const col = moi.colonies.find(c => c.nodeId === 'eris');
  col.connected = true;
  const nivAvant = col.level;
  try { sb.doUpgrade('eris'); } catch (e) { note('(doUpgrade : ' + e.message.split('\n')[0] + ')'); }
  if (col.level === nivAvant) ok('l\'amélioration est refusée — elle reste au niveau ' + col.level);
  else ko('elle est passée au niveau ' + col.level + ' alors qu\'elle est non améliorable');

  /* ⚠️ CONTRE-ÉPREUVE INDISPENSABLE. Si `doUpgrade` échouait pour une raison quelconque
     — ressources, connexion, garde — le test ci-dessus passerait au vert sans rien
     prouver. On vérifie donc qu'une colonie NORMALE, elle, monte bien de niveau. */
  const normale = moi.colonies.find(c => c.nodeId !== 'eris' && c.level < 3);
  if (!normale) { note('aucune colonie normale disponible pour la contre-épreuve'); }
  else {
    normale.connected = true;
    const n0 = normale.level;
    try { sb.doUpgrade(normale.nodeId); } catch (e) {}
    if (normale.level > n0) ok('contre-épreuve : une colonie normale monte bien (' + n0 + ' → ' + normale.level + ')');
    else ko('contre-épreuve ÉCHOUÉE : même une colonie normale ne monte pas — le point ci-dessus ne prouve rien');
  }
}

/* ── 7. Planète libre : colonie normale ────────────────────────────────────── */
console.log('\n5. Sur une planète libre, la colonie est normale');
{
  const { sb, G } = partie();
  const moi = G.player;
  sb._extraSolarColonize(moi, 'triton');
  const col = moi.colonies.find(c => c.nodeId === 'triton');
  if (col && !col.noUpgrade) ok('planète libre : colonie améliorable (pas de bridage inutile)');
  else if (col) ko('planète libre mais colonie bridée');
  else ko('aucune colonie créée sur Triton');
  if (!G.commercialAccords.includes('triton')) ok('et aucun accord commercial forcé');
  else ko('un accord commercial a été imposé alors que la planète était libre');
}

/* ── 6. Cohabitation et guerre ─────────────────────────────────────────────── */
console.log('\n6. Deux nations sur le même nœud, et la guerre arrive');
{
  /* POURQUOI. Marc, 2026-08-14 : « qu'est-ce qui se passe si une nation attaque sa colonie partagée
     extra solaire ? Et si une autre nation l'attaque ou la prend, il se passe quoi ? »
     La mesure (`mesure_cohabitation.js`) avait établi quatre choses, toutes fausses :
       · un cohabitant qui attaquait son nœud ne déclenchait RIEN — clic mort, sans message ;
       · une tierce nation attaquait le PREMIER de la liste interne, pas le vrai maître des lieux ;
       · le vainqueur cohabitant restait bloqué à Nv.1 avec l'interdiction d'améliorer ;
       · le chemin de l'IA créait DEUX colonies sur le même nœud, comptées deux fois.
     RÈGLES DÉCIDÉES PAR MARC : un cohabitant peut chasser l'autre ; face à un tiers, les deux
     défendent ensemble et tombent ensemble. */
  const monter = () => {
    const { sb, G } = partie();
    const moi = G.player, mars = nation(G, 'martiens'), jup = nation(G, 'jupiteriens');
    mars.colonies.push({ nodeId: 'eris', level: 3, connected: true });
    sb._extraSolarColonize(moi, 'eris');
    for (const p of [moi, mars, jup]) p.forceTokens = 8;
    return { sb, G, moi, mars, jup };
  };
  const occupants = (G) => [G.player].concat(G.ais)
    .filter(p => p.colonies.some(c => c.nodeId === 'eris')).map(p => p.civ.id);
  const combien = (p) => p.colonies.filter(c => c.nodeId === 'eris').length;

  // a) Le défenseur désigné est le VRAI maître des lieux, jamais l'attaquant.
  {
    const { sb, G, moi, mars } = monter();
    const d = sb.defenseurPrincipal('eris', moi);
    if (d && d.civ.id === 'martiens') ok('le défenseur désigné est l\'occupant le plus développé (Nv.3), pas le premier de la liste');
    else ko('défenseur désigné : ' + (d && d.civ.id) + ' au lieu de martiens');
    const soi = sb.defenseurPrincipal('eris', mars);
    if (soi && soi.civ.id === 'terriens') ok('et vu depuis l\'autre camp, c\'est le cohabitant — jamais soi-même');
    else ko('vu depuis les Martiens, le défenseur est ' + (soi && soi.civ.id));
  }

  // b) Le vainqueur cohabitant reste SEUL, monte de niveau, et se débloque.
  {
    const { sb, G, moi } = monter();
    const av = moi.colonies.find(c => c.nodeId === 'eris');
    if (!av.noUpgrade) ko('la colonie partagée n\'était pas bridée au départ — cas non éprouvé');
    const niv = sb.capturerNoeud(moi, 'eris');
    const ap = moi.colonies.find(c => c.nodeId === 'eris');
    if (occupants(G).join() === 'terriens') ok('après la capture, un seul occupant reste : ' + occupants(G).join());
    else ko('occupants après capture : ' + occupants(G).join());
    if (combien(moi) === 1) ok('et il n\'a qu\'UNE colonie sur ce nœud (le chemin IA en créait deux)');
    else ko('le vainqueur a ' + combien(moi) + ' colonies sur le même nœud');
    if (ap.level === 2) ok('sa colonie prend le niveau de la conquise moins un : Nv.1 → Nv.' + ap.level + ' (elle était Nv.3)');
    else ko('niveau après capture : ' + ap.level + ' au lieu de 2 (Nv.3 conquise − 1)');
    if (!ap.noUpgrade) ok('l\'interdiction d\'améliorer est levée — il n\'y a plus personne avec qui cohabiter');
    else ko('la colonie reste bridée alors que la cohabitation a cessé');
    if (!G.commercialAccords.includes('eris')) ok('et l\'accord forcé tombe avec elle');
    else ko('l\'accord commercial forcé subsiste sans cohabitation');
    void niv;
  }

  // c) Une tierce nation les expulse TOUS LES DEUX.
  {
    const { sb, G, jup } = monter();
    if (occupants(G).length !== 2) ko('la scène de départ n\'a pas deux occupants');
    sb.capturerNoeud(jup, 'eris');
    if (occupants(G).join() === 'jupiteriens') ok('le tiers vainqueur prend le nœud entier : ' + occupants(G).join());
    else ko('après la capture par un tiers, il reste : ' + occupants(G).join());
    if (combien(jup) === 1) ok('avec une seule colonie, au niveau du plus développé moins un (Nv.' + jup.colonies.find(c => c.nodeId === 'eris').level + ')');
    else ko('le tiers a ' + combien(jup) + ' colonies sur ce nœud');
  }

  // d) L'assaut d'un cohabitant n'est plus un clic mort.
  {
    const { sb, G, moi } = monter();
    const n0 = G.log.length;
    moi.acLeft = 4; moi.res.materials = 20; moi.res.energy = 20;
    try { sb.attackColony('eris'); } catch (e) { note('(attackColony : ' + e.message.split('\n')[0] + ')'); }
    const dit = G.log.slice(0, Math.max(0, G.log.length - n0)).map(e => (e && e.msg) || '').join(' | ');
    if (dit.trim()) ok('l\'assaut sur un nœud partagé produit quelque chose : « ' + dit.replace(/<[^>]+>/g, '').slice(0, 96) + '… »');
    else ko('l\'assaut reste un clic mort : aucune ligne de journal');
    const guerre = (G.wars || []).some(w => (w.a === 'terriens' && w.b === 'martiens') || (w.a === 'martiens' && w.b === 'terriens'));
    if (guerre) ok('et la guerre est bien déclarée contre le cohabitant');
    else note('(pas de guerre déclarée — l\'assaut a pu être refusé pour une autre raison)');
  }

  // e) CONTRE-ÉPREUVE : sur un nœud NORMAL, rien n'a changé.
  {
    const { sb, G } = partie();
    const moi = G.player, mars = nation(G, 'martiens');
    const libre = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb)
      .find(id => ![G.player].concat(G.ais).some(p => p.colonies.some(c => c.nodeId === id)));
    mars.colonies.push({ nodeId: libre, level: 2, connected: true });
    const niv = sb.capturerNoeud(moi, libre);
    const ap = moi.colonies.find(c => c.nodeId === libre);
    if (ap && ap.level === 1 && niv === 1) ok('nœud normal : capture inchangée — Nv.2 conquise → Nv.1 pour le vainqueur');
    else ko('nœud normal : niveau ' + (ap && ap.level) + ' (attendu 1) — la capture ordinaire a bougé');
    if (!mars.colonies.some(c => c.nodeId === libre)) ok('et le perdant n\'a plus rien sur ce nœud');
    else ko('le perdant garde sa colonie sur un nœud normal');
  }
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Extra-solaire : vraie colonie (VP, agendas, calculs par colonie), Nv.1 non améliorable ;\n   la cohabitation se rompt par les armes, et les cohabitants tombent ensemble.');
console.log('═'.repeat(74));
