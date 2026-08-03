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

   🆕 MULTIJOUEUR À 4 HUMAINS (demande de Marc, 2026-08-03)
   ---------------------------------------------------------------------------
   Le banc n'installait qu'UN humain + des IA. Il était donc structurellement
   AVEUGLE à toute une famille de bugs, ceux du DESTINATAIRE :
     · « la fenêtre de victoire de Marc s'affiche aussi chez Laurent »
     · « la fenêtre n'apparaît pas du tout parce qu'une autre était ouverte »
   Avec un seul humain, aucun second joueur ne peut recevoir une fenêtre à tort,
   et deux fenêtres ne se concurrencent jamais. Il a fallu une partie réelle pour
   les découvrir. Le banc installe désormais 4 nations HUMAINES et REJOUE la
   distribution du serveur (server.js) : chaque fenêtre est déposée dans la
   BOÎTE AUX LETTRES de son destinataire, et on vérifie ensuite :
     · qu'aucune fenêtre n'arrive chez quelqu'un à qui elle n'était pas destinée,
     · qu'aucune fenêtre n'est émise sans destinataire (= risque de blocage),
     · que le bilan de fin de tour arrive à TOUS et que chacun reçoit LE SIEN,
     · que deux fenêtres ne sont pas en vol simultanément pour le même joueur
       sans que la précédente ait été traitée (condition qui faisait disparaître
       une fenêtre côté client avant la mise en file d'attente),
     · qu'aucun joueur n'est privé de tour (famine).

   MÉTHODE (imposée par Marc) : UNE partie → on lit → on corrige → UNE autre
   partie → on lit → on corrige. Jamais 20 parties d'un coup : le but est de
   regarder ce qui s'affiche, pas d'accumuler des statistiques.

   CE QU'IL NE VOIT PAS : la mise en page (largeurs, défilement, boutons hors
   écran sur mobile). Cela demande un vrai navigateur → captures d'écran de Marc.

   USAGE :  node playthrough.js [nbHumains]     (défaut 4 = multijoueur complet)
            node playthrough.js 1               (ancien mode : 1 humain + 2 IA)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const { setRecorder } = require('./game-core.js');

/* Lit une valeur DANS le contexte du jeu. Indispensable pour tout ce qui est déclaré en `const`
   ou `let` dans index.html (NODES, EVENTS…) : ces déclarations ne deviennent PAS des propriétés
   du bac à sable, contrairement aux `function`. Les lire via `sb.X` renvoie `undefined` — piège
   silencieux qui a longtemps empêché le joueur simulé de coloniser. */
function _ctx(sb, nom) { try { return vm.runInContext(nom, sb); } catch (e) { return undefined; } }

const HTML = path.join(__dirname, '..', 'index.html');
const ALL_CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
const NB_HUMAINS = Math.max(1, Math.min(4, parseInt(process.argv[2], 10) || 4));
// 4 humains = table complète ; en dessous, on complète avec des IA pour garder 3 nations minimum.
const SEATS = (NB_HUMAINS === 4 ? ALL_CIVS : ALL_CIVS.slice(0, Math.max(3, NB_HUMAINS)))
  .map((c, i) => ({ civId: c, isAI: i >= NB_HUMAINS }));
const HUMANS = SEATS.filter(s => !s.isAI).map(s => s.civId);
const PSEUDO = {}; HUMANS.forEach((c, i) => { PSEUDO[c] = 'Joueur ' + (i + 1) + ' (' + c + ')'; });
const whoLabel = (c) => PSEUDO[c] || (c ? c + ' [IA]' : '???');

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

const problems = [];
const seenKinds = new Set();

/* ============================================================================
   BOÎTES AUX LETTRES — on rejoue ici la distribution faite par server.js.
   Toute fenêtre destinée à une nation part dans SA boîte, et seulement la sienne.
   ========================================================================== */
const INBOX = {};   // civId -> [ {step, kind, own} ]
HUMANS.forEach(c => { INBOX[c] = []; });
const enVol = new Map();   // décisions émises et pas encore répondues : id -> {kind, who}

function nationIdOf(p) {
  const n = p && p.nation;
  return (n && typeof n === 'object' && n.civ) ? n.civ.id : (n || null);
}

/* Fenêtres COLLECTIVES : elles concernent toute la table, pas une nation.
   Elles doivent arriver chez TOUS les humains (cf. FENETRES_COLLECTIVES dans server.js). */
const COLLECTIVES = ['eot', 'event_announce', 'event_result'];

/* Reproduit la distribution de server.js. Renvoie la liste des destinataires effectifs.
   La corrélation se fait par IDENTIFIANT de fenêtre (pas par numéro d'étape : le moteur émet
   la fenêtre AVANT que la boucle principale n'incrémente l'étape). */
function distribuer(p) {
  const kind = p.kind, cible = nationIdOf(p), id = p.id;
  if (COLLECTIVES.includes(kind)) {
    const bodies = (p.payload && p.payload.bodies) || null;
    const recus = [];
    for (const c of HUMANS) {
      const corps = kind === 'eot' ? ((bodies && bodies[c]) || (p.payload && p.payload.html) || '') : null;
      if (kind === 'eot' && !corps) { problems.push('bilan de fin de tour : ' + whoLabel(c) + ' ne reçoit AUCUN bilan'); continue; }
      INBOX[c].push({ id, kind, own: corps });
      recus.push(c);
    }
    // Chacun doit recevoir SON bilan : deux corps identiques = bascule de perspective ratée.
    if (kind === 'eot' && bodies) {
      for (let i = 0; i < recus.length; i++) for (let j = i + 1; j < recus.length; j++) {
        const a = bodies[recus[i]], b = bodies[recus[j]];
        if (a && b && a === b)
          problems.push('bilan de fin de tour IDENTIQUE pour ' + whoLabel(recus[i]) + ' et ' + whoLabel(recus[j]) + ' (perspective non appliquée)');
      }
    }
    return recus;
  }
  // Fenêtre PERSONNELLE : elle doit avoir un destinataire, et un seul.
  if (!cible) { problems.push('fenêtre personnelle « ' + kind + ' » émise SANS destinataire (risque de blocage)'); return []; }
  if (!INBOX[cible]) return [];   // destinée à une IA : rien à afficher
  INBOX[cible].push({ id, kind });
  return [cible];
}

/* ---------- Fenêtres du JEU (index.html) réellement ouvertes ---------- */
const openedWindows = [];
setRecorder({
  open(id, el) {
    if (/^(sc-confirm|npop|map-|tech-)/.test(id)) return;   // conteneurs techniques
    const txt = plain(el && (el.innerHTML || el.textContent));
    openedWindows.push(id);
    line('   🪟 FENÊTRE OUVERTE  #' + id + (txt ? ('  « ' + txt.slice(0, 160) + ' »') : '  (vide)'));
  },
  close(id) { /* fermetures : non bruitées */ }
});

/* ---------- réponses automatiques (un « joueur » qui joue proprement) ---------- */
function answerFor(p) {
  const k = p.kind, o = p.payload || {};
  if (o.options && o.options.length) {
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
  // ⚠️ NODES est déclaré en `const` dans index.html : il n'est PAS une propriété du bac à sable
  // (contrairement aux `function`). Il faut le lire dans le contexte, sinon toute la logique de
  // colonisation échoue en silence et le joueur simulé ne fait QUE passer son tour.
  const NODES = _ctx(sb, 'NODES') || {};
  const maxAff = _ctx(sb, 'maxAffordableTokens');
  const payable = (typeof maxAff === 'function') ? maxAff(me) : 0;
  const engage = Math.min(me.forceTokens || 0, payable);

  // 1) ATTAQUER une colonie ennemie dès qu'on peut engager 2 jetons (le minimum payable en début
  //    de partie) — sinon aucune guerre n'a jamais lieu et les fenêtres de combat ne sont pas testées.
  if (engage >= 2 && (me.acLeft || 0) >= 1) {
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
        const _cc = _ctx(sb, 'colonizeCost');
        const cout = (typeof _cc === 'function') ? _cc(me) : { ac: 1, mat: 2, en: 1 };
        if ((me.acLeft || 0) >= cout.ac && (me.res.materials || 0) >= cout.mat && (me.res.energy || 0) >= cout.en)
          return { type: 'colonize', node: adj };
      }
    }
  } catch (e) {}
  return { type: 'pass' };
}

/* ---------- déroulé de LA partie ---------- */
const d = new GameDriver(HTML);
d.onLog = (entries) => { for (const e of entries) line('   📜 ' + plain((e && e.msg) || e)); };

function dumpTurn(G) { return 'Tour ' + (G.turn || '?') + ' · phase ' + (G.phase || '?'); }

const toursJoues = {};   // civId -> nombre de fois où la main lui est revenue
HUMANS.forEach(c => { toursJoues[c] = 0; });

d.boot(SEATS, (p) => {
  seenKinds.add(p.kind);
  // Deux fenêtres en vol pour le MÊME joueur = le client doit les mettre en file,
  // sans quoi la seconde écrase la première et disparaît (bug de la victoire post-Dyson).
  const who = nationIdOf(p);
  for (const [, v] of enVol) {
    if (v.who && who && v.who === who)
      line('   ⚠️  deux fenêtres en vol pour ' + whoLabel(who) + ' (« ' + v.kind + ' » puis « ' + p.kind + ' ») — la file d\'attente du client est indispensable ici');
  }
  if (p.id) enVol.set(p.id, { kind: p.kind, who });
  distribuer(p);
});

let r = d.pump();
let guard = 0;
while (guard++ < 4000) {
  const G = d.state();
  if (!r) { problems.push('pump() n\'a rien renvoyé — état indéterminé'); break; }

  if (r.kind === 'decision') {
    const p = r.pending;
    const who = nationIdOf(p);
    step++;
    head('#' + step + ' · ' + dumpTurn(G) + ' · FENÊTRE « ' + p.kind + ' » → ' + whoLabel(who));
    if (!who) problems.push('décision ' + p.kind + ' sans destinataire (risque de blocage)');
    // Qui la reçoit RÉELLEMENT (distribution serveur rejouée) — c'est ici qu'on voit une fenêtre
    // qui partirait chez le mauvais joueur.
    const recus = HUMANS.filter(c => INBOX[c].some(m => m.id === p.id));
    if (recus.length) line('   📬 reçue par : ' + recus.map(whoLabel).join(' · ')
      + (COLLECTIVES.includes(p.kind) ? '  (fenêtre collective)' : ''));
    for (const c of recus) {
      if (!COLLECTIVES.includes(p.kind) && c !== who)
        problems.push('fenêtre « ' + p.kind + ' » destinée à ' + whoLabel(who) + ' mais reçue AUSSI par ' + whoLabel(c));
    }
    if (COLLECTIVES.includes(p.kind)) {
      const manquants = HUMANS.filter(c => !recus.includes(c));
      if (manquants.length) problems.push('fenêtre collective « ' + p.kind + ' » NON reçue par : ' + manquants.map(whoLabel).join(', '));
    }
    // Bilan de fin de tour : on RELIT le contenu réel reçu par CHAQUE joueur.
    if (p.kind === 'eot') {
      for (const c of recus) {
        const msg = INBOX[c].find(m => m.id === p.id);
        const corps = (msg && msg.own) || '';
        line('   ┌─ bilan de ' + whoLabel(c));
        for (const l of htmlToText(corps).split('\n')) line('   │ ' + l);
        for (const sec of ['Actions ce tour', 'Entretien', 'Revenus'])
          if (corps.indexOf(sec) === -1) problems.push('bilan de ' + whoLabel(c) + ' : section « ' + sec + ' » manquante');
      }
    }
    const ans = answerFor(p);
    line('   ↳ réponse : ' + JSON.stringify(ans));
    enVol.delete(p.id);
    try { r = d.answer(p.id, ans); }
    catch (e) { problems.push('réponse à ' + p.kind + ' → exception : ' + e.message); break; }
    continue;
  }

  if (r.kind === 'action') {
    step++;
    if (toursJoues[r.civId] !== undefined) toursJoues[r.civId]++;
    head('#' + step + ' · ' + dumpTurn(G) + ' · À ' + whoLabel(r.civId) + ' DE JOUER');
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

// Aucun joueur ne doit être privé de tour (famine = un siège que la rotation saute).
for (const c of HUMANS) if (!toursJoues[c]) problems.push(whoLabel(c) + ' n\'a JAMAIS eu la main de toute la partie');

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
// Le client DOIT savoir empiler les fenêtres : sans file d'attente, toute fenêtre arrivant
// pendant qu'une autre attend une réponse est perdue (bug vécu par Marc sur la Sphère de Dyson).
if (!/STATE\._queue/.test(online)) problems.push('online.js : pas de file d\'attente des fenêtres — une fenêtre arrivant pendant une autre serait PERDUE');

/* ---------- sortie ---------- */
console.log(T.join('\n'));
console.log('\n' + '='.repeat(72));
console.log('RÉSUMÉ — ' + step + ' étapes · ' + openedWindows.length + ' fenêtres ouvertes · tour final ' + G.turn);
console.log('table : ' + SEATS.map(s => s.civId + (s.isAI ? ' [IA]' : ' [humain]')).join(' · '));
console.log('tours joués : ' + HUMANS.map(c => whoLabel(c) + ' = ' + toursJoues[c]).join(' · '));
console.log('fenêtres reçues : ' + HUMANS.map(c => whoLabel(c) + ' = ' + INBOX[c].length).join(' · '));
console.log('types de décisions rencontrés : ' + [...seenKinds].sort().join(', '));
if (problems.length) {
  console.log('\n⚠️  ' + problems.length + ' PROBLÈME(S) À CORRIGER :');
  problems.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + p));
  process.exitCode = 1;
} else {
  console.log('\n✅ Aucun problème automatique détecté. RELIRE quand même la transcription ci-dessus :');
  console.log('   textes des fenêtres, ordre des étapes, fenêtre manquante après une conquête ou un raid.');
}
