/* Solar Conquest — serveur multijoueur autoritaire (tâche A du chantier).
   Node + WebSocket (ws) autour du GameDriver prouvé (server/driver.js).
   - L'état vit ici ; les clients envoient des INTENTIONS (act / answer), le serveur valide et pousse.
   - Comptes simples : fichier JSON + scrypt (zéro dépendance BDD pour la v1 ; schéma SQL prêt pour plus tard).
   - 1 partie = 1 GameDriver (contexte moteur isolé). Décisions routées vers le bon joueur.
   - Repli IA : si un joueur est déconnecté (ou AFK trop longtemps), l'IA joue à sa place.
   - Snapshots d'état sur disque après chaque avancée (data/games/<code>.json) — reprise après redémarrage : TODO v2.
   Usage : node server.js   (PORT, GAME_HTML, DATA_DIR, ECHEANCE_MS surchargeables par variables d'env)
*/
'use strict';
/* VERSION DU PROTOCOLE parlé avec les clients. `PROTO_MAX` = ce que ce serveur sait faire ;
   `PROTO_MIN` = le plus ancien client encore accepté. Élargir la fenêtre plutôt que de casser :
   sur mobile, les joueurs mettent des semaines à mettre à jour. À incrémenter dès qu'un message
   change de forme (nouveau champ obligatoire, sens modifié, message retiré). */
const PROTO_MIN = 1, PROTO_MAX = 1;
const SERVER_BUILD = '2026-08-07 · v8.1';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { GameDriver } = require('./driver.js');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HTML = process.env.GAME_HTML || path.join(__dirname, '..', 'index.html');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
// AFK_MS a été SUPPRIMÉ (lot 17). C'était le levier « au bout de N secondes, l'IA joue à ta place ».
// Plus aucun délai ne fait avancer une partie : voir « ABSENCE D'UN JOUEUR » plus bas. Le seul délai
// restant, ECHEANCE_MS, n'affiche qu'un bouton chez les autres joueurs.
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
/* ESPACES INVISIBLES — cause n°1 d'un « ça marche au webmail mais pas en SMTP ».
   Un copier-coller dans Coolify ajoute très souvent une espace ou un retour à la ligne en fin de
   valeur. Le webmail, lui, reçoit ce que Marc TAPE : il ne voit donc pas le problème. On nettoie
   donc les extrémités — et on le DIT, parce que modifier un mot de passe en silence serait pire
   que le bug. Les espaces INTERNES sont conservés (ils peuvent être voulus). */
function _net(v) { return String(v === undefined || v === null ? '' : v).replace(/^[\s ]+|[\s ]+$/g, ''); }
const SMTP_USER = _net(process.env.SMTP_USER);
const SMTP_PASS = _net(process.env.SMTP_PASS);
const SMTP_HOST = _net(process.env.SMTP_HOST);
const _rogne = [];
if (process.env.SMTP_USER !== undefined && SMTP_USER !== String(process.env.SMTP_USER)) _rogne.push('SMTP_USER');
if (process.env.SMTP_PASS !== undefined && SMTP_PASS !== String(process.env.SMTP_PASS)) _rogne.push('SMTP_PASS');
if (process.env.SMTP_HOST !== undefined && SMTP_HOST !== String(process.env.SMTP_HOST)) _rogne.push('SMTP_HOST');
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
const MAIL_FROM = _net(process.env.MAIL_FROM) || (SMTP_USER ? 'Solar <' + SMTP_USER + '>' : 'Solar <contact@solar-game.com>');
function _adresseDe(x) { const m = /<([^>]+)>/.exec(String(x || '')); return (m ? m[1] : String(x || '')).trim().toLowerCase(); }
/* Incohérences détectables SANS envoyer : ce sont elles qui produisent le 535 / le refus de relais. */
function smtpAvertissements() {
  const a = [];
  if (!SMTP_HOST) { a.push('SMTP_HOST absent — aucun envoi possible, tout est seulement journalisé.'); return a; }
  const u = SMTP_USER;
  if (!u) a.push('SMTP_USER absent — OVH exige une authentification.');
  else if (!isEmail(u)) a.push('SMTP_USER = « ' + u +' » n\'est PAS une adresse complète. OVH veut `prenom@domaine.ch` — c\'est LA cause n°1 du « 535 Authentication failed ».');
  if (!SMTP_PASS) a.push('SMTP_PASS absent.');
  if (_rogne.length) a.push('ESPACE(S) EN TROP retiré(es) dans : ' + _rogne.join(', ')
    + '. Un copier-coller dans Coolify ajoute souvent une espace ou un retour à la ligne invisible —\n'
    + '    c\'est LA cause d\'un mot de passe qui marche au webmail mais pas en SMTP.');
  if (_secureForce) a.push('SMTP_SECURE=' + process.env.SMTP_SECURE + ' est en désaccord avec le port ' + SMTP_PORT
    + ' → IGNORÉ, on applique le réglage imposé par le port (' + (SMTP_SECURE ? 'TLS implicite' : 'STARTTLS')
    + '). Tu peux laisser cette variable telle quelle, elle ne bloque plus rien.');
  /* Caractères actifs pour le shell : Coolify/Docker les mangent ou les transforment en passant la
     variable au conteneur. C'est une INCOHÉRENCE à part entière, pas un simple détail d'affichage —
     elle explique un mot de passe qui marche au webmail et échoue en SMTP. */
  const _actifs = [...new Set((SMTP_PASS.match(/[`$\\"']/g) || []))];
  if (_actifs.length) a.push('SMTP_PASS contient des caractères que le shell INTERPRÈTE : ' + _actifs.join(' ')
    + '. Coolify/Docker les abîment au passage vers le conteneur (l\'antislash échappe, l\'accent grave'
    + ' substitue).\n    REMÈDE 1 (le plus simple, rien à changer d\'autre) : cocher « Is Literal » sur'
    + ' cette variable dans Coolify — la valeur est alors passée telle quelle.'
    + '\n    REMÈDE 2 (le plus robuste) : un mot de passe LONG mais uniquement alphanumérique, qui ne'
    + ' dépend d\'aucune case à cocher et survit à un changement d\'hébergeur.');
  if (SMTP_PORT !== 465 && SMTP_PORT !== 587) a.push('port ' + SMTP_PORT + ' inhabituel : chez OVH, utilise 465 (SSL) ou 587 (STARTTLS).');
  if (u && isEmail(u) && _adresseDe(MAIL_FROM) !== u.toLowerCase())
    a.push('MAIL_FROM (« ' + _adresseDe(MAIL_FROM) + ' ») diffère de la boîte authentifiée (« ' + u.toLowerCase() + ' ») — OVH refuse de relayer une adresse d\'expéditeur qui n\'est pas la sienne.');
  return a;
}
try {
  if (SMTP_HOST) {
    const nodemailer = require('nodemailer');
    _transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      requireTLS: !SMTP_SECURE,               // 587 : exiger STARTTLS (jamais d'authentification en clair)
      auth: (SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined)
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
/* ─── LE RAPPORT DE FIN DE PARTIE ─────────────────────────────────────────────
   Demande de Marc (2026-08-08) : l'email doit contenir le CALCUL COMPLET des scores, puis le
   rapport de bug éventuel, puis le journal entier — dans cet ordre.
   Avant, il ne contenait qu'un classement en trois lignes : impossible de comprendre après coup
   d'où venaient les points, ni de relire une partie pour y chercher une anomalie. */
function corpsRapport(entry) {
  const L = [];
  L.push('Partie ' + entry.code + ' — terminée le ' + entry.dateFr + (entry.turn ? ' (tour ' + entry.turn + ')' : ''));
  L.push('Joueurs : ' + entry.joueurs.map(j => j.civ + (j.user ? ' = ' + j.user : ' (IA)')).join(' · '));
  L.push('');
  L.push('═══════════ CALCUL FINAL DES POINTS DE VICTOIRE ═══════════');
  for (let i = 0; i < entry.scores.length; i++) {
    const s = entry.scores[i], d = s.detail || {};
    L.push('');
    L.push((i + 1) + '. ' + s.name + (s.user ? ' (' + s.user + ')' : ' (IA)') + ' — TOTAL ' + s.vp + ' VP');
    L.push('     Colonies ............... ' + (d.colVP || 0));
    L.push('     Routes ................. ' + (d.routeVP || 0));
    L.push('     Cartes ................. ' + (d.cardsVP || 0));
    L.push('     Bonus technologiques ... ' + (d.techBonusVP || 0));
    L.push('     Revenus par tour ....... ' + (d.rptVP || 0));
    L.push('     Agenda' + (s.agenda ? ' (' + s.agenda + ')' : '') + ' ......... ' + (d.agendasVP || 0));
    L.push('     Événements ............. ' + (d.evtVP || 0));
    L.push('     Bonus divers ........... ' + (d.extraVP || 0));
  }
  L.push('');
  L.push('═══════════ RAPPORT DE BUG ═══════════');
  if (!entry.bugs || !entry.bugs.length) L.push('(aucun rapport signalé pour cette partie)');
  else for (const b of entry.bugs) {
    L.push('');
    L.push('— ' + (b.dateFr || '') + ' par ' + (b.user || 'anonyme') + ' :');
    L.push(String(b.text || '').split('\n').map(x => '   ' + x).join('\n'));
  }
  L.push('');
  L.push('═══════════ JOURNAL COMPLET DE LA PARTIE ═══════════');
  L.push('(' + (entry.journal || []).length + ' lignes, du début à la fin)');
  L.push('');
  for (const l of (entry.journal || [])) L.push(l);
  L.push('');
  L.push('Merci d\'avoir joué !');
  return L.join('\n');
}
function archiveGame(g) {
  let scores = [], journal = [], turn = null;
  try {
    const sb = g.driver.sb, G = g.driver.state();
    turn = G.turn;
    const parUser = {};
    for (const s of g.seats) if (s.user) parUser[s.civId] = s.user;
    /* DÉTAIL COMPLET, pas seulement le total : `calcVP` rend déjà toute la ventilation, elle était
       simplement jetée ici alors que l'écran de fin l'affiche. */
    scores = [G.player, ...G.ais].map(p => {
      const d = sb.calcVP(p) || {};
      return {
        civId: p.civ.id, name: p.civ.name, vp: d.total || 0,
        user: parUser[p.civ.id] || null,
        agenda: (p.agenda && p.agenda.name) || null,
        detail: { colVP: d.colVP || 0, routeVP: d.routeVP || 0, cardsVP: d.cardsVP || 0,
                  techBonusVP: d.techBonusVP || 0, rptVP: d.rptVP || 0, agendasVP: d.agendasVP || 0,
                  evtVP: d.evtVP || 0, extraVP: d.extraVP || 0 }
      };
    }).sort((a, b) => b.vp - a.vp);
    journal = (G.log || []).map(l => plainText((l && l.msg) || l)).reverse();   // archive et email : journal ENTIER
  } catch (e) { console.error('archiveGame:', e.message); }
  const endedAt = Date.now();
  const humans = g.seats.filter(s => !s.ai && s.user);
  const entry = {
    code: g.code, endedAt, dateFr: frDate(endedAt), turn,
    joueurs: g.seats.map(s => ({ civ: s.civId, ai: !!s.ai, user: s.user || null })),
    scores, journal, bugs: (g._bugs || [])
  };
  const corps = corpsRapport(entry);
  for (const s of humans) {
    const list = readArch(s.user); list.unshift(entry); writeArch(s.user, list);
    sendMail(s.user, 'Solar — fin de partie ' + g.code + ' (' + entry.dateFr + ')', corps);
  }
  sendMail(ADMIN_MAIL, 'Solar — partie terminée ' + g.code, corps);
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
/* ============ SESSIONS PERSISTANTES ============
   ⚠️ Les jetons vivaient en MÉMOIRE : chaque redéploiement déconnectait TOUS les joueurs, y compris
   en pleine partie. C'est ce qui a bloqué Marc sur mobile le 2026-08-05 — son téléphone tentait une
   reprise avec un jeton mort et n'arrivait plus à en sortir. Ils sont désormais écrits sur le volume
   `/data`, avec une péremption glissante : une session inutilisée pendant TOKEN_TTL_J jours expire.
   Écriture différée (200 ms) pour ne pas toucher le disque à chaque message. */
const TOKENS_FILE = path.join(DATA, 'tokens.json');
const TOKEN_TTL_J = 90;
const TOKEN_TTL_MS = TOKEN_TTL_J * 24 * 3600 * 1000;
const tokens = new Map(); // token -> {user, vu} (vu = dernier usage, pour la péremption)
(function chargerTokens() {
  let brut = {};
  try { brut = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch (e) { return; }
  const now = Date.now(); let charges = 0, perimes = 0;
  for (const [t, v] of Object.entries(brut || {})) {
    const o = (typeof v === 'string') ? { user: v, vu: now } : v;   // tolère l'ancien format
    if (!o || !o.user) continue;
    if (now - (o.vu || 0) > TOKEN_TTL_MS) { perimes++; continue; }
    tokens.set(t, o); charges++;
  }
  console.log('sessions rechargées : ' + charges + (perimes ? ' (' + perimes + ' périmée(s) écartée(s))' : ''));
})();
let _tokSaveTimer = null;
function _ecrireTokens() {
  clearTimeout(_tokSaveTimer); _tokSaveTimer = null;
  try {
    const now = Date.now(), out = {};
    for (const [t, o] of tokens) { if (now - (o.vu || 0) <= TOKEN_TTL_MS) out[t] = o; else tokens.delete(t); }
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(out));
  } catch (e) { console.error('saveTokens:', e.message); }
}
/* `immediat` = une session vient d'être CRÉÉE ou SUPPRIMÉE : il ne faut pas la perdre si le serveur
   s'arrête dans la seconde (un redéploiement, justement). Une écriture différée était perdue à
   l'arrêt — la session ne survivait donc pas, ce que le test a montré.
   Sans `immediat` : simple rafraîchissement de la date d'usage, sans conséquence si on le perd. */
function saveTokens(immediat) {
  if (immediat) return _ecrireTokens();
  if (!_tokSaveTimer) _tokSaveTimer = setTimeout(_ecrireTokens, 2000);
}
/* Arrêt propre : on vide ce qui attend avant de rendre la main (Docker envoie SIGTERM au redéploiement). */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { try { if (_tokSaveTimer) _ecrireTokens(); } catch (e) {} process.exit(0); });
}
/* Retrouve l'utilisateur d'un jeton ET rafraîchit sa date d'usage (péremption glissante). */
function userDuToken(t) {
  const o = tokens.get(t);
  if (!o) return null;
  if (Date.now() - (o.vu || 0) > TOKEN_TTL_MS) { tokens.delete(t); saveTokens(); return null; }
  o.vu = Date.now(); saveTokens();
  return o.user;
}

/* ============ parties ============ */
const games = new Map(); // code -> game
function newCode() { let c; do { c = crypto.randomBytes(2).toString('hex').toUpperCase(); } while (games.has(c)); return c; }

function gameView(g) { // ce que le lobby a le droit de voir
  return {
    code: g.code, status: g.status, host: g.host,
    seats: g.seats.map(s => ({ civId: s.civId, ai: s.ai, user: s.user || null, connected: !!(s.ws && s.ws.readyState === 1),
                               remplace: !!s.remplaceLe })),
    // De qui la partie attend un geste, et si un remplacement est proposable. Le client s'en sert pour
    // afficher « en attente de X » plutôt qu'un plateau silencieux — la cause n°1 des « c'est bloqué ».
    attendu: g.attendu || null, voteOuvert: g.voteOuvert || null,
    votePour: (g.vote && g.vote.pour) ? g.vote.pour.slice() : []
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
/* `war_result` est COLLECTIF depuis le 2026-08-07 (demande de Marc : « il faut aussi que les
   fenêtres de résultats apparaissent aux deux joueurs »). Un combat a DEUX camps : n'en informer
   que l'assaillant, c'est laisser le défenseur découvrir ses pertes en regardant sa carte.
   Une guerre est de toute façon publique — tout le monde la voit dans le journal. */
const FENETRES_COLLECTIVES = ['eot', 'event_announce', 'event_result', 'war_result'];
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

/* ============================================================================
   PARTIES QUI SURVIVENT AU REDÉMARRAGE — le modèle BGA, enfin possible
   ----------------------------------------------------------------------------
   Ce n'était PAS faisable jusqu'au 2026-08-06. On savait écrire l'état d'une
   partie et le relire à l'identique, mais elle ne REPARTAIT pas : le déroulement
   vivait dans des fonctions (« et après cette réponse, fais ceci »), et JSON
   n'écrit pas de fonctions. Une partie restaurée s'arrêtait sur la première
   question, sa suite envolée.
   Depuis la migration du flux en machine à états, le déroulement est une DONNÉE
   rangée dans `G._flux` : numéro d'état, nations actives, curseurs, et le registre
   des questions en attente avec leurs suites sous forme de NOMS. Sauver `G`, c'est
   donc sauver la partie ENTIÈRE — règles et déroulement. C'est exactement ce que
   fait BGA (état + données en base), et c'est vérifié par
   `node server/test_serialisation.js` et `node server/test_reprise.js` (5/5).

   On écrit UN fichier par partie : l'état du jeu + ce que le serveur seul connaît
   (qui occupe quel siège, qui est l'hôte). Le reste — de qui on attend un geste —
   est recalculé au chargement en rejouant `pump()`, jamais mémorisé.
   ========================================================================== */
const PARTIES_DIR = path.join(DATA, 'games');
try { fs.mkdirSync(PARTIES_DIR, { recursive: true }); } catch (e) {}
function fichierPartie(code) { return path.join(PARTIES_DIR, String(code) + '.json'); }

function snapshot(g) {
  if (!g.driver || g.status !== 'playing') return;
  try {
    fs.writeFileSync(fichierPartie(g.code), J({
      version: 2, code: g.code, host: g.host, status: g.status,
      cree: g.cree || Date.now(), maj: Date.now(),
      // Les sièges d'AUJOURD'HUI : un remplacement par IA fait partie de l'état de la partie,
      // et `_isAI` est de toute façon porté par les nations dans l'état du jeu.
      sieges: g.seats.map(s => ({ civId: s.civId, ai: !!s.ai, user: s.user || null })),
      etat: g.driver.state()
    }));
  } catch (e) { console.error('snapshot', g.code, ':', e.message); }
}
function oublierPartie(code) { try { fs.unlinkSync(fichierPartie(code)); } catch (e) {} }

/* Recharge une partie depuis son fichier. Rend la partie, ou lève. */
function chargerPartie(fiche) {
  const g = {
    code: fiche.code, host: fiche.host, cree: fiche.cree, status: 'playing',
    seats: fiche.sieges.map(s => ({ civId: s.civId, ai: !!s.ai, user: s.user || null, ws: null })),
    driver: null, timer: null, lastRoute: null
  };
  g.driver = new GameDriver(HTML);
  // On démarre une partie « vide » pour construire le bac à sable, puis on remplace l'état par
  // celui du fichier. `_restore` reconstruit aussi le roster : sans lui, le pilote garderait les
  // nations de la partie vide et jouerait à côté de la plaque.
  g.driver.boot(g.seats.map(s => ({ civId: s.civId, isAI: s.ai })), () => {});
  g.driver._restore(J(fiche.etat));
  for (const s of g.seats) { const n = g.driver.nation(s.civId); if (n) n._isAI = !!s.ai; }
  installerJournalPilote(g);
  return g;
}

function rechargerParties() {
  let fichiers = [];
  try { fichiers = fs.readdirSync(PARTIES_DIR).filter(f => f.endsWith('.json')); } catch (e) { return; }
  let ok = 0, perdues = 0;
  for (const f of fichiers) {
    let fiche = null;
    try { fiche = JSON.parse(fs.readFileSync(path.join(PARTIES_DIR, f), 'utf8')); } catch (e) { continue; }
    // Les fichiers de l'ancien format (l'état nu, sans les sièges) ne sont pas reprenables :
    // on ne sait pas qui occupait quel siège. On les ignore plutôt que de deviner.
    if (!fiche || fiche.version !== 2 || !Array.isArray(fiche.sieges) || fiche.status !== 'playing') continue;
    try {
      const g = chargerPartie(fiche);
      games.set(g.code, g);
      // ⚠️ `route()` est INDISPENSABLE : sans lui la partie est bien là, mais `lastRoute` est vide et
      // le joueur qui revient reçoit un plateau MUET, sans savoir si c'est à lui de jouer. Le
      // chargement rend l'ÉTAT ; c'est route() qui rend LA MAIN.
      route(g, g.driver.pump());
      ok++;
      console.log('  · partie ' + g.code + ' reprise — tour ' + g.driver.state().turn
        + ' — ' + g.seats.filter(s => !s.ai).map(s => s.user || '?').join(', '));
    } catch (e) {
      perdues++;
      console.error('  ✗ partie ' + fiche.code + ' NON reprise : ' + e.message.split('\n')[0]);
      try { fs.renameSync(fichierPartie(fiche.code), fichierPartie(fiche.code) + '.echec'); } catch (e2) {}
    }
  }
  if (ok || perdues) console.log('Parties reprises : ' + ok + (perdues ? ' — non reprises : ' + perdues + ' (fichiers .echec conservés pour diagnostic)' : ''));
}

/* Réponse par défaut à une décision : la première option proposée.
   ⚠️ N'EST PLUS DÉCLENCHÉE PAR UN DÉLAI. Depuis le lot 17, elle ne sert QUE lorsqu'un
   siège vient d'être converti en IA **par un vote des autres joueurs** : il faut bien
   solder la décision déjà émise pour l'humain qui vient d'être remplacé. Voir
   « ABSENCE D'UN JOUEUR » plus bas. */
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
/* ============================================================================
   ABSENCE D'UN JOUEUR — ce que le serveur a le DROIT de faire   (lot 17)
   ----------------------------------------------------------------------------
   AVANT : au bout de 30 s de déconnexion, le serveur RÉPONDAIT À LA PLACE du
   joueur (première option de la liste) puis enchaînait tout seul. Deux dégâts
   réels, constatés par Marc :
     · **un simple rafraîchissement de page cassait la partie.** Recharger le jeu
       peut dépasser 30 s (mobile, réseau lent, cache vide — et le moteur pèse
       maintenant 488 Ko) : le temps de revenir, l'IA avait joué son tour.
     · une partie abandonnée se terminait toute seule et arrivait « finie » —
       « c'est déprimant » (Marc, 2026-08-04).

   MAINTENANT : **le serveur ne joue JAMAIS à la place de personne.** Une partie
   dont le joueur attendu est absent ATTEND — sans limite. L'échéance ne déclenche
   RIEN : elle OUVRE seulement la possibilité, pour les AUTRES joueurs, de VOTER le
   remplacement de l'absent par une IA (option C, choisie par Marc le 2026-08-04).
   Le vote doit être UNANIME parmi les humains présents. Tant qu'il ne l'est pas,
   ou que personne ne vote, rien ne bouge : c'est le comportement voulu.

   Autrement dit : le temps qui passe n'a plus aucun pouvoir sur une partie.
   Seuls des JOUEURS peuvent faire avancer une partie — soit en jouant, soit en
   décidant ensemble de remplacer un absent.
   ========================================================================== */
function clearTimer(g) { if (g.timer) { clearTimeout(g.timer); g.timer = null; } }
/* Délai au bout duquel le vote de remplacement devient PROPOSABLE. Il ne « fait » rien :
   il ne fait qu'afficher un bouton chez les autres. 90 s laisse largement le temps de
   recharger une page ; ce n'est pas une horloge de partie (celles-ci viennent avec les
   types de partie temps réel / tour par tour). */
const ECHEANCE_MS = parseInt(process.env.ECHEANCE_MS || '90000', 10);

/* Le PUITS DE NOTICES d'une partie : à qui va chaque fenêtre non bloquante.
   ⚠️ ELLES NE SONT PAS DIFFUSÉES À TOUT LE MONDE. Un `broadcast` faisait apparaître « Tu as gagné
   le combat » chez TOUS les humains : Laurent voyait la fenêtre de victoire de Marc, puis l'inverse
   (bug du 2026-08-01). Une notice appartient à UNE nation, celle inscrite dans `p.nation`.
   Exception : le BILAN DE FIN DE TOUR (`eot`) va bien à tous en même temps, chacun recevant LE SIEN
   (`payload.bodies`) — à cet instant il n'y a plus de joueur actif, c'est un temps commun ; il est
   distribué par route(), donc on ne le double pas ici. */
function puitsNotices(g) {
  return (p) => {
    try {
      if (!(p && (p.notice || ['war_result', 'event_result', 'event_announce', 'eot'].includes(p.kind)))) return;
      if (FENETRES_COLLECTIVES.includes(p.kind)) return;
      const civ = (p.nation && p.nation.civ) ? p.nation.civ.id : p.nation;
      const seat = civ ? g.seats.find(s2 => s2.civId === civ && !s2.ai) : null;
      if (seat) sendTo(seat.ws, { t: 'notice', kind: p.kind, payload: p.payload });
      else if (!civ) broadcast(g, { t: 'notice', kind: p.kind, payload: p.payload }); // notice sans destinataire = information générale
    } catch (e) {}
  };
}
/* Branche le pilote sur les clients : journal des actions + puits de notices. */
function installerJournalPilote(g) {
  if (!g.driver) return;
  // Le journal des actions part vers TOUS SAUF l'auteur : la fenêtre rouge montre ce que font les
  // AUTRES nations, pas ce que le joueur vient lui-même de faire.
  g.driver.onLog = entries => { for (const s2 of g.seats) { if (g._actingCiv && s2.civId === g._actingCiv) continue; sendTo(s2.ws, { t: 'log', entries }); } };
  g.driver._onDecision = puitsNotices(g);
}

function nomSiege(g, civId) {
  const s = g.seats.find(x => x.civId === civId);
  return (s && s.user) ? s.user : String(civId || '?');
}
function humainsPresentsSauf(g, civId) {
  return g.seats.filter(s => !s.ai && s.civId !== civId && s.ws && s.ws.readyState === 1);
}
/* La partie attend un geste de `civId`. On note QUI on attend et depuis quand, et on arme
   l'échéance au bout de laquelle les AUTRES pourront proposer un remplacement. */
function attendre(g, civId) {
  clearTimer(g);
  g.attendu = civId;
  g.attendDepuis = Date.now();
  g.voteOuvert = null;   // nouvelle attente = toute proposition précédente tombe
  g.vote = null;
  g.timer = setTimeout(() => {
    g.timer = null;
    if (g.attendu !== civId || g.status !== 'playing') return;
    g.voteOuvert = civId;
    broadcast(g, {
      t: 'absence', civId, votable: true,
      msg: nomSiege(g, civId) + ' n\'a pas joué depuis un moment. Vous pouvez proposer de le remplacer par une IA — '
         + 'ou simplement attendre : la partie l\'attendra aussi longtemps qu\'il le faudra.'
    });
  }, ECHEANCE_MS);
}
/* Un joueur vote le remplacement de l'absent. Unanimité des humains PRÉSENTS requise.
   Un seul humain présent → son vote suffit (il est l'unanimité). */
function voterRemplacement(g, votantCiv) {
  if (g.status !== 'playing' || !g.voteOuvert) return { ok: false, msg: 'aucun remplacement à voter' };
  const cible = g.voteOuvert;
  if (votantCiv === cible) return { ok: false, msg: 'tu ne peux pas voter ton propre remplacement' };
  if (!g.vote || g.vote.cible !== cible) g.vote = { cible, pour: [] };
  if (!g.vote.pour.includes(votantCiv)) g.vote.pour.push(votantCiv);
  const requis = humainsPresentsSauf(g, cible).map(s => s.civId);
  const manquants = requis.filter(c => !g.vote.pour.includes(c));
  broadcast(g, { t: 'vote', cible, pour: g.vote.pour.slice(), requis, manquants });
  if (manquants.length) return { ok: true, encore: manquants.length };
  remplacerParIA(g, cible);
  return { ok: true, encore: 0 };
}
/* Conversion effective d'un siège humain en IA. C'est le SEUL chemin par lequel une nation
   humaine peut se mettre à jouer seule — et il passe par un vote, jamais par une horloge. */
function remplacerParIA(g, cible) {
  const s = g.seats.find(x => x.civId === cible);
  if (!s || s.ai) return;
  s.remplaceLe = Date.now(); s.remplaceUser = s.user || null;
  s.ai = true;
  try { const n = g.driver && g.driver.nation(cible); if (n) n._isAI = true; } catch (e) {}
  g.vote = null; g.voteOuvert = null; clearTimer(g);
  broadcast(g, { t: 'notice', kind: 'info', payload: { msg: '🤖 ' + nomSiege(g, cible) + ' est remplacé par une IA (vote des joueurs présents).' } });
  broadcast(g, { t: 'game', game: gameView(g) });
  // La décision déjà émise pour cet humain doit être soldée, sinon la partie reste figée dessus.
  try {
    // SA question à lui, où qu'elle soit dans la file (plusieurs joueurs peuvent être interrogés
    // en même temps : ne regarder que la tête laissait la partie figée sur celle de l'absent).
    const file = (g.driver && typeof g.driver.sb.fluxQuestionsEnAttente === 'function')
      ? g.driver.sb.fluxQuestionsEnAttente()
      : (g.driver && g.driver.state()._pending ? [g.driver.state()._pending] : []);
    const p = file.find(q => q && String(q.nation && q.nation.civ ? q.nation.civ.id : q.nation) === String(cible));
    if (p) {
      route(g, g.driver.answer(p.id, autoAnswer(p)));
      return;
    }
    if (g.lastRoute && g.lastRoute.kind === 'action' && g.lastRoute.civId === cible) {
      route(g, g.driver.actAuto(cible));
    }
  } catch (e) { console.error('remplacerParIA:', e.message); }
}

/* ===================== CONCÉDER LA VICTOIRE =====================
   Marc, 2026-08-09 : « ajouter un bouton : Concéder la victoire pour annuler sa
   participation au jeu. Les autres joueurs éventuels peuvent alors voir une fenêtre qui
   annonce cela et choisir si ils continuent avec une IA qui joue la nation dont le joueur
   est parti ou si le jeu s'arrête. »

   À NE PAS CONFONDRE avec le vote de remplacement d'un ABSENT, juste au-dessus. Là, on
   soupçonne quelqu'un d'être parti et on attend une échéance avant d'oser le remplacer.
   Ici, le joueur annonce LUI-MÊME son départ : il n'y a rien à supposer et rien à attendre,
   seulement une question à poser aux autres.

   Règles retenues avec Marc le 2026-08-09 :
     · les humains restants tranchent, à l'UNANIMITÉ (même règle que le remplacement) ;
     · désaccord → on continue avec une IA : c'est l'issue qui ne détruit la partie de
       personne, alors qu'« arrêter » l'impose à tout le monde ;
     · « on arrête » → fin NORMALE : scores complets, archive et emails, comme au tour 10.
       C'est un choix explicite de Marc : la partie a été jouée, elle compte ;
     · plus aucun humain présent à qui demander → fin normale aussi. Remplacer par une IA
       donnerait une partie entièrement automatique que personne ne regarde. */
function nomNation(g, civId) {
  try { const n = g.driver && g.driver.nation(civId); if (n && n.civ) return n.civ.name; } catch (e) {}
  return String(civId || '?');
}
/* Écrit dans le VRAI journal de partie : il part donc aussi dans /debug, dans l'archive et
   dans l'email de fin. Une concession doit laisser une trace, sinon le classement final
   devient incompréhensible pour ceux qui le reçoivent. */
function journaliserPartie(g, msg, cls) {
  const e = { msg, cls: cls || 'gold' };
  try { g.driver.sb.addLog(msg, e.cls); } catch (err) {}
  broadcast(g, { t: 'log', entries: [e] });
}
function conceder(g, civId) {
  if (!g || g.status !== 'playing') return { ok: false, msg: 'la partie n\'est pas en cours' };
  const s = g.seats.find(x => x.civId === civId);
  if (!s || s.ai) return { ok: false, msg: 'siège inconnu, ou déjà tenu par une IA' };
  if (g.concede) return { ok: false, msg: 'une concession est déjà en cours' };
  journaliserPartie(g, '🏳️ ' + nomSiege(g, civId) + ' (' + nomNation(g, civId) + ') concède la victoire et quitte la partie.');
  const restants = humainsPresentsSauf(g, civId).map(x => x.civId);
  g.concede = { cible: civId, choix: {} };
  broadcast(g, { t: 'concede_vote', civId, qui: nomSiege(g, civId), nation: nomNation(g, civId), restants });
  if (!restants.length) { trancherConcession(g, 'stop', 'plus aucun joueur humain'); return { ok: true }; }
  return { ok: true };
}
/* Un des restants a choisi. Unanimité requise ; un seul restant → son choix suffit.
   `restants` est RECALCULÉ à chaque vote, et pas figé à l'ouverture : si quelqu'un se
   déconnecte entre-temps, on resterait sinon à attendre indéfiniment son avis. */
function choixConcession(g, votantCiv, choix) {
  if (!g.concede) return { ok: false, msg: 'aucune concession en cours' };
  if (votantCiv === g.concede.cible) return { ok: false, msg: 'tu ne décides pas de ta propre concession' };
  if (choix !== 'ia' && choix !== 'stop') return { ok: false, msg: 'choix inconnu' };
  g.concede.choix[votantCiv] = choix;
  const restants = humainsPresentsSauf(g, g.concede.cible).map(x => x.civId);
  const manquants = restants.filter(c => !g.concede.choix[c]);
  broadcast(g, { t: 'concede_wait', manquants: manquants.map(c => nomSiege(g, c)) });
  if (manquants.length) return { ok: true, encore: manquants.length };
  const avis = restants.map(c => g.concede.choix[c]);
  const stop = avis.length > 0 && avis.every(x => x === 'stop');
  trancherConcession(g, stop ? 'stop' : 'ia', stop ? 'décision unanime' : (avis.every(x => x === 'ia') ? 'décision unanime' : 'pas d\'unanimité : la partie continue'));
  return { ok: true, encore: 0 };
}
function trancherConcession(g, issue, motif) {
  if (!g.concede) return;
  const cible = g.concede.cible;
  g.concede = null;
  broadcast(g, { t: 'concede_done', issue, civId: cible, motif: motif || '' });
  if (issue === 'ia') {
    journaliserPartie(g, '🤖 ' + nomNation(g, cible) + ' est repris par une IA — la partie continue.');
    remplacerParIA(g, cible);   // solde aussi la question ou le tour d'action laissé en plan
    return;
  }
  journaliserPartie(g, '🛑 Les joueurs restants arrêtent la partie. Les scores sont calculés en l\'état.');
  try { route(g, { kind: 'over' }); } catch (e) { console.error('concession/arrêt:', e.message); }
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
/* REMETTRE UN JOUEUR DANS LE BAIN — appelé quand il revient (`join` après un rafraîchissement)
   et quand il se sent perdu (`resync`). C'est LE point unique qui répond à « où en est la partie,
   et qu'est-ce que j'ai à faire maintenant ? ».
   Il existait deux versions divergentes de ce code (une dans `join`, une dans `resync`) et aucune
   des deux ne savait rendre une action TENUE : après un rafraîchissement au mauvais moment, le
   joueur retrouvait un plateau muet, sans barre Valider/Annuler, et croyait sa partie cassée. */
function renvoyerLaMain(g, s, ws) {
  if (!g || !s || !g.lastRoute || g.status !== 'playing') return;
  const r = g.lastRoute;
  /* SA question à lui, pas celle de la tête de file. Quand tout le monde est interrogé en même
     temps, `r.civId` ne désigne qu'un seul des joueurs : chercher là-dedans aurait renvoyé les
     autres au sablier alors qu'ils avaient une fenêtre en cours. */
  const sienne = (r.kind === 'decision' && Array.isArray(r.questions))
    ? r.questions.find(q => q.civId === s.civId) : null;
  if (sienne) { sendTo(ws, { t: 'decision', pending: sienne.pending }); }
  else if (r.civId === s.civId) {
    if (r.kind === 'decision') sendTo(ws, { t: 'decision', pending: r.pending });
    else if (r.kind === 'action') sendTo(ws, { t: 'your_action', civId: s.civId });
    else if (r.kind === 'confirm') sendTo(ws, { t: 'confirm_pending', civId: s.civId });
  } else {
    sendTo(ws, { t: r.kind === 'decision' ? 'waiting' : 'turn', civId: r.civId, kind: r.pending && r.pending.kind });
  }
  // Et l'état d'absence en cours, sinon celui qui revient ne verrait pas qu'un vote est ouvert.
  if (g.voteOuvert && g.voteOuvert !== s.civId) {
    sendTo(ws, { t: 'absence', civId: g.voteOuvert, votable: true,
                 msg: nomSiege(g, g.voteOuvert) + ' n\'a pas joué depuis un moment. Vous pouvez proposer de le remplacer par une IA.' });
    if (g.vote && g.vote.cible === g.voteOuvert) {
      const requis = humainsPresentsSauf(g, g.voteOuvert).map(x => x.civId);
      sendTo(ws, { t: 'vote', cible: g.voteOuvert, pour: g.vote.pour.slice(), requis,
                   manquants: requis.filter(c => !g.vote.pour.includes(c)) });
    }
  }
  // Idem pour une CONCESSION en cours : sans cela, celui qui revient ne verrait jamais la question,
  // et la partie resterait suspendue à un avis qu'on ne lui a pas demandé.
  if (g.concede) {
    const cible = g.concede.cible;
    sendTo(ws, { t: 'concede_vote', civId: cible, qui: nomSiege(g, cible), nation: nomNation(g, cible),
                 restants: humainsPresentsSauf(g, cible).map(x => x.civId), dejaChoisi: !!g.concede.choix[s.civId] });
  }
}

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
  if (r && (r.kind === 'decision' || r.kind === 'action' || r.kind === 'over')) g._idleEssais = 0; // ça repart : on oublie les tentatives
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
    /* BILAN DE FIN DE TOUR — MULTI-ACTIF (demande de Marc, 2026-08-07 : « chacun doit cliquer ok »).
       AVANT : le bilan était porté par UNE nation ; quand elle cliquait « Continuer », le serveur
       enchaînait sur le tour suivant et la fenêtre disparaissait chez TOUT LE MONDE — y compris chez
       ceux qui étaient encore en train de lire. Les autres n'avaient qu'une `notice`, sans bouton.
       MAINTENANT : chacun reçoit une vraie DÉCISION avec SON propre bilan (`payload.bodies`), et le
       tour ne repart qu'au DERNIER clic. C'est le même mécanisme que l'agenda et les
       investissements ; la machine sait déjà compter les réponses. */
    if (p.kind === 'eot') {
      const humains = g.seats.filter(s => !s.ai && s.user).map(s => s.civId);
      g.attenteBilan = { id: p.id, porteur: civ, restants: humains.slice() };
      /* ⚠️ MÉMORISER LE BILAN DE CHACUN, pas seulement l'envoyer.
         Ce branchement sortait AVANT de renseigner `lastRoute.questions`. Un joueur qui revenait
         pendant le bilan — après un rafraîchissement, ou après un REDÉMARRAGE du serveur, où tout
         le monde se reconnecte — ne recevait donc jamais SA fenêtre : `renvoyerLaMain` ne trouvait
         rien pour lui et le laissait sur un sablier. Or on l'attend pour repartir : la partie
         restait bloquée là, définitivement. Vu une fois sur trois au banc de redémarrage. */
      g.lastRoute.questions = [];
      for (const s of g.seats) {
        if (s.ai || !s.user) continue;
        const corps = (p.payload && p.payload.bodies && p.payload.bodies[s.civId]) || (p.payload && p.payload.html) || '';
        const sien = { id: p.id, kind: 'eot', nation: s.civId, payload: Object.assign({}, p.payload, { html: corps }) };
        g.lastRoute.questions.push({ civId: s.civId, pending: sien });
        if (s.ws) sendTo(s.ws, { t: 'decision', pending: sien });
      }
      broadcast(g, { t: 'bilan_attente', restants: g.attenteBilan.restants.slice() });
      attendre(g, civ);
      return;
    }
    /* ================= PLUSIEURS JOUEURS INTERROGÉS EN MÊME TEMPS =================
       Le moteur peut désormais poser une question à CHACUN (agenda secret, investissements). Le
       serveur envoie à chaque siège LA SIENNE, et ne dit « en attente de X » qu'à ceux qui n'ont
       rien à faire — sinon on affichait un sablier à quelqu'un qui, lui, avait une fenêtre ouverte.
       On n'envoie une question qu'UNE FOIS (`g.envoyees`) : chaque réponse relance `pump()`, qui
       rend les questions encore ouvertes ; les renvoyer effacerait la sélection en cours chez les
       joueurs qui sont justement en train de choisir. */
    const liste = (Array.isArray(r.pendings) && r.pendings.length) ? r.pendings : [p];
    const civDe = q => (typeof q.nation === 'object' && q.nation) ? (q.nation.civ && q.nation.civ.id) : q.nation;
    const questions = liste.map(q => ({ civId: civDe(q), pending: { id: q.id, kind: q.kind, nation: civDe(q), payload: q.payload } }));
    g.lastRoute.questions = questions;
    if (!g.envoyees) g.envoyees = new Set();
    const vivantes = new Set(questions.map(q => q.pending.id));
    for (const id of [...g.envoyees]) if (!vivantes.has(id)) g.envoyees.delete(id);  // question soldée : on oublie
    const occupes = new Set(questions.map(q => q.civId));
    for (const q of questions) {
      if (FENETRES_COLLECTIVES.includes(q.pending.kind)) sendWindowToAll(g, q.pending.kind, q.pending.payload, q.civId);
      if (g.envoyees.has(q.pending.id)) continue;
      g.envoyees.add(q.pending.id);
      sendToCiv(g, q.civId, { t: 'decision', pending: q.pending });
    }
    for (const s of g.seats) {
      if (s.ai || !s.ws || occupes.has(s.civId)) continue;
      sendTo(s.ws, { t: 'waiting', civId: civ, kind: p.kind, civIds: questions.map(q => q.civId) });
    }
    attendre(g, civ); // on attend SA réponse — aussi longtemps qu'il le faut (plus d'auto-réponse au bout de 30 s)
    return;
  }
  if (r.kind === 'action') {
    sendToCiv(g, r.civId, { t: 'your_action', civId: r.civId });
    broadcast(g, { t: 'turn', civId: r.civId, turn: g.driver.state().turn });
    attendre(g, r.civId); // idem : c'est son tour, la partie l'attend
    return;
  }
  if (r.kind === 'over') {
    g.status = 'over';
    oublierPartie(g.code);   // partie finie : l'archive prend le relais
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
  /* ANTI-GEL BORNÉ. Il réessayait toutes les 1,2 s INDÉFINIMENT : une partie réellement bloquée
     produisait une ligne de log par seconde, pour toujours, sans que personne apprenne POURQUOI.
     Maintenant : quelques tentatives, puis on s'arrête et on DIAGNOSTIQUE — c'est exactement ce
     que Marc demandait (« le rafraîchissement amène le jeu à vérifier les bugs éventuels »).
     Le diagnostic vient de la machine à états : elle sait dire quel état attend quoi, et de qui. */
  g._idleEssais = (g._idleEssais || 0) + 1;
  if (g._idleEssais <= 4) {
    if (!g._idleRetry) {
      g._idleRetry = setTimeout(() => {
        g._idleRetry = null;
        try { route(g, g.driver.pump()); } catch (e) { console.error('anti-gel', g.code, ':', e.message); }
      }, 1200);
    }
    return;
  }
  const diag = diagnostiquer(g);
  console.error('route ' + g.code + ' : BLOQUÉE après ' + g._idleEssais + ' tentatives — ' + diag.resume);
  broadcast(g, { t: 'notice', kind: 'info', payload: { msg:
    '⚠️ La partie ne parvient pas à repartir toute seule. ' + diag.resume
    + ' Rafraîchis la page : le serveur revérifiera. Le problème a été signalé.' } });
  sendMail(ADMIN_MAIL, 'Solar — partie bloquée : ' + g.code, diag.texte);
  g._idleEssais = 0;
}

/* CE QUE LE SERVEUR SAIT DIRE D'UNE PARTIE QUI NE BOUGE PAS.
   Avant, la réponse était « rien » : le moteur rendait `idle` et on relançait à l'aveugle.
   La machine à états (bloc @flux de moteur.js) sait, elle, dans quel état on est, qui doit agir,
   et quelles transitions ont mené là. On lui demande. */
function diagnostiquer(g) {
  let d = null;
  try { d = g.driver && g.driver.sb.fluxDiagnostiquer(); } catch (e) {}
  const G = (() => { try { return g.driver.state(); } catch (e) { return null; } })();
  if (!d) return { resume: 'Diagnostic indisponible.', texte: 'Partie ' + g.code + ' : diagnostic indisponible.' };
  const resume = 'État « ' + d.nom + ' » (' + d.type + '), tour ' + d.tour
    + (d.actifs.length ? ', en attente de : ' + d.actifs.join(', ') : ', AUCUNE nation active')
    + (d.soucis.length ? ' — ' + d.soucis[0] : '');
  const texte = [
    'Partie ' + g.code + ' bloquée le ' + frDate(Date.now()),
    'Tour ' + (G ? G.turn : '?') + ' — phase ' + (G ? G.phase : '?'),
    'État du flux : ' + d.nom + ' (' + d.type + ')',
    'Nations actives : ' + (d.actifs.join(', ') || 'aucune'),
    'En attente de réponse : ' + (d.enAttente.join(', ') || 'personne'),
    'Sièges : ' + g.seats.map(s => s.civId + (s.ai ? ' [IA]' : ' [' + (s.user || 'vide') + ']')).join(' · '),
    '',
    'Problèmes détectés :',
    ...(d.soucis.length ? d.soucis.map(x => '  · ' + x) : ['  (aucun — la machine se croit saine, le blocage est ailleurs)']),
    '',
    'Douze dernières transitions :',
    ...(d.histoire || []).map(h => '  tour ' + h.t + ' : ' + h.deNom + ' --' + h.via + '--> ' + h.versNom)
  ].join('\n');
  return { resume, texte };
}
/* Reprise sûre après une exception du moteur : on repompe pour re-dispatcher le jeu. */
function recover(g, tag, e) {
  console.error(tag, g.code, ':', e.message.split('\n')[0]);
  try { route(g, g.driver.pump()); } catch (e2) { console.error(tag, 'recover KO:', e2.message.split('\n')[0]); }
}

/* ============ HTTP (health) + WebSocket ============ */
/* ────────────────────────────────────────────────────────────────────────────────────────────
   TOUTES LES PAGES DE SERVICE SONT SOUS CLÉ  (décision de Marc, 2026-08-07)
   ────────────────────────────────────────────────────────────────────────────────────────────
   Le serveur répond à des adresses qui n'ont rien à voir avec le jeu et qui servaient à la mise
   au point. Laissées ouvertes sur un serveur public, elles donnaient, sans aucun mot de passe :
     · /debug     → la LISTE DES PARTIES EN COURS avec leur code et leur avancement ;
     · /bot       → l'ajout d'un bot dans N'IMPORTE QUELLE partie dont on connaît le code
                    (et on le connaissait, grâce à /debug) ;
     · /mailtest  → l'envoi de courrier depuis l'adresse du domaine ;
     · /stats     → les archives des parties terminées.
   Aucune n'est un trou béant prise isolément ; ensemble elles forment une chaîne complète, de la
   lecture d'un code jusqu'à l'intrusion dans la partie de quelqu'un d'autre.
   Elles exigent maintenant `?key=…`. Sans clé valable : 404 — la page se comporte comme si elle
   n'existait pas, ce qui ne dit rien à qui cherche au hasard (un 403 confirmerait qu'il y a
   quelque chose à trouver). Seul `/health` reste ouvert : Coolify l'interroge pour savoir si le
   serveur est vivant, et il ne révèle que le nombre de parties.
   La clé se règle par la variable d'environnement ADMIN_KEY. Valeur par défaut « marci » pendant
   le rodage, à la demande de Marc — À REMPLACER par quelque chose de long avant d'ouvrir le jeu
   à des inconnus : « marci » est devinable en quelques essais. */
/* ⚠️ AUCUNE CLÉ PAR DÉFAUT DANS LE CODE — LE DÉPÔT EST PUBLIC.
   Il y avait ici `process.env.ADMIN_KEY || 'marci'`. Sur un dépôt public, une clé de repli n'est pas
   un secret : elle est PUBLIÉE. Tant que Coolify fournit `ADMIN_KEY`, le repli ne sert à rien ; le
   jour où cette variable disparaît — nouvelle instance, migration, nettoyage des variables — les
   pages de service se rouvriraient avec une clé que n'importe qui peut lire sur GitHub. Un piège
   différé, et c'est moi qui l'avais posé.
   Sans `ADMIN_KEY`, les pages de service sont donc TOTALEMENT fermées : aucune clé ne les ouvre.
   En cas de doute, fermé — c'est le seul réglage qui ne se dégrade pas tout seul avec le temps. */
const ADMIN_KEY = process.env.ADMIN_KEY || '';
function cleValide(url) {
  if (!ADMIN_KEY) return false;   // pas de clé configurée = pages de service désactivées
  try { return (new URL(url, 'http://x').searchParams.get('key') || '') === ADMIN_KEY; } catch (e) { return false; }
}
function refuser(res) {   // 404 volontaire : on ne confirme pas l'existence de la page
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"ok":true,"games":' + games.size + '}'); return; }
  // Toute page de service exige la clé, AVANT d'exécuter quoi que ce soit.
  if (req.url && /^\/(bot|admin|mailtest|stats|debug)\b/.test(req.url) && !cleValide(req.url)) return refuser(res);
  if (req.url && req.url.indexOf('/bot') === 0) { // inviter le bot « Claude » : /bot?code=XXXX[&civ=martiens]&key=…
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
    // La clé a déjà été vérifiée à l'entrée du serveur HTTP (voir le bandeau plus haut).
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
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
    /* ⚠️ PAGE PROTÉGÉE. Elle affiche l'identifiant SMTP et déclenche des connexions vers OVH :
       laissée ouverte, n'importe qui pouvait lire la configuration et marteler le serveur de mail
       (défaut introduit avec la page elle-même, corrigé aussitôt). */
    const KEY_M = ADMIN_KEY;
    if (false) {   // clé déjà vérifiée à l'entrée ; on garde la branche pour ne pas déplacer le reste
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      /* La VERSION figure même sur le refus : sans elle, on ne sait pas si la page vient du build
         qu'on croit — ambiguïté qui nous a déjà coûté un aller-retour de déploiement. */
      res.end((KEY_M
        ? 'Accès refusé.\n\nLa clé attendue est la valeur de la variable ADMIN_KEY de ce serveur\n'
          + '(celle qui protège déjà /admin/reset), PAS le mot de passe de la boîte mail.\n'
          + 'À lire dans Coolify → variables d\'environnement de live.solar-game.com.\n\n'
          + 'Puis : /mailtest?key=LA_VALEUR_DE_ADMIN_KEY'
        : 'Page désactivée : définis la variable ADMIN_KEY sur le serveur, puis appelle /mailtest?key=TA_CLE')
        + '\n\nVersion du serveur : ' + SERVER_BUILD + '\n');
      return;
    }
    const dest = q.get('to');
    /* Essai d'AUTRES réglages sans redéployer : chaque aller-retour Coolify coûte plusieurs minutes,
       et il faut souvent tester plusieurs serveurs OVH (MX Plan ≠ Email Pro ≠ Exchange).
       Le mot de passe n'est JAMAIS acceptable en paramètre d'URL — seuls l'hôte et le port. */
    const hostAlt = q.get('host'), portAlt = parseInt(q.get('port'), 10);
    const out = [];
    out.push('SOLAR — DIAGNOSTIC EMAIL  (' + frDate(Date.now()) + ')  —  serveur ' + SERVER_BUILD);
    out.push('');
    out.push('CONFIGURATION EFFECTIVE');
    out.push('  SMTP_HOST   : ' + (SMTP_HOST || '(absent)'));
    out.push('  SMTP_PORT   : ' + SMTP_PORT);
    out.push('  chiffrement : ' + (SMTP_SECURE ? 'SSL direct (secure=true)' : 'STARTTLS (secure=false)')
             + ' — imposé par le port ' + SMTP_PORT
             + (_secureForce ? '  [SMTP_SECURE=' + process.env.SMTP_SECURE + ' ignoré, incompatible avec ce port]' : ''));
    out.push('  SMTP_USER   : ' + (SMTP_USER || '(absent)'));
    /* Longueur + caractères « fragiles » : si le mot de passe contient $ ` " ' \ ou une espace, il a
       pu être MANGÉ par Coolify/Docker au passage en variable d'environnement. Comparer la longueur
       affichée avec celle du vrai mot de passe le dit immédiatement, sans jamais l'exposer. */
    const _pw = SMTP_PASS;
    const _fragiles = (_pw.match(/[$`"'\\ ]/g) || []);
    out.push('  SMTP_PASS   : ' + (_pw ? '(défini, ' + _pw.length + ' caractères'
      + (_fragiles.length ? ' — dont ' + _fragiles.length + ' caractère(s) fragile(s) : ' + [...new Set(_fragiles)].join(' ') : '')
      + ')' : '(ABSENT)'));
    if (_pw) out.push('              ↑ compare cette LONGUEUR avec ton vrai mot de passe : si elle diffère,');
    if (_pw) out.push('                c\'est Coolify qui l\'a tronqué, pas OVH qui te refuse.');
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
    /* Transport d'essai si un hôte/port de rechange est demandé (?host=…&port=…) — pour éprouver
       un autre serveur OVH sans redéployer. Mêmes identifiants, seul le point d'entrée change. */
    let _t = _transport;
    if (hostAlt || portAlt) {
      try {
        const nm = require('nodemailer');
        const h = _net(hostAlt) || SMTP_HOST;
        const p2 = portAlt || SMTP_PORT;
        const s2 = (p2 === 465);
        _t = nm.createTransport({ host: h, port: p2, secure: s2, requireTLS: !s2,
          auth: { user: SMTP_USER, pass: SMTP_PASS } });
        out.push('ESSAI AVEC D\'AUTRES RÉGLAGES : ' + h + ':' + p2 + ' (' + (s2 ? 'SSL' : 'STARTTLS') + ')');
        out.push('');
      } catch (e) { out.push('essai impossible : ' + e.message); }
    }
    out.push('CONNEXION RÉELLE AU SERVEUR');
    _t.verify()
      .then(() => {
        out.push('  ✅ connexion et authentification acceptées.');
        if (!dest) { out.push('\n  (ajoute ?to=ton@email pour envoyer un message d\'essai)'); return fin(); }
        return _t.sendMail({ from: MAIL_FROM, to: dest, subject: 'Solar — test d\'envoi',
          text: 'Si tu lis ceci, la configuration SMTP fonctionne.\n\n' + frDate(Date.now()) })
          .then(info => { out.push('  ✅ message d\'essai envoyé à ' + dest + ' (id ' + (info && info.messageId) + ')'); fin(); });
      })
      .catch(e => {
        out.push('  ❌ ÉCHEC : ' + e.message);
        if (e && e.responseCode) out.push('  code SMTP : ' + e.responseCode);
        if (e && e.response) out.push('  réponse du serveur : ' + String(e.response).slice(0, 300));
        out.push('');
        /* La lecture doit correspondre à l'erreur REELLEMENT reçue : afficher l'explication du 535
           sur une panne DNS enverrait Marc chercher au mauvais endroit. */
        const _code = (e && e.responseCode) || 0;
        const _msg = String((e && e.message) || '');
        const _est535 = _code === 535 || /535/.test(_msg);
        const _estReseau = /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH/.test(_msg);
        out.push('LECTURE DE CETTE ERREUR');
        if (_estReseau) {
          out.push('  Erreur RÉSEAU, pas d\'authentification : le serveur de mail n\'a pas pu être joint.');
          out.push('  → nom d\'hôte incorrect, ou port sortant bloqué depuis le VPS.');
          out.push('  Les identifiants ne sont donc PAS en cause ici.');
        } else if (_est535) {
        out.push('  535 → identifiants refusés. Si la configuration est cohérente ci-dessus, les causes');
        out.push('        restantes sont, par ordre de fréquence :');
        out.push('        1. « ' + (SMTP_USER||'?') + ' » est une REDIRECTION (alias), pas une vraie boîte.');
        out.push('           Une redirection ne peut PAS s\'authentifier. À vérifier dans l\'espace OVH :');
        out.push('           Web Cloud → E-mails → onglet « Comptes e-mail ». Si l\'adresse n\'y figure que');
        out.push('           dans « Redirections », il faut CRÉER un compte e-mail avec cette adresse.');
        out.push('        2. Mot de passe de la BOÎTE, pas celui du compte OVH — ce sont deux choses distinctes.');
        out.push('        3. Mauvais serveur pour ton offre : MX Plan = ssl0.ovh.net · Email Pro / Exchange =');
        out.push('           pro*.mail.ovh.net ou ex*.mail.ovh.net. Essaie sans redéployer :');
        out.push('           /mailtest?key=TA_CLE&host=pro2.mail.ovh.net&port=587');
        out.push('        4. Boîte créée il y a moins d\'une heure : OVH n\'a pas fini de la provisionner.');
        } else if (_code === 550 || _code === 553) {
          out.push('  Authentification acceptée, mais EXPÉDITEUR refusé : MAIL_FROM doit être la boîte authentifiée.');
        } else {
          out.push('  Erreur non répertoriée. Code : ' + (_code || 'aucun') + '. Envoie cette page à Claude.');
        }
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
  if (req.url === '/debug' || req.url.indexOf('/debug?') === 0) { // diagnostic de rodage (exige ?key=…) (pas de secrets : codes + avancement)
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
        // journal COMPLET — sans aucune troncature, remis dans l'ordre chronologique
        journal = (G.log || []).map(l => plainText((l && l.msg) || l)).reverse();   // ENTIER, et sans couper les lignes : une ligne tronquée à 180 caractères perdait la fin du compte rendu de combat
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
          /* ⚠️ LE RAPPORT ARRIVE APRÈS L'EMAIL DE FIN DE PARTIE, PAS AVANT.
             Le signalement se saisit sur l'écran de fin — donc quelques secondes à quelques minutes
             après l'archivage, qui a déjà envoyé le rapport complet. Attendre ce bug avant d'envoyer
             l'email n'a pas de sens : on ne sait pas s'il viendra. On renvoie donc le rapport COMPLET
             une seconde fois, cette fois avec le signalement à sa place — entre les scores et le
             journal, comme demandé. Le joueur reçoit deux messages ; le second remplace le premier. */
          try {
            const listMaj = readArch(who);
            if (listMaj.length && listMaj[0].scores && listMaj[0].scores.length) {
              const maj = corpsRapport(listMaj[0]);
              sendMail(who, 'Solar — fin de partie ' + listMaj[0].code + ' (avec ton signalement)', maj);
              sendMail(ADMIN_MAIL, 'Solar — partie ' + listMaj[0].code + ' + signalement', maj);
            }
          } catch (e) { console.error('bug_report renvoi:', e.message); }
          sendTo(ws, { t: 'notice', kind: 'info', payload: { msg: 'Merci ! Ton signalement a été transmis.' } });
          break;
        }

        case 'login': {
          const u = String(m.user || '').trim().toLowerCase();
          if (!users[u] || !checkPass(m.pass, users[u].pass)) return err('identifiants incorrects');
          const token = crypto.randomBytes(24).toString('hex');
          tokens.set(token, { user: u, vu: Date.now() }); saveTokens(true); // création : écriture immédiate
          sess.user = u;
          sendTo(ws, { t: 'logged', user: u, token, tier: users[u].tier || 1 });
          break;
        }

        case 'token': { // reconnexion rapide avec un token encore valide
          const u = userDuToken(m.token);   // rafraîchit la péremption glissante
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
          const g = { code: newCode(), host: sess.user, seats, status: 'lobby', driver: null, timer: null, lastRoute: null,
                      cree: Date.now() };
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
          if (g.status === 'playing') {
            // il est revenu : toute proposition de remplacement le concernant tombe, l'échéance repart à zéro
            if (g.attendu === s.civId) attendre(g, s.civId);
            renvoyerLaMain(g, s, ws);
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
          g.status = 'playing';
          broadcast(g, { t: 'started', game: gameView(g) });
          // Décisions humaines : récupérées via pump(). Notices : acquittées par le pump, distribuées
          // par le puits ci-dessous (voir `puitsNotices` pour le pourquoi du destinataire unique).
          g.driver.boot(g.seats.map(s => ({ civId: s.civId, isAI: s.ai })), puitsNotices(g));
          installerJournalPilote(g);
          route(g, g.driver.pump());
          break;
        }

        case 'answer': { // {t:'answer', id, ans}
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          /* On cherche la question dans TOUTE la file, plus seulement en tête : depuis que plusieurs
             joueurs sont interrogés en même temps, la réponse qui arrive en premier n'est pas
             forcément celle de la question de tête — la refuser comme « périmée » aurait bloqué
             tous ceux qui répondent vite. */
          const enAttente = (typeof g.driver.sb.fluxQuestionsEnAttente === 'function')
            ? g.driver.sb.fluxQuestionsEnAttente()
            : (g.driver.state()._pending ? [g.driver.state()._pending] : []);
          const p = enAttente.find(q => q && q.id === m.id);
          if (!p) return err('décision périmée', { id: m.id });
          /* BILAN MULTI-ACTIF : la même question est posée à TOUS les humains. On enregistre les
             accusés de réception un par un et on ne répond au moteur qu'au DERNIER — sinon le tour
             repartirait dès le premier clic et la fenêtre disparaîtrait chez les autres. */
          if (g.attenteBilan && g.attenteBilan.id === m.id) {
            const i = g.attenteBilan.restants.indexOf(s.civId);
            if (i >= 0) g.attenteBilan.restants.splice(i, 1);
            if (g.attenteBilan.restants.length) {
              broadcast(g, { t: 'bilan_attente', restants: g.attenteBilan.restants.slice() });
              break;                                   // il en manque : on attend
            }
            g.attenteBilan = null;
            try { route(g, g.driver.answer(m.id, {})); }
            catch (e) { err(e.message.split('\n')[0]); recover(g, 'answer', e); }
            break;
          }
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
          /* ⚠️ `_actingCiv` EXCLUT son porteur du journal des actions diffusé (les « fenêtres rouges »).
             Il DOIT donc être relâché quoi qu'il arrive. Il était remis à `null` juste après
             `driver.act()`, À L'INTÉRIEUR du `try` : si l'action levait une exception — ce qui
             arrive, `recover()` existe pour ça — on sautait au `catch` et le drapeau restait collé
             sur ce joueur. Il était alors exclu du journal **pour le reste de la partie**, d'un coup
             et sans retour. C'est le bug vécu par l'ami de Marc le 2026-08-07 (partie DB55).
             Le `finally` ci-dessous est la garantie que ça ne peut plus arriver. */
          try {
            g._actingCiv = s.civId;                       // auteur de l'action (exclu du journal diffusé)
            const rr = g.driver.act(s.civId, m.action || { type: 'pass' });
            const act = m.action || {};
            if (act.type && act.type !== 'pass' && act.type !== 'skip') {   // 'skip' = renoncer à un coup : rien à annoncer
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
              // AVANT : auto-Valider au bout de 2 min. Une action était donc VALIDÉE À SA PLACE pendant
              // qu'il rechargeait sa page. Maintenant l'action reste TENUE : il la retrouvera telle quelle
              // en revenant (voir `resync`), et si vraiment il ne revient pas, les autres pourront voter.
              attendre(g, s.civId);
            } else {
              route(g, rr);
            }
          }
          catch (e) { err(e.message.split('\n')[0]); recover(g, 'act', e); }
          finally { g._actingCiv = null; }   // ← relâché même si l'action a échoué (voir plus haut)
          break;
        }

        case 'concede': { // {t:'concede'} — le joueur quitte la partie de son plein gré
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          const r = conceder(g, s.civId);
          if (!r.ok) return err(r.msg);
          break;
        }

        case 'concede_choice': { // {t:'concede_choice', choix:'ia'|'stop'} — avis d'un joueur restant
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          const r = choixConcession(g, s.civId, m.choix);
          if (!r.ok) return err(r.msg);
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

        case 'vote_ia': { // {t:'vote_ia'} — proposer/soutenir le remplacement de l'absent par une IA
          if (!requireAuth() || !requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g || !s) return err('pas dans cette partie');
          const r = voterRemplacement(g, s.civId);
          if (!r.ok) return err(r.msg);
          break;
        }

        case 'resync': { // le client se sent perdu → on lui renvoie où en est la partie
          if (!requireGame()) break;
          const g = games.get(sess.game);
          const s = seatOf(g, ws) || seatOf(g, sess.user);
          if (!g.driver || !s) return err('pas dans cette partie');
          renvoyerLaMain(g, s, ws);
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
            oublierPartie(g.code);
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
      // Une déconnexion ne déclenche RIEN. Surtout pas un tour joué à sa place : c'est le plus souvent
      // un simple rafraîchissement de page. On signale seulement l'absence aux autres.
      if (s) broadcast(g, { t: 'absence', civId: s.civId, votable: false,
                            msg: nomSiege(g, s.civId) + ' s\'est déconnecté.' });
    }
  });
});

/* ============================================================================
   CONTRÔLE AU DÉMARRAGE — le moteur se charge-t-il ?
   ----------------------------------------------------------------------------
   Le 2026-08-07, le serveur a démarré normalement, accepté une connexion, affiché
   le lobby… puis explosé au moment de créer la partie : « MOTEUR INTROUVABLE :
   /app/moteur.js ». L'image Docker ne copiait qu'`index.html` — son Dockerfile
   datait d'avant l'extraction des règles dans `moteur.js` (v7.2).
   Un serveur qui accueille des joueurs alors qu'il est incapable de faire tourner
   une partie est pire qu'un serveur éteint : le joueur perd son temps et croit que
   c'est le jeu qui est cassé. On vérifie donc AVANT d'écouter, et on refuse de
   démarrer avec un message qui dit quoi faire.
   Coût : ~1 s au démarrage, une fois. C'est le prix d'un échec franc.
   ========================================================================== */
try {
  const _t0 = Date.now();
  new GameDriver(HTML);
  console.log('Moteur vérifié au démarrage (' + (Date.now() - _t0) + ' ms) — ' + HTML);
} catch (e) {
  console.error('\n❌ DÉMARRAGE REFUSÉ — le moteur du jeu ne se charge pas :\n');
  console.error(e.message);
  console.error('\nLe serveur ne peut faire tourner AUCUNE partie dans cet état. Il vaut mieux ne pas');
  console.error('démarrer que d\'accueillir des joueurs et les planter à la création de leur partie.');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log('Solar Conquest server — port ' + PORT + ' — moteur: ' + HTML + ' — data: ' + DATA);
  // Les parties en cours sont rechargées depuis leur fichier (état + déroulement). Voir le bandeau
  // « PARTIES QUI SURVIVENT AU REDÉMARRAGE » plus haut.
  try { rechargerParties(); } catch (e) { console.error('rechargerParties:', e.message); }
});
