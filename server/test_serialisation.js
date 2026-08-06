/* ============================================================================
   ÉTAPE 1 DU LOT 17 — LA SÉRIALISATION EST-ELLE FIABLE ?
   ----------------------------------------------------------------------------
   POURQUOI CE TEST EXISTE
   Recharger une partie depuis le disque au démarrage du serveur, c'est exercer
   à CHAQUE fois un chemin que `ARCHITECTURE_AVENIR.md` §4 signale comme fragile :
   `Set`/`Map` à réanimer, cycles coupés (`_enemy` des vues de guerre), et un
   `refreshWarViews()` obligatoire après restauration. Jusqu'ici ce chemin n'était
   utilisé que par l'annulation d'une action — rarement, et jamais vérifié.
   Tant que ce test n'est pas vert, les étapes 2 à 6 du lot 17 bâtissent sur du sable.

   CE QU'IL FAIT
     1. joue une VRAIE partie jusqu'à un état riche (colonies, routes, cartes,
        guerres, Sets, tensions) — un état pauvre ne prouverait rien ;
     2. sérialise par le MÊME chemin que `snapshot()` du serveur ;
     3. écrit sur disque, relit, et restaure dans un moteur NEUF (autre bac à sable) ;
     4. COMPARE en profondeur l'état d'origine et l'état restauré, et imprime
        chaque écart avec son chemin exact ;
     5. vérifie que la partie restaurée REPART et se termine proprement.

   USAGE :  node server/test_serialisation.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');

const HTML = path.join(__dirname, '..', 'index.html');
const FICHIER = path.join(require('os').tmpdir(), 'solar_serialisation_test.json');
const problemes = [];
const dire = (s) => console.log(s);

/* ---------- encodage : COPIE EXACTE de safeEncode() de server.js ------------
   On teste le chemin RÉEL du serveur. Si server.js change son encodage, ce test
   doit être mis à jour en même temps — sinon il ne prouve plus rien. */
function safeEncode(root) {
  const stack = [];
  function enc(v) {
    if (v instanceof Set) return { __set: [...v].map(enc) };
    if (v instanceof Map) return { __map: [...v].map(([k, val]) => [enc(k), enc(val)]) };
    if (v === null || typeof v !== 'object') return (typeof v === 'function' || v === undefined) ? undefined : v;
    if (stack.indexOf(v) !== -1) return undefined;      // cycle → coupé ici
    stack.push(v);
    let out;
    if (Array.isArray(v)) out = v.map(enc);
    else { out = {}; for (const k in v) { const e = enc(v[k]); if (e !== undefined) out[k] = e; } }
    stack.pop();
    return out;
  }
  return enc(root);
}

/* ---------- comparaison profonde, avec CHEMIN de l'écart --------------------
   Tolérances ASSUMÉES et documentées (pas des exceptions commodes) :
   · les clés commençant par `_` et absentes après restauration sont des vues
     dérivées, reconstruites par refreshWarViews() — on les vérifie séparément ;
   · les fonctions et `undefined` ne survivent jamais à JSON, par définition. */
const IGNORE_RACINE = new Set(['_pending', '_pendingDecisions', '_il', '_ilTimer', '_playerStuckWatch', '_ilHideTimer']);
function comparer(a, b, chemin, ecarts, prof) {
  if (prof > 12 || ecarts.length > 40) return;
  const ta = typeof a, tb = typeof b;
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set)) { ecarts.push(chemin + ' : Set d\'un côté seulement (' + (a instanceof Set ? 'origine' : 'restauré') + ')'); return; }
    if (a.size !== b.size) ecarts.push(chemin + ' : Set de taille ' + a.size + ' → ' + b.size);
    else for (const v of a) if (!b.has(v)) { ecarts.push(chemin + ' : Set a perdu « ' + v + ' »'); break; }
    return;
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map)) { ecarts.push(chemin + ' : Map d\'un côté seulement'); return; }
    if (a.size !== b.size) ecarts.push(chemin + ' : Map de taille ' + a.size + ' → ' + b.size);
    return;
  }
  if (a === null || b === null || ta !== 'object' || tb !== 'object') {
    if (ta === 'function') return;                       // jamais sérialisable
    if (a !== b) ecarts.push(chemin + ' : ' + JSON.stringify(a) + ' → ' + JSON.stringify(b));
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { ecarts.push(chemin + ' : tableau/objet incohérent'); return; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) { ecarts.push(chemin + ' : tableau de ' + a.length + ' → ' + b.length + ' élément(s)'); return; }
    for (let i = 0; i < a.length; i++) comparer(a[i], b[i], chemin + '[' + i + ']', ecarts, prof + 1);
    return;
  }
  for (const k of Object.keys(a)) {
    if (prof === 0 && IGNORE_RACINE.has(k)) continue;
    if (typeof a[k] === 'function' || a[k] === undefined) continue;
    if (!(k in b)) { ecarts.push(chemin + '.' + k + ' : PERDU à la restauration'); continue; }
    comparer(a[k], b[k], chemin + '.' + k, ecarts, prof + 1);
  }
}

/* ---------- 1. jouer jusqu'à un état RICHE ---------- */
dire('═'.repeat(74));
dire('SÉRIALISATION — écrire, relire, comparer  (étape 1 du lot 17)');
dire('═'.repeat(74));

const d = new GameDriver(HTML);
d.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: false },
        { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
function reponse(p) {
  const o = p.payload || {};
  if (o.options && o.options.length) { const c = o.options[0]; return { agendaId: c.id, cardId: c.id, value: c.id, targetId: c.id, branch: c.branch, node: c.node }; }
  if (p.kind === 'war_combat') return o.cols && o.cols.length ? { action: 'attack', node: o.cols[0].node, tokens: 3 } : { action: 'hold' };
  if (p.kind === 'peace_offer') return { accept: false };
  return {};
}
function actionRiche(civId) {
  try {
    const sb = d.sb, G = sb.__G, me = d.nation(civId);
    const NODES = vm.runInContext('NODES', sb) || {};
    const pris = new Set();
    for (const p of [G.player].concat(G.ais || [])) for (const c of (p.colonies || [])) pris.add(c.nodeId);
    for (const c of (me.colonies || [])) for (const adj of ((NODES[c.nodeId] || {}).conn || [])) {
      const n = NODES[adj];
      if (n && !n.decorative && !n.noColonize && !pris.has(adj) && (me.acLeft || 0) >= 1
          && (me.res.materials || 0) >= 2 && (me.res.energy || 0) >= 1) return { type: 'colonize', node: adj };
    }
  } catch (e) {}
  return { type: 'pass' };
}
let r = d.pump(), garde = 0;
const G0 = d.state();
while (garde++ < 900 && G0.turn <= 4) {
  if (!r) break;
  if (r.kind === 'decision') { r = d.answer(r.pending.id, reponse(r.pending)); continue; }
  if (r.kind === 'action')   { r = d.act(r.civId, actionRiche(r.civId)); continue; }
  if (r.kind === 'confirm')  { r = d.commit(r.civId); continue; }
  break;
}
const G = d.state();
const nb = (p) => (p.colonies || []).length + '/' + (p.routes || []).length + '/' + (p.cards || []).length;
dire('\n1. ÉTAT ATTEINT — tour ' + G.turn + ', ' + (G.wars || []).length + ' guerre(s)');
dire('   colonies/routes/cartes par nation : ' + [G.player].concat(G.ais).map(p => p.civ.id.slice(0, 4) + ' ' + nb(p)).join('  ·  '));
dire('   techTaken (Set) : ' + (G.techTaken instanceof Set ? G.techTaken.size + ' entrée(s)' : 'PAS un Set !'));
if (!(G.techTaken instanceof Set)) problemes.push('techTaken n\'est pas un Set avant sérialisation — le test ne prouverait rien');
if (G.turn < 2) problemes.push('état trop pauvre (tour ' + G.turn + ') : la preuve serait faible');

/* ---------- 2 & 3. écrire, relire, restaurer dans un moteur NEUF ---------- */
const json = JSON.stringify(safeEncode(G));
fs.writeFileSync(FICHIER, json);
dire('\n2. ÉCRIT sur disque : ' + Math.round(json.length / 1024) + ' Ko');
const relu = fs.readFileSync(FICHIER, 'utf8');
if (relu !== json) problemes.push('le fichier relu diffère de ce qui a été écrit');

const d2 = new GameDriver(HTML);   // moteur NEUF : aucun état partagé avec le premier
d2.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: false },
         { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
let restaure = null;
try {
  const g = d2.sb.scDeserialize(relu);          // reviver __set / __map
  d2.sb.scSetG(g);
  if (typeof d2.sb.rehydrateState === 'function') d2.sb.rehydrateState(g);
  if (typeof d2.sb.refreshWarViews === 'function') d2.sb.refreshWarViews();
  // Reconstruire le roster du pilote : après restauration, G contient de NOUVEAUX objets nations.
  const G2 = d2.sb.__G;
  d2.roster = [G2.player].concat(G2.ais || []);
  for (const p of d2.roster) { const anc = [G.player].concat(G.ais).find(x => x.civ.id === p.civ.id); if (anc) p._isAI = anc._isAI; }
  restaure = G2;
  dire('3. RESTAURÉ dans un moteur neuf : OK');
} catch (e) {
  problemes.push('la restauration a ÉCHOUÉ : ' + e.message);
  dire('3. RESTAURÉ : ❌ ' + e.message);
}

/* ---------- 4. comparer ---------- */
if (restaure) {
  const ecarts = [];
  comparer(G, restaure, 'G', ecarts, 0);
  dire('\n4. COMPARAISON origine ↔ restauré');
  if (!ecarts.length) dire('   ✅ aucun écart.');
  else {
    dire('   ⚠️ ' + ecarts.length + ' écart(s) :');
    ecarts.slice(0, 25).forEach((e, i) => dire('     ' + (i + 1) + '. ' + e));
    for (const e of ecarts) problemes.push('écart : ' + e);
  }
  // Contrôles ciblés sur ce que la sérialisation abîme habituellement.
  dire('\n   contrôles ciblés :');
  const t = (l, v) => dire('     ' + l.padEnd(46) + (v ? '✓' : '✗ ÉCHEC'));
  const okSet = restaure.techTaken instanceof Set;
  t('techTaken est bien un Set après relecture', okSet);
  if (!okSet) problemes.push('techTaken n\'est plus un Set après restauration');
  const guerres = (restaure.wars || []);
  const okVues = guerres.every(w => typeof w.aiId === 'string' || guerres.length === 0);
  t('vues de guerre reconstruites (w.aiId)', okVues);
  if (!okVues) problemes.push('les vues de guerre ne sont pas reconstruites (refreshWarViews)');
  const okNat = [restaure.player].concat(restaure.ais || []).every(p => p && p.civ && p.res && Array.isArray(p.colonies));
  t('nations complètes (civ, res, colonies)', okNat);
  if (!okNat) problemes.push('des nations sont incomplètes après restauration');
}

/* ---------- 5. la partie restaurée repart-elle ? ---------- */
if (restaure) {
  dire('\n5. LA PARTIE RESTAURÉE REPART-ELLE ?');
  let r2 = null, g2 = 0, erreur = null;
  try {
    r2 = d2.pump();
    while (g2++ < 1200) {
      if (!r2) break;
      if (r2.kind === 'decision') { r2 = d2.answer(r2.pending.id, reponse(r2.pending)); continue; }
      if (r2.kind === 'action')   { r2 = d2.act(r2.civId, actionRiche(r2.civId)); continue; }
      if (r2.kind === 'confirm')  { r2 = d2.commit(r2.civId); continue; }
      break;
    }
  } catch (e) { erreur = e.message; }
  const G2 = d2.state();
  if (erreur) { dire('   ❌ exception : ' + erreur); problemes.push('la partie restaurée plante : ' + erreur); }
  else if (r2 && r2.kind === 'over') dire('   ✅ la partie est allée jusqu\'à son terme (tour ' + G2.turn + ').');
  else { dire('   ⚠️ arrêt sur « ' + (r2 && r2.kind) + ' » au tour ' + G2.turn); problemes.push('la partie restaurée ne se termine pas (état ' + (r2 && r2.kind) + ')'); }
}

/* ---------- verdict ---------- */
try { fs.unlinkSync(FICHIER); } catch (e) {}
dire('\n' + '═'.repeat(74));
if (problemes.length) {
  dire('⚠️  ' + problemes.length + ' PROBLÈME(S) — la sérialisation N\'EST PAS fiable :');
  problemes.slice(0, 20).forEach((p, i) => dire('  ' + (i + 1) + '. ' + p));
  dire('\n🔴 RÉGRESSION. Ce test était VERT depuis le 2026-08-06 : une partie sauvegardée pendant');
  dire('   une question repartait jusqu\'au bout. S\'il redevient rouge, c\'est qu\'une continuation');
  dire('   est repassée sous forme de FONCTION quelque part — JSON n\'écrit pas de fonctions.');
  dire('   Cherche un `_emitDecision(..., (ans)=>{...})` ou une file gardée dans une fermeture :');
  dire('   la suite doit être un NOM enregistré par `fluxDeclarer` (voir le bloc @flux de moteur.js).');
  dire('   `node server/test_reprise.js` dira QUELLE famille de questions ne reprend plus.');
  process.exitCode = 1;
} else {
  dire('✅ SÉRIALISATION FIABLE : écrite, relue, identique, et la partie repart jusqu\'au bout.');
  dire('   L\'étape 2 (recharger les parties au démarrage) peut être construite dessus.');
}
