/* ============================================================================
   RESYNCHRONISEUR DU TUTORIEL — server/tutorial-sync.js
   ----------------------------------------------------------------------------
   POURQUOI (demande de Marc, 2026-08-03) : le jeu évolue, `tutorial.js` non.
   Le scénario du coach pointe vers des ÉLÉMENTS du jeu (fenêtres, cartes,
   fonctions) et suppose un ORDRE d'enchaînement. Quand `index.html` change, le
   tutoriel se désynchronise en silence : une bulle met en évidence une fenêtre
   qui n'existe plus, propose d'acheter une carte renommée, ou explique les
   étapes dans un ordre que le jeu ne suit plus.

   CE QUE FAIT CE PROGRAMME — il ne réécrit PAS le scénario (le texte pédagogique
   est un travail humain). Il DIAGNOSTIQUE la dérive et régénère ce qui est
   mécanique :

     1. IDENTIFIANTS DOM   — chaque `glow` / `awaitClick` / `requireChoice` du
                             scénario existe-t-il encore dans index.html ?
     2. CARTES             — chaque `demo:{kind,id}` (tech / civique / militaire)
                             correspond-il encore à une carte du jeu ?
     3. FONCTIONS          — chaque fonction du jeu appelée par le tutoriel
                             existe-t-elle encore ?
     4. ORDRE RÉEL         — on joue une VRAIE partie en solo, on enregistre la
                             SÉQUENCE des fenêtres réellement ouvertes, et on la
                             compare à l'ordre du scénario. C'est ce contrôle qui
                             attrape « les enchaînements ne sont plus synchro ».
     5. RÉGÉNÉRATION       — `tutorial.html` doit être une copie d'`index.html`
                             où `online.js` est remplacé par `tutorial.js`.

   USAGE
     node server/tutorial-sync.js           → diagnostic seul (ne modifie rien)
     node server/tutorial-sync.js --fix     → régénère aussi tutorial.html

   À LANCER après quelques mises à jour du jeu, avant de livrer un lot.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Engine, setRecorder } = require('./game-core.js');

const RACINE = path.join(__dirname, '..');
const F_INDEX = path.join(RACINE, 'index.html');
const F_TUTOJS = path.join(RACINE, 'tutorial.js');
const F_TUTOHTML = path.join(RACINE, 'tutorial.html');
const FIX = process.argv.includes('--fix');

const index = fs.readFileSync(F_INDEX, 'utf8');
const tuto = fs.readFileSync(F_TUTOJS, 'utf8');

const soucis = [];   // {gravite:'bloquant'|'attention', texte}
const bloquant = (t) => soucis.push({ gravite: 'bloquant', texte: t });
const attention = (t) => soucis.push({ gravite: 'attention', texte: t });

/* ---------------------------------------------------------------- 1. Le scénario
   On lit le tableau STEPS dans la SOURCE (tutorial.js est une IIFE : on ne peut
   pas l'importer). Découpage sur les entrées de premier niveau `{lab:`. */
function lireEtapes(src) {
  const i0 = src.indexOf('const STEPS=[');
  if (i0 < 0) { bloquant('tutorial.js : tableau STEPS introuvable — le tutoriel a changé de structure.'); return []; }
  // Fin = premier `];` en début de ligne après i0
  const i1 = src.indexOf('\n];', i0);
  const bloc = src.slice(i0, i1 < 0 ? src.length : i1);
  const morceaux = bloc.split(/\n\s*\{lab:/).slice(1);
  return morceaux.map((m, n) => {
    const champ = (nom) => { const r = new RegExp(nom + ":\\s*'([^']*)'").exec(m); return r ? r[1] : null; };
    const lab = /^\s*'([^']*)'/.exec(m);
    const demo = /demo:\s*\{\s*kind:\s*'([^']*)'\s*,\s*id:\s*'([^']*)'/.exec(m);
    return {
      n: n + 1,
      lab: lab ? lab[1] : ('étape ' + (n + 1)),
      glow: champ('glow'),
      awaitClick: champ('awaitClick'),
      requireChoice: champ('requireChoice'),
      sync: champ('sync'),
      demoKind: demo ? demo[1] : null,
      demoId: demo ? demo[2] : null
    };
  });
}
const etapes = lireEtapes(tuto);

/* ---------------------------------------------------------------- 2. Identifiants DOM */
const idsDuJeu = new Set();
for (const m of index.matchAll(/\bid=["']?([A-Za-z][\w-]*)["']?/g)) idsDuJeu.add(m[1]);
// Certains conteneurs sont créés dynamiquement par le JS : on les accepte aussi.
for (const m of index.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)) idsDuJeu.add(m[1]);

for (const e of etapes) {
  for (const [champ, val] of [['glow', e.glow], ['awaitClick', e.awaitClick], ['requireChoice', e.requireChoice]]) {
    if (!val) continue;
    if (!idsDuJeu.has(val))
      bloquant('étape ' + e.n + ' « ' + e.lab + ' » : ' + champ + ' pointe sur #' + val + ' qui n\'existe plus dans index.html.');
  }
}

/* ---------------------------------------------------------------- 3. Cartes citées en démonstration */
const idsCartes = new Set();
for (const m of index.matchAll(/\bid:\s*'([a-z][\w]*)'/g)) idsCartes.add(m[1]);
for (const e of etapes) {
  if (!e.demoId) continue;
  if (!idsCartes.has(e.demoId))
    bloquant('étape ' + e.n + ' « ' + e.lab + ' » : la carte « ' + e.demoId + ' » (' + e.demoKind + ') n\'existe plus dans le jeu.');
}

/* ---------------------------------------------------------------- 4. Fonctions du jeu appelées */
const fnsAppelees = new Set();
for (const m of tuto.matchAll(/window\.([A-Za-z_]\w*)\s*(?:\(|&&|\|\||\))/g)) fnsAppelees.add(m[1]);
const IGNORE = new Set(['innerHeight', 'innerWidth', 'SC_TUTO', 'scrollTo', 'addEventListener', 'removeEventListener', 'getComputedStyle', 'location', 'setTimeout']);
for (const fn of fnsAppelees) {
  if (IGNORE.has(fn)) continue;
  const declaree = new RegExp('function\\s+' + fn + '\\b').test(index) || new RegExp('window\\.' + fn + '\\s*=').test(index)
                || new RegExp('\\b' + fn + '\\s*=\\s*function').test(index);
  if (!declaree)
    bloquant('le tutoriel appelle window.' + fn + '() — cette fonction n\'existe plus dans index.html.');
}

/* ---------------------------------------------------------------- 5. ORDRE RÉEL des fenêtres
   On joue une vraie partie SOLO (sink de décision nul → les vraies fenêtres s'ouvrent) et on
   enregistre l'ordre d'ouverture. C'est la séquence que le joueur voit ; le scénario doit la suivre. */
/* ⚠️ On ne peut PAS dérouler une partie solo sans écran : les modales attendent un clic et la
   partie se fige au tour 1. On passe donc par le PILOTE serveur, qui répond aux fenêtres — la
   séquence des décisions qu'il émet EST la séquence des fenêtres que voit le joueur. On y ajoute
   les fenêtres que le moteur ouvre lui-même (découverte, jeton de route…), captées par le
   magnétoscope, pour obtenir un ordre complet. */
const MODALE_DE = {                     // décision émise → fenêtre correspondante côté joueur
  agenda:'agenda-sel-modal', strategy:'strategy-modal', invest1:'invest-modal', invest2:'invest2-modal',
  event_announce:'event-announce-modal', event_result:'event-modal', eot:'eot-modal',
  peace_offer:'peace-modal', war_result:'war-modal', raid_hit:'war-modal',
  ai_dyson:'dyson-modal', human_dyson:'dyson-modal', dyson_build:'dyson-modal',
  espionage:'espionage-modal', empath_copy:'empath-copy-modal'
};
const ordreReel = [];
setRecorder({
  open(id) { if (!/^(sc-|npop|map-|tech-detail)/.test(id)) ordreReel.push(id); },
  close() {}
});
try {
  const { GameDriver } = require('./driver.js');
  const d = new GameDriver(F_INDEX);
  d.boot([{ civId:'terriens', isAI:false }, { civId:'martiens', isAI:true }, { civId:'jupiteriens', isAI:true }],
    (p) => { const m = MODALE_DE[p.kind]; if (m) ordreReel.push(m); });
  let r = d.pump(), garde = 0;
  const G = d.state();
  while (garde++ < 1200 && G.turn <= 3) {         // 3 tours : le tutoriel en couvre 4
    if (!r) break;
    if (r.kind === 'decision') { r = d.answer(r.pending.id, reponseAuto(r.pending)); continue; }
    if (r.kind === 'action')   { r = d.act(r.civId, actionJouable(d, r.civId)); continue; }
    if (r.kind === 'confirm')  { r = d.commit(r.civId); continue; }
    break;
  }
} catch (err) {
  attention('impossible de rejouer une partie pour relever l\'ordre réel (' + err.message.split('\n')[0] + ').');
}
setRecorder(null);
/* Le joueur simulé doit COLONISER puis RELIER : sans cela, les fenêtres « Tuile Découverte » et
   « Protéger la route » ne s'ouvrent jamais et le contrôle d'ordre les croit obsolètes à tort.
   NB : NODES est déclaré en `const` → invisible via sb.NODES, il faut le lire dans le contexte. */
function actionJouable(d, civId) {
  try {
    const sb = d.sb, G = sb.__G, me = d.nation(civId);
    const NODES = vm.runInContext('NODES', sb) || {};
    const pris = new Set();
    for (const p of [G.player].concat(G.ais || [])) for (const c of (p.colonies || [])) pris.add(c.nodeId);
    for (const c of (me.colonies || [])) {
      for (const adj of ((NODES[c.nodeId] || {}).conn || [])) {
        const n = NODES[adj];
        if (!n || n.decorative || n.noColonize || pris.has(adj)) continue;
        if ((me.acLeft || 0) >= 1 && (me.res.materials || 0) >= 2 && (me.res.energy || 0) >= 1)
          return { type: 'colonize', node: adj };
      }
    }
  } catch (e) {}
  return { type: 'pass' };
}
function reponseAuto(p) {
  const o = p.payload || {};
  if (o.options && o.options.length) { const c = o.options[0]; return { agendaId:c.id, cardId:c.id, value:c.id, targetId:c.id, branch:c.branch, node:c.node }; }
  if (p.kind === 'war_combat') return { action:'hold' };
  if (p.kind === 'peace_offer') return { accept:true };
  return {};
}
// Les identifiants de la table de correspondance doivent exister dans le jeu.
for (const [kind, id] of Object.entries(MODALE_DE))
  if (!idsDuJeu.has(id)) attention('table de correspondance : la décision « ' + kind + ' » vise #' + id + ', absent d\'index.html — mettre à jour MODALE_DE dans cet outil.');

// Ordre attendu par le scénario = ses `glow` successifs, restreints aux fenêtres modales.
const modales = etapes.filter(e => e.glow && /modal/.test(e.glow)).map(e => ({ n: e.n, lab: e.lab, id: e.glow }));
const reelModales = ordreReel.filter(id => /modal/.test(id));
const premiereApparition = (id) => reelModales.indexOf(id);

for (let i = 0; i < modales.length - 1; i++) {
  const a = modales[i], b = modales[i + 1];
  const ia = premiereApparition(a.id), ib = premiereApparition(b.id);
  if (ia < 0 || ib < 0) continue;                 // fenêtre non vue sur 3 tours : non concluant
  if (ia > ib)
    bloquant('ORDRE : le scénario montre « ' + a.lab + ' » (#' + a.id + ') AVANT « ' + b.lab + ' » (#' + b.id
      + '), mais le jeu ouvre l\'inverse. Intervertir ces deux étapes.');
}
for (const m of modales) {
  if (premiereApparition(m.id) < 0 && reelModales.length)
    attention('étape ' + m.n + ' « ' + m.lab + ' » : la fenêtre #' + m.id + ' ne s\'est pas ouverte sur 3 tours de partie réelle — étape peut-être obsolète, ou déclenchée plus tard.');
}

/* ---------------------------------------------------------------- 6. tutorial.html à jour */
const attenduHtml = index.replace('<script src="online.js"></script>', '<script src="tutorial.js"></script>');
let htmlAJour = false;
try { htmlAJour = fs.readFileSync(F_TUTOHTML, 'utf8') === attenduHtml; } catch (e) {}
if (!htmlAJour) {
  if (FIX) { fs.writeFileSync(F_TUTOHTML, attenduHtml); console.log('🔧 tutorial.html RÉGÉNÉRÉ depuis index.html.'); }
  else bloquant('tutorial.html n\'est pas une copie à jour d\'index.html — relancer avec --fix.');
}
if (attenduHtml === index) attention('index.html ne contient pas <script src="online.js"> : vérifier la régénération de tutorial.html.');

/* ---------------------------------------------------------------- Rapport */
console.log('═'.repeat(74));
console.log('RESYNCHRONISATION DU TUTORIEL — ' + etapes.length + ' étapes analysées');
console.log('═'.repeat(74));
console.log('\nSÉQUENCE RÉELLE des fenêtres du jeu (3 premiers tours) :');
const vues = []; for (const id of reelModales) if (!vues.includes(id)) vues.push(id);
console.log('  ' + (vues.join('  →  ') || '(aucune fenêtre relevée)'));
console.log('\nSÉQUENCE DU SCÉNARIO :');
console.log('  ' + (modales.map(m => m.id).join('  →  ') || '(aucune)'));

const bl = soucis.filter(s => s.gravite === 'bloquant');
const at = soucis.filter(s => s.gravite === 'attention');
if (bl.length) {
  console.log('\n🔴 ' + bl.length + ' DÉSYNCHRONISATION(S) À CORRIGER :');
  bl.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.texte));
}
if (at.length) {
  console.log('\n🟡 ' + at.length + ' POINT(S) À VÉRIFIER À LA MAIN :');
  at.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.texte));
}
if (!bl.length && !at.length) console.log('\n✅ Le tutoriel est synchronisé avec le jeu.');
console.log('\nRappel : ce programme ne réécrit pas les TEXTES du scénario (travail humain).');
console.log('Il signale ce qui ne correspond plus au jeu et régénère tutorial.html avec --fix.');
process.exitCode = bl.length ? 1 : 0;
