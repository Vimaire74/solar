/* ============================================================================
   TEST — UNE PARTIE SURVIT AU REDÉMARRAGE DU SERVEUR
   ----------------------------------------------------------------------------
   POURQUOI. Les parties ne vivaient qu'en mémoire : chaque mise à jour du serveur,
   chaque redéploiement, chaque plantage les effaçait toutes. Pour un jeu où une
   partie peut durer plusieurs jours (mode tour par tour), personne ne commence une
   partie qu'un redémarrage peut effacer.

   POURQUOI CE N'ÉTAIT PAS FAISABLE AVANT. On savait déjà écrire l'état d'une partie
   et le relire à l'identique. Mais elle ne REPARTAIT pas : le déroulement vivait
   dans des fonctions (« et après cette réponse, fais ceci »), et JSON n'écrit pas
   de fonctions. Depuis que le flux est une machine à états rangée dans `G._flux`,
   sauver `G` sauve la partie entière — règles ET déroulement. C'est le modèle BGA.

   CE QUE CE TEST FAIT, pour de vrai :
     1. il démarre un serveur, joue une vraie partie à 2 humains sur quelques tours ;
     2. il TUE le serveur (SIGKILL — pas d'arrêt propre, comme un plantage) ;
     3. il le relance sur le même dossier de données ;
     4. le joueur se reconnecte et doit retrouver SA partie, au même tour, avec le
        même journal, ET la main — pas seulement un plateau à regarder.

   Usage : node test_redemarrage.js [coups]     (défaut 25)
   ========================================================================== */
'use strict';
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8500 + Math.floor(Math.random() * 400);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-redem-'));
const PASS = 'test-123456';
const A_MAIL = 'reda@test.local', B_MAIL = 'redb@test.local';
const COUPS = parseInt(process.argv[2] || '25', 10);

const ecarts = [];
function note(s) { console.log('   ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
const dodo = ms => new Promise(r => setTimeout(r, ms));

let srv = null;
function demarrer() {
  srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, ECHEANCE_MS: '600000' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stdout.on('data', d => { const t = String(d).trim(); if (/reprise|reprises|NON reprise/i.test(t)) console.log('   [serveur] ' + t); });
  srv.stderr.on('data', d => { const t = String(d).trim(); if (t && !/SMTP/.test(t)) console.log('   [serveur] ' + t); });
}
const _clients = [];
function fin(code) {
  try { srv && srv.kill('SIGKILL'); } catch (e) {}
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
  process.exitCode = code;
  clearTimeout(garde);
  for (const c of _clients) { try { c.ws && c.ws.terminate(); } catch (e) {} }
}
const garde = setTimeout(() => { ko('TIMEOUT global'); bilan(); }, 70000);
process.on('unhandledRejection', e => { ko('promesse rejetée : ' + (e && e.message || e)); bilan(); });

function client(nom) {
  const c = { nom, ws: null, token: null, code: null, coups: 0, sur: {}, auto: false, fini: false };
  _clients.push(c);
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) {} };
  c.attendre = (t, ms) => new Promise((res, rej) => {
    const h = setTimeout(() => { delete c.sur[t]; rej(new Error(c.nom + ' : rien de type « ' + t + ' »')); }, ms || 12000);
    c.sur[t] = m => { clearTimeout(h); delete c.sur[t]; res(m); };
  });
  c.ouvrir = () => new Promise((res, rej) => {
    c.ws = new WebSocket('ws://127.0.0.1:' + PORT);
    c.ws.on('open', res);
    c.ws.on('error', e => rej(e));
    c.ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (m.t === 'logged') c.token = m.token;
      if (m.t === 'game') c.code = m.game.code;
      if (m.t === 'over') c.fini = true;
      if (m.t === 'decision' && c.auto) { c.coups++; c.send({ t: 'answer', id: m.pending.id, ans: reponse(m.pending) }); }
      if (m.t === 'your_action' && c.auto) { c.coups++; c.send({ t: 'act', action: { type: 'pass' } }); }
      if (c.sur[m.t]) c.sur[m.t](m);
    });
  });
  return c;
}
function reponse(p) {
  const pay = (p && p.payload) || {};
  for (const k of Object.keys(pay)) { const v = pay[k]; if (Array.isArray(v) && v.length) { const o = v[0]; const id = (o && o.id !== undefined) ? o.id : 0; return { choice: id, index: 0, [k.replace(/s$/, '')]: id }; } }
  return {};
}
async function attendreServeur() {
  for (let i = 0; i < 80; i++) {
    try { const t = client('probe'); await t.ouvrir(); t.ws.close(); return true; } catch (e) { await dodo(250); }
  }
  return false;
}

async function main() {
  console.log('═'.repeat(72));
  console.log('UNE PARTIE EN COURS SURVIT-ELLE À UN REDÉMARRAGE DU SERVEUR ?');
  console.log('═'.repeat(72) + '\n');

  demarrer();
  if (!await attendreServeur()) { ko('le serveur n\'a pas démarré'); return bilan(); }

  const A = client(A_MAIL), B = client(B_MAIL);
  await A.ouvrir(); await B.ouvrir();
  A.send({ t: 'register', user: A_MAIL, pass: PASS }); A.send({ t: 'login', user: A_MAIL, pass: PASS });
  B.send({ t: 'register', user: B_MAIL, pass: PASS }); B.send({ t: 'login', user: B_MAIL, pass: PASS });
  await A.attendre('logged'); await B.attendre('logged');

  A.send({ t: 'create', civId: 'terriens', seats: [{ civId: 'martiens', ai: false }, { civId: 'jupiteriens', ai: true }, { civId: 'ceinturiens', ai: true }] });
  const gv = await A.attendre('game');
  const CODE = gv.game.code;
  B.send({ t: 'join', code: CODE, civId: 'martiens' });
  await B.attendre('game');
  A.send({ t: 'start' }); await A.attendre('started');
  note('partie ' + CODE + ' démarrée (2 humains + 2 IA)');

  A.auto = true; B.auto = true;
  const t0 = Date.now();
  while (A.coups + B.coups < COUPS && Date.now() - t0 < 15000 && !A.fini) await dodo(60);
  A.auto = false; B.auto = false;
  await dodo(500);

  A.send({ t: 'state' });
  const avant = await A.attendre('state');
  const tourAvant = avant.state && avant.state.turn;
  const journalAvant = ((avant.state && avant.state.log) || []).length;
  note(A.coups + B.coups + ' entrées jouées — tour ' + tourAvant + ', ' + journalAvant + ' lignes de journal');

  const fiche = path.join(DATA, 'games', CODE + '.json');
  if (!fs.existsSync(fiche)) {
    if (A.fini || B.fini) { note('la partie s\'est terminée avant le redémarrage — rien à reprendre, c\'est voulu'); return bilan(); }
    ko('aucun fichier de partie écrit pour ' + CODE); return bilan();
  }
  note('fichier de partie présent : ' + Math.round(fs.statSync(fiche).size / 1024) + ' Ko');

  console.log('\n── on TUE le serveur (SIGKILL, aucun arrêt propre) ──');
  srv.kill('SIGKILL');
  A.ws.terminate(); B.ws.terminate();
  await dodo(900);

  console.log('── on le relance sur le même dossier de données ──\n');
  demarrer();
  if (!await attendreServeur()) { ko('le serveur n\'a pas redémarré'); return bilan(); }
  await dodo(700);

  const A2 = client(A_MAIL);
  await A2.ouvrir();
  A2.send({ t: 'token', token: A.token });
  await A2.attendre('logged');
  A2.send({ t: 'join', code: CODE });            // ce que le navigateur fait tout seul au rechargement
  let vue = null;
  try { vue = await A2.attendre('game', 8000); } catch (e) {}
  if (!vue) { ko('la partie ' + CODE + ' n\'existe plus après le redémarrage : elle a été perdue'); return bilan(); }
  note('✔ la partie ' + CODE + ' existe encore après le redémarrage');

  A2.send({ t: 'state' });
  let apres = null;
  try { apres = await A2.attendre('state', 8000); } catch (e) {}
  if (!apres) { ko('la partie est là mais ne rend plus son état'); return bilan(); }
  const tourApres = apres.state && apres.state.turn;
  const journalApres = ((apres.state && apres.state.log) || []).length;

  if (tourApres !== tourAvant) ko('tour ' + tourApres + ' après le redémarrage au lieu de ' + tourAvant);
  else note('✔ même tour (' + tourApres + ')');
  if (journalApres !== journalAvant) ko('journal de ' + journalApres + ' lignes au lieu de ' + journalAvant);
  else note('✔ même journal (' + journalApres + ' lignes) — c\'est bien LA partie, pas une nouvelle');

  // La MAIN : le joueur doit pouvoir reprendre, pas seulement regarder.
  A2.send({ t: 'resync' });
  const reprise = await Promise.race([
    A2.attendre('decision', 5000).then(m => 'sa décision « ' + m.pending.kind + ' »').catch(() => new Promise(() => {})),
    A2.attendre('your_action', 5000).then(() => 'son tour d\'action').catch(() => new Promise(() => {})),
    A2.attendre('waiting', 5000).then(() => 'l\'attente d\'un autre joueur').catch(() => new Promise(() => {})),
    A2.attendre('turn', 5000).then(() => 'le tour d\'un autre joueur').catch(() => new Promise(() => {})),
    dodo(5200).then(() => null)
  ]);
  if (!reprise) ko('le joueur revient dans sa partie mais ne sait pas ce qu\'il a à faire (plateau muet)');
  else note('✔ le joueur retrouve ' + reprise + ' : la partie est JOUABLE, pas seulement consultable');

  // Et elle doit pouvoir aller jusqu'au bout.
  A2.auto = true;
  const B2 = client(B_MAIL);
  await B2.ouvrir(); B2.send({ t: 'token', token: B.token }); await B2.attendre('logged');
  B2.send({ t: 'join', code: CODE }); B2.auto = true;
  A2.send({ t: 'resync' }); B2.send({ t: 'resync' });
  const t1 = Date.now();
  while (!A2.fini && !B2.fini && Date.now() - t1 < 20000) await dodo(120);
  if (!A2.fini && !B2.fini) ko('la partie reprise ne va pas jusqu\'à son terme');
  else note('✔ la partie reprise s\'est jouée jusqu\'à la fin');

  bilan();
}

function bilan() {
  console.log('\n' + '─'.repeat(72));
  if (ecarts.length) {
    console.log('❌ ' + ecarts.length + ' problème(s) :');
    ecarts.forEach(e => console.log('   · ' + e));
    return fin(1);
  }
  console.log('✅ Une partie en cours survit à un redémarrage brutal du serveur :');
  console.log('   même tour, même journal, la main rendue, et elle se joue jusqu\'au bout.');
  fin(0);
}

main().catch(e => { ko('exception : ' + e.message); bilan(); });
