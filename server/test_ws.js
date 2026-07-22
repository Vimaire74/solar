/* Test bout-en-bout du serveur : 2 clients WebSocket humains + 2 IA, partie ENTIÈRE.
   Les "humains" répondent aux décisions (première option) et passent leurs tours d'action.
   Usage : node test_ws.js [port]   (le serveur doit tourner). Sortie attendue : ✅ + scores. */
'use strict';
const WebSocket = require('ws');
const PORT = process.argv[2] || process.env.PORT || 8080;
const URL = 'ws://127.0.0.1:' + PORT;

let code = null;
let overCount = 0, decisions = 0, actions = 0, errors = [];
const t0 = Date.now();

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

function client(name, role) { // role: 'host' | 'guest'
  const ws = new WebSocket(URL);
  const send = o => ws.send(JSON.stringify(o));
  ws.on('open', () => send({ t: 'register', user: name, pass: 'test-123456' }));
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    switch (m.t) {
      case 'registered': send({ t: 'login', user: name, pass: 'test-123456' }); break;
      case 'error':
        if (/déjà pris/.test(m.msg)) { send({ t: 'login', user: name, pass: 'test-123456' }); break; }
        errors.push(name + ': ' + m.msg);
        break;
      case 'logged':
        if (role === 'host') {
          send({ t: 'create', civId: 'terriens', seats: [
            { civId: 'martiens', ai: false },
            { civId: 'jupiteriens', ai: true },
            { civId: 'ceinturiens', ai: true } ] });
        } else {
          const wait = setInterval(() => { if (code) { clearInterval(wait); send({ t: 'join', code, civId: 'martiens' }); } }, 50);
        }
        break;
      case 'game':
        if (role === 'host' && !code) { code = m.game.code; console.log('partie créée:', code); }
        if (role === 'host' && m.game.status === 'lobby' && m.game.seats.every(s => s.ai || s.user)) send({ t: 'start' });
        break;
      case 'decision': decisions++; send({ t: 'answer', id: m.pending.id, ans: autoAnswer(m.pending) }); break;
      case 'your_action': actions++; send({ t: 'act', action: { type: 'pass' } }); break;
      case 'over':
        overCount++;
        if (role === 'host') {
          console.log('=== Partie terminée en ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ===');
          m.scores.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.name + ' — ' + s.vp + ' VP'));
        }
        ws.close();
        break;
    }
  });
  ws.on('error', e => { errors.push(name + ' ws: ' + e.message); });
  return ws;
}

client('testhote', 'host');
client('testinvite', 'guest');

const guard = setTimeout(() => { console.log('❌ TIMEOUT (120s) — over:' + overCount, 'décisions:' + decisions, 'actions:' + actions, errors); process.exit(1); }, 120000);
const check = setInterval(() => {
  if (overCount >= 2) {
    clearTimeout(guard); clearInterval(check);
    console.log('décisions humaines routées: ' + decisions + ' — tours d\'action humains: ' + actions);
    if (errors.length) { console.log('⚠ erreurs:', errors.slice(0, 5)); process.exit(1); }
    console.log('✅ Partie complète à 2 humains + 2 IA via WebSocket, décisions routées, 0 erreur.');
    process.exit(0);
  }
}, 100);
