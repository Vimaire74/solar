/* ============================================================================
   TEST — EN SOLO LOCAL, L'ESPIONNAGE OUVRE SA FENÊTRE ; LE CHIEN DE GARDE DE 5 s SE TAIT
   ----------------------------------------------------------------------------
   POURQUOI. Marc, appli Android, 28/09/2026 : « le jeu s'est juste arrêté à la fin de mes actions
   [au tour 3], sans fin de tour, sans filet de sécurité ». Son investissement Niv.1 était
   l'Espionnage. À la fin du tour 3, `stEspionnage` posait la question via `_emitDecision` DANS TOUS
   LES CAS — alors que partout ailleurs le moteur suit le schéma « en ligne : router au client ;
   sinon : ouvrir la fenêtre du jeu ». En solo local (l'appli, sans serveur), personne n'affichait
   la question : `G._pending` restait posé, et le chien de garde de 8 s se tait volontairement tant
   qu'une question est en attente. Blocage silencieux par construction.
   Sur le site, même le solo passe par le serveur (lot 17) : la fenêtre venait d'online.js. C'est
   pourquoi le défaut n'était visible que dans l'appli.

   Même jour, second défaut : la fenêtre « ⚠️ Tu sembles bloqué » s'ouvrait après 5 s de réflexion
   en solo. Marc : « si on joue tout seul contre les IA, ce message n'a pas de sens, il doit être
   réservé au multijoueur ». Le chien de garde de 5 s ne s'arme plus hors ligne.

   ⚠️ CONTRE-ÉPREUVES : avec un émetteur de décisions installé (serveur), l'espionnage doit
   toujours POSER la question et n'ouvrir aucune fenêtre ; en ligne, le chien de garde de 5 s
   s'arme toujours.

   Usage : node test_espionnage_solo_fenetre.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic, setRecorder } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

function montage() {
  const ouvertes = [];
  setRecorder({ open(id){ ouvertes.push(id); }, close(){}, text(){} });
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 3; G.phase = 'actions';
  const moi = G.player;
  moi._isAI = false; moi._inv1 = 'inv_esp'; moi._espFait = false; moi._espTour = null;
  const parBranche = vm.runInContext(
    'CARDS_POOL.filter(c=>c.branch).slice(0,40).map(c=>({id:c.id,branch:c.branch,name:c.name,emoji:c.emoji,tier:c.tier}))', sb);
  const groupes = {};
  for (const c of parBranche) (groupes[c.branch] = groupes[c.branch] || []).push(c);
  const b = Object.keys(groupes).find(k => groupes[k].length >= 2);
  const victime = G.ais[0];
  for (const c of groupes[b]) if (!victime.cards.some(x => x.id === c.id)) victime.cards.push(c);
  return { sb, G, moi, victime, ouvertes };
}
const questions = sb => (typeof sb.fluxQuestionsEnAttente === 'function' ? sb.fluxQuestionsEnAttente() : []).filter(p => p.kind === 'espionage');

console.log('═'.repeat(80));
console.log('SOLO LOCAL — ESPIONNAGE AVEC FENÊTRE, CHIEN DE GARDE DE 5 s MUET');
console.log('═'.repeat(80) + '\n');

/* ── 1. Solo local : la fenêtre s'ouvre, aucune question ne reste en attente ─────── */
console.log('1. SOLO LOCAL (aucun émetteur de décisions) — fin du tour 3 avec Espionnage');
{
  const { sb, G, ouvertes } = montage();
  if (sb._decisionActive()) ko('montage : un émetteur de décisions est installé, ce n\'est pas le solo');
  let err = null;
  try { sb.stEspionnage(); } catch (e) { err = e; }
  if (err) ko('stEspionnage a jeté : ' + err.message); else ok('stEspionnage passe sans exception');
  const q = questions(sb);
  if (q.length) ko('une question « espionage » reste en attente (' + q[0].id + ') : personne ne l\'affichera en solo local'); else ok('aucune question en attente');
  if (ouvertes.includes('espionage-modal')) ok('la fenêtre #espionage-modal s\'est ouverte'); else ko('la fenêtre #espionage-modal ne s\'est PAS ouverte (fenêtres vues : ' + (ouvertes.join(', ') || 'aucune') + ')');
  if (G._pending) ko('G._pending est posé → le chien de garde de 8 s restera muet'); else ok('G._pending vide : le chien de garde garde la main');
}

/* ── 2. Solo local : la réponse de la fenêtre mène au bilan ──────────────────────── */
console.log('\n2. SOLO LOCAL — répondre depuis la fenêtre conduit au bilan de tour');
{
  const { sb, G, moi, ouvertes } = montage();
  try { sb.stEspionnage(); } catch (e) {}
  const opts = sb._espOptions(moi).filter(o => o.kind === 'une');
  const avant = moi.cards.length;
  let err = null;
  try { sb.stEspionnageRecu({ ids: [opts[0].id] }, moi.civ.id); } catch (e) { err = e; }
  if (err) ko('stEspionnageRecu a jeté : ' + err.message);
  if (moi.cards.length === avant + 1) ok('une technologie volée (' + avant + ' → ' + moi.cards.length + ')'); else ko('vol non appliqué (' + avant + ' → ' + moi.cards.length + ')');
  if (ouvertes.includes('eot-modal')) ok('le bilan de tour (#eot-modal) s\'ouvre ensuite'); else ko('le bilan de tour ne s\'ouvre pas après la réponse');
  const d = sb.fluxDonnees(); if (d.espRestants) ko('espRestants non vidé'); else ok('espRestants vidé');
}

/* ── 3. CONTRE-ÉPREUVE : en ligne, la question est posée, pas de fenêtre ────────── */
console.log('\n3. CONTRE-ÉPREUVE — émetteur installé (serveur) : question posée, fenêtre fermée');
{
  const { sb, ouvertes } = montage();
  const recues = [];
  sb.setDecisionSink(p => recues.push(p));
  try { sb.stEspionnage(); } catch (e) { ko('stEspionnage a jeté : ' + e.message); }
  if (recues.some(p => p.kind === 'espionage')) ok('la question « espionage » part à l\'émetteur'); else ko('aucune question émise en ligne');
  if (questions(sb).length) ok('elle est en attente dans G._flux (sauvegardable)'); else ko('elle n\'est pas en attente');
  if (!ouvertes.includes('espionage-modal')) ok('aucune fenêtre solo ouverte côté serveur'); else ko('la fenêtre solo s\'ouvre côté serveur');
  sb.setDecisionSink(null);
}

/* ── 4. Chien de garde de 5 s : muet en solo, armé en ligne ─────────────────────── */
console.log('\n4. CHIEN DE GARDE « Tu sembles bloqué » (5 s)');
{
  const { sb, G } = montage();
  const armes = [];
  sb.setTimeout = function (fn, ms) { armes.push({ fn, ms }); return armes.length; };
  sb.clearTimeout = function () {};
  /* ⚠️ Le décor répond un élément à TOUT id : `_scTutorialActive()` verrait donc un `#tuto-coach`
     et couperait le chien de garde avant même le délai — le point serait vert sans rien prouver. */
  const _gebi = sb.document.getElementById;
  sb.document.getElementById = function (id) { return id === 'tuto-coach' ? null : _gebi.call(sb.document, id); };
  if (sb._scTutorialActive()) ko('montage : le tutoriel est vu actif, le chien de garde ne peut pas être mesuré');
  G._il = true; G._humanActive = true; G.phase = 'actions';
  sb._armPlayerStuckWatch();
  const cinq = armes.filter(a => a.ms === 5000);
  if (!cinq.length) ok('solo local : aucun délai de 5 s armé'); else ko('solo local : un délai de 5 s est armé — la fenêtre « Tu sembles bloqué » reviendra en solo');
  /* Contre-épreuve : en ligne, il s'arme toujours (délai à revalider avec le multijoueur de l'appli, Marc 28/09). */
  armes.length = 0;
  sb.window.SC_ONLINE = { STATE: { started: true } };
  sb._armPlayerStuckWatch();
  if (armes.some(a => a.ms === 5000)) ok('en ligne : le délai de 5 s est armé (comportement conservé)'); else ko('en ligne : le chien de garde ne s\'arme plus');
  delete sb.window.SC_ONLINE;
  /* Et le cas « plus aucune ressource » reste signalé en solo : il ne dépend pas du délai. */
  const p = G.player; p.acLeft = 1; p.res = { materials: 0, energy: 0, science: 0 }; p.forceTokens = 0; p.abilityUsed = true;
  if (sb._scCanPlayerAct() === false) ok('solo : la pénurie réelle reste détectée par _scCanPlayerAct'); else ko('solo : la pénurie n\'est plus détectée');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   • ' + e)); process.exit(1); }
console.log('✅ Tout est vert.');
