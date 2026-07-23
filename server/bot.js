/* Solar Conquest — BOT-JOUEUR « Claude » : joue comme un client humain (via WebSocket),
   avec de vraies actions (coloniser/route/tech/upgrade/raid) et de vraies réponses aux décisions.
   Sert de partenaire de test : Marc l'invite dans une partie via http://…/bot?code=XXXX
   Différence avec un siège IA : le bot passe par le MÊME chemin réseau qu'un humain
   (décisions routées, tours d'action, reconnexion), donc il teste le vrai circuit. */
'use strict';
const path = require('path');
const vm = require('vm');
const WebSocket = require('ws');
const { loadLogic } = require('./game-core.js');

let _aux = null, _NODES = null, _CARDS = null;
function aux() { // contexte du moteur partagé par tous les bots (données + fonctions de coût)
  if (!_aux) {
    _aux = loadLogic(process.env.GAME_HTML || path.join(__dirname, '..', 'index.html'));
    _NODES = vm.runInContext('NODES', _aux);
    _CARDS = vm.runInContext('CARDS_POOL', _aux);
  }
  return _aux;
}

function revive(x) { return JSON.parse(JSON.stringify(x), (k, v) => { if (v && v.__set) return new Set(v.__set); if (v && v.__map) return new Map(v.__map); return v; }); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function answerDecision(p) {
  const o = p.payload || {}, k = p.kind, opts = o.options || [];
  if (k === 'defense') return { defTokens: Math.min(2, o.maxDef || 0) };
  if (k === 'war_combat') return { tokens: 1 };
  if (k === 'peace_offer') return { accept: Math.random() < 0.6, offer: { materials: 0, energy: 0, science: 0 } };
  if (k === 'ai_dyson') return { war: false };
  if (k === 'dyson_build') return { force: false };
  if (k === 'accord_confirm') return { confirm: true };
  if (!opts.length) return {};
  const key = k === 'agenda' ? 'agendaId' : (k === 'strategy' ? 'cardId' : (k === 'invest1' || k === 'invest2' ? 'cardId' : (k === 'espionage' ? 'branch' : (k === 'extrasolar' ? 'node' : (k === 'empath_copy' ? 'cardId' : 'value')))));
  const op = pick(opts); const ans = {};
  ans[key] = op.id !== undefined ? op.id : (op.branch !== undefined ? op.branch : op.node);
  if (k === 'strategy_calm') ans.targetId = op.id;
  return ans;
}

function chooseAction(G, civ) {
  aux();
  const me = [G.player].concat(G.ais || []).find(x => x && x.civ && x.civ.id === civ);
  if (!me) return null;
  const options = [];
  try { // coloniser
    const cc = _aux.colonizeCost(me);
    if (me.acLeft >= cc.ac && (me.res.materials || 0) >= cc.mat && (me.res.energy || 0) >= cc.en) {
      const all = [G.player].concat(G.ais || []);
      for (const id in _NODES) {
        const n = _NODES[id];
        if (n.decorative || n.noColonize) continue;
        if (all.some(x => x.colonies && x.colonies.some(c => c.nodeId === id))) continue;
        if (!me.colonies.some(c => _NODES[c.nodeId] && _NODES[c.nodeId].conn.includes(id))) continue;
        options.push({ type: 'colonize', node: id });
      }
    }
  } catch (e) {}
  try { // route
    const rc = _aux.routeCost(me);
    if (me.acLeft >= rc.ac && (me.res.materials || 0) >= rc.mat) {
      for (const c of me.colonies) {
        const n = _NODES[c.nodeId]; if (!n) continue;
        for (const to of (n.conn || [])) {
          if (!_NODES[to]) continue;
          if (me.routes.some(r => (r.from === c.nodeId && r.to === to) || (r.from === to && r.to === c.nodeId))) continue;
          options.push({ type: 'route', from: c.nodeId, to, token: me.forceTokens > 0 });
        }
      }
    }
  } catch (e) {}
  try { // tech T1/T2 abordable
    for (const card of _CARDS) {
      if (card.tier === 3) continue;
      if (me.cards.some(c => c.id === card.id)) continue;
      try { if (!_aux.isTechAvailable(card, me)) continue; } catch (e) { continue; }
      try { if (typeof _aux.isTechExclusive === 'function' && _aux.isTechExclusive(card) && G.techTaken && G.techTaken.has && G.techTaken.has(card.id)) continue; } catch (e) {}
      const ac = card.tier === 3 ? 2 : 1;
      if (me.acLeft < ac) continue;
      let cost = {}; try { cost = _aux.getEffCost(card, me) || {}; } catch (e) {}
      let ok = true; for (const r in cost) { if ((me.res[r] || 0) < cost[r]) { ok = false; break; } }
      if (ok) options.push({ type: 'buyTech', card: card.id });
    }
  } catch (e) {}
  try { // upgrade
    if (me.acLeft >= 1) for (const c of me.colonies) {
      const n = _NODES[c.nodeId];
      if (n && !c.noUpgrade && c.level < (n.maxLv || 1)) options.push({ type: 'upgrade', node: c.nodeId });
    }
  } catch (e) {}
  try { // raid occasionnel si assez de jetons
    const tc = me.civ.id === 'ceinturiens' ? 1 : 2;
    if (me.acLeft >= 1 && me.forceTokens >= tc && Math.random() < 0.25) {
      const foes = [G.player].concat(G.ais || []).filter(x => x.civ.id !== civ && x.colonies.length);
      if (foes.length) { const f = pick(foes); options.push({ type: 'raid', target: f.civ.id, node: f.colonies[0].nodeId }); }
    }
  } catch (e) {}
  return options.length ? pick(options) : null;
}

const bots = new Map(); // user -> ws (évite les doublons)

function spawnBot(serverPort, code, opts) {
  opts = opts || {};
  const user = (opts.user || 'claude') + '_' + Math.random().toString(36).slice(2, 6);
  const pass = 'bot-' + Math.random().toString(36).slice(2, 10) + 'x';
  const ws = new WebSocket('ws://127.0.0.1:' + serverPort);
  const send = o => { try { ws.send(JSON.stringify(o)); } catch (e) {} };
  const delay = opts.fast ? (() => 25) : (() => 600 + Math.floor(Math.random() * 1200)); // rythme « humain » (fast=tests)
  let civ = null, lastState = null, pendingAction = false, lastSig = null, rep = 0;
  ws.on('open', () => send({ t: 'register', user, pass }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    switch (m.t) {
      case 'registered': send({ t: 'login', user, pass }); break;
      case 'logged': send({ t: 'join', code: String(code).toUpperCase(), civId: opts.civId }); break;
      case 'game': {
        const seat = m.game.seats.find(s => s.user === user);
        if (seat) civ = seat.civId;
        break;
      }
      case 'decision': setTimeout(() => send({ t: 'answer', id: m.pending.id, ans: answerDecision(m.pending) }), delay()); break;
      case 'your_action': pendingAction = true; send({ t: 'state' }); break;
      case 'state':
        lastState = revive(m.state);
        if (pendingAction) {
          pendingAction = false;
          let a = null;
          try { a = chooseAction(lastState, civ); } catch (e) { console.log('[bot] chooseAction:', e.message); }
          // ANTI-BOUCLE : si la même action revient (= refusée par le serveur), on passe en auto
          const sig = a ? JSON.stringify(a) : null;
          if (sig && sig === lastSig) rep++; else rep = 0;
          lastSig = sig;
          if (!a || rep >= 1) { setTimeout(() => send({ t: 'auto' }), delay()); }
          else setTimeout(() => send({ t: 'act', action: a }), delay());
        }
        break;
      case 'over': setTimeout(() => { try { ws.close(); } catch (e) {} bots.delete(user); }, 1500); break;
      case 'error': console.log('[bot ' + user + ']', m.msg); break;
    }
  });
  ws.on('close', () => bots.delete(user));
  ws.on('error', e => console.log('[bot ' + user + '] ws:', e.message));
  bots.set(user, ws);
  return user;
}

module.exports = { spawnBot, bots };
