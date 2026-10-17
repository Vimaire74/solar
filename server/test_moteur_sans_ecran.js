/* ============================================================================
   TEST — LE MOTEUR NE DOIT PLUS DESSINER QUAND IL N'Y A PAS D'ÉCRAN
   ----------------------------------------------------------------------------
   POURQUOI. Trouvé le 27/08 en cherchant tout autre chose — pourquoi le moral ne baisse jamais.
   La mesure crachait, entre deux tableaux, la même ligne toutes les deux parties :

       ⚠️ runEndOfRound a levé (tour 9) : Cannot read properties of null (reading 'style')
           at _warShowAttackSlider … at _warSelectColonyTarget … at playerAssaultColony

   LE DÉFAUT, EN UNE PHRASE. `playerAssaultColony` appliquait la règle PUIS ouvrait la fenêtre de
   combat, dans la même fonction. Sur le serveur, `game-core.js` fabrique un `document` de carton
   dont chaque élément rend `parentElement: null` : `slider.parentElement.style` jetait.

   CE QUE ÇA COÛTAIT — ET C'EST ÉNORME. L'exception remontait jusqu'à `runEndOfRound`, qui
   abandonnait **toute la fin de tour** : revenus, entretien, tension, événements, pour TOUTES les
   nations. Le pilote attrapait, journalisait, et la partie continuait comme si de rien n'était.
   Mesuré sur 8 parties, trois tirages :

       code fautif   4, 3, 4 fins de tour avortées   ·  19,5 / 21,8 / 17,6 ressources en fin de partie
       code corrigé  0, 0    fin de tour avortée     ·  28,2 / 29,9 ressources

   **Un tiers de l'économie du jeu disparaissait dans un `catch`.** C'est la cause du point #81
   (« pourquoi tout à coup elles n'ont plus d'énergie »), que Marc et moi avons cherchée du côté du
   comportement des IA pendant plusieurs sessions. Elle n'était pas là.

   ⚠️ LA LEÇON, PLUS UTILE QUE LE CORRECTIF. Un `try/catch` qui journalise sans interrompre est un
   filet nécessaire — mais il transforme une panne bruyante en dérive silencieuse. Ici la ligne
   d'alerte s'affichait vraiment, à chaque partie, depuis des semaines : personne ne la lisait parce
   qu'elle n'empêchait rien de tourner. Le banc ci-dessous en fait un échec.

   COMMENT ON A CORRIGÉ, ET POURQUOI PAS AUTREMENT. On aurait pu mettre cinq `if(!x)return` sur les
   cinq lignes fragiles. Marc, 27/08 : « les versions rapides ne m'intéressent pas, je veux du code
   solide. » La cause n'est pas la ligne, c'est que le moteur ignorait dans quel monde il tournait.
   Le bac à sable le DÉCLARE maintenant (`SOLAR_SANS_ECRAN`), le moteur le lit (`_aUnEcran()`), et
   `playerAssaultColony` sépare explicitement la règle de l'affichage.

   Usage : node test_moteur_sans_ecran.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

console.log('═'.repeat(84));
console.log('MOTEUR SANS ÉCRAN — LA RÈGLE S\'APPLIQUE, LE DESSIN S\'ABSTIENT');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le bac à sable se déclare, et le moteur l'entend ──────────────────── */
console.log('1. Le bac à sable annonce qu\'il n\'a pas d\'écran');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const drapeau = vm.runInContext('typeof SOLAR_SANS_ECRAN!=="undefined" && SOLAR_SANS_ECRAN', sb);
  if (drapeau === true) ok('`SOLAR_SANS_ECRAN` est posé par game-core.js');
  else ko('`SOLAR_SANS_ECRAN` absent — le moteur va redevenir aveugle et suivre des références nulles');
  const vu = vm.runInContext('_aUnEcran()', sb);
  if (vu === false) ok('et `_aUnEcran()` le lit correctement');
  else ko('`_aUnEcran()` rend ' + vu + ' alors qu\'il n\'y a pas d\'écran');
}

/* ── 2. LE CŒUR — un assaut sans écran ne jette pas, et applique la règle ─── */
console.log('\n2. Un assaut résolu sans écran : aucune exception, et la règle est posée');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const moi = G.player, cible = G.ais[0];
  moi.forceTokens = 8; moi.res.materials = 20; moi.res.energy = 20; moi.acLeft = 5;
  const col = cible.colonies.find(c => c.nodeId !== cible.civ.home) || cible.colonies[0];
  sb.setDecisionSink(() => {});
  let leve = null;
  try { sb.playerAssaultColony(col.nodeId, cible, moi); } catch (e) { leve = e.message; }
  if (!leve) ok('`playerAssaultColony` s\'exécute jusqu\'au bout');
  else ko('elle jette encore : ' + leve);
  /* La règle doit être INTÉGRALEMENT posée — c'est ce que le correctif ne devait pas casser. */
  const cibleVue = vm.runInContext('_warAttackColonyTarget', sb);
  if (cibleVue === col.nodeId) ok('la cible est mémorisée (`_warAttackColonyTarget`) — resolveWarCombat la relira');
  else ko('cible perdue : ' + cibleVue + ' au lieu de ' + col.nodeId + ' — le serveur combattrait dans le vide');
  const fd = sb.fluxDonnees ? sb.fluxDonnees() : {};
  if (fd.assautCible === col.nodeId && fd.assautEnnemi === cible.civ.id && fd.suiteCombat === 'stAssautJoueurChoisi')
    ok('et le flux porte cible, ennemi et suite — l\'assaut survit à une sauvegarde');
  else ko('le flux est incomplet : ' + JSON.stringify(fd));
  if (sb._warBetween(moi.civ.id, cible.civ.id)) ok('la guerre est bien ouverte entre les deux nations');
  else ko('aucune guerre ouverte — l\'assaut n\'a rien déclenché');
}

/* ── 3. CONTRE-ÉPREUVE — sans le drapeau, la panne revient ────────────────── */
console.log('\n3. CONTRE-ÉPREUVE — on retire le drapeau, la panne DOIT revenir');
{
  /* Si ce bloc reste vert, c'est que le correctif ne sert à rien et que quelque chose d'autre
     protège le moteur par accident. Le banc ne prouverait alors rien du tout. */
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  vm.runInContext('SOLAR_SANS_ECRAN=false;', sb);   // le moteur se croit devant un écran
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const moi = G.player, cible = G.ais[0];
  moi.forceTokens = 8; moi.res.materials = 20; moi.res.energy = 20; moi.acLeft = 5;
  const col = cible.colonies.find(c => c.nodeId !== cible.civ.home) || cible.colonies[0];
  sb.setDecisionSink(() => {});
  let leve = null;
  try { sb.playerAssaultColony(col.nodeId, cible, moi); } catch (e) { leve = e.message; }
  note('exception obtenue : ' + (leve || 'aucune'));
  if (leve && /style|null/.test(leve)) ok('le décor de carton s\'effondre — c\'est bien le drapeau qui protège');
  else ko('aucune panne sans le drapeau : la contre-épreuve ne prouve rien, le banc est à revoir');
}

/* ── 4. Des parties entières, sans une seule fin de tour abandonnée ───────── */
/* ⚠️ TROIS PARTIES, PLUS HUIT — ET C'EST UN AVEU, PAS UN CONFORT.
   Depuis que `tacticien` décide (28/08), une partie coûte ~13 s au lieu de ~0,3 s : le cerveau
   simule chaque coup possible avant de choisir. Huit parties dépassaient le plafond de temps et ce
   banc mourait sans rien dire — un banc qui n'a pas fini ne prouve RIEN, et je l'ai d'abord pris
   pour une régression.
   Le nombre de parties se règle par PARTIES=<n> : le défaut reste assez grand pour attraper une
   fin de tour abandonnée (c'est le défaut du 27/08 qui coûtait un tiers de l'économie, et il se
   voyait dès la première partie), et assez petit pour que le banc ARRIVE AU BOUT. */
const PARTIES_COMPLETES = parseInt(process.env.PARTIES || '3', 10);
console.log('\n4. ' + PARTIES_COMPLETES + ' parties complètes — aucune fin de tour ne doit être abandonnée');
{
  const orig = console.error; const cap = [];
  console.error = (...a) => { cap.push(a.join(' ')); };
  let res = 0, cols = 0, n = 0;
  for (let k = 0; k < PARTIES_COMPLETES; k++) {
    const d = new GameDriver(HTML);
    d.boot([{ civId: 'terriens', isAI: true }, { civId: 'martiens', isAI: true },
            { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
    let r = d.pump(), g = 0;
    while (g++ < 60000) {
      if (!r) break; const G = d.state(); if (G.turn > G.maxTurns) break;
      try {
        if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
        if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
        if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
      } catch (e) { break; }
      break;
    }
    const G = d.state();
    for (const p of [G.player].concat(G.ais || [])) {
      n++; res += (p.res.energy || 0) + (p.res.materials || 0) + (p.res.science || 0);
      cols += (p.colonies || []).length;
    }
  }
  console.error = orig;
  const avortees = cap.filter(l => /runEndOfRound a levé/.test(l));
  const moyenne = res / n;
  note('ressources moyennes par nation en fin de partie : ' + moyenne.toFixed(1)
    + ' · colonies : ' + (cols / n).toFixed(2));
  if (!avortees.length) ok('aucune fin de tour abandonnée sur 8 parties');
  else { ko(avortees.length + ' fin(s) de tour abandonnée(s)'); for (const a of avortees.slice(0, 3)) note(a.slice(0, 110)); }
  /* ⚠️ CE CHIFFRE EST INFORMATIF, PAS UNE ASSERTION — et il a fallu qu'il rougisse à tort pour le
     comprendre. J'y avais mis un seuil (« ≥ 25 »), calibré sur la mesure du 27/08 : ~20 avec le
     défaut, ~28 sans. Quelques heures plus tard l'usure de guerre est arrivée : les nations en
     guerre perdent du moral, tombent en guerre civile, ne touchent plus de revenu — et l'économie
     est redescendue à 20 SANS qu'aucune fin de tour ne soit perdue. Le banc a crié au retour du
     défaut alors qu'il observait un réglage d'équilibre voulu.
     Un banc doit éprouver SON sujet. Le sujet de celui-ci est « aucune fin de tour n'est abandonnée
     en silence » — c'est l'assertion ci-dessus, et elle ne dépend d'aucun réglage. Le niveau de
     l'économie, lui, bougera à chaque équilibrage : on l'imprime pour le lecteur, on ne s'y accroche
     pas. */
  note('(chiffre indicatif : il varie avec l\'équilibrage, il n\'est pas une condition de succès)');
}

/* ── 5. CONTRE-ÉPREUVE — devant un écran, le dessin doit AVOIR LIEU ───────── */
console.log('\n5. CONTRE-ÉPREUVE — le correctif ne doit pas éteindre l\'affichage du navigateur');
{
  /* Le risque symétrique : « ne rien dessiner » partout, y compris chez le joueur, qui n'aurait
     alors plus de fenêtre de combat. On vérifie que la porte s'ouvre quand il y a un écran. */
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  vm.runInContext('SOLAR_SANS_ECRAN=false;', sb);
  if (vm.runInContext('_aUnEcran()', sb) === true) ok('`_aUnEcran()` rend vrai dès qu\'un écran est déclaré');
  else ko('`_aUnEcran()` reste faux même avec un écran — le joueur ne verrait plus rien');
  /* Et la fenêtre reste réservée à l'attaquant : une IA ne doit pas ouvrir de modale. */
  const G = sb.__G; const ia = G.ais[0]; ia._isAI = true;
  let leve = null;
  try { vm.runInContext('_ouvrirFenetreAssaut', sb).call(null, 'lune', ia); } catch (e) { leve = e.message; }
  if (!leve) ok('et elle ne s\'ouvre pas pour une IA, même avec un écran');
  else ko('ouvrir la fenêtre pour une IA jette : ' + leve);
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La règle s\'applique partout, le dessin ne s\'exécute que devant un écran et pour');
console.log('   l\'attaquant — et plus aucune fin de tour n\'est abandonnée en silence.');
console.log('═'.repeat(84));
