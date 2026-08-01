/* ============================================================================
   BANC D'ESSAI « PARTIE COMMENTÉE » — server/playthrough.js
   ----------------------------------------------------------------------------
   POURQUOI : les tests classiques (selftest, test_contract) vérifient l'ÉTAT du
   moteur. Ils ne rendent AUCUNE interface, donc ils ne peuvent pas voir les bugs
   que Marc rencontre : fenêtre qui ne s'ouvre pas, mauvais texte, fenêtre au
   mauvais moment, partie qui se fige en attendant un clic.

   CE QUE FAIT CE BANC : il joue UNE partie complète et imprime une TRANSCRIPTION
   chronologique — pour chaque étape : la décision routée (et vers qui), les
   FENÊTRES réellement ouvertes avec leur TEXTE, et les lignes de journal.
   On la relit ligne par ligne, comme un joueur regarderait son écran.

   MÉTHODE (imposée par Marc) : UNE partie → on lit → on corrige → UNE autre
   partie → on lit → on corrige. Jamais 20 parties d'un coup : le but est de
   regarder ce qui s'affiche, pas d'accumuler des statistiques.

   CE QU'IL NE VOIT PAS : la mise en page (largeurs, défilement, boutons hors
   écran sur mobile). Cela demande un vrai navigateur → captures d'écran de Marc.

   USAGE :  node playthrough.js [civ] [graine]
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const { setRecorder } = require('./game-core.js');

const HTML = path.join(__dirname, '..', 'index.html');
const MY_CIV = process.argv[2] || 'terriens';
const OTHERS = ['martiens', 'jupiteriens', 'ceinturiens'].filter(c => c !== MY_CIV).slice(0, 2);

/* ---------- nettoyage du texte affiché (icônes → emoji, balises retirées) ---------- */
function plain(x) {
  return String(x == null ? '' : x)
    .replace(/<i\s+class=["']?ri-energy["']?\s*><\/i>/gi, '⚡')
    .replace(/<i\s+class=["']?ri-materials["']?\s*><\/i>/gi, '🪨')
    .replace(/<i\s+class=["']?ri-science["']?\s*><\/i>/gi, '🔬')
    .replace(/<i\s+class=["']?ri-morale["']?\s*><\/i>/gi, '🙂')
    .replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- journal chronologique ---------- */
const T = [];                       // transcription
let step = 0;
const line = (s) => T.push(s);
/* Rend lisible un HTML de fenêtre (icônes → emoji, une ligne par bloc) pour pouvoir RELIRE les textes. */
const htmlToText = (h) => String(h)
  .replace(/<i class=ri-(\w+)><\/i>/g, (m, r) => ({energy:'⚡',materials:'🪨',science:'🔬',morale:'❤️'}[r] || r))
  .replace(/<h4[^>]*>/g, '\n■ ').replace(/<\/(div|h4)>/g, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .split('\n').map(s => s.trim()).filter(Boolean).join('\n');
const head = (s) => { T.push(''); T.push('── ' + s); };

/* Fenêtres du JEU (index.html) réellement ouvertes/fermées */
const openedWindows = [];           // pour les vérifications de fin
setRecorder({
  open(id, el) {
    // on ignore le bruit : conteneurs techniques sans intérêt de lecture
    if (/^(sc-confirm|npop|map-|tech-)/.test(id)) return;
    const txt = plain(el && (el.innerHTML || el.textContent));
    openedWindows.push(id);
    line('   🪟 FENÊTRE OUVERTE  #' + id + (txt ? ('  « ' + txt.slice(0, 160) + ' »') : '  (vide)'));
  },
  close(id) { /* fermetures : non bruitées, on ne les lit pas */ }
});

/* ---------- réponses automatiques (un « joueur » qui joue proprement) ---------- */
function answerFor(p) {
  const k = p.kind, o = p.payload || {};
  if (o.options && o.options.length) {                  // agenda / stratégie / invest / espionnage…
    const c = o.options[0];
    return { agendaId: c.id, cardId: c.id, branch: c.branch, node: c.node, value: c.id, targetId: c.id };
  }
  switch (k) {
    case 'peace_offer':   return { accept: false };     // on refuse : on veut VOIR la guerre
    case 'defense':       return { defTokens: Math.min(2, o.maxDef || 0), cruiser: false };
    case 'war_combat':    return o.cols && o.cols.length ? { action: 'attack', node: o.cols[0].node, tokens: 3 } : { action: 'hold' };
    case 'event_comm':    return { aiId: (o.cands && o.cands[0]) ? o.cands[0].id : null };
    case 'event_diplo':   return { selected: [] };
    case 'forced_war':    return { peace: true };
    case 'route_capture': return { capture: true };
    case 'accord_confirm':return { confirm: true };
    case 'ai_dyson': case 'human_dyson': return { war: false };
    case 'dyson_build':   return { force: true };
    default:              return {};                     // notices : accusé de réception
  }
}

/* ---------- « cerveau » du joueur simulé ----------------------------------------------
   Il doit JOUER pour de vrai (coloniser, puis ATTAQUER) : sans cela, aucune guerre n'est
   déclenchée et la transcription ne montre jamais les fenêtres de combat/capture — c'est-à-dire
   précisément là où se trouvent les bugs signalés. Priorité : attaquer > coloniser > passer. */
function chooseAction(d, civId) {
  const sb = d.sb, G = sb.__G;
  const me = d.nation(civId); if (!me) return { type: 'pass' };
  const others = [G.player].concat(G.ais || []).filter(p => p && p.civ && p.civ.id !== civId);
  const NODES = sb.NODES || {};
  const payable = (typeof sb.maxAffordableTokens === 'function') ? sb.maxAffordableTokens(me) : 0;
  const engage = Math.min(me.forceTokens || 0, payable);

  // 1) ATTAQUER une colonie ennemie (hors capitale : elle demande 10+ jetons) dès qu'on peut payer 3 jetons
  if (engage >= 3 && (me.acLeft || 0) >= 1) {
    for (const o of others) {
      const cible = (o.colonies || []).find(c => c.nodeId !== o.civ.home);
      if (cible) return { type: 'attack', node: cible.nodeId, tokens: Math.min(engage, 5) };
    }
  }
  // 2) COLONISER un nœud libre adjacent à une de mes colonies
  try {
    const pris = new Set();
    for (const p of [G.player].concat(G.ais || [])) for (const c of (p.colonies || [])) pris.add(c.nodeId);
    for (const c of (me.colonies || [])) {
      for (const adj of ((NODES[c.nodeId] || {}).conn || [])) {
        const n = NODES[adj];
        if (!n || n.decorative || n.noColonize || pris.has(adj)) continue;
        const cout = (typeof sb.colonizeCost === 'function') ? sb.colonizeCost(me) : { ac: 1, mat: 2, en: 1 };
        if ((me.acLeft || 0) >= cout.ac && (me.res.materials || 0) >= cout.mat && (me.res.energy || 0) >= cout.en)
          return { type: 'colonize', node: adj };
      }
    }
  } catch (e) {}
  return { type: 'pass' };
}

/* ---------- déroulé de LA partie ---------- */
const d = new GameDriver(HTML);
let lastLog = 0;
d.onLog = (entries) => { for (const e of entries) line('   📜 ' + plain((e && e.msg) || e)); };

const problems = [];
const seenKinds = new Set();

function dumpTurn(G) { return 'Tour ' + (G.turn || '?') + ' · phase ' + (G.phase || '?'); }

d.boot([{ civId: MY_CIV, isAI: false }].concat(OTHERS.map(c => ({ civId: c, isAI: true }))), (p) => {
  seenKinds.add(p.kind);
});

let r = d.pump();
let guard = 0;
while (guard++ < 4000) {
  const G = d.state();
  if (!r) { problems.push('pump() n\'a rien renvoyé — état indéterminé'); break; }

  if (r.kind === 'decision') {
    const p = r.pending;
    const who = (typeof p.nation === 'object' && p.nation) ? p.nation.civ.id : p.nation;
    step++;
    head('#' + step + ' · ' + dumpTurn(G) + ' · DÉCISION « ' + p.kind +' » → ' + (who || '???'));
    if (!who) problems.push('décision ' + p.kind + ' sans destinataire (risque de blocage)');
    // Bilan de fin de tour : on RELIT son contenu réel (c'est le HTML que le client injecte tel quel).
    if (p.kind === 'eot') {
      const h = (p.payload && p.payload.html) || '';
      if (!h) problems.push('bilan de fin de tour envoyé VIDE (le client afficherait un résumé dégradé)');
      else {
        for (const l of htmlToText(h).split('\n')) line('   │ ' + l);
        for (const sec of ['Actions ce tour', 'Entretien', 'Revenus'])
          if (h.indexOf(sec) === -1) problems.push('bilan de fin de tour : section « ' + sec + ' » manquante');
      }
    }
    const before = openedWindows.length;
    const ans = answerFor(p);
    line('   ↳ réponse : ' + JSON.stringify(ans));
    try { r = d.answer(p.id, ans); }
    catch (e) { problems.push('réponse à ' + p.kind + ' → exception : ' + e.message); break; }
    // NB : en mode serveur, le jeu ÉMET la décision au lieu d'ouvrir lui-même la fenêtre — c'est le client
    // qui l'affiche. On ne signale donc PAS « aucune fenêtre » ici (ce serait un faux positif systématique) :
    // la présence d'un vrai rendu client est vérifiée par le contrôle REAL[] en fin de partie.
    void before;
    continue;
  }

  if (r.kind === 'action') {
    step++;
    head('#' + step + ' · ' + dumpTurn(G) + ' · À MOI DE JOUER (' + r.civId + ')');
    const act = chooseAction(d, r.civId);
    line('   ↳ action : ' + JSON.stringify(act));
    try { r = d.act(r.civId, act); }
    catch (e) { problems.push('act() → exception : ' + e.message); break; }
    continue;
  }

  if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
  if (r.kind === 'over') { head('FIN DE PARTIE atteinte proprement ✅'); break; }
  problems.push('état inattendu : ' + r.kind + ' (partie potentiellement figée)');
  break;
}
if (guard >= 4000) problems.push('BOUCLE : la partie ne se termine jamais');

/* ---------- vérifications automatiques (invariants) ---------- */
const G = d.state();
if (G.turn <= G.maxTurns && !(r && r.kind === 'over')) problems.push('la partie ne s\'est PAS terminée (figée au tour ' + G.turn + ')');

// Chaque type de décision doit avoir un rendu CLIENT dédié (sinon = panneau générique)
const fs = require('fs');
const online = fs.readFileSync(path.join(__dirname, '..', 'online.js'), 'utf8');
const REAL = { agenda:'showAgendaReal', strategy:'showStrategyReal', invest1:'showInvestReal', invest2:'showInvestReal',
  peace_offer:'showPeaceReal', ai_dyson:'showDysonReal', human_dyson:'showDysonReal', dyson_build:'showDysonReal',
  accord_confirm:'showAccordReal', espionage:'showOptsReal', empath_copy:'showOptsReal', forced_war:'showForcedWarReal',
  route_capture:'showRouteCaptureReal', war_result:'showWarResultReal', raid_hit:'showHitReal',
  event_result:'showEventResultBlocking', event_announce:'showEventAnnounceBlocking',
  event_comm:'showCommEventModal', event_diplo:'showDiploEventModal' };
for (const k of seenKinds) {
  if (REAL[k] && online.indexOf(REAL[k]) === -1) problems.push('décision « ' + k + ' » : pas de vraie fenêtre côté client (' + REAL[k] + ' absent)');
  if (!REAL[k] && !/^(war_combat|defense|extrasolar|strategy_calm|eot)$/.test(k)) problems.push('décision « ' + k + ' » : aucune fenêtre dédiée prévue — à vérifier');
}

/* ---------- sortie ---------- */
console.log(T.join('\n'));
console.log('\n' + '='.repeat(72));
console.log('RÉSUMÉ — ' + step + ' étapes · ' + openedWindows.length + ' fenêtres ouvertes · tour final ' + G.turn);
console.log('types de décisions rencontrés : ' + [...seenKinds].sort().join(', '));
if (problems.length) {
  console.log('\n⚠️  ' + problems.length + ' PROBLÈME(S) À CORRIGER :');
  problems.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + p));
  process.exitCode = 1;
} else {
  console.log('\n✅ Aucun problème automatique détecté. RELIRE quand même la transcription ci-dessus :');
  console.log('   textes des fenêtres, ordre des étapes, fenêtre manquante après une conquête ou un raid.');
}
