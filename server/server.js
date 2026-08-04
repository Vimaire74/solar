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
/* VERSION DU PROTOCOLE parlé avec les clients. `PROTO_MAX` = ce que ce serveur sait faire ;
   `PROTO_MIN` = le plus ancien client encore accepté. Élargir la fenêtre plutôt que de casser :
   sur mobile, les joueurs mettent des semaines à mettre à jour. À incrémenter dès qu'un message
   change de forme (nouveau champ obligatoire, sens modifié, message retiré). */
const PROTO_MIN = 1, PROTO_MAX = 1;
const SERVER_BUILD = '2026-08-03 · v6.4';
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
let _smtpChargementErreur = null;   // ex. « nodemailer » absent : cause TRÈS différente d'une mauvaise config
/* CONFIGURATION SMTP — avec détection des erreurs classiques d'OVH.
   Le « 535 Authentication failed » vient presque toujours de l'une de ces trois causes :
     1. SMTP_USER n'est PAS l'adresse complète (OVH exige `prenom@domaine.ch`, pas `prenom`) ;
     2. le port et le chiffrement ne s'accordent pas (465 = SSL direct, 587 = STARTTLS) ;
     3. MAIL_FROM diffère de la boîte authentifiée → OVH refuse de relayer.
   On DÉDUIT donc `secure` du port quand il n'est pas précisé, on aligne MAIL_FROM par défaut sur
   SMTP_USER, et on signale les incohérences au démarrage plutôt que de laisser l'envoi échouer en
   silence des jours durant. */
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
/* Le chiffrement est IMPOSÉ par le port sur les deux ports standards (RFC 8314) : 465 = TLS implicite,
   587 = STARTTLS. Un désaccord n'est jamais un choix, c'est toujours une erreur de saisie — et il est
   parfois impossible à corriger dans l'interface (Coolify remet la valeur précédente quand on vide le
   champ, constaté par Marc). On aligne donc sur le port et on le DIT dans les logs, plutôt que de
   laisser une case rebelle empêcher tout envoi. SMTP_SECURE n'est respecté que sur un port exotique. */
const _secureDemande = (process.env.SMTP_SECURE === undefined || process.env.SMTP_SECURE === '')
  ? null : (String(process.env.SMTP_SECURE) === '1');
const SMTP_SECURE = (SMTP_PORT === 465) ? true
                  : (SMTP_PORT === 587) ? false
                  : (_secureDemande === null ? false : _secureDemande);
const _secureForce = (_secureDemande !== null && _secureDemande !== SMTP_SECURE);
const MAIL_FROM = process.env.MAIL_FROM || (process.env.SMTP_USER ? 'Solar <' + process.env.SMTP_USER + '>' : 'Solar <contact@solar-game.com>');
function _adresseDe(x) { const m = /<([^>]+)>/.exec(String(x || '')); return (m ? m[1] : String(x || '')).trim().toLowerCase(); }
/* Incohérences détectables SANS envoyer : ce sont elles qui produisent le 535 / le refus de relais. */
function smtpAvertissements() {
  const a = [];
  if (!process.env.SMTP_HOST) { a.push('SMTP_HOST absent — aucun envoi possible, tout est seulement journalisé.'); return a; }
  const u = String(process.env.SMTP_USER || '');
  if (!u) a.push('SMTP_USER absent — OVH exige une authentification.');
  else if (!isEmail(u)) a.push('SMTP_USER = « ' + u +' » n\'est PAS une adresse complète. OVH veut `prenom@domaine.ch` — c\'est LA cause n°1 du « 535 Authentication failed ».');
  if (!process.env.SMTP_PASS) a.push('SMTP_PASS absent.');
  if (_secureForce) a.push('SMTP_SECURE=' + process.env.SMTP_SECURE + ' est en désaccord avec le port ' + SMTP_PORT
    + ' → IGNORÉ, on applique le réglage imposé par le port (' + (SMTP_SECURE ? 'TLS implicite' : 'STARTTLS')
    + '). Tu peux laisser cette variable telle quelle, elle ne bloque plus rien.');
  if (SMTP_PORT !== 465 && SMTP_PORT !== 587) a.push('port ' + SMTP_PORT + ' inhabituel : chez OVH, utilise 465 (SSL) ou 587 (STARTTLS).');
  if (u && isEmail(u) && _adresseDe(MAIL_FROM) !== u.toLowerCase())
    a.push('MAIL_FROM (« ' + _adresseDe(MAIL_FROM) + ' ») diffère de la boîte authentifiée (« ' + u.toLowerCase() + ' ») — OVH refuse de relayer une adresse d\'expéditeur qui n\'est pas la sienne.');
  return a;
}
try {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      requireTLS: !SMTP_SECURE,               // 587 : exiger STARTTLS (jamais d'authentification en clair)
      auth: (process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined)
    });
  }
  for (const w of smtpAvertissements()) console.error('⚠️  SMTP : ' + w);
} catch (e) {
  _smtpChargementErreur = e.message;
  console.error('⚠️  SMTP : nodemailer indisponible (emails journalisés seulement) — ' + e.message);
}
function frDate(ts) { // date + heure au format FRANÇAIS (jj/mm/aaaa hh:mm)
  try { return new Date(ts).toLocaleString('fr-FR', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return new Date(ts).toISOString(); }
}
function isEmail(x) { return /^[^@\s]+@[^@\s.]+\.[a-z]{2,}$/i.test(String(x || '')); }
const _mailErrors = []; // dernières erreurs d'envoi, affichées dans /stats (diagnostic sans ouvrir les logs)
function noteMailError(msg) { _mailErrors.unshift(frDate(Date.now()) + ' — ' + msg); _mailErrors.splice(12); }
function sendMail(to, subject, text) {
  const line = '\n===== ' + frDate(Date.now()) + ' — À: ' + to + ' — ' + subject + ' =====\n' + text + '\n';
  try { fs.appendFileSync(OUTBOX, line); } catch (e) {}
  // Destinataire qui n'est PAS une adresse email (ancien compte créé avec un simple pseudo, avant que
  // l'email devienne obligatoire) → on n'essaie même pas : l'envoi échouerait silencieusement.
  if (!isEmail(to)) { noteMailError('NON ENVOYÉ à « ' + to + ' » : ce compte a un pseudo, pas une adresse email. Le joueur doit créer un compte avec son email.'); return; }
  if (!_transport) { noteMailError('NON ENVOYÉ à ' + to + ' : SMTP non configuré (variables SMTP_* absentes).'); return; }
  _transport.sendMail({ from: MAIL_FROM, to, subject, text })
    .then(() => {})
    .catch(e => { console.error('sendMail:', e.message); noteMailError('ÉCHEC vers ' + to + ' : ' + e.message); });
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
/* FENÊTRES COLLECTIVES — celles qui concernent TOUTE la table, pas une seule nation :
     · `eot`            : le bilan de fin de tour (chacun reçoit LE SIEN, voir payload.bodies) ;
     · `event_announce` / `event_result` : un événement frappe la partie entière.
   Le moteur ne sait désigner qu'UN destinataire (celui qui débloquera le flux en cliquant
   « Continuer »). Sans la diffusion ci-dessous, les AUTRES joueurs ne voyaient jamais ces
   fenêtres — défaut invisible tant que le banc d'essai ne simulait qu'un seul humain.
   `ownerCiv` reçoit déjà la fenêtre sous forme de décision : on ne la lui envoie pas deux fois. */
const FENETRES_COLLECTIVES = ['eot', 'event_announce', 'event_result'];
function sendWindowToAll(g, kind, payload, ownerCiv) {
  if (!payload) return;
  const bodies = payload.bodies || null;
  for (const s of g.seats) {
    if (s.ai || !s.ws) continue;
    if (ownerCiv && s.civId === ownerCiv) continue;
    if (kind === 'eot') {
      const html = (bodies && bodies[s.civId]) || payload.html || '';
      if (!html) continue;
      sendTo(s.ws, { t: 'notice', kind: 'eot', payload: { turn: payload.turn, html } });
    } else {
      sendTo(s.ws, { t: 'notice', kind, payload });
    }
  }
}

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
/* ASSAINISSEMENT DES RÉPONSES CLIENT (vague A du lot 16).
   Le serveur vérifiait déjà QUI répond (le siège doit être le destinataire de la décision), mais pas
   CE QU'IL répond. Un client modifié pouvait engager 999 jetons, désigner une cible absente de la
   liste proposée, ou renvoyer un type inattendu. Le moteur reste l'autorité finale (il replafonne),
   mais on refuse ici ce qui n'a aucun sens — défense en profondeur, indispensable avant d'ouvrir le
   multijoueur à des inconnus.
   Principe : on ne « devine » rien. Les nombres sont bornés, et toute valeur censée venir d'une
   LISTE proposée doit s'y trouver ; sinon on la retire plutôt que de l'inventer. */
function assainirReponse(g, pending, ans) {
  if (!ans || typeof ans !== 'object' || Array.isArray(ans)) return {};
  const out = {};
  const payload = pending.payload || {};
  const idsProposes = new Set();
  for (const liste of [payload.options, payload.cands, payload.cols, payload.routes]) {
    if (Array.isArray(liste)) for (const o of liste) { if (o && o.id) idsProposes.add(String(o.id)); if (o && o.node) idsProposes.add(String(o.node)); }
  }
  // Plafond de jetons : ce que le moteur a lui-même annoncé comme engageable.
  const maxJetons = Math.max(0, parseInt(payload.maxEngage !== undefined ? payload.maxEngage
                                        : (payload.maxDef !== undefined ? payload.maxDef : payload.myForce), 10) || 0);
  for (const [k, v] of Object.entries(ans)) {
    if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+$/.test(v))) {
      let n = parseInt(v, 10); if (!isFinite(n)) continue;
      if (k === 'tokens' || k === 'defTokens') n = Math.max(0, Math.min(n, maxJetons));
      else n = Math.max(-9999, Math.min(9999, n));
      out[k] = n;
    } else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') {
      const s = v.slice(0, 64);
      // Un identifiant de choix doit provenir de la liste proposée (quand il y en a une).
      if (idsProposes.size && /^(id|value|targetId|cardId|agendaId|node|branch|aiId|target)$/.test(k) && !idsProposes.has(s)) continue;
      out[k] = s;
    } else if (Array.isArray(v)) out[k] = v.slice(0, 12).filter(x => typeof x === 'string').map(x => x.slice(0, 64));
    else if (v && typeof v === 'object') { // une seule profondeur (ex. offre de paix {materials,energy,science})
      if (k === 'tokens' || k === 'defTokens') continue; // un nombre de jetons n'est JAMAIS un objet
      const sub = {};
      for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'number' && isFinite(v2)) sub[k2] = Math.max(0, Math.min(999, Math.floor(v2)));
      out[k] = sub;
    }
  }
  return out;
}

function route(g, r) {
  clearTimer(g);
  snapshot(g);
  g.lastRoute = r;
  if (!r) return;
  if (r.kind === 'decision') {
    const p = r.pending;
    const civ = (typeof p.nation === 'object' && p.nation) ? (p.nation.civ && p.nation.civ.id) : p.nation;
    g.lastRoute = { kind: 'decision', civId: civ, pending: { id: p.id, kind: p.kind, nation: civ, payload: p.payload } };
    // FENÊTRES COLLECTIVES (bilan de fin de tour, annonce et résultat d'événement) : tout le monde
    // les voit EN MÊME TEMPS. Celui qui porte la décision répond pour relancer la partie ; les autres
    // ferment simplement la leur. Pendant le bilan de fin de tour, il n'y a plus de joueur actif.
    if (FENETRES_COLLECTIVES.includes(p.kind)) sendWindowToAll(g, p.kind, p.payload, civ);
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
      // DÉTAIL COMPLET des points de victoire (Marc : « les calculs finaux ne sont plus visibles »).
      // En ligne, l'écran de fin ne recevait que le total : on renvoie tout le décompte de calcVP
      // (colonies, routes, cartes, techs, revenus, agendas, événements, bonus) pour que le client
      // affiche EXACTEMENT le même tableau qu'en solo, ligne par ligne, y compris les postes à 0.
      scores = [G.player, ...G.ais].map(p => {
        const d = sb.calcVP(p) || {};
        return { civId: p.civ.id, name: p.civ.name, emoji: p.civ.emoji || '', vp: d.total || 0, detail: {
          colVP: d.colVP || 0, routeVP: d.routeVP || 0, cardsVP: d.cardsVP || 0, techBonusVP: d.techBonusVP || 0,
          rptVP: d.rptVP || 0, agendasVP: d.agendasVP || 0, evtVP: d.evtVP || 0, extraVP: d.extraVP || 0,
          total: d.total || 0 } };
      }).sort((a, b) => b.vp - a.vp);
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
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"ok":true,"games":' + games.size + '}'); return; }
  if (req.url && req.url.indexOf('/bot') === 0) { // inviter le bot « Claude » : /bot?code=XXXX[&civ=martiens]
    let code = '', civId;
    let fast = false;
    try { const u = new URL(req.url, 'http://x'); code = (u.searchParams.get('code') || '').toUpperCase(); civId = u.searchParams.get('civ') || undefined; fast = u.searchParams.get('fast') === '1'; } catch (e) {}
    const g = games.get(code);
    res.writeHead(g ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!g) { res.end('{"ok":false,"msg":"partie introuvable (code ?)"}'); return; }
    try {
      const user = require('./bot.js').spawnBot(PORT, code, { civId, fast });
      res.end(JSON.stringify({ ok: true, user, msg: 'Le bot rejoint la partie ' + code + ' (il prend un siège humain libre).' }));
    } catch (e) { res.end(JSON.stringify({ ok: false, msg: e.message })); }
    return;
  }
  if (req.url.indexOf('/admin/reset') === 0) {
    // REMISE À ZÉRO (fresh start) : supprime TOUS les comptes, archives, parties et journal d'emails.
    // Protégé par une clé : inactif tant que la variable d'environnement ADMIN_KEY n'est pas définie.
    const KEY = process.env.ADMIN_KEY || '';
    const given = (req.url.split('key=')[1] || '').split('&')[0];
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (!KEY) { res.end('Remise à zéro DÉSACTIVÉE : définis la variable ADMIN_KEY sur le serveur, puis rappelle /admin/reset?key=TA_CLE'); return; }
    if (given !== KEY) { res.end('Clé invalide.'); return; }
    let nU = 0, nA = 0, nG = 0;
    try { nU = Object.keys(users).length; users = {}; saveUsers(); } catch (e) {}
    try { for (const f of fs.readdirSync(ARCH_DIR)) { fs.unlinkSync(path.join(ARCH_DIR, f)); nA++; } } catch (e) {}
    try { const gd = path.join(DATA, 'games'); for (const f of fs.readdirSync(gd)) { fs.unlinkSync(path.join(gd, f)); nG++; } } catch (e) {}
    try { fs.writeFileSync(OUTBOX, ''); } catch (e) {}
    try { tokens.clear(); } catch (e) {}
    try { for (const c of Array.from(games.keys())) games.delete(c); } catch (e) {}
    _mailErrors.length = 0;
    res.end('✅ Remise à zéro effectuée le ' + frDate(Date.now()) + '\n'
      + '  · comptes supprimés : ' + nU + '\n  · archives supprimées : ' + nA + '\n  · parties supprimées : ' + nG + '\n'
      + '  · journal des emails vidé, sessions et parties en cours effacées.\n\n'
      + 'Crée maintenant ton compte avec ton ADRESSE EMAIL pour recevoir les scores.');
    return;
  }
  /* ───────── /mailtest — DIAGNOSTIC SMTP ─────────────────────────────────────────────────────
     Sans cette page, vérifier un réglage d'email demandait de jouer une partie entière pour
     déclencher un envoi. Ici : configuration effective (mot de passe masqué), incohérences
     détectées, test de connexion RÉEL au serveur OVH, et envoi d'essai facultatif.
       /mailtest              → configuration + avertissements + verify()
       /mailtest?to=x@y.ch    → en plus, envoie un vrai message d'essai à cette adresse
     Aucune donnée sensible n'est exposée : le mot de passe n'est jamais affiché. */
  if (req.url === '/mailtest' || req.url.indexOf('/mailtest?') === 0) {
    const q = new URL(req.url, 'http://x').searchParams;
    const dest = q.get('to');
    const out = [];
    out.push('SOLAR — DIAGNOSTIC EMAIL  (' + frDate(Date.now()) + ')');
    out.push('');
    out.push('CONFIGURATION EFFECTIVE');
    out.push('  SMTP_HOST   : ' + (process.env.SMTP_HOST || '(absent)'));
    out.push('  SMTP_PORT   : ' + SMTP_PORT);
    out.push('  chiffrement : ' + (SMTP_SECURE ? 'SSL direct (secure=true)' : 'STARTTLS (secure=false)')
             + ' — imposé par le port ' + SMTP_PORT
             + (_secureForce ? '  [SMTP_SECURE=' + process.env.SMTP_SECURE + ' ignoré, incompatible avec ce port]' : ''));
    out.push('  SMTP_USER   : ' + (process.env.SMTP_USER || '(absent)'));
    out.push('  SMTP_PASS   : ' + (process.env.SMTP_PASS ? '(défini, ' + String(process.env.SMTP_PASS).length + ' caractères)' : '(ABSENT)'));
    out.push('  MAIL_FROM   : ' + MAIL_FROM);
    out.push('  ADMIN_MAIL  : ' + ADMIN_MAIL);
    out.push('');
    const av = smtpAvertissements();
    out.push('INCOHÉRENCES DÉTECTÉES SANS ENVOYER');
    if (!av.length) out.push('  aucune — la configuration est cohérente.');
    else av.forEach((w, i) => out.push('  ' + (i + 1) + '. ' + w));
    out.push('');
    const fin = () => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(out.join('\n')); };
    if (!_transport) {
      if (_smtpChargementErreur) {
        out.push('CONNEXION : impossible — la bibliothèque d\'envoi n\'a pas pu être chargée :');
        out.push('  ' + _smtpChargementErreur);
        out.push('  → sur le serveur : `npm install` dans le dossier server/ puis redéployer.');
        out.push('  (Ce n\'est PAS un problème d\'identifiants : aucun envoi n\'est même tenté.)');
      } else out.push('CONNEXION : impossible — SMTP_HOST n\'est pas défini.');
      return fin();
    }
    out.push('CONNEXION RÉELLE AU SERVEUR');
    _transport.verify()
      .then(() => {
        out.push('  ✅ connexion et authentification acceptées.');
        if (!dest) { out.push('\n  (ajoute ?to=ton@email pour envoyer un message d\'essai)'); return fin(); }
        return _transport.sendMail({ from: MAIL_FROM, to: dest, subject: 'Solar — test d\'envoi',
          text: 'Si tu lis ceci, la configuration SMTP fonctionne.\n\n' + frDate(Date.now()) })
          .then(info => { out.push('  ✅ message d\'essai envoyé à ' + dest + ' (id ' + (info && info.messageId) + ')'); fin(); });
      })
      .catch(e => {
        out.push('  ❌ ÉCHEC : ' + e.message);
        if (e && e.responseCode) out.push('  code SMTP : ' + e.responseCode);
        if (e && e.response) out.push('  réponse du serveur : ' + String(e.response).slice(0, 300));
        out.push('');
        out.push('LECTURE DU CODE');
        out.push('  535 → identifiants refusés. Chez OVH : SMTP_USER doit être l\'ADRESSE COMPLÈTE,');
        out.push('        et le mot de passe celui de la BOÎTE (pas celui du compte OVH).');
        out.push('  550/553 → authentification OK mais expéditeur refusé : MAIL_FROM doit être la boîte authentifiée.');
        out.push('  ETIMEDOUT/ECONNREFUSED → mauvais hôte ou port bloqué.');
        fin();
      });
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
    // État réel de l'envoi + dernières ERREURS (diagnostic sans ouvrir les logs Coolify)
    out.push('\n' + '='.repeat(70) + '\nÉTAT EMAIL : ' + (_transport ? 'SMTP configuré (' + (process.env.SMTP_HOST || '?') + ')' : 'SMTP NON configuré — aucun envoi possible'));
    const _bad = Object.keys(users).filter(u => !isEmail(u));
    if (_bad.length) out.push('⚠️ Comptes SANS adresse email (ils ne peuvent PAS recevoir de mail) : ' + _bad.join(', '));
    if (_mailErrors.length) { out.push('⚠️ Derniers échecs d\'envoi :'); _mailErrors.forEach(e => out.push('   · ' + e)); }
    else out.push('Aucun échec d\'envoi enregistré depuis le démarrage du serveur.');
    let ob = ''; try { ob = fs.readFileSync(OUTBOX, 'utf8').slice(-4000); } catch (e) {}
    if (ob) out.push('\nDERNIERS EMAILS (journal complet des messages préparés) :\n' + ob);
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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(out)); return;
  }
  /* Réponse par défaut. ⚠️ Le charset est OBLIGATOIRE : sans lui, le navigateur lit l'UTF-8 comme
     du Latin-1 et le tiret cadratin s'affiche « â€” » (constaté par Marc). Même règle partout. */
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Solar — serveur de jeu (WebSocket).\n\n'
    + 'Pages disponibles :\n'
    + '  /health    état du serveur\n'
    + '  /stats     parties archivées et journaux\n'
    + '  /mailtest  diagnostic de l\'envoi d\'emails\n\n'
    + 'Version : ' + SERVER_BUILD + '\n'
    + "Si /mailtest renvoie cette page, c'est que cette version n'est pas encore déployée.\n");
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
          // Le journal des actions part vers TOUS SAUF l'auteur de l'action : la fenêtre rouge doit
          // montrer ce que font les AUTRES nations, pas ce que le joueur vient lui-même de faire.
          g.driver.onLog = entries => { for (const s2 of g.seats) { if (g._actingCiv && s2.civId === g._actingCiv) continue; sendTo(s2.ws, { t: 'log', entries }); } };
          g.status = 'playing';
          broadcast(g, { t: 'started', game: gameView(g) });
          // Décisions humaines : récupérées via pump(). Notices (résultats de combat/événement/fin de tour) :
          // le pump les acquitte automatiquement, on les envoie ici pour que les joueurs les voient.
          //
          // ⚠️ ELLES NE SONT PLUS DIFFUSÉES À TOUT LE MONDE. Un `broadcast` faisait apparaître « Tu as
          // gagné le combat » chez TOUS les humains : Laurent voyait la fenêtre de victoire de Marc,
          // puis l'inverse (bug signalé le 2026-08-01). Une notice appartient à UNE nation : celle
          // inscrite dans `p.nation`. On l'envoie donc au siège correspondant, et à lui seul.
          // Exception : le BILAN DE FIN DE TOUR (`eot`) va bien à tout le monde en même temps, chacun
          // recevant SON propre bilan (voir `payload.bodies`), parce qu'à cet instant il n'y a plus de
          // joueur actif — c'est un temps commun.
          g.driver.boot(g.seats.map(s => ({ civId: s.civId, isAI: s.ai })), (p) => {
            try {
              if (!(p && (p.notice || ['war_result', 'event_result', 'event_announce', 'eot'].includes(p.kind)))) return;
              // Les fenêtres collectives sont distribuées par route() (une seule fois, à tous) : ne pas les doubler ici.
              if (FENETRES_COLLECTIVES.includes(p.kind)) return;
              const civ = (p.nation && p.nation.civ) ? p.nation.civ.id : p.nation;
              const seat = civ ? g.seats.find(s2 => s2.civId === civ && !s2.ai) : null;
              if (seat) sendTo(seat.ws, { t: 'notice', kind: p.kind, payload: p.payload });
              else if (!civ) broadcast(g, { t: 'notice', kind: p.kind, payload: p.payload }); // notice sans destinataire = information générale
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
          try { route(g, g.driver.answer(m.id, assainirReponse(g, p, m.ans || {}))); }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'answer', e); }
          break;
        }

        case 'act': { // {t:'act', action:{type:...}} — 'pass' pour passer
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          try {
            g._actingCiv = s.civId;                       // auteur de l'action (exclu du journal diffusé)
            const rr = g.driver.act(s.civId, m.action || { type: 'pass' });
            g._actingCiv = null;
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

        /* POIGNÉE DE MAIN VERSIONNÉE (premier message du client).
           Sur mobile, une application installée peut avoir des mois de retard : sans ce contrôle
           elle parlerait à un serveur récent et produirait des symptômes incompréhensibles. On
           répond alors « maj_requise » plutôt que de laisser la partie dérailler.
           NB : un client ANCIEN n'envoie pas 'hello' du tout — on reste tolérant (proto 1 supposé),
           mais dès qu'un proto ≥ 2 existera, l'absence de hello devra être refusée. */
        case 'hello': {
          const proto = parseInt(m.proto, 10) || 0;
          sess.proto = proto; sess.build = String(m.build || '?').slice(0, 40);
          if (proto < PROTO_MIN || proto > PROTO_MAX) {
            sendTo(ws, { t: 'maj_requise', serveur: PROTO_MAX, client: proto,
              msg: proto < PROTO_MIN
                ? 'Ta version du jeu est trop ancienne pour ce serveur. Recharge la page (ou mets à jour l\'application).'
                : 'Ce serveur est plus ancien que ta version du jeu. Réessaie plus tard.' });
            break;
          }
          sendTo(ws, { t: 'hello_ok', proto: PROTO_MAX, serveur: SERVER_BUILD });
          break;
        }
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
