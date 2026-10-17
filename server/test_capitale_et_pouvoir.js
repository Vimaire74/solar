/* ============================================================================
   TEST — LA CAPITALE EST UNE CIBLE, ET LE POUVOIR NATIONAL N'OUVRE PAS DE FENÊTRE PARASITE
   ----------------------------------------------------------------------------
   DEUX SUJETS, DEUX DEMANDES DE MARC DU 03/09.

   1. « OUI LES IA PEUVENT ATTAQUER UNE CAPITALE. » La tâche #6 a supprimé la règle qui l'interdisait,
      et le joueur, lui, l'a bien récupérée : la fenêtre de guerre propose la planète mère
      (`homeBtn`), et la guerre populaire ne l'exclut plus de la liste des cibles — le commentaire
      du moteur le dit noir sur blanc : « la capitale ennemie EST une cible valable (10 jetons de
      garnison, plus imprenable) : on ne l'exclut plus de la liste, sinon une nation réduite à sa
      capitale n'était plus attaquable ».
      Les chemins de DÉCISION DE L'IA étaient restés à l'ancienne règle (`c.nodeId!==civ.home`).
      Conséquence mesurée : une nation réduite à sa seule capitale devenait intouchable par les
      ordinateurs — faute de cible, ils concluaient « je ne peux pas gagner » et demandaient la paix.
      C'est ce qui m'a fait rougir un banc pour la mauvaise raison la veille (carnet §67).

      ⚠️ ON NE LA MET PAS À ÉGALITÉ, ON LA MET EN DERNIER. La capitale porte 10 jetons de garnison :
      une IA qui la viserait par défaut se saignerait. On reprend donc l'idiome déjà employé pour le
      joueur : les colonies ordinaires d'abord, la capitale seulement s'il n'y a rien d'autre.

   2. `useAbility` — LA DERNIÈRE FONCTION NON AUDITÉE DU MOTIF §64. C'est le pouvoir national
      gratuit (Diplomatie Verte, Surtension, Commerce avec les pirates, Forge Orbitale). Elle est
      appelée par `appliquerCoup` (`case 'pouvoir'`), donc par le cerveau `tacticien` — et elle
      contient deux appels d'INTERFACE que rien ne réserve au joueur local : `showForgeChoiceModal`
      pour le jupitérien, et `scArmConfirm` en fin de fonction. C'est exactement ce qui avait fait
      s'ouvrir la fenêtre de la Sphère de Dyson chez Marc pour un achat d'IA (§64).

   Usage : node test_capitale_et_pouvoir.js
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
  sb.initGame('terriens', ['jupiteriens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  for (const p of [moi, ia]) { p.acLeft = 6; p.res.energy = 30; p.res.materials = 30; p.res.science = 30; p.res.morale = 8; }
  return { sb, G, moi, ia };
}

console.log('═'.repeat(84));
console.log('LA CAPITALE COMME CIBLE · LE POUVOIR NATIONAL SANS FENÊTRE PARASITE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Une nation réduite à sa capitale doit rester attaquable ────────────── */
console.log('1. Une IA attaque la capitale quand c\'est la seule colonie qui reste');
{
  const m = montage();
  /* L'IA est l'agresseur solide ; la victime n'a plus que sa planète mère. */
  m.ia.forceTokens = 8;
  m.moi.colonies = [{ nodeId: m.moi.civ.home, level: 2, connected: true }];
  m.moi.forceTokens = 1;
  m.G.warWith = m.moi.civ.id;
  m.G.wars = [{ a: m.ia.civ.id, b: m.moi.civ.id, winsBy: {}, turnsLeft: 99, justDeclared: false,
                live: true, agresseurCiv: m.ia.civ.id, aiRecaptureTarget: null }];
  const d = m.sb.iaChoixDeCombat(m.ia);
  note('décision : ' + JSON.stringify(d));
  if (d && d.action === 'attack' && d.node === m.moi.civ.home) ok('elle vise la capitale — plus d\'abri imprenable');
  else ko('elle ne vise pas la capitale (action=' + (d && d.action) + ') : la nation est intouchable');
}

/* ── 2. CONTRE-ÉPREUVE — une colonie ordinaire passe AVANT la capitale ─────── */
console.log('\n2. CONTRE-ÉPREUVE — s\'il existe une colonie ordinaire, elle la préfère');
{
  /* ⚠️ SANS CE POINT, ON « CORRIGERAIT » EN METTANT LA CAPITALE À ÉGALITÉ. Elle porte 10 jetons de
     garnison : une IA qui la choisirait alors qu'une colonie de niveau 1 est à côté se ruinerait
     pour rien. On veut « en dernier », pas « comme les autres ». */
  const m = montage();
  m.ia.forceTokens = 8;
  m.moi.colonies = [{ nodeId: m.moi.civ.home, level: 3, connected: true },
                    { nodeId: 'ceres', level: 1, connected: true }];
  m.moi.forceTokens = 1;
  m.G.warWith = m.moi.civ.id;
  m.G.wars = [{ a: m.ia.civ.id, b: m.moi.civ.id, winsBy: {}, turnsLeft: 99, justDeclared: false,
                live: true, agresseurCiv: m.ia.civ.id, aiRecaptureTarget: null }];
  const d = m.sb.iaChoixDeCombat(m.ia);
  note('décision : ' + JSON.stringify(d));
  if (d && d.action === 'attack' && d.node === 'ceres') ok('elle prend la colonie ordinaire, pas la planète mère');
  else ko('elle vise ' + (d && d.node) + ' alors qu\'une colonie ordinaire était disponible');
}

/* ── 3. Le pouvoir national d'une IA n'ouvre aucune fenêtre chez le joueur ─── */
console.log('\n3. Le pouvoir national joué par une IA n\'ouvre AUCUNE fenêtre');
{
  /* Le jupitérien est le cas critique : sa Forge Orbitale demande de CHOISIR une lune, donc une
     modale. `appliquerCoup` peut appeler `useAbility` pour n'importe quelle nation. */
  const m = montage();
  for (const nom of ['showForgeChoiceModal', 'scArmConfirm', 'showToast'])
    try { vm.runInContext(nom + ' = function(){ globalThis.__f=(globalThis.__f||0)+1; };', m.sb); } catch (e) {}
  try { vm.runInContext('globalThis.__f=0;', m.sb); } catch (e) {}
  /* Une lune joviène de niveau 1 et connectée : la Forge a de quoi travailler. */
  m.ia.colonies = [{ nodeId: m.ia.civ.home, level: 2, connected: true },
                   { nodeId: 'io', level: 1, connected: true }];
  m.ia.abilityUsed = false;
  m.sb.appliquerCoup(m.ia, { type: 'pouvoir' });
  let f = 0; try { f = vm.runInContext('globalThis.__f||0', m.sb); } catch (e) {}
  note(f + ' fenêtre(s) ouverte(s) pour un pouvoir joué par l\'IA');
  if (f === 0) ok('aucune fenêtre parasite — le joueur n\'a rien à cliquer');
  else ko(f + ' fenêtre(s) ouverte(s) chez le joueur pour le pouvoir d\'une autre nation');
}

/* ── 4. CONTRE-ÉPREUVE — le pouvoir de l'IA doit tout de même AGIR ────────── */
console.log('\n4. CONTRE-ÉPREUVE — le pouvoir de l\'IA produit bien son effet');
{
  /* Sans ce point, on « corrigerait » en n'exécutant plus rien pour les IA : zéro fenêtre, zéro
     effet, §3 vert et pouvoir national mort. */
  const m = montage();
  m.ia.colonies = [{ nodeId: m.ia.civ.home, level: 2, connected: true },
                   { nodeId: 'io', level: 1, connected: true }];
  m.ia.abilityUsed = false;
  m.sb.appliquerCoup(m.ia, { type: 'pouvoir' });
  const io = m.ia.colonies.find(c => c.nodeId === 'io');
  note('capacité marquée utilisée : ' + !!m.ia.abilityUsed + ' · Io niveau ' + (io && io.level));
  if (m.ia.abilityUsed) ok('le pouvoir a bien été consommé');
  else ko('le pouvoir n\'a rien fait du tout');
}

/* ── 5. CONTRE-ÉPREUVE — le joueur, lui, garde sa fenêtre de choix ────────── */
console.log('\n5. CONTRE-ÉPREUVE — quand TU joues ton pouvoir, la fenêtre s\'ouvre');
{
  const m = montage();
  for (const nom of ['showForgeChoiceModal', 'scArmConfirm', 'showToast'])
    try { vm.runInContext(nom + ' = function(){ globalThis.__g=(globalThis.__g||0)+1; };', m.sb); } catch (e) {}
  try { vm.runInContext('globalThis.__g=0;', m.sb); } catch (e) {}
  /* On fait du joueur local un jupitérien pour tester le cas « modale de choix ». */
  const j = m.sb.__G.ais[0];
  m.sb.__G.player = j; m.sb.__G.ais = [m.moi];
  j._isAI = false; j.abilityUsed = false;
  j.colonies = [{ nodeId: j.civ.home, level: 2, connected: true }, { nodeId: 'io', level: 1, connected: true }];
  m.sb.useAbility(j);
  let g = 0; try { g = vm.runInContext('globalThis.__g||0', m.sb); } catch (e) {}
  note(g + ' fenêtre(s) ouverte(s) pour le pouvoir du joueur local');
  if (g > 0) ok('le joueur choisit toujours sa lune — rien n\'a été coupé pour lui');
  else ko('le joueur n\'a plus de fenêtre : le garde-fou est trop large');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une capitale est attaquable mais choisie en dernier ; le pouvoir national d\'une IA');
console.log('   agit sans rien ouvrir chez le joueur, qui garde ses propres fenêtres.');
console.log('═'.repeat(84));
