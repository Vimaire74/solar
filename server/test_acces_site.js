/* Banc : porte d'accès du site (13/10). Lance le vrai serveur sur un port libre, avec un DATA_DIR
   jetable, puis vérifie : mot de passe non défini → refus ; défini via /stats (POST) → jeton ;
   WebSocket venu de solar-game.com sans jeton → refusé, avec jeton → accepté ; sans Origin du site
   (appli) → accepté ; /api/diagnostic toujours ouvert (OPTIONS 204). */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os');
const WebSocket = require('ws');
const PORT = 18000 + Math.floor(Math.random() * 1000), KEY = 'cle-test-acces';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'acces-'));
const srv = spawn('node', [path.join(__dirname, 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: DATA, ADMIN_KEY: KEY, DIAG_MAIL: '' }), stdio: 'ignore' });
let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };
const B = 'http://127.0.0.1:' + PORT;
const attendre = ms => new Promise(r => setTimeout(r, ms));
function ws(origin, q) { return new Promise(res => { const w = new WebSocket('ws://127.0.0.1:' + PORT + (q || ''), origin ? { origin } : {});
  let refus = false; w.on('message', d => { try { if (JSON.parse(d).acces === false) refus = true; } catch (e) {} });
  w.on('open', () => setTimeout(() => { res(refus ? 'refus' : (w.readyState === 1 ? 'ouvert' : 'ferme')); try { w.close(); } catch (e) {} }, 400));
  w.on('error', () => res('erreur')); }); }
(async () => {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch (e) {} await attendre(200); }
  const post = b => fetch(B + '/api/acces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  ok((await post({ mdp: 'x' })).raison === 'non_configure', 'mot de passe non défini → refus « non_configure »');
  const r = await fetch(B + '/stats?key=' + KEY, { method: 'POST', body: 'mdp_site=etoile42', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  ok(r.status === 303, '/stats POST → redirection 303');
  ok((await post({ mdp: 'mauvais' })).ok === false, 'mauvais mot de passe refusé');
  const bon = await post({ mdp: 'etoile42' }); ok(bon.ok && bon.jeton, 'bon mot de passe → jeton');
  ok((await (await fetch(B + '/api/acces?jeton=' + bon.jeton)).json()).ok === true, 'jeton vérifié (GET)');
  ok((await (await fetch(B + '/stats?key=' + KEY)).text()).includes('Mot de passe du jeu sur le site'), '/stats montre le formulaire');
  ok(await ws('https://solar-game.com') === 'refus', 'WS du site sans jeton → refusé');
  ok(await ws('https://solar-game.com', '/?acces=' + bon.jeton) === 'ouvert', 'WS du site avec jeton → accepté');
  ok(await ws('https://localhost') === 'ouvert', 'WS de l\'appli (Origin localhost) → accepté sans jeton');
  ok((await fetch(B + '/api/diagnostic', { method: 'OPTIONS' })).status === 204, '/api/diagnostic toujours ouvert');
  await fetch(B + '/stats?key=' + KEY, { method: 'POST', body: 'mdp_site=nouveau99', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  ok((await (await fetch(B + '/api/acces?jeton=' + bon.jeton)).json()).ok === false, 'mot de passe changé → ancien jeton invalide');
  srv.kill(); console.log(ko ? '\n❌ ' + ko + ' échec(s)' : '\n✅ porte d\'accès : tout est vert'); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
