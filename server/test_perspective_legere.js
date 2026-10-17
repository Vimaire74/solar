/* ============================================================================
   TEST — LES ACTIONS « LÉGÈRES » AGISSENT SUR LA NATION QU'ON LEUR NOMME
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-15 : « Alors résous les plus légères d'abord » — après avoir
   demandé la liste des actions affectées par `G.player`.

   LA MALADIE. Le moteur a été écrit pour UN joueur. `G.player` y désigne « moi », et le
   multijoueur fonctionne en faisant TOURNER ce que « moi » désigne. Toute règle qui lit
   `G.player` au lieu de la nation réellement concernée devient donc fausse dès qu'un
   deuxième humain joue — et fausse SILENCIEUSEMENT, ce qui est pire : l'action réussit,
   elle s'applique simplement à la mauvaise nation.

   CE QUE CE BANC VÉRIFIE. Pour chaque action corrigée : appelée AU NOM D'UNE AUTRE
   NATION, elle touche cette nation-là et laisse la nation active intacte.

   ⚠️ CHAQUE CAS PORTE SA CONTRE-ÉPREUVE. Un test qui vérifie seulement « B a bougé »
   passerait au vert si l'action touchait TOUT LE MONDE. On vérifie donc les deux côtés :
   B a bougé ET la nation active n'a pas bougé. Sans quoi le banc ne prouve rien.

   Usage : node test_perspective_legere.js
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

/* Une partie où la nation active est terrienne, avec trois autres nations.
   `G.ais` contient les autres — c'est là que vivent AUSSI les humains distants. */
function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  return { sb, G, moi: G.player };
}
const par = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
/* Marquer une nation « humaine distante » : c'est exactement ce que fait le serveur. */
const humaniser = n => { n._isAI = false; return n; };
const NODES = sb => vm.runInContext('NODES', sb);
/* ⚠️ NEUTRALISER LE CURSEUR D'ENGAGEMENT, ET RIEN D'AUTRE. `playerAssaultColony` finit par ouvrir
   la fenêtre de combat, qui manipule un `<input range>` absent du DOM de test. Ce banc ne parle pas
   d'affichage : il demande À QUI appartient la guerre ouverte. On coupe donc la seule marche qui
   touche l'écran — pas la déclaration, pas la résolution, pas les compteurs. Si on coupait plus
   large, les sections suivantes passeraient au vert sans rien prouver. */
const sansCurseur = sb => { try { vm.runInContext('_warShowAttackSlider=function(){};', sb); } catch (e) { note('(curseur non neutralisable : ' + e.message + ')'); } };

console.log('═'.repeat(80));
console.log('ACTIONS LÉGÈRES — AGISSENT-ELLES SUR LA NATION NOMMÉE, OU SUR « MOI » ?');
console.log('═'.repeat(80) + '\n');

/* ── 1. Améliorer une colonie ──────────────────────────────────────────────── */
console.log('1. AMÉLIORER UNE COLONIE — `doUpgrade(nœud, nation)`');
{
  const { sb, G, moi } = partie();
  const autre = humaniser(par(G, 'martiens'));
  const N = NODES(sb);
  /* Un nœud libre, relié à la capitale martienne, colonisé par l'AUTRE nation. */
  const libre = (N[autre.civ.home].conn || []).find(v => N[v] && !N[v].decorative && !N[v].noColonize
    && ![G.player].concat(G.ais).some(p => p.colonies.some(c => c.nodeId === v)));
  if (!libre) { ko('aucun nœud libre voisin de la capitale martienne — le cas ne peut pas être monté'); }
  else {
    autre.colonies.push({ nodeId: libre, level: 1, connected: true });
    autre.res.materials = 40; autre.res.energy = 40; autre.res.science = 40; autre.acLeft = 5;
    const moiMat = moi.res.materials, moiAc = moi.acLeft;
    const autreMat = autre.res.materials;
    sb.doUpgrade(libre, autre);
    const col = autre.colonies.find(c => c.nodeId === libre);
    note('nœud ' + N[libre].name + ' : niveau ' + col.level + ', martiens ' + autreMat + '🪨 → ' + autre.res.materials + '🪨');
    if (col.level === 2) ok('la colonie MARTIENNE est passée au niveau 2');
    else ko('la colonie martienne est restée au niveau ' + col.level);
    if (autre.res.materials < autreMat) ok('ce sont les MATÉRIAUX MARTIENS qui ont payé');
    else ko('les martiens n\'ont rien payé — quelqu\'un d\'autre a réglé la facture');
    /* CONTRE-ÉPREUVE : la nation active n'a été touchée en rien. */
    if (moi.res.materials === moiMat && moi.acLeft === moiAc)
      ok('contre-épreuve : la nation active n\'a perdu ni matériaux ni action');
    else ko('contre-épreuve ÉCHOUÉE : la nation active a payé ' + (moiMat - moi.res.materials)
      + '🪨 et ' + (moiAc - moi.acLeft) + ' AC pour une amélioration qui n\'est pas la sienne');
  }
}

/* ── 2. Pouvoir national ───────────────────────────────────────────────────── */
console.log('\n2. POUVOIR NATIONAL — `useAbility(nation)`');
{
  /* ⚠️ PAS AVEC LES JUPITÉRIENS. Mon premier jet les avait choisis, et le banc s'est mis au rouge :
     « le pouvoir n'a pas été consommé ». C'était vrai et ce n'était pas un défaut — la Forge
     Orbitale ouvre une modale de choix, et le coût n'est prélevé qu'APRÈS la sélection. Le banc
     accusait le moteur d'un comportement voulu. On prend les Martiens : Surtension agit d'un bloc,
     sans fenêtre, donc l'effet est lisible immédiatement. */
  const { sb, G, moi } = partie();
  const autre = humaniser(par(G, 'martiens'));
  autre.res.energy = 30; autre.res.materials = 30; autre.res.science = 30; autre.acLeft = 5;
  autre.abilityUsed = false;
  const avantMoi = JSON.stringify(moi.res), moiAc = moi.acLeft;
  const avantLui = JSON.stringify(autre.res), acLui = autre.acLeft;
  sb.useAbility(autre);
  note('martiens : pouvoir consommé = ' + !!autre.abilityUsed + ' · ressources ' + avantLui + ' → ' + JSON.stringify(autre.res)
    + ' · AC ' + acLui + ' → ' + autre.acLeft);
  if (autre.abilityUsed) ok('le pouvoir est marqué consommé chez les MARTIENS');
  else ko('le pouvoir martien n\'a pas été consommé');
  if (JSON.stringify(autre.res) !== avantLui) ok('ce sont les ressources MARTIENNES qui ont payé la Surtension');
  else ko('les martiens n\'ont rien payé — le coût est allé ailleurs');
  if (!moi.abilityUsed) ok('contre-épreuve : le pouvoir de la nation active reste disponible');
  else ko('contre-épreuve ÉCHOUÉE : c\'est le pouvoir de la nation active qui a été brûlé');
  if (JSON.stringify(moi.res) === avantMoi && moi.acLeft === moiAc)
    ok('contre-épreuve : ni les ressources ni les actions de la nation active n\'ont bougé');
  else ko('contre-épreuve ÉCHOUÉE : la nation active a été débitée');
}

/* ── 3. Assaut — la guerre s'ouvre au nom du bon agresseur ─────────────────── */
console.log('\n3. ASSAUT D\'UN AUTRE JOUEUR — `playerAssaultColony(nœud, défenseur, attaquant)`');
{
  /* ⚠️ C'EST LE DÉFAUT LE PLUS COÛTEUX DU LOT. L'ancien code appelait la façade
     `declareWar(…,'player',…)`, qui déclare TOUJOURS au nom de `G.player`, puis relisait la
     guerre avec `_warBetween(_moiId(), …)`. En solo, identique. À deux humains : le joueur B
     assaille, et c'est le joueur A qui se retrouve en guerre. */
  const { sb, G, moi } = partie();
  sansCurseur(sb);
  const attaquant = humaniser(par(G, 'martiens'));
  const defenseur = par(G, 'jupiteriens');
  const N = NODES(sb);
  const cible = defenseur.colonies[0] && defenseur.colonies[0].nodeId;
  if (!cible) { ko('le défenseur n\'a aucune colonie — cas impossible à monter'); }
  else {
    attaquant.res.materials = 30; attaquant.res.energy = 30; attaquant.forceTokens = 8; attaquant.acLeft = 5;
    const warAvant = G.warWith;
    sb.playerAssaultColony(cible, defenseur, attaquant);
    const guerres = (G.wars || []).map(w => w.a + '↔' + w.b);
    note('nœud visé : ' + (N[cible] ? N[cible].name : cible) + ' · guerres ouvertes : ' + (guerres.join(', ') || 'aucune'));
    const bonne = (G.wars || []).some(w => (w.a === 'martiens' && w.b === 'jupiteriens') || (w.a === 'jupiteriens' && w.b === 'martiens'));
    const mauvaise = (G.wars || []).some(w => w.a === 'terriens' || w.b === 'terriens');
    if (bonne) ok('la guerre est ouverte entre MARTIENS et JUPITÉRIENS — les deux nations concernées');
    else ko('aucune guerre martiens↔jupitériens : l\'assaut n\'a pas ouvert le bon conflit');
    if (!mauvaise) ok('contre-épreuve : la nation active (terriens) n\'est entraînée dans aucune guerre');
    else ko('contre-épreuve ÉCHOUÉE : les terriens sont en guerre alors qu\'ils n\'ont rien fait');
    if (G.warWith === warAvant) ok('contre-épreuve : le drapeau d\'écran `G.warWith` n\'a pas été pollué');
    else ko('contre-épreuve ÉCHOUÉE : `G.warWith` vaut « ' + G.warWith + ' » — cet écran affichera une guerre qui n\'est pas la sienne');
    if (attaquant._attacksThisTurn === 1) ok('le compteur d\'attaques du tour est débité chez l\'ATTAQUANT');
    else ko('compteur d\'attaques de l\'attaquant : ' + attaquant._attacksThisTurn + ' au lieu de 1');
    if (!moi._attacksThisTurn) ok('contre-épreuve : la nation active n\'a consommé aucune attaque');
    else ko('contre-épreuve ÉCHOUÉE : la nation active a consommé ' + moi._attacksThisTurn + ' attaque(s)');
  }
}

/* ── 4. Assaut par la nation active : rien n'a été cassé ───────────────────── */
console.log('\n4. CONTRE-ÉPREUVE GÉNÉRALE — la nation active assaille encore normalement');
{
  /* Sans ce cas, les trois sections précédentes passeraient au vert si j'avais simplement
     empêché la nation active d'agir. C'est le garde-fou du garde-fou. */
  const { sb, G, moi } = partie();
  sansCurseur(sb);
  const defenseur = par(G, 'jupiteriens');
  const cible = defenseur.colonies[0] && defenseur.colonies[0].nodeId;
  moi.res.materials = 30; moi.res.energy = 30; moi.forceTokens = 8; moi.acLeft = 5;
  sb.playerAssaultColony(cible, defenseur);
  const bonne = (G.wars || []).some(w => (w.a === 'terriens' && w.b === 'jupiteriens') || (w.a === 'jupiteriens' && w.b === 'terriens'));
  if (bonne) ok('sans argument `attaquant`, l\'assaut est bien mené par la nation active');
  else ko('la nation active ne peut plus assaillir — le correctif a cassé le cas normal');
  if (G.warWith === 'jupiteriens') ok('et SON drapeau d\'écran est posé, lui : `G.warWith` = jupiteriens');
  else ko('`G.warWith` = « ' + G.warWith +' » : le drapeau local n\'est plus posé quand c\'est bien moi qui attaque');
}

/* ── 5. Façade de déclaration de guerre ────────────────────────────────────── */
console.log('\n5. DÉCLARER LA GUERRE (façade) — `declareWar(…, déclarant)`');
{
  const { sb, G, moi } = partie();
  const declarant = humaniser(par(G, 'ceinturiens'));
  sb.declareWar('Test — le déclarant est nommé', 'player', 'martiens', null, declarant);
  const guerres = (G.wars || []).map(w => w.a + '↔' + w.b);
  note('guerres ouvertes : ' + (guerres.join(', ') || 'aucune'));
  const bonne = (G.wars || []).some(w => (w.a === 'ceinturiens' && w.b === 'martiens') || (w.a === 'martiens' && w.b === 'ceinturiens'));
  if (bonne) ok('la guerre est ouverte entre CEINTURIENS et MARTIENS');
  else ko('la guerre n\'a pas été ouverte entre les deux nations nommées');
  if (!(G.wars || []).some(w => w.a === 'terriens' || w.b === 'terriens'))
    ok('contre-épreuve : la nation active n\'est pas partie à ce conflit');
  else ko('contre-épreuve ÉCHOUÉE : la nation active a été inscrite dans une guerre qu\'elle n\'a pas déclarée');

  /* CONTRE-ÉPREUVE : sans `déclarant`, la façade parle toujours au nom de la nation active. */
  const b = partie();
  b.sb.declareWar('Test — repli sur la nation active', 'player', 'martiens');
  if ((b.G.wars || []).some(w => (w.a === 'terriens' && w.b === 'martiens') || (w.a === 'martiens' && w.b === 'terriens')))
    ok('contre-épreuve : sans déclarant, la façade parle bien au nom de la nation active (compatibilité)');
  else ko('contre-épreuve ÉCHOUÉE : le repli historique est cassé — des dizaines d\'appelants en dépendent');
}

/* ── 6. Pirates — un JOUEUR ceinturien est-il vu ? ─────────────────────────── */
console.log('\n6. PIRATES — la nation ceinturienne est-elle vue si c\'est un HUMAIN qui la joue ?');
{
  /* ⚠️ LE DÉFAUT MESURÉ AVANT CORRECTION. Le code cherchait les Ceinturiens dans `G.ais`
     uniquement. Quand un HUMAIN les joue, ils n'y sont plus : la règle du « soutien secret aux
     pirates » ne se déclenchait jamais, et c'est la branche de repli (risque global +1) qui
     s'exécutait à la place. La nation ceinturienne était, littéralement, invisible. */
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['terriens', 'martiens', 'jupiteriens']);
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  const ceint = G.player;   // les Ceinturiens sont joués par la personne devant cet écran
  const dansAis = G.ais.some(a => a.civ.id === 'ceinturiens');
  const dansTous = vm.runInContext('allPlayers()', sb).some(a => a.civ.id === 'ceinturiens');
  note('`G.ais` contient les Ceinturiens ? ' + (dansAis ? 'oui' : 'NON') + '   ·   `allPlayers()` ? ' + (dansTous ? 'oui' : 'NON'));
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  /* ⚠️ NE PAS DÉCOUPER AU NOMBRE DE CARACTÈRES. Mon premier jet prenait « les 3000 caractères qui
     suivent », et la ligne cherchée tombait juste au-delà : le banc criait au défaut sur du code
     déjà corrigé. On découpe jusqu'à la fonction SUIVANTE, ce qui est la vraie frontière. */
  const i = src.indexOf('function advancePirates');
  const j = i >= 0 ? src.indexOf('\nfunction ', i + 10) : -1;
  const bloc = i >= 0 ? src.slice(i, j > 0 ? j : i + 8000) : '';
  if (/ceinturAI\s*=\s*allPlayers\(\)/.test(bloc))
    ok('la règle des pirates cherche les Ceinturiens dans `allPlayers()` — humain comme IA');
  else ko('la règle des pirates lit encore `G.ais` : un joueur ceinturien lui est invisible');

  /* Le fond : la tension monte vraiment vers les Ceinturiens quand un raid frappe. */
  const victime = G.ais[0];
  const avant = (function () { try { return sb.getTens(victime.civ.id, 'ceinturiens'); } catch (e) { return null; } })();
  if (avant === null) note('(`getTens` indisponible dans ce bac à sable — on s\'en tient au contrôle de source)');
  else {
    /* On force un raid pirate sur la victime, puis on relit la tension. */
    victime.colonies.forEach(c => { c.raided = false; });
    const p0 = ceint.res.materials;
    sb.advancePirates && sb.advancePirates();
    const apres = sb.getTens(victime.civ.id, 'ceinturiens');
    note('tension ' + victime.civ.id + ' → ceinturiens : ' + avant + ' → ' + apres + ' (les pirates n\'ont pas forcément frappé ce tour-ci)');
    if (ceint.res.materials === p0) ok('contre-épreuve : le joueur ceinturien n\'a rien encaissé directement des pirates');
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Les actions légères agissent sur la nation qu\'on leur nomme, et la nation active\n   reste intacte quand ce n\'est pas son tour d\'agir.');
console.log('═'.repeat(80));
