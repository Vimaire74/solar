/* ============================================================================
   TEST — UNE NATION ÉTEINTE NE DOIT BLOQUER NI LA FILE DES GUERRES, NI LE TOUR
   ----------------------------------------------------------------------------
   POURQUOI. Partie 8280 (Marc, 10/09), tour 10. Les Ceinturiens perdent leurs deux
   dernières colonies dans le même tour : Pluton prise par les Jupitériens, Éris —
   leur capitale — prise par Marc. Ils sont donc à 0 colonie ET en guerre avec DEUX
   nations. La partie s'est arrêtée là, sans fenêtre ouverte chez personne, et le
   diagnostic du serveur a écrit « la machine se croit saine ».

   DEUX DÉFAUTS DISTINCTS, ET IL FAUT LES DEUX BANCS.

   1. LA FILE DES GUERRES. Dans `guerreEtape`, la branche « nation sans colonie »
      montre un message UNE SEULE FOIS par nation (drapeau `_sansColonieDit`, posé
      le 27/08 parce que le message se répétait à chaque fin de tour). Mais la suite
      de la file, elle, était rangée par `_warSuite('guerreSuivante')` — et
      `_warSuiteJouer` n'est appelé QUE par la fermeture d'une fenêtre. Pas de
      fenêtre au deuxième passage, donc personne pour la fermer, donc la suite
      n'est jamais jouée. Une nation éteinte en guerre avec deux camps bloque la
      table à coup sûr — pas par intermittence.

   2. L'ÉLIMINATION EN COURS DE TOUR (hypothèse de Marc, 10/09 : « le jeu attend
      son action qui n'arrive jamais »). `appliquerEliminations` ne tourne qu'au
      DÉBUT d'une manche. Une nation vidée EN COURS de tour gardait donc ses AC et
      son `_passedRound=false` : le tour de table revenait vers elle. Pour un
      ordinateur c'est sans effet — `doAITurn` se sabordait tout seul. Pour un
      HUMAIN, le serveur lui envoyait `your_action` et l'attendait sans limite
      (règle d'or : aucun délai ne fait avancer une partie). Ce n'est PAS ce qui a
      bloqué la 8280 — les Ceinturiens y étaient tenus par l'ordinateur — mais
      c'est le même blocage, à un siège près.

   CONTRE-ÉPREUVES (sans elles, un vert ne prouve rien) :
     · une SEULE guerre contre la nation éteinte passait déjà avant le correctif :
       si ce point-là rougit, c'est le montage qui est faux, pas le jeu ;
     · le message « plus aucune colonie » doit rester écrit UNE fois (on ne veut pas
       « corriger » en réintroduisant le défaut du 27/08) ;
     · une nation qui perd une colonie mais en garde une autre garde ses AC.

   Usage : node test_nation_eteinte.js
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
const par = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);

/* Le pilote du serveur, réduit à ce dont ce banc a besoin : il répond à tout ce que
   le moteur pose, comme `driver.pump()` le fait pour les notices et les ordinateurs.
   S'il tourne dans le vide, c'est que la chaîne est morte : on rend `false`. */
function pomper(sb, max) {
  const G = sb.__G;
  for (let i = 0; i < (max || 300); i++) {
    const liste = (typeof sb.fluxQuestionsEnAttente === 'function')
      ? sb.fluxQuestionsEnAttente() : (G._pending ? [G._pending] : []);
    if (!liste.length) return true;
    sb.resolveDecision(liste[0].id, {});
  }
  return false;
}

/* Montage commun : tour 10, Ceinturiens à 0 colonie, en guerre avec `contre`.
   `apresGuerres` pointe sur un état témoin : c'est LUI qui prouve que la file est
   allée jusqu'au bout, sans dépendre de tout ce que fait une vraie fin de tour. */
function montage(contre) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 10; G.phase = 'actions';
  G.player._isAI = false;
  const eteinte = par(G, 'ceinturiens');
  eteinte.colonies = [];
  const vus = [];
  sb.setDecisionSink(p => vus.push(p));
  for (const id of contre) {
    const n = par(G, id);
    sb.declarerGuerre(n, eteinte, 'banc', n === G.player ? 'player' : 'ai');
  }
  sb.fluxDeclarer('stBancFini', function () { sb.__G._bancFini = true; });
  return { sb, G, eteinte, vus };
}

function jouerLesGuerres(m) {
  m.sb.guerresPreparer('stBancFini');
  let creve = null;
  try { m.sb.guerreEtape(); } catch (e) { creve = e; }
  const vide = pomper(m.sb);
  return { creve, vide, fini: !!m.sb.__G._bancFini };
}

console.log('═'.repeat(80));
console.log('NATION ÉTEINTE — LA FILE DES GUERRES ET LE TOUR DOIVENT CONTINUER');
console.log('═'.repeat(80) + '\n');

/* ── 1. CONTRE-ÉPREUVE : une seule guerre. Doit passer, correctif ou pas. ──── */
console.log('1. CONTRE-ÉPREUVE — nation éteinte, UNE seule guerre contre elle');
{
  const m = montage(['terriens']);
  note('guerres au départ : ' + (m.G.wars || []).map(w => w.a + '↔' + w.b).join(', '));
  const r = jouerLesGuerres(m);
  if (r.creve) ko('exception : ' + r.creve.message);
  if (r.fini) ok('la file va jusqu\'au bout (état témoin atteint)');
  else ko('la file ne va pas au bout AVEC UNE SEULE GUERRE — le montage du banc est faux, pas le jeu');
}

/* ── 2. LE DÉFAUT DE LA 8280 : deux guerres contre la nation éteinte ───────── */
console.log('\n2. LE CAS 8280 — nation éteinte, DEUX guerres contre elle');
{
  const m = montage(['terriens', 'jupiteriens']);
  note('guerres au départ : ' + (m.G.wars || []).map(w => w.a + '↔' + w.b).join(', '));
  const r = jouerLesGuerres(m);
  const d = m.sb.fluxDonnees ? m.sb.fluxDonnees() : {};
  note('index de file à l\'arrêt : ' + (d.guerreIdx === undefined ? '?' : d.guerreIdx)
    + ' / ' + ((d.guerres || []).length) + ' · suite en attente : ' + (d.suiteGuerre || 'aucune'));
  if (r.creve) ko('exception : ' + r.creve.message);
  if (r.fini) ok('la file va jusqu\'au bout : la deuxième guerre ne fige plus la partie');
  else ko('LA FILE S\'ARRÊTE À LA DEUXIÈME GUERRE — aucune fenêtre ouverte, plus rien ne relance : c\'est le blocage de la 8280');
  if (!m.G.wars.length) ok('les deux guerres sont bien terminées');
  else ko('il reste ' + m.G.wars.length + ' guerre(s) ouverte(s) contre une nation sans colonie');
}

/* ── 3. Le message reste écrit UNE fois (défaut du 27/08, à ne pas rouvrir) ── */
console.log('\n3. CONTRE-ÉPREUVE — le message « plus aucune colonie » n\'est pas répété');
{
  const m = montage(['terriens', 'jupiteriens']);
  jouerLesGuerres(m);
  const lignes = (m.G.log || []).map(l => String(l.msg || '').replace(/<[^>]+>/g, ''))
    .filter(t => /plus aucune colonie/.test(t));
  note('lignes « plus aucune colonie » : ' + lignes.length);
  if (lignes.length === 1) ok('écrit une seule fois');
  else ko('écrit ' + lignes.length + ' fois — le défaut du 27/08 revient');
}

/* ── 4. Élimination EN COURS de tour : la nation rend la main tout de suite ── */
console.log('\n4. L\'HYPOTHÈSE DE MARC — éliminée en cours de tour, elle ne garde pas la main');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  const vainqueur = G.player, victime = par(G, 'martiens');
  victime._isAI = false;                       // un HUMAIN distant : c'est lui qu'on attendrait sans fin
  const noeud = victime.civ.home;
  victime.colonies = [{ nodeId: noeud, level: 1, connected: true }];
  victime.acLeft = 2; victime._passedRound = false;
  sb.capturerNoeud(vainqueur, noeud);
  note('colonies restantes : ' + victime.colonies.length + ' · AC : ' + victime.acLeft
    + ' · a passé : ' + !!victime._passedRound);
  if (!victime.colonies.length) ok('la victime n\'a plus de colonie');
  else ko('la capture n\'a pas eu lieu — montage faux');
  if (victime.acLeft === 0 && victime._passedRound === true)
    ok('elle a rendu la main dans la seconde : le tour de table ne l\'attendra pas');
  else ko('elle garde ' + victime.acLeft + ' AC et n\'a pas passé — le serveur lui enverra `your_action` et attendra sans fin');
}

/* ── 5. CONTRE-ÉPREUVE : il lui reste une colonie → elle joue normalement ──── */
console.log('\n5. CONTRE-ÉPREUVE — perdre UNE colonie sur deux ne met personne dehors');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  const vainqueur = G.player, victime = par(G, 'martiens');
  victime._isAI = false;
  const noeud = victime.civ.home;
  const noeuds = vm.runInContext('Object.keys(NODES)', sb);
  const autre = noeuds.find(n => n !== noeud && !vainqueur.colonies.some(c => c.nodeId === n));
  victime.colonies = [{ nodeId: noeud, level: 1, connected: true }, { nodeId: autre, level: 1, connected: true }];
  victime.acLeft = 2; victime._passedRound = false;
  sb.capturerNoeud(vainqueur, noeud);
  note('colonies restantes : ' + victime.colonies.length + ' · AC : ' + victime.acLeft);
  if (victime.colonies.length === 1 && victime.acLeft === 2 && !victime._passedRound)
    ok('elle garde ses AC et son tour');
  else ko('une nation qui a encore une colonie a été mise dehors');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ TOUT EST VERT');
