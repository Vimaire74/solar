/* ============================================================================
   TEST — « RAFRAÎCHIR LA PAGE NE CASSE PLUS LA PARTIE »   (lot 17, étape A)
   ----------------------------------------------------------------------------
   POURQUOI CE TEST EXISTE
   Marc : « j'aimerais que rafraîchir la page ne casse pas la partie ». Le défaut
   n'était pas côté navigateur mais côté SERVEUR : à la fermeture de la socket, il
   armait un compte à rebours de 30 s au bout duquel **l'IA répondait à sa place**.
   Recharger le jeu peut dépasser 30 s (mobile, réseau lent, cache vide) : le temps
   de revenir, son tour avait été joué. Le geste le plus anodin cassait la partie.

   CE QUE CE TEST PROUVE, sur un VRAI serveur et de VRAIES WebSockets :
     1. un joueur qui disparaît ne fait RIEN avancer — même longtemps après
        l'échéance, la partie l'attend toujours (aucune réponse inventée) ;
     2. en revenant, il retrouve SA fenêtre, la MÊME, SANS RIEN CLIQUER ;
     3. l'échéance n'ouvre qu'une POSSIBILITÉ : les autres joueurs peuvent voter
        son remplacement par une IA — et c'est le vote, pas l'horloge, qui décide ;
     4. après ce vote, la partie repart et va jusqu'au bout.

   Un test qui se contenterait de vérifier « la partie finit » passerait même avec
   l'ancien auto-jeu : c'est précisément ce qui a laissé le défaut vivre si
   longtemps. On vérifie donc surtout ce qui NE DOIT PAS arriver.

   Usage : node test_refresh.js        (démarre son propre serveur, port libre)
   ========================================================================== */
'use strict';
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8100 + Math.floor(Math.random() * 400);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-refresh-'));
const ECHEANCE_MS = 1200;          // échéance très courte : le test dure des secondes, pas des minutes
const PATIENCE_MS = 4000;          // temps pendant lequel on vérifie que RIEN ne bouge tout seul
const PASS = 'test-123456';
// L'identifiant de compte est une ADRESSE EMAIL (le serveur refuse tout le reste) : un simple
// pseudo faisait échouer l'inscription, et le test attendait un « logged » qui ne venait jamais.
const A_MAIL = 'refa@test.local', B_MAIL = 'refb@test.local';

const ecarts = [];                 // ce qui ne s'est pas passé comme il faut
const journal = [];
function note(s) { journal.push(s); console.log('   ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }

/* ── le serveur, dans son propre processus ─────────────────────────────────── */
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, ECHEANCE_MS: String(ECHEANCE_MS) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let srvSorti = false;
srv.on('exit', c => { srvSorti = true; if (c) console.log('serveur sorti code ' + c); });
srv.stderr.on('data', d => { const t = String(d).trim(); if (t) console.log('   [serveur] ' + t); });

function fin(code) {
  try { srv.kill('SIGKILL'); } catch (e) {}
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}
// Filet de diagnostic : un test qui meurt SANS RIEN DIRE est le pire des résultats.
process.on('unhandledRejection', e => { ko('promesse rejetée sans traitement : ' + (e && e.message || e)); bilan(); });
process.on('uncaughtException', e => { ko('exception non interceptée : ' + (e && e.stack || e)); bilan(); });
const garde = setTimeout(() => { ko('TIMEOUT global (75 s)'); bilan(); }, 75000);

/* ── un client, réduit au strict nécessaire ────────────────────────────────── */
function client(nom) {
  const c = {
    nom, ws: null, token: null, civ: null, code: null,
    pending: null, monTour: false, absence: null, vote: null,
    recus: [], fini: false, sur: {}
  };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) {} };
  c.attendre = (t, ms) => new Promise((res, rej) => {           // attend UN message de type t
    const fini = setTimeout(() => rej(new Error(c.nom + ' : rien reçu de type « ' + t +' » en ' + ms + ' ms')), ms || 15000);
    c.sur[t] = m => { clearTimeout(fini); delete c.sur[t]; res(m); };
  });
  c.ouvrir = () => new Promise((res, rej) => {
    c.ws = new WebSocket('ws://127.0.0.1:' + PORT);
    c.ws.on('open', res);
    // ⚠️ SANS ce rejet, une connexion refusée laissait la promesse en suspens POUR TOUJOURS :
    // le test se figeait sans un mot, ce qui est pire qu'un échec (on croit qu'il travaille).
    c.ws.on('error', e => rej(e));
    c.ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      c.recus.push(m.t);
      if (m.t === 'logged') c.token = m.token;
      if (m.t === 'game') { c.code = m.game.code; const s = m.game.seats.find(x => x.user === c.nom); if (s) c.civ = s.civId; }
      if (m.t === 'decision') c.pending = m.pending;
      if (m.t === 'your_action') c.monTour = true;
      if (m.t === 'absence') c.absence = m;
      if (m.t === 'vote') c.vote = m;
      if (m.t === 'over') c.fini = true;
      if (c.sur[m.t]) c.sur[m.t](m);
    });
  });
  return c;
}
const dodo = ms => new Promise(r => setTimeout(r, ms));

/* ── répondre à tout ce qui arrive : sert à faire avancer la partie ───────── */
function reponseParDefaut(pending) {
  const pay = (pending && pending.payload) || {};
  for (const k of Object.keys(pay)) {
    const v = pay[k];
    if (Array.isArray(v) && v.length) { const o = v[0]; const id = (o && o.id !== undefined) ? o.id : 0; return { choice: id, index: 0, [k.replace(/s$/, '')]: id }; }
  }
  return {};
}
function pilotageAuto(c) {   // ce client joue tout seul (sauf quand on le débranche)
  c.auto = true;
  c.ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!c.auto) return;
    if (m.t === 'decision') c.send({ t: 'answer', id: m.pending.id, ans: reponseParDefaut(m.pending) });
    if (m.t === 'your_action') c.send({ t: 'act', action: { type: 'pass' } });
  });
}

async function main() {
  // attendre que le serveur écoute
  let debout = false;
  for (let i = 0; i < 80 && !srvSorti && !debout; i++) {
    try { const t = client('probe'); await t.ouvrir(); t.ws.close(); debout = true; } catch (e) { await dodo(250); }
  }
  if (!debout) { ko('le serveur n\'a pas démarré sur le port ' + PORT); return bilan(); }

  const A = client(A_MAIL), B = client(B_MAIL);
  await A.ouvrir(); await B.ouvrir();
  A.send({ t: 'register', user: A_MAIL, pass: PASS }); A.send({ t: 'login', user: A_MAIL, pass: PASS });
  B.send({ t: 'register', user: B_MAIL, pass: PASS }); B.send({ t: 'login', user: B_MAIL, pass: PASS });
  await A.attendre('logged'); await B.attendre('logged');

  A.send({ t: 'create', civId: 'terriens', seats: [{ civId: 'martiens', ai: false }, { civId: 'jupiteriens', ai: true }, { civId: 'ceinturiens', ai: true }] });
  const gv = await A.attendre('game');
  B.send({ t: 'join', code: gv.game.code, civId: 'martiens' });
  await B.attendre('game');
  A.send({ t: 'start' });
  await A.attendre('started');
  note('partie ' + gv.game.code + ' démarrée — A=terriens (humain), B=martiens (humain), 2 IA');

  // ── on avance jusqu'à ce que A ait quelque chose à faire ──────────────────
  pilotageAuto(B);
  let tour = 0;
  while (!A.pending && !A.monTour && tour++ < 200) await dodo(50);
  if (!A.pending && !A.monTour) { ko('A n\'a jamais rien reçu à faire'); return bilan(); }
  const aFaire = A.pending ? ('décision ' + A.pending.kind + ' (' + A.pending.id + ')') : 'tour d\'action';
  note('A doit jouer : ' + aFaire);

  /* ══ ÉPREUVE 1 — il ferme sa page. La partie ne doit PAS avancer sans lui ══ */
  const avantB = B.recus.length;
  const pendingAvant = A.pending ? A.pending.id : null;
  A.auto = false;
  A.ws.close();                                   // ← le rafraîchissement : la socket meurt
  note('A a fermé sa page (échéance serveur = ' + ECHEANCE_MS + ' ms)');
  await dodo(PATIENCE_MS);                        // bien au-delà de l'échéance

  if (B.monTour || (B.pending && B.pending.id !== pendingAvant && B.recus.slice(avantB).includes('decision'))) {
    ko('LA PARTIE A AVANCÉ SANS A : le serveur a joué à sa place (c\'est exactement le bug corrigé).');
  } else {
    note('✔ ' + (PATIENCE_MS / 1000) + ' s après l\'échéance : la partie attend toujours A. Rien n\'a été joué à sa place.');
  }
  if (!B.absence) ko('B n\'a pas été prévenu de l\'absence de A');
  else if (!B.absence.votable) ko('l\'échéance est passée mais le vote n\'est pas proposé à B');
  else note('✔ B voit l\'absence et peut proposer un remplacement (il n\'y est pas obligé)');

  /* ══ ÉPREUVE 2 — il revient. Il doit retrouver SA fenêtre, sans rien cliquer ══ */
  const A2 = client(A_MAIL);
  await A2.ouvrir();
  A2.send({ t: 'token', token: A.token });        // reconnexion silencieuse, comme au chargement de la page
  await A2.attendre('logged');
  A2.send({ t: 'join', code: gv.game.code });     // ce que online.js fait tout seul avec sc_ws_game
  // ⚠️ Chaque branche porte SON PROPRE .catch. Sans cela, la branche perdante rejette APRÈS
  // que la course est gagnée : rejet non intercepté → Node tue le processus, et le test
  // mourait en silence juste avant d'imprimer son verdict.
  const retrouve = await Promise.race([
    A2.attendre('decision', 6000).then(m => 'décision ' + m.pending.kind + ' (' + m.pending.id + ')').catch(() => new Promise(() => {})),
    A2.attendre('your_action', 6000).then(() => 'tour d\'action').catch(() => new Promise(() => {})),
    dodo(6500).then(() => null)
  ]);

  if (!retrouve) ko('A est revenu mais n\'a RIEN reçu : sa partie a l\'air cassée (c\'est le symptôme que décrit Marc)');
  else if (retrouve !== aFaire) ko('A retrouve « ' + retrouve + ' » alors qu\'il avait « ' + aFaire + ' »');
  else note('✔ A revient et retrouve EXACTEMENT « ' + retrouve + ' », sans le moindre clic');
  if (A2.absence) ko('le bandeau d\'absence de A lui est renvoyé à lui-même');

  /* ══ ÉPREUVE 3 — il repart pour de bon. B vote. C'est le VOTE qui décide ══ */
  A2.ws.close();
  note('A repart, cette fois pour de bon');
  await dodo(ECHEANCE_MS + 800);
  if (!B.absence || !B.absence.votable) { ko('le vote n\'est pas rouvert après la seconde absence'); return bilan(); }
  B.vote = null;
  B.send({ t: 'vote_ia' });                       // seul humain présent → son vote fait l'unanimité
  await dodo(1500);
  if (!B.vote) ko('aucun retour de vote reçu');
  else if ((B.vote.manquants || []).length) ko('vote non conclusif alors que B est le seul humain présent');
  else note('✔ le vote de B (seul présent = unanimité) déclenche le remplacement par une IA');

  /* ══ ÉPREUVE 4 — la partie REPART ══
     On ne joue pas la partie jusqu'au bout ici : `test_ws.js` le fait déjà, et un test long
     finit par ne plus être lancé. Ce qu'il faut prouver, c'est que le vote a DÉBLOQUÉ le flux :
     la décision sur laquelle la table était figée est soldée et la main est passée. */
  const bloquante = pendingAvant;
  const t0 = Date.now();
  let repartie = false;
  while (!repartie && Date.now() - t0 < 15000) {
    if (B.fini) { repartie = true; break; }
    if (B.monTour) { repartie = true; break; }
    if (B.pending && B.pending.id !== bloquante) { repartie = true; break; }
    await dodo(100);
  }
  if (!repartie) ko('après le vote, la partie est restée figée sur « ' + aFaire + ' »');
  else note('✔ la partie est repartie : la décision qui la bloquait est soldée, la main a circulé');

  bilan();
}

function bilan() {
  clearTimeout(garde);
  console.log('\n────────────────────────────────────────────────────────');
  if (ecarts.length) {
    console.log('❌ ' + ecarts.length + ' problème(s) :');
    ecarts.forEach(e => console.log('   · ' + e));
    fin(1);
  }
  console.log('✅ Rafraîchir ne casse plus la partie : rien ne se joue à la place d\'un absent,');
  console.log('   il retrouve sa fenêtre en revenant, et seul un VOTE peut le remplacer par une IA.');
  fin(0);
}

main().catch(e => { ko('exception : ' + e.message); bilan(); });
