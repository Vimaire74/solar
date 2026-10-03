/* ============================================================================
   TEST — PLUSIEURS GUERRES POPULAIRES LE MÊME TOUR : AUCUNE N'EST OUBLIÉE
   ----------------------------------------------------------------------------
   Partie FE37 (Marc, 15/09) : les Ceinturiens à 10 envers Jupitériens depuis le tour 4 n'ont jamais
   déclaré la guerre — `updateTension` faisait `return` à la PREMIÈRE guerre populaire du tour
   (Martiens au T5, Terriens au T6). Les autres couples à 10 étaient oubliés ce tour-là.
   Usage : node test_guerres_populaires_file.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
let note = s => console.log('     ' + s);
const guerre = (sb, a, b) => !!sb._warBetween(a, b);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 5; G.phase = 'actions';
  const jup = G.player, ter = G.ais[0], mar = G.ais[1], cei = G.ais[2];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup, ter, mar, cei]) { n.res.morale = 8; n.forceTokens = 6; n.res.materials = 8; n.res.energy = 8; }
  const questions = [];
  sb.setDecisionSink(p => questions.push(p));   // mode serveur : la fenêtre du joueur devient une question
  return { sb, G, jup, ter, mar, cei, questions };
}
/* Une tension à 10 qui TIENT : le calcul du tour ajoute +1 (une route adverse touche une colonie) puis
   plafonne — sans ce grief, la tension retomberait à 9 avant l'examen. */
function tensionDix(sb, de, vers, routeDeVersTouchant) {
  sb.setTens(de.civ.id === sb.__G.player.civ.id ? 'player' : de.civ.id, vers.civ.id === sb.__G.player.civ.id ? 'player' : vers.civ.id, 10);
  vers.routes.push({ from: routeDeVersTouchant, to: de.civ.home, tokens: 0 });   // route de « vers » touchant la capitale de « de »
  /* Ultimatum d'un tour (02/10) : à 10 la guerre attend le tour suivant. Ici on teste la FILE des
     guerres, pas le délai : l'ultimatum est posé « au tour d'avant », donc échu à ce jugement. */
  const G = sb.__G; if (!G.ultimatums) G.ultimatums = {};
  G.ultimatums[de.civ.id + '|' + vers.civ.id] = (G.turn || 0) - 1;
}

/* ⚠️ ADAPTÉ LE 17/09 — LA FENÊTRE DU JOUEUR N'EST PLUS OUVERTE PENDANT `updateTension` (partie 66C3).
   Ce banc vérifiait qu'aucune guerre populaire n'était OUBLIÉE — c'était le défaut FE37, et cette
   exigence ne bouge pas. Ce qui change, c'est OÙ la fenêtre du joueur s'ouvre : plus au jugement de
   la tension, avant la file des guerres, mais À SA PLACE dans la file (`guerreEtapeFraiche`), sur
   l'état du moment. Marc, 17/09 : « il faut que chaque guerre se résolve dans l'ordre et en entier. »
   Conséquence directe : les trois guerres sont DÉCLARÉES au jugement, toutes, sans qu'aucune fenêtre
   ne bloque l'examen des suivantes — la file `guerresPopEnAttente` n'a plus rien à retenir pour le
   joueur. Le §3 d'origine (« un couple dont la pression est retombée avant son tour n'est pas servi »)
   n'a plus d'objet : la guerre est déclarée au moment où la tension vaut 10, et c'est dans SA fenêtre,
   dans la file, que le joueur peut encore exiger la paix. Banc jumeau : test_ordre_des_guerres.js */
/* On lance la file et on répond aux fenêtres des ORDINATEURS comme le pilote (driver.js,
   `_reponseIA`) — sans quoi la file s'arrête sur leur première question. On rend les fenêtres qui
   atteignent le JOUEUR, dans l'ordre. */
const fenetresDuJoueurDansLaFile = (sb, questions, dejaLancee) => {
  /* ⚠️ `moi` AVANT de lancer la file : `_focusWar` déplace G.player sur un belligérant. */
  const moi = 'jupiteriens';
  if (!dejaLancee) vm.runInContext('stGuerres()', sb);
  const pilote = (p) => {
    const nat = sb.allPlayers().find(n => n.civ.id === p.nation);
    if (p.kind === 'peace_offer') return { accept: false };
    if (p.kind === 'war_initiative') return { id: 'attaque' };
    if (p.kind === 'war_combat') return sb.iaChoixDeCombat(nat);
    if (p.kind === 'defense') return { defTokens: 0 };
    if (p.kind === 'forced_war') return p.payload.colTarget ? { colony: p.payload.colTarget } : { peace: true };
    return {};
  };
  let garde = 0;
  while (garde++ < 40) {
    const mienne = questions.find(p => !p._vue && p.nation === moi && !p.notice);
    if (mienne) break;
    const autre = questions.find(p => !p._vue && (p.nation !== moi || p.notice));
    if (!autre) break;
    autre._vue = true; try { sb.resolveDecision(autre.id, pilote(autre)); } catch (e) { note('pilote : ' + autre.kind + '@' + autre.nation + ' → ' + String(e.stack).split('\n').slice(0, 3).join(' ⏎ ')); break; }
  }
  return questions.filter(p => !p._vue && p.nation === moi && !p.notice);
};

console.log('§1 Le même tour : Terriens→Martiens à 10 (IA↔IA), joueur→Martiens à 10, Ceinturiens→joueur à 10 — les trois sont servies');
{
  const { sb, G, jup, ter, mar, cei, questions } = montage();
  tensionDix(sb, ter, mar, 'phobos');
  tensionDix(sb, jup, mar, 'phobos');
  tensionDix(sb, cei, jup, 'io');
  sb.updateTension();
  if (guerre(sb, 'terriens', 'martiens')) ok('guerre populaire Terriens ↔ Martiens déclarée (IA↔IA, sans écran)'); else ko('Terriens ↔ Martiens absente');
  const wj = sb._warBetween('jupiteriens', 'martiens');
  if (wj && wj.populaireJoueur) ok('la guerre du joueur contre Martiens est déclarée et marquée « choix à venir » — sans fenêtre à cet instant');
  else ko('guerre du joueur absente ou non marquée : ' + JSON.stringify(wj && { a: wj.a, b: wj.b, pj: wj.populaireJoueur }));
  if (guerre(sb, 'ceinturiens', 'jupiteriens')) ok('guerre populaire Ceinturiens → Jupitériens déclarée dans le MÊME jugement — plus rien ne bloque l\'examen (c\'était FE37)');
  else ko('Ceinturiens → Jupitériens absente — c\'est exactement FE37');
  if (!questions.some(p => p.kind === 'forced_war')) ok('aucune fenêtre ouverte pendant le jugement'); else ko('une fenêtre forced_war s\'est ouverte pendant updateTension');
  const q = fenetresDuJoueurDansLaFile(sb, questions).filter(p => p.kind === 'forced_war');
  if (q.length === 1 && q[0].nation === 'jupiteriens' && q[0].payload.enemy === 'martiens') ok('dans la file, la fenêtre « guerre forcée » s\'ouvre chez le joueur, contre Martiens');
  else ko('fenêtre dans la file : ' + JSON.stringify(questions.filter(p => !p._vue).map(p => p.kind + '@' + p.nation + '/' + (p.payload && p.payload.enemy))));
  void G; void cei;
}

console.log('§2 Deux guerres impliquant le joueur le même tour : deux places dans la file, chaque fenêtre vise SA nation');
{
  /* Joueur → Terriens (sa guerre populaire) et Ceinturiens → joueur (IA offensée). Deux entrées de
     file, deux fenêtres pour le joueur, l'une après l'autre, chacune contre la bonne nation.
     (Deux guerres populaires DU JOUEUR le même tour sont impossibles par construction : dès la
     première déclarée, `tensEff` retire 6 à ses autres tensions — « son peuple a d'autres soucis ».) */
  const { sb, G, jup, ter, cei, questions } = montage();
  tensionDix(sb, jup, ter, 'lune');      // joueur → Terriens
  tensionDix(sb, cei, jup, 'io');        // Ceinturiens → joueur
  sb.updateTension();
  if (guerre(sb, 'jupiteriens', 'terriens') && guerre(sb, 'ceinturiens', 'jupiteriens')) ok('les deux guerres sont déclarées au jugement');
  else ko('guerres : Terriens ' + guerre(sb, 'jupiteriens', 'terriens') + ' · Ceinturiens ' + guerre(sb, 'ceinturiens', 'jupiteriens'));
  if (!sb.fluxDonnees().guerresPopEnAttente) ok('rien en file d\'attente : ce sont des entrées de la file des guerres, pas des fenêtres retenues');
  else ko('file d\'attente non vide : ' + JSON.stringify(sb.fluxDonnees().guerresPopEnAttente));
  const q1 = fenetresDuJoueurDansLaFile(sb, questions);
  if (q1.length === 1 && q1[0].kind === 'forced_war' && q1[0].payload.enemy === 'terriens') ok('première fenêtre : « guerre forcée » contre Terriens, G.warWith = ' + G.warWith);
  else ko('première fenêtre : ' + JSON.stringify(q1.map(p => p.kind + '/' + (p.payload && (p.payload.enemy || p.payload.attacker)))));
  if (q1.length && G.warWith === 'terriens') ok('la fenêtre vise la nation de la guerre courante'); else ko('G.warWith = ' + G.warWith);
  if (q1.length) { q1[0]._vue = true; sb.resolveDecision(q1[0].id, {}); }     // le joueur ferme sans cible → la file avance
  const q2 = fenetresDuJoueurDansLaFile(sb, questions, true);
  if (q2.length === 1 && q2[0].kind === 'peace_offer' && q2[0].payload.attacker === 'ceinturiens') ok('seconde fenêtre, APRÈS la première : « paix ou guerre ? » face aux Ceinturiens, l\'agresseur');
  else ko('seconde fenêtre : ' + JSON.stringify(q2.map(p => p.kind + '/' + (p.payload && (p.payload.enemy || p.payload.attacker)))));
  if (!sb.fluxDonnees().guerrePopFenetre) ok('aucun drapeau « fenêtre ouverte » collé'); else ko('drapeau guerrePopFenetre collé');
  void cei;
}

console.log('§3 Une guerre déclarée au jugement est servie dans la file même si la tension a bougé entre-temps — c\'est dans SA fenêtre qu\'on fait la paix');
{
  const { sb, G, jup, ter, questions } = montage();
  tensionDix(sb, jup, ter, 'lune');
  sb.updateTension();
  sb.setTens('player', 'terriens', 3);                    // apaisés entre le jugement et la file
  const q = fenetresDuJoueurDansLaFile(sb, questions).filter(p => p.kind === 'forced_war');
  if (q.length === 1) ok('la fenêtre s\'ouvre quand même : la guerre existe, la pression retombée ne l\'annule pas'); else ko('fenêtre absente : ' + q.length);
  if (q.length) { sb.resolveDecision(q[0].id, { peace: true }); }
  note = (typeof note === 'function') ? note : (s => console.log('     ' + s));
  if (!guerre(sb, 'jupiteriens', 'terriens')) ok('« Exiger la paix » dans cette fenêtre met fin à la guerre'); else ko('la guerre survit à la paix exigée');
  void G;
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_guerres_populaires_file : aucune guerre populaire n\'est oubliée, et chacune est jouée à sa place.');
