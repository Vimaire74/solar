/* ============================================================================
   TEST — LA PHASE DE GUERRES REND LA PERSPECTIVE QU'ELLE A EMPRUNTÉE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie C04C. Au tour 6, une guerre éclate entre Jupitériens et Martiens — deux
   IA, Marc n'y est pour rien. À partir de cet instant, TOUT le bloc de fin de tour est signé
   `jupiteriens` dans le journal, y compris ce qui appartient à Marc :

       T6  jupiteriens │ 💰 Revenus nets (après entretien) : +7⚡ +5🪨 +6🔬 …
       T6  jupiteriens │ 💼 🌍 Terriens — investissement choisi.
       T7  jupiteriens │ 🎯 🌍 Terriens — Stratégie : Effort de Guerre …

   La perspective survit même au changement de tour. Et ce n'est pas qu'une signature de ligne : au
   tour 10, la demande de paix sort avec le MAUVAIS NOM DANS LA PHRASE —
   « ☠️ Ceinturiens cherche la paix avec 🌍 Terriens » alors que la guerre est Martiens ↔ Ceinturiens.
   Le texte va chercher `G.player` là où il devrait lire le belligérant.

   LA CAUSE. `guerreEtape` appelle `_focusWar(war)` pour traiter chaque guerre du point de vue d'un
   de ses belligérants — c'est légitime et nécessaire (sans quoi, à quatre joueurs, les fenêtres de
   guerre s'ouvriraient chez la mauvaise personne, cf. §62 du carnet de bord). Mais `_focusWar`
   appelle `_activateNation(cible)` et **rien ne restaure jamais l'ancienne perspective**. On
   emprunte, on ne rend pas.

   CE QU'ON VÉRIFIE. L'invariant est simple et se mesure sans interpréter : la nation active à la
   SORTIE de la file de guerres doit être celle qui y est entrée. Le §2 est là pour interdire la
   fausse correction — « supprimer `_focusWar` » rendrait le §1 vert et recasserait les guerres à
   quatre joueurs.

   Usage : node test_perspective_guerre.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Une partie serveur à quatre : un humain + trois IA, comme la partie C04C. Le mode serveur est
   indispensable — `_focusWar` ne fait rien en solo (`_decisionActive()` y est faux). */
function partie() {
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: true },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  const G = d.sb.__G;
  G.turn = 5; G.phase = 'actions';
  return { d, G };
}
const nation = (G, id) => [G.player].concat(G.ais || []).find(p => p && p.civ && p.civ.id === id);
const actif = G => (G.player && G.player.civ && G.player.civ.id) || '?';

/* Déclare une guerre ENTRE DEUX IA, sans y mêler l'humain — c'est la situation exacte du T6. */
function guerreEntreIA(m, idA, idB) {
  const G = m.G;
  G.wars = G.wars || [];
  G.wars.push({ a: idA, b: idB, winsBy: { [idA]: 0, [idB]: 0 }, turnsLeft: 99,
                justDeclared: false, reason: 'test', declaredBy: 'other',
                agresseurCiv: idA, live: true, aiRecaptureTarget: null });
}
/* Déroule la file de guerres jusqu'au bout, en répondant à tout ce qui se présente. */
function deroulerGuerres(m) {
  try { m.d.sb.guerresPreparer('stFinDeTour'); } catch (e) { return 'guerresPreparer indisponible : ' + e.message; }
  try { m.d.sb.guerreEtape(); } catch (e) { /* la suite peut passer par une décision */ }
  let r = null, garde = 0;
  try { r = m.d.pump(); } catch (e) {}
  while (r && garde++ < 400) {
    try {
      if (r.kind === 'decision') { r = m.d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'confirm') { r = m.d.commit(r.civId); continue; }
      if (r.kind === 'action') break;   // on est ressorti dans le jeu normal : la phase est finie
    } catch (e) { break; }
    break;
  }
  return null;
}

console.log('═'.repeat(84));
console.log('PERSPECTIVE — LA FILE DE GUERRES REND CE QU\'ELLE EMPRUNTE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Une guerre entre deux IA ne doit pas déplacer le joueur actif ──────── */
console.log('1. Après une guerre entre deux IA, le joueur actif est celui d\'avant');
{
  const m = partie();
  const avant = actif(m.G);
  note('joueur actif avant la phase : ' + avant);
  guerreEntreIA(m, 'jupiteriens', 'martiens');
  const err = deroulerGuerres(m);
  if (err) { ko(err); }
  else {
    const apres = actif(m.G);
    note('joueur actif après la phase : ' + apres);
    if (apres === avant) ok('la perspective est rendue — le journal restera au bon nom');
    else ko('le joueur actif est devenu ' + apres + ' : tout ce qui suit sera écrit à son nom');
  }
}

/* ── 2. CONTRE-ÉPREUVE — la phase a bien EU LIEU ──────────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — la guerre a bien été traitée, pas sautée');
{
  /* ⚠️ SANS CE POINT, ON « CORRIGERAIT » EN NE TRAITANT PLUS LES GUERRES DES AUTRES : la perspective
     ne bougerait plus, le §1 passerait au vert, et les guerres entre IA cesseraient d'exister.
     On exige donc qu'il se soit passé quelque chose. */
  const m = partie();
  guerreEntreIA(m, 'jupiteriens', 'martiens');
  const avantLog = (m.G.log || []).length;
  deroulerGuerres(m);
  const ecrit = (m.G.log || []).length - avantLog;
  note(ecrit + ' ligne(s) de journal écrites pendant la phase');
  if (ecrit > 0) ok('la phase de guerres a bien tourné');
  else ko('rien ne s\'est passé : le banc ne prouverait rien');
}

/* ── 3. Le cas nominal — une guerre QUI ME CONCERNE me laisse actif ────────── */
console.log('\n3. Une guerre qui implique le joueur le laisse actif, lui');
{
  /* `_focusWar` choisit l'humain quand il y en a un : ici il ne devrait rien déplacer du tout. */
  const m = partie();
  const avant = actif(m.G);
  guerreEntreIA(m, 'terriens', 'martiens');
  deroulerGuerres(m);
  const apres = actif(m.G);
  note(avant + ' → ' + apres);
  if (apres === avant) ok('le joueur reste chez lui quand la guerre est la sienne');
  else ko('le joueur actif a glissé vers ' + apres + ' pour sa PROPRE guerre');
}

/* ── 4. Deux guerres d'affilée entre IA — la perspective revient quand même ── */
console.log('\n4. Deux guerres entre IA à la suite');
{
  /* La file traite les guerres une par une, et `_focusWar` est rappelée à chaque tour de file :
     une restauration posée au mauvais endroit marcherait pour une guerre et pas pour deux. */
  const m = partie();
  const avant = actif(m.G);
  guerreEntreIA(m, 'jupiteriens', 'martiens');
  guerreEntreIA(m, 'ceinturiens', 'martiens');
  deroulerGuerres(m);
  const apres = actif(m.G);
  note(avant + ' → ' + apres + ' (deux guerres en file)');
  if (apres === avant) ok('la perspective revient même après plusieurs guerres');
  else ko('perdue sur la file : joueur actif ' + apres);
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ La file de guerres emprunte la perspective d\'un belligérant et la rend :');
console.log('   le journal, les fenêtres et les phrases gardent le bon nom.');
console.log('═'.repeat(84));
