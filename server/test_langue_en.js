/* ════════════════════════════════════════════════════════════════════════════════════════════
   LE BANC DE LA LANGUE EN LIGNE — « est-ce que l'écran anglais est vraiment en anglais ? »
   ────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI IL EXISTE. Toutes mes vérifications de la traduction s'étaient faites EN SOLO, où le
   texte est écrit par le navigateur du joueur, donc forcément dans sa langue. En ligne, c'est le
   SERVEUR qui écrit — et il n'a pas de dictionnaire. Tout ce qui partait déjà rendu arrivait donc
   en français chez un joueur anglais : rapport de fin de tour, espionnage, investissements,
   agendas, journal des autres nations (captures de Marc, 20/09). Aucun banc ne le voyait.

   CE QU'IL FAIT. Il joue une partie en ligne ENTIÈRE avec deux clients qui se déclarent
   `lang:'en'`, garde tous les messages reçus, puis REJOUE LE RENDU DU CLIENT dessus : il pose le
   dictionnaire anglais, traduit les tables de données, applique `_i18nHydrater` (comme online.js)
   et relit le journal par `_logTexte`. Ce qui reste en français à ce stade est EXACTEMENT ce que
   le joueur anglais voit en français.

   CE QU'IL NE SIGNALE PAS. Un champ français doublé de son jumeau `<champ>_i18n` est normal sur le
   fil : c'est la forme voulue, le client le re-rend. On ne juge que le résultat final.

   Usage :  node test_langue_en.js [port] [nb_parties]     (le serveur doit tourner)
            SOLAR_TEST_TIMEOUT=200000 pour un plafond plus large.
   Sortie : « ✅ … 0 texte français » ou la liste, fenêtre par fenêtre, avec le chemin du champ.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';
const WebSocket = require('ws');
const fs = require('fs'), path = require('path'), vm = require('vm');

const PORT = process.argv[2] || process.env.PORT || 8080;
const PARTIES = Math.max(1, parseInt(process.argv[3] || process.env.SOLAR_PARTIES || '1', 10));
const URL = 'ws://127.0.0.1:' + PORT;
const LIMITE = Number(process.env.SOLAR_TEST_TIMEOUT || 180000);
const PROTO = Number(process.env.SOLAR_PROTO || 0) || (function () {
  try { const m = /PROTO_MAX\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')); return m ? +m[1] : 2; } catch (e) { return 2; }
})();

const recus = [];                  // tous les messages reçus par l'hôte, bruts
let code = null, over = 0, partie = 0, erreurs = [];
const kinds = {};

function repondre(pending) {
  const pay = (pending && pending.payload) || {};
  kinds[pending && pending.kind] = (kinds[pending && pending.kind] || 0) + 1;
  if (pending.kind === 'event_comm') { const c = (pay.cands || [])[0]; return c ? { aiId: c.id } : { aiId: null }; }
  if (pending.kind === 'event_diplo') { const r = (pay.rows || [])[0]; return r ? { selected: [r.id] } : { selected: [] }; }
  if (pending.kind === 'accord_request' || pending.kind === 'peace_answer') return { id: 'yes', accept: true };
  for (const k of Object.keys(pay)) { const v = pay[k]; if (Array.isArray(v) && v.length) { const o = v[0]; const id = (o && o.id !== undefined) ? o.id : 0; return { choice: id, index: 0, [k.replace(/s$/, '')]: id }; } }
  return {};
}
function creer(send) { send({ t: 'create', civId: 'terriens', seats: [{ civId: 'martiens', ai: false }, { civId: 'jupiteriens', ai: true }, { civId: 'ceinturiens', ai: true }] }); }

function client(nom, role) {
  const ws = new WebSocket(URL);
  const send = o => ws.send(JSON.stringify(o));
  ws.on('open', () => { send({ t: 'hello', proto: PROTO, build: 'banc-langue', lang: 'en' }); send({ t: 'register', user: nom, pass: 'test-123456', lang: 'en' }); });
  ws.on('message', brut => {
    const m = JSON.parse(brut.toString());
    if (role === 'host') recus.push(m);
    switch (m.t) {
      case 'registered': send({ t: 'login', user: nom, pass: 'test-123456' }); break;
      case 'error':
        if (/déjà pris|déjà inscrite|already/i.test(m.msg || '')) { send({ t: 'login', user: nom, pass: 'test-123456' }); break; }
        erreurs.push(nom + ': ' + m.msg); break;
      case 'logged':
        if (role === 'host') creer(send);
        else { const w = setInterval(() => { if (code) { clearInterval(w); send({ t: 'join', code, civId: 'martiens' }); } }, 50); }
        break;
      case 'game':
        if (role === 'host' && !code) code = m.game.code;
        if (role === 'host' && m.game.status === 'lobby' && m.game.seats.every(s => s.ai || s.user)) send({ t: 'start' });
        break;
      case 'decision': send({ t: 'answer', id: m.pending.id, ans: repondre(m.pending) }); break;
      case 'your_action': send({ t: 'act', action: { type: 'pass' } }); break;
      case 'over':
        over++;
        if (over >= 2 && partie + 1 < PARTIES) {   // on enchaîne : le tirage des événements varie d'une partie à l'autre
          partie++; over = 0; code = null;
          if (role === 'host') setTimeout(() => creer(send), 80);
          else { const w2 = setInterval(() => { if (code) { clearInterval(w2); send({ t: 'join', code, civId: 'martiens' }); } }, 50); }
          break;
        }
        ws.close(); break;
    }
  });
  ws.on('error', e => erreurs.push(nom + ' ws: ' + e.message));
  return ws;
}

/* ── LE RENDU DU CLIENT, REJOUÉ ──────────────────────────────────────────────────────────────
   Mots et tournures qui n'existent qu'en français. On vise la certitude plutôt que l'exhaustivité :
   un faux positif fait perdre une demi-heure, un vrai manque se voit à l'écran de toute façon. */
const FR = /\b(le|la|les|des|une|du|aux|sur|dans|avec|sans|pour|est|sont|tu|ton|ta|tes|son|ses|leur|cette|qui|que|puis|tour|tours|guerre|paix|vaisseau|vaisseaux|planète|colonie|colonies|ressources|achète|adopte|pillée|pillé|choisis|choisir|gagne|perd|reçoit|envoie|chaque|aucun|aucune|déjà|tout|tous|toute|jour|jours|entretien|revenus|peuple|exige|jeton|jetons|prendre|faire|rien)\b/i;
const ACC = /[àâçéèêëîïôûùüœ]/i;
function estFrancais(s) {
  if (typeof s !== 'string') return false;
  const txt = s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').trim();
  if (txt.length < 4) return false;
  if (ACC.test(txt)) return true;
  const m = txt.toLowerCase().match(new RegExp(FR.source, 'gi'));
  return !!(m && new Set(m.map(x => x.toLowerCase())).size >= 2);
}
function analyser() {
  const sb = require('./game-core.js').loadLogic(path.join(__dirname, '..', 'index.html'));
  const dict = fs.readFileSync(path.join(__dirname, '..', 'lang', 'en.js'), 'utf8');
  vm.runInContext(dict + '\n;globalThis.SOLAR_LANG_DICT = (typeof window!=="undefined" && window.SOLAR_LANG_DICT) || globalThis.SOLAR_LANG_DICT || null;', sb);
  if (!sb.SOLAR_LANG_DICT) { console.log('❌ dictionnaire anglais illisible'); process.exit(1); }
  sb.i18nTraduireDonnees();

  const trouves = [], vus = new Set();
  function scan(fenetre, o, chemin, prof) {
    if (prof > 7 || o == null) return;
    if (typeof o === 'string') {
      if (estFrancais(o)) { const c = fenetre + '|' + o.slice(0, 80); if (!vus.has(c)) { vus.add(c); trouves.push({ fenetre, chemin, texte: o.slice(0, 170) }); } }
      return;
    }
    if (Array.isArray(o)) { o.forEach((v, i) => scan(fenetre, v, chemin + '[' + i + ']', prof + 1)); return; }
    if (typeof o === 'object') for (const k of Object.keys(o)) {
      if (/_i18n$/.test(k) || k === 'k' || k === 'fr' || k === 'p') continue;   // le français de référence voyage exprès
      scan(fenetre, o[k], chemin + '.' + k, prof + 1);
    }
  }
  let n = 0;
  for (const m of recus) {
    if (m.t === 'game' || m.t === 'state' || m.t === 'lobby') continue;
    n++;
    try { sb._i18nHydrater(m); if (m.pending && m.pending.payload) sb._i18nHydrater(m.pending.payload); } catch (e) {}
    const journal = arr => { if (Array.isArray(arr)) arr.forEach(e => { if (e && typeof e === 'object') { try { e.msg = sb._logTexte(e); } catch (err) {} } }); };
    journal(m.entries); journal(m.log);
    const f = m.t + (m.kind ? ':' + m.kind : (m.payload && m.payload.kind ? ':' + m.payload.kind : (m.pending && m.pending.kind ? ':' + m.pending.kind : '')));
    scan(f, m, m.t, 0);
  }
  console.log('\n' + (partie + 1) + ' partie(s) · ' + n + ' message(s) analysé(s) · fenêtres : ' + Object.keys(kinds).sort().join(', '));
  if (erreurs.length) console.log('⚠ erreurs de protocole : ' + erreurs.slice(0, 3).join(' | '));
  if (!trouves.length) { console.log('✅ écran anglais : 0 texte français.'); process.exit(0); }
  console.log('❌ ' + trouves.length + ' texte(s) français à l\'écran anglais :');
  const par = {}; trouves.forEach(x => { (par[x.fenetre] = par[x.fenetre] || []).push(x); });
  for (const k of Object.keys(par).sort()) {
    console.log('\n■ ' + k + ' (' + par[k].length + ')');
    par[k].slice(0, 14).forEach(x => console.log('   ' + x.chemin + '  ≫ ' + x.texte));
  }
  console.log('\n   Rappel : un texte qui part en ligne se passe en J(…) ou en _i18nRef(…), jamais concaténé.');
  process.exit(1);
}

client('testlangue1@test.local', 'host');
client('testlangue2@test.local', 'guest');
setTimeout(() => { console.log('⏱️ plafond atteint — on analyse ce qui est arrivé.'); analyser(); }, LIMITE);
setInterval(() => { if (over >= 2) analyser(); }, 200);
