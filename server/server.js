/* Solar Conquest — serveur multijoueur autoritaire (tâche A du chantier).
   Node + WebSocket (ws) autour du GameDriver prouvé (server/driver.js).
   - L'état vit ici ; les clients envoient des INTENTIONS (act / answer), le serveur valide et pousse.
   - Comptes simples : fichier JSON + scrypt (zéro dépendance BDD pour la v1 ; schéma SQL prêt pour plus tard).
   - 1 partie = 1 GameDriver (contexte moteur isolé). Décisions routées vers le bon joueur.
   - Repli IA : si un joueur est déconnecté (ou AFK trop longtemps), l'IA joue à sa place.
   - Snapshots d'état sur disque après chaque avancée (data/games/<code>.json) — reprise après redémarrage : TODO v2.
   Usage : node server.js   (PORT, GAME_HTML, DATA_DIR, AFK_MS surchargeables par variables d'env)
*/
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { GameDriver } = require('./driver.js');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HTML = process.env.GAME_HTML || path.join(__dirname, '..', 'index.html');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const AFK_MS = parseInt(process.env.AFK_MS || '120000', 10); // 2 min puis l'IA joue à ta place (0 = jamais)
fs.mkdirSync(path.join(DATA, 'games'), { recursive: true });

const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

/* ============ sérialisation sûre ============
   - Set/Map → __set/__map (même convention que le solo, reviver scDeserialize côté client) ;
   - CYCLES coupés (ex. vues de guerre `_enemy` qui se référencent mutuellement) : seule la
     référence circulaire est omise, les objets partagés légitimes sont conservés
     (rehydrateState + refreshWarViews recréent les liens côté client). */
function safeEncode(root) {
  const stack = [];
  function enc(v) {
    if (v instanceof Set) return { __set: [...v].map(enc) };
    if (v instanceof Map) return { __map: [...v].map(([k, val]) => [enc(k), enc(val)]) };
    if (v === null || typeof v !== 'object') return (typeof v === 'function' || v === undefined) ? undefined : v;
    if (stack.indexOf(v) !== -1) return undefined; // cycle → on coupe ici
    stack.push(v);
    let out;
    if (Array.isArray(v)) out = v.map(enc);
    else { out = {}; for (const k in v) { const e = enc(v[k]); if (e !== undefined) out[k] = e; } }
    stack.pop();
    return out;
  }
  return enc(root);
}
function J(obj) { return JSON.stringify(safeEncode(obj)); }

/* ============ comptes (fichier JSON + scrypt, pas de mot de passe en clair) ============ */
/* ─────────────── EMAIL + ARCHIVES DE PARTIES ───────────────
   Email : nodemailer SI les variables SMTP_* sont fournies (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
   MAIL_FROM). Sinon on n'échoue PAS : tout message est écrit dans data/outbox.log et reste visible dans
   /stats → aucune information perdue, et l'envoi démarre dès que les identifiants sont configurés. */
const ADMIN_MAIL = process.env.ADMIN_MAIL || 'marc@guerir.ch';
const OUTBOX = path.join(DATA, 'outbox.log');
let _transport = null;
try {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: String(process.env.SMTP_SECURE || '') === '1',
      auth: (process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined)
    });
  }
} catch (e) { console.error('nodemailer indisponible (emails journalisés seulement):', e.message); }
function frDate(ts) { // date + heure au format FRANÇAIS (jj/mm/aaaa hh:mm)
  try { return new Date(ts).toLocaleString('fr-FR', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return new Date(ts).toISOString(); }
}
function sendMail(to, subject, text) {
  const line = '\n===== ' + frDate(Date.now()) + ' — À: ' + to + ' — ' + subject + ' =====\n' + text + '\n';
  try { fs.appendFileSync(OUTBOX, line); } catch (e) {}
  if (!_transport) return;
  _transport.sendMail({ from: process.env.MAIL_FROM || 'Solar <contact@solar-game.com>', to, subject, text })
    .catch(e => console.error('sendMail:', e.message));
}
// Archives : 10 dernières parties PAR JOUEUR (scores + journal complet + bugs signalés).
const ARCH_DIR = path.join(DATA, 'archives');
fs.mkdirSync(ARCH_DIR, { recursive: true });
function archFile(user) { return path.join(ARCH_DIR, encodeURIComponent(String(user)) + '.json'); }
function readArch(user) { try { return JSON.parse(fs.readFileSync(archFile(user), 'utf8')); } catch (e) { return []; } }
function writeArch(user, list) {
  try { fs.writeFileSync(archFile(user), JSON.stringify(list.slice(0, 10), null, 1)); } // 10 parties max, plus récente en tête
  catch (e) { console.error('writeArch:', e.message); }
}
function archiveGame(g) {
  let scores = [], journal = [], turn = null;
  try {
    const sb = g.driver.sb, G = g.driver.state();
    turn = G.turn;
    scores = [G.player, ...G.ais].map(p => ({ civId: p.civ.id, name: p.civ.name, vp: sb.calcVP(p).total }))
      .sort((a, b) => b.vp - a.vp);
    journal = (G.log || []).slice(0, 400).map(l => plainText((l && l.msg) || l)).reverse();
  } catch (e) {}
  const endedAt = Date.now();
  const humans = g.seats.filter(s => !s.ai && s.user);
  const entry = {
    code: g.code, endedAt, dateFr: frDate(endedAt), turn,
    joueurs: g.seats.map(s => ({ civ: s.civId, ai: !!s.ai, user: s.user || null })),
    scores, journal, bugs: (g._bugs || [])
  };
  const tableau = scores.map((s, i) => '  ' + (i + 1) + '. ' + s.name + ' — ' + s.vp + ' VP').join('\n');
  for (const s of humans) {
    const list = readArch(s.user); list.unshift(entry); writeArch(s.user, list);
    sendMail(s.user, 'Solar — fin de partie ' + g.code + ' (' + entry.dateFr + ')',
      'Partie ' + g.code + ' terminée le ' + entry.dateFr + '.\n\nSCORES :\n' + tableau + '\n\nMerci d\'avoir joué !');
  }
  sendMail(ADMIN_MAIL, 'Solar — partie terminée ' + g.code,
    'Partie ' + g.code + ' — ' + entry.dateFr + '\nJoueurs : ' + entry.joueurs.map(j => j.civ + (j.user ? ('=' + j.user) : '(IA)')).join(', ') + '\n\nSCORES :\n' + tableau);
  return entry;
}
const USERS_FILE = path.join(DATA, 'users.json');
let users = {};
try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) {}
function saveUsers() { try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 1)); } catch (e) { console.error('saveUsers:', e.message); } }
function hashPass(pass, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pass), salt, 32).toString('hex');
}
function checkPass(pass, stored) {
  try {
    const salt = stored.split(':')[0];
    const a = Buffer.from(hashPass(pass, salt)), b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
const tokens = new Map(); // token -> username (sessions en mémoire ; re-login après redémarrage serveur)

/* ============ parties ============ */
const games = new Map(); // code -> game
function newCode() { let c; do { c = crypto.randomBytes(2).toString('hex').toUpperCase(); } while (games.has(c)); return c; }

function gameView(g) { // ce que le lobby a le droit de voir
  return {
    code: g.code, status: g.status, host: g.host,
    seats: g.seats.map(s => ({ civId: s.civId, ai: s.ai, user: s.user || null, connected: !!(s.ws && s.ws.readyState === 1) }))
  };
}
function seatOf(g, wsOrUser) {
  return g.seats.find(s => s.ws === wsOrUser) || g.seats.find(s => s.user === wsOrUser) || null;
}
function sendTo(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(J(obj)); } catch (e) {} } }
function sendToCiv(g, civId, obj) { const s = g.seats.find(x => x.civId === civId); if (s) sendTo(s.ws, obj); }
function broadcast(g, obj) { for (const s of g.seats) sendTo(s.ws, obj); }

function snapshot(g) {
  if (!g.driver) return;
  try {
    fs.writeFileSync(path.join(DATA, 'games', g.code + '.json'), J(g.driver.state()));
  } catch (e) { console.error('snapshot', g.code, ':', e.message); }
}

/* Réponse automatique de secours à une décision (même heuristique validée en test :
   première option proposée). Utilisée seulement si le joueur est déconnecté/AFK. */
function autoAnswer(pending) {
  const pay = (pending && pending.payload) || {};
  for (const k of Object.keys(pay)) {
    const v = pay[k];
    if (Array.isArray(v) && v.length) {
      const o = v[0];
      const id = (o && o.id !== undefined) ? o.id : 0;
      return { choice: id, index: 0, [k.replace(/s$/, '')]: id };
    }
  }
  return {};
}

// Les ressources du jeu sont des BALISES <i class=ri-...> : les supprimer bêtement effaçait le butin
// (« Raid ! + » / « Commerce avec les pirates : → + » sans rien). On les convertit en emoji AVANT de nettoyer.
function plainText(s) {
  return String(s == null ? '' : s)
    .replace(/<i\s+class=["']?ri-energy["']?\s*><\/i>/gi, '⚡')
    .replace(/<i\s+class=["']?ri-materials["']?\s*><\/i>/gi, '🪨')
    .replace(/<i\s+class=["']?ri-science["']?\s*><\/i>/gi, '🔬')
    .replace(/<i\s+class=["']?ri-morale["']?\s*><\/i>/gi, '🙂')
    .replace(/<[^>]+>/g, '')
    .trim();
}
function clearTimer(g) { if (g.timer) { clearTimeout(g.timer); g.timer = null; } }
const RECONNECT_GRACE_MS = parseInt(process.env.RECONNECT_GRACE_MS || '30000', 10);
function armTimer(g, civId, fn) {
  clearTimer(g);
  const s = g.seats.find(x => x.civId === civId);
  const connected = !!(s && s.ws && s.ws.readyState === 1);
  g.timerFn = fn; g.timerCiv = civId; // mémorisé pour ré-armer à la reconnexion
  if (!connected) { // déconnecté : on laisse 30 s pour se reconnecter avant que l'IA reprenne
    broadcast(g, { t: 'notice', kind: 'info', payload: { msg: civId + ' est déconnecté — l\'IA jouera pour lui dans ' + Math.round(RECONNECT_GRACE_MS / 1000) + ' s s\'il ne revient pas.' } });
    g.timer = setTimeout(fn, RECONNECT_GRACE_MS);
    return;
  }
  // CONNECTÉ = on NE joue JAMAIS à sa place (bugs #2/#13 : le jeu choisissait l'agenda / jouait une action
  // alors que le joueur réfléchissait). Il prend tout son temps. L'auto-jeu ne sert QU'à un joueur déconnecté.
}

/* Le cœur : appliquer le résultat de pump() → router vers les clients. */
function route(g, r) {
  clearTimer(g);
  snapshot(g);
  g.lastRoute = r;
  if (!r) return;
  if (r.kind === 'decision') {
    const p = r.pending;
    const civ = (typeof p.nation === 'object' && p.nation) ? (p.nation.civ && p.nation.civ.id) : p.nation;
    g.lastRoute = { kind: 'decision', civId: civ, pending: { id: p.id, kind: p.kind, nation: civ, payload: p.payload } };
    sendToCiv(g, civ, { t: 'decision', pending: g.lastRoute.pending });
    broadcast(g, { t: 'waiting', civId: civ, kind: p.kind });
    armTimer(g, civ, () => { try { route(g, g.driver.answer(p.id, autoAnswer(p))); } catch (e) { console.error('auto-answer:', e.message); } });
    return;
  }
  if (r.kind === 'action') {
    sendToCiv(g, r.civId, { t: 'your_action', civId: r.civId });
    broadcast(g, { t: 'turn', civId: r.civId, turn: g.driver.state().turn });
    armTimer(g, r.civId, () => { try { route(g, g.driver.actAuto(r.civId)); } catch (e) { console.error('auto-act:', e.message); } });
    return;
  }
  if (r.kind === 'over') {
    g.status = 'over';
    let scores = [];
    try {
      const sb = g.driver.sb, G = g.driver.state();
      scores = [G.player, ...G.ais].map(p => ({ civId: p.civ.id, name: p.civ.name, vp: sb.calcVP(p).total }))
        .sort((a, b) => b.vp - a.vp);
    } catch (e) {}
    // ARCHIVE de fin de partie : scores par nation + journal complet + bugs → 10 dernières parties par joueur,
    // + email des scores à chaque joueur humain et à l'admin. Visible ensuite dans /stats.
    let _entry = null;
    try { if (!g._archived) { _entry = archiveGame(g); g._archived = true; } } catch (e) { console.error('archiveGame:', e.message); }
    broadcast(g, { t: 'over', scores, dateFr: _entry ? _entry.dateFr : frDate(Date.now()), code: g.code });
    snapshot(g);
    return;
  }
  // 'idle' / 'guard' : le moteur n'a rien rendu à distribuer → anti-gel : on retente une fois peu après.
  console.error('route', g.code, ': état', r.kind, '(anti-gel armé)');
  if (!g._idleRetry) {
    g._idleRetry = setTimeout(() => {
      g._idleRetry = null;
      try { route(g, g.driver.pump()); } catch (e) { console.error('anti-gel', g.code, ':', e.message); }
    }, 1200);
  }
}
/* Reprise sûre après une exception du moteur : on repompe pour re-dispatcher le jeu. */
function recover(g, tag, e) {
  console.error(tag, g.code, ':', e.message.split('\n')[0]);
  try { route(g, g.driver.pump()); } catch (e2) { console.error(tag, 'recover KO:', e2.message.split('\n')[0]); }
}

/* ============ HTTP (health) + WebSocket ============ */
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"games":' + games.size + '}'); return; }
  if (req.url && req.url.indexOf('/bot') === 0) { // inviter le bot « Claude » : /bot?code=XXXX[&civ=martiens]
    let code = '', civId;
    let fast = false;
    try { const u = new URL(req.url, 'http://x'); code = (u.searchParams.get('code') || '').toUpperCase(); civId = u.searchParams.get('civ') || undefined; fast = u.searchParams.get('fast') === '1'; } catch (e) {}
    const g = games.get(code);
    res.writeHead(g ? 200 : 404, { 'Content-Type': 'application/json' });
    if (!g) { res.end('{"ok":false,"msg":"partie introuvable (code ?)"}'); return; }
    try {
      const user = require('./bot.js').spawnBot(PORT, code, { civId, fast });
      res.end(JSON.stringify({ ok: true, user, msg: 'Le bot rejoint la partie ' + code + ' (il prend un siège humain libre).' }));
    } catch (e) { res.end(JSON.stringify({ ok: false, msg: e.message })); }
    return;
  }
  if (req.url === '/stats' || req.url.indexOf('/stats?') === 0) {
    // STATS : 10 dernières parties PAR JOUEUR — date/heure FR, scores par nation, bugs signalés, journal complet.
    // Texte brut → sélectionnable/copiable pour me l'envoyer.
    const out = [];
    out.push('SOLAR — STATISTIQUES  (généré le ' + frDate(Date.now()) + ')');
    out.push('Joueurs inscrits : ' + Object.keys(users).length);
    for (const u of Object.keys(users)) out.push('  · ' + u + ' — inscrit le ' + frDate(users[u].created || Date.now()));
    let files = []; try { files = fs.readdirSync(ARCH_DIR).filter(f => f.endsWith('.json')); } catch (e) {}
    for (const f of files) {
      const user = decodeURIComponent(f.replace(/\.json$/, ''));
      const list = readArch(user);
      out.push('\n' + '='.repeat(70) + '\nJOUEUR : ' + user + '  (' + list.length + ' partie(s) conservée(s), 10 max)');
      list.forEach((e, i) => {
        out.push('\n--- Partie ' + (i + 1) + ' — code ' + e.code + ' — terminée le ' + e.dateFr + (e.turn ? (' — tour ' + e.turn) : '') + ' ---');
        if (e.joueurs) out.push('Nations : ' + e.joueurs.map(j => j.civ + (j.user ? ('=' + j.user) : ' (IA)')).join(', '));
        out.push('SCORES :');
        (e.scores || []).forEach((s, k) => out.push('   ' + (k + 1) + '. ' + s.name + ' — ' + s.vp + ' VP'));
        if (e.bugs && e.bugs.length) {
          out.push('🐞 BUGS SIGNALÉS (' + e.bugs.length + ') :');
          e.bugs.forEach(b => out.push('   [' + b.dateFr + '] ' + b.user + ' : ' + b.text));
        }
        out.push('JOURNAL COMPLET (' + (e.journal || []).length + ' lignes) :');
        (e.journal || []).forEach(l => out.push('   ' + l));
      });
    }
    let ob = ''; try { ob = fs.readFileSync(OUTBOX, 'utf8').slice(-4000); } catch (e) {}
    if (ob) out.push('\n' + '='.repeat(70) + '\nDERNIERS EMAILS (journalisés' + (_transport ? ' ET envoyés' : ' — SMTP non configuré, non envoyés') + ') :\n' + ob);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(out.join('\n'));
    return;
  }
  if (req.url === '/debug') { // diagnostic de rodage (pas de secrets : codes + avancement)
    const out = [];
    for (const g of games.values()) {
      let turn = null, pend = null;
      try { turn = g.driver ? g.driver.state().turn : null; const p = g.driver && g.driver.state()._pending; if (p) pend = p.kind + '/' + ((typeof p.nation === 'object' && p.nation) ? p.nation.civ.id : p.nation); } catch (e) {}
      let nations = [], journal = [], wars = [], phase = null, warTrace = [];
      try {
        const G = g.driver.state();
        phase = G.phase + (G._serverActionPhase ? '/actions' : '');
        nations = [G.player].concat(G.ais || []).map(p => ({ civ: p.civ.id, ai: !!p._isAI, AC: p.acLeft + '/' + p.acMax,
          jetons: p.forceTokens, recup: (p.forceCooldown || []).reduce((s, c) => s + (c.count || 0), 0),
          res: (p.res.energy||0)+'⚡ '+(p.res.materials||0)+'🪨 '+(p.res.science||0)+'🔬 '+(p.res.morale||0)+'🙂',
          // colonies détaillées : nœud + niveau + (✗ si déconnectée) + (⚑n si récemment conquise)
          colonies: (p.colonies || []).map(c => c.nodeId + 'Nv' + (c.level||1) + (c.connected === false ? '✗' : '') + (c._conquest ? '⚑' + c._conquest : '')),
          routes: (p.routes || []).map(r => r.from + '→' + r.to + ((r.tokens||0) ? '[' + r.tokens + ']' : '')),
          cartes: (p.cards || []).length }));
        // état des guerres : qui, cible de reconquête IA, tours restants, agresseur
        wars = (G.wars || []).map(w => ({ entre: (w.a || '?') + '↔' + (w.b || w.aiId || '?'), aiId: w.aiId,
          reconqCible: w.aiRecaptureTarget || null, toursRestants: w.turnsLeft, live: !!w.live, wins: w.wins, agresseurIA: !!w.aiAggressor, aFrappeCeTour: !!w._aiAssaultedThisTurn }));
        // journal COMPLET (jusqu'à 200 lignes), remis dans l'ordre chronologique
        journal = (G.log || []).slice(0, 200).map(l => plainText((l && l.msg) || l).slice(0, 180)).reverse();
        // trace de guerre dédiée (capture/reprise/combat/défense) — sous-ensemble du journal filtré
        warTrace = journal.filter(l => /captur|reprend|assaut|combat|défense|defense|guerre|paix|pill|raid|jeton/i.test(l));
      } catch (e) {}
      out.push({ code: g.code, status: g.status, turn, phase, lastRoute: g.lastRoute ? (g.lastRoute.kind + '/' + (g.lastRoute.civId || '')) : null, pending: pend,
                 seats: g.seats.map(s => ({ civ: s.civId, ai: s.ai, user: s.user, on: !!(s.ws && s.ws.readyState === 1) })),
                 nations, wars, warTrace, journal });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); return;
  }
  res.writeHead(404); res.end('Solar Conquest server — WebSocket only. GET /health');
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const sess = { user: null, game: null };

  const err = (msg, extra) => sendTo(ws, Object.assign({ t: 'error', msg }, extra || {}));
  const requireAuth = () => { if (!sess.user) { err('non connecté (login d\'abord)'); return false; } return true; };
  const requireGame = () => { if (!sess.game || !games.has(sess.game)) { err('pas de partie en cours'); return false; } return true; };

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return err('JSON invalide'); }
    try {
      switch (m.t) {

        case 'register': {
          const u = String(m.user || '').trim().toLowerCase();
          // L'identifiant est désormais une ADRESSE EMAIL (sert aussi à envoyer les scores de fin de partie).
          if (!/^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(u)) return err('adresse email invalide (ex. prenom@domaine.ch)');
          if (!m.pass || String(m.pass).length < 6) return err('mot de passe trop court (min. 6)');
          if (users[u]) return err('cette adresse email est déjà inscrite');
          users[u] = { pass: hashPass(m.pass), created: Date.now(), tier: 1 }; // tier = niveau d'abonnement (1 gratuit)
          saveUsers();
          sendMail(ADMIN_MAIL, 'Solar — nouvelle inscription : ' + u,
            'Nouveau joueur inscrit le ' + frDate(Date.now()) + '\nEmail : ' + u + '\nTotal joueurs : ' + Object.keys(users).length);
          sendTo(ws, { t: 'registered', user: u });
          break;
        }

        case 'bug_report': { // {t:'bug_report', text} — signalé depuis l'écran de fin de partie
          const txt = String(m.text || '').slice(0, 4000).trim();
          if (!txt) return err('rapport vide');
          const who = sess.user || 'anonyme';
          const g = (sess.game && games.get(sess.game)) || null;
          const rec = { at: Date.now(), dateFr: frDate(Date.now()), user: who, text: txt };
          if (g) { g._bugs = (g._bugs || []); g._bugs.push(rec); }
          // Rattacher aussi à la partie DÉJÀ archivée du joueur (la plus récente), pour le retrouver dans /stats.
          try {
            const list = readArch(who);
            if (list.length) { list[0].bugs = (list[0].bugs || []).concat([rec]); writeArch(who, list); }
            else writeArch(who, [{ code: g ? g.code : '—', endedAt: rec.at, dateFr: rec.dateFr, scores: [], journal: [], bugs: [rec] }]);
          } catch (e) {}
          sendMail(ADMIN_MAIL, '🐞 Solar Conquest — BUG signalé par ' + who,
            'Le ' + rec.dateFr + '\nJoueur : ' + who + '\nPartie : ' + (g ? g.code : '—') + '\n\n--- Message ---\n' + txt);
          sendTo(ws, { t: 'notice', kind: 'info', payload: { msg: 'Merci ! Ton signalement a été transmis.' } });
          break;
        }

        case 'login': {
          const u = String(m.user || '').trim().toLowerCase();
          if (!users[u] || !checkPass(m.pass, users[u].pass)) return err('identifiants incorrects');
          const token = crypto.randomBytes(24).toString('hex');
          tokens.set(token, u);
          sess.user = u;
          sendTo(ws, { t: 'logged', user: u, token, tier: users[u].tier || 1 });
          break;
        }

        case 'token': { // reconnexion rapide avec un token encore valide
          const u = tokens.get(m.token);
          if (!u) return err('token inconnu ou expiré');
          sess.user = u;
          sendTo(ws, { t: 'logged', user: u, token: m.token, tier: users[u].tier || 1 });
          break;
        }

        case 'create': { // {t:'create', civId, seats:[{civId,ai}...]} — l'hôte prend civId, le reste = sièges
          if (!requireAuth()) break;
          const civId = m.civId || 'terriens';
          if (!CIVS.includes(civId)) return err('civilisation inconnue: ' + civId);
          const others = Array.isArray(m.seats) ? m.seats : CIVS.filter(c => c !== civId).slice(0, 1).map(c => ({ civId: c, ai: true }));
          const seats = [{ civId, ai: false, user: sess.user, ws }];
          for (const s of others) {
            if (!CIVS.includes(s.civId) || seats.some(x => x.civId === s.civId)) return err('sièges invalides');
            seats.push({ civId: s.civId, ai: !!s.ai, user: null, ws: null });
          }
          if (seats.length < 2 || seats.length > 4) return err('2 à 4 sièges requis');
          const g = { code: newCode(), host: sess.user, seats, status: 'lobby', driver: null, timer: null, lastRoute: null };
          games.set(g.code, g);
          sess.game = g.code;
          sendTo(ws, { t: 'game', game: gameView(g) });
          break;
        }

        case 'join': { // {t:'join', code, civId?} — prend un siège humain libre
          if (!requireAuth()) break;
          const g = games.get(String(m.code || '').toUpperCase());
          if (!g) return err('partie introuvable');
          // reconnexion : déjà un siège à ce nom ?
          let s = g.seats.find(x => x.user === sess.user);
          if (!s) {
            if (g.status !== 'lobby') return err('partie déjà commencée');
            const free = g.seats.filter(x => !x.ai && !x.user);
            s = m.civId ? free.find(x => x.civId === m.civId) : free[0];
            if (!s) return err('aucun siège libre' + (m.civId ? ' pour ' + m.civId : ''));
            s.user = sess.user;
          }
          s.ws = ws;
          sess.game = g.code;
          broadcast(g, { t: 'game', game: gameView(g) });
          // si la partie tourne, remettre le joueur dans le bain
          if (g.status === 'playing' && g.lastRoute) {
            if (g.lastRoute.kind === 'decision' && g.lastRoute.civId === s.civId) sendTo(ws, { t: 'decision', pending: g.lastRoute.pending });
            if (g.lastRoute.kind === 'action' && g.lastRoute.civId === s.civId) sendTo(ws, { t: 'your_action', civId: s.civId });
            // il est revenu : annuler le compte à rebours « déconnecté » et repartir sur le délai anti-AFK normal
            if (g.timerCiv === s.civId && g.timerFn) armTimer(g, s.civId, g.timerFn);
          }
          break;
        }

        case 'start': {
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          if (g.host !== sess.user) return err('seul l\'hôte peut démarrer');
          if (g.status !== 'lobby') return err('déjà démarrée');
          const empty = g.seats.filter(s => !s.ai && !s.user);
          if (empty.length) return err('sièges humains vides: ' + empty.map(s => s.civId).join(','));
          g.driver = new GameDriver(HTML);
          g.driver.onLog = entries => broadcast(g, { t: 'log', entries });
          g.status = 'playing';
          broadcast(g, { t: 'started', game: gameView(g) });
          // Décisions humaines : récupérées via pump(). Notices (résultats de combat/événement/fin de tour) :
          // le pump les acquitte automatiquement, mais on les DIFFUSE ici pour que les joueurs les voient.
          g.driver.boot(g.seats.map(s => ({ civId: s.civId, isAI: s.ai })), (p) => {
            try {
              if (p && (p.notice || ['war_result', 'event_result', 'event_announce', 'eot'].includes(p.kind))) {
                broadcast(g, { t: 'notice', kind: p.kind, payload: p.payload });
              }
            } catch (e) {}
          });
          route(g, g.driver.pump());
          break;
        }

        case 'answer': { // {t:'answer', id, ans}
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          const p = g.driver.state()._pending;
          if (!p || p.id !== m.id) return err('décision périmée', { id: m.id });
          const civ = (typeof p.nation === 'object' && p.nation) ? (p.nation.civ && p.nation.civ.id) : p.nation;
          if (civ !== s.civId) return err('cette décision n\'est pas pour toi');
          try { route(g, g.driver.answer(m.id, m.ans || {})); }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'answer', e); }
          break;
        }

        case 'act': { // {t:'act', action:{type:...}} — 'pass' pour passer
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          try {
            const rr = g.driver.act(s.civId, m.action || { type: 'pass' });
            const act = m.action || {};
            if (act.type && act.type !== 'pass') {
              const lines = (g.driver._lastActionLog || []).map(x => plainText(x)).filter(Boolean);
              const warn = lines.filter(x => /⚠️|pas assez|impossible|déjà|non adjacent|invalide|refuse/i.test(x));
              if (warn.length) sendTo(ws, { t: 'notice', kind: 'info', payload: { msg: warn[0] } });
              else if (lines.length) sendTo(ws, { t: 'notice', kind: 'result', payload: { lines: lines.slice(-4) } });
            }
            if (rr && rr.kind === 'confirm') {
              // Action ANNULABLE réussie : le serveur la TIENT. Le client montre Valider/Annuler.
              snapshot(g);
              g.lastRoute = { kind: 'confirm', civId: s.civId };
              sendTo(ws, { t: 'confirm_pending', civId: s.civId });   // le client redemandera l'état (reqState)
              // Sécurité : pas de réponse / déconnexion → auto-Valider (le jeu n'attend pas indéfiniment).
              clearTimer(g);
              g.timer = setTimeout(() => { try { route(g, g.driver.commit(s.civId)); } catch (e) {} }, AFK_MS > 0 ? AFK_MS : 120000);
            } else {
              route(g, rr);
            }
          }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'act', e); }
          break;
        }

        case 'auto': { // le joueur demande à l'IA de jouer son tour d'action
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          try { route(g, g.driver.actAuto(s.civId)); }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'auto', e); }
          break;
        }

        case 'confirm': { // Valider une action tenue (annulable)
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          try { route(g, g.driver.commit(s.civId)); }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'confirm', e); }
          break;
        }

        case 'undo': { // Annuler une action tenue → restaure l'état d'avant (découvertes figées)
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          try { route(g, g.driver.undo(s.civId)); }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'undo', e); }
          break;
        }

        case 'resync': { // le client se sent perdu → on lui renvoie où en est la partie
          if (!requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          if (g.lastRoute && g.lastRoute.kind === 'decision' && g.lastRoute.civId === s.civId) sendTo(ws, { t: 'decision', pending: g.lastRoute.pending });
          else if (g.lastRoute && g.lastRoute.kind === 'action' && g.lastRoute.civId === s.civId) sendTo(ws, { t: 'your_action', civId: s.civId });
          else if (g.status === 'playing' && g.lastRoute) sendTo(ws, { t: g.lastRoute.kind === 'decision' ? 'waiting' : 'turn', civId: g.lastRoute.civId });
          break;
        }

        case 'state': { // état complet, FILTRÉ par joueur : les agendas adverses (secrets) sont masqués
          if (!requireGame()) break;
          const g = games.get(sess.game);
          if (!g.driver) return err('partie pas démarrée');
          const seat = seatOf(g, ws) || seatOf(g, sess.user);
          const enc = safeEncode(g.driver.state());
          if (seat && g.status !== 'over') {
            const hide = (nat) => {
              if (nat && nat.civ && nat.civ.id !== seat.civId && nat.agenda) {
                nat.agenda = { id: null, hidden: true, name: '🔒 Agenda secret', emoji: '🔒', desc: 'Révélé en fin de partie.' };
              }
            };
            hide(enc.player); (enc.ais || []).forEach(hide);
            enc.agendas = [enc.player].concat(enc.ais || []).map(p => p && p.agenda).filter(Boolean);
          }
          sendTo(ws, { t: 'state', state: enc });
          break;
        }

        case 'leave': { // quitter / abandonner la partie → libère tout le monde (fix #3 : plus de partie fantôme)
          if (!sess.game || !games.has(sess.game)) { sendTo(ws, { t: 'game_ended' }); break; }
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          const wasHost = g.host === sess.user;
          if (wasHost || g.status !== 'lobby') {
            // l'hôte quitte, ou partie en cours → on TERMINE la partie pour tout le monde.
            clearTimer(g);
            broadcast(g, { t: 'game_ended', by: sess.user });
            try { fs.unlinkSync(path.join(DATA, 'games', g.code + '.json')); } catch (e) {}
            games.delete(g.code);
          } else {
            // un invité quitte le lobby → on libère juste son siège.
            if (s) { s.user = null; s.ws = null; }
            broadcast(g, { t: 'game', game: gameView(g) });
            sendTo(ws, { t: 'game_ended' });
          }
          sess.game = null;
          break;
        }

        case 'game_info': { if (!requireGame()) break; sendTo(ws, { t: 'game', game: gameView(games.get(sess.game)) }); break; }
        case 'ping': sendTo(ws, { t: 'pong' }); break;
        default: err('message inconnu: ' + m.t);
      }
    } catch (e) {
      err(e.message.split('\n')[0]);
    }
  });

  ws.on('close', () => {
    if (sess.game && games.has(sess.game)) {
      const g = games.get(sess.game);
      const s = g.seats.find(x => x.ws === ws);
      if (s) s.ws = null;
      broadcast(g, { t: 'game', game: gameView(g) });
      // si c'était à lui de jouer, le timer de repli IA est déjà armé (armTimer re-évalue à la déconnexion suivante)
      if (g.status === 'playing' && g.lastRoute && g.lastRoute.civId === (s && s.civId)) {
        if (g.lastRoute.kind === 'decision') {
          const p = g.driver.state()._pending;
          if (p) armTimer(g, s.civId, () => { try { route(g, g.driver.answer(p.id, autoAnswer(p))); } catch (e) {} });
        } else if (g.lastRoute.kind === 'action') {
          armTimer(g, s.civId, () => { try { route(g, g.driver.actAuto(s.civId)); } catch (e) {} });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log('Solar Conquest server — port ' + PORT + ' — moteur: ' + HTML + ' — data: ' + DATA);
});
