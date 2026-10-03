/* ============================================================================
   pw_audit_couts.js (03/10 §198 : AUDIT DES RESSOURCES — chaque coup comparé à son coût/gain déclaré, chaque revenu au calcul, rpt aux cartes ; NB=2/3/4, BOOST=1) — dérivé de pw_ordre_fenetres.js (dérivé de pw_rappel_fenetres.js, 03/10 §196 : + SÉQUENCE des fenêtres, choix abordable) — UNE PARTIE OÙ LE JOUEUR RAIDE, CONSTRUIT DES ROUTES ET ASSAILLE (03/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 03/10 : « le pouvoir de la nation, 1 tour avant la fin, peut s'intercaler avec
   d'autres fenêtres décisionnelles que tu es en train de terminer — entre faire la route et décider
   si on met un jeton, entre un raid et le résultat du raid (qui ne s'affiche toujours pas), entre une
   conquête et le résultat de la conquête. Tu peux vérifier ça en faisant quelques parties ? »
   Et ses deux rapports du 03/10 montrent une nation HUMAINE jouée par l'ordinateur (« T7 terriens →
   coloniser Deimos » alors que Marc jouait les Terriens) : sonde de perspective.

   Dérivé de pw_partie_appli.js (même moteur de partie, mêmes sondes de fenêtres), avec :
     · un joueur qui RAIDE, POSE DES ROUTES et ASSAILLE (pas seulement des technologies) ;
     · un joueur LENT sur les fenêtres de suite d'action (jeton de route, combat, résultat) : il attend
       2 s avant de répondre — c'est le cas réel ; la machine, elle, répond en 120 ms ;
     · ÉCARTS : rappel de pouvoir affiché en même temps qu'une autre fenêtre ; raid sans fenêtre de
       résultat ; ordinateur qui joue la nation humaine (`doAITurn` sur le joueur) ; `G.player` qui
       n'est plus la nation du joueur pendant la phase d'actions.
   UNE SEULE PARTIE par exécution. Variables : URL, OUT, CIV (ceinturiens), DIFF (normal), MAX_MIN (14).
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/tmp/claude-0/node_modules/playwright'); }
const URL = process.env.URL || 'http://127.0.0.1:8766/index.html';
const OUT = process.env.OUT || '/tmp/claude-0/rappel';
const CIV = process.env.CIV || 'terriens', DIFF = process.env.DIFF || 'normal';
const NB = +(process.env.NB || 4);   // nombre de nations (joueur compris)
const MAX_MS = (parseFloat(process.env.MAX_MIN) || 14) * 60000;
const LENTES = ['route-token-modal', 'war-combat-modal', 'war-modal', 'sc-raid-result'];
fs.mkdirSync(OUT, { recursive: true });

/* Ce qui compte comme « une fenêtre à l'écran » : les modales du jeu, l'overlay d'événement, les
   fenêtres construites à la volée (scDemander, diagnostic, bloqué, rappel de pouvoir), le bandeau ✓/↩. */
const TROUVER = `(() => {
  const vis = e => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length && !e.classList.contains('hidden');
  const l = [];
  document.querySelectorAll('[id$="-modal"], #sc-ask, #sc-diag, #sc-ability-reminder, #sc-attack-notice, #aad-overlay, #calm-overlay, #il-window, #sc-ov, #sc-decision, #sc-raid-result, #sc-refus').forEach(e => { if (vis(e)) l.push(e.id); });
  const c = document.getElementById('sc-confirm'); if (c && c.classList.contains('show')) l.push('sc-confirm');
  return l;
})()`;

const SONDE = `((id) => {
  const root = document.getElementById(id); if (!root) return [];
  const bruts = [];
  root.querySelectorAll('button').forEach(b => {
    if (!b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') return;
    const cs = getComputedStyle(b);
    if (cs.backgroundColor === 'rgb(239, 239, 239)' || cs.backgroundColor === 'rgb(240, 240, 240)' || cs.borderStyle === 'outset')
      bruts.push('bouton du navigateur : « ' + (b.textContent || '').trim().slice(0, 40) + ' »');
    if (b.scrollWidth > b.clientWidth + 2 && cs.overflow !== 'visible') bruts.push('texte coupé dans « ' + (b.textContent || '').trim().slice(0, 30) + ' »');
  });
  root.querySelectorAll('select, input[type=checkbox], input[type=radio]').forEach(e => { if (e.getClientRects().length) bruts.push('élément natif <' + e.tagName.toLowerCase() + '>'); });
  /* Un élément rogné par un ancêtre qui ne déborde pas, lui, n'est pas visible au-delà de l'écran. */
  const rogne = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (o.overflowX !== 'visible' && a.getBoundingClientRect().right <= window.innerWidth + 1) return true; } return false; };
  [...root.querySelectorAll('*')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > window.innerWidth + 1 && !rogne(e)).slice(0, 2)
    .forEach(e => bruts.push('déborde à droite : <' + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '> ' + Math.round(e.getBoundingClientRect().right) + ' px'));
  return bruts;
})`;

/* Répondre comme un joueur : le bouton principal du jeu, jamais un destructeur. */
const REPONDRE = `((id) => {
  const root = document.getElementById(id); if (!root) return 'absent';
  const ok = b => b && !b.disabled && b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden';
  /* Destructeur = met fin à la partie ou au compte. « Guerre » n'en fait pas partie : la fenêtre de
     guerre populaire n'a QUE des choix de guerre (premier jet : « aucune sortie cliquable », faux). */
  const DANGER = /abandon|recommencer|supprimer|conc[ée]der|renoncer|admettre|quitter|ne plus proposer/i;
  const clic = b => { b.click(); return (b.textContent || b.className || '').trim().slice(0, 40); };
  if (id === 'sc-confirm') { const b = root.querySelector('.scc-ok'); if (ok(b)) return clic(b); }
  if (id === 'sc-diag') { const b = document.getElementById('sc-diag-non'); if (ok(b)) return clic(b); }
  if (id === 'sc-ask') { const b = document.getElementById('sc-ask-non'); if (ok(b)) return clic(b); }
  /* Listes à choisir d'abord (agenda, stratégie, investissement, pactes, accords, espionnage). */
  /* Une option ABORDABLE (« Il te manque… » = inabordable) — sinon le banc restait bloqué sur l'investissement Niv.2 (§196). */
  const choix = [...root.querySelectorAll('.agsel-ag:not(.ag-selected), .strat-opt, .inv-opt, .esp-l[aria-pressed="false"], .pacte-l[aria-pressed="false"]')].find(e => !/manque/i.test(e.textContent || ''));
  if (choix && ok(choix) && !root.dataset.__pwChoisi) { root.dataset.__pwChoisi = '1'; choix.click(); }
  /* .fw-choice : les choix de la guerre populaire sont des blocs cliquables, pas des <button>. */
  const prio = ['.fw-choice', '.fen-btn.ok', '.fen-btn.go', '#ev-pactes-go', '#ev-accords-go', '.esp-go', '.eot-btn', '.agsel-go', '.btn-go', '.fen-btn', '.war-btn', '.evm-btn', '.disc-btn', '.npop-btn', '.inv-opt', '.strat-opt', 'button'];
  /* 02/10 : le bouton de repli (.fen-reduire, REPRISE 176.2 et 188) est un <button> : un joueur ne répond pas avec. */
  for (const s of prio) for (const b of root.querySelectorAll(s)) if (ok(b) && !b.classList.contains('fen-reduire') && !DANGER.test(b.textContent || '')) return clic(b);
  return 'rien à cliquer';
})`;

(async () => {
  const t0 = Date.now();
  const rapport = { sequence: [], fenetres: {}, ecarts: [], erreurs: [], natifs: [], figeages: [], tours: [], fin: null };
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-CH',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F741B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, platform: 'android', registerPlugin: () => ({ addListener() {}, exitApp() {} }), Plugins: {} };
    try { localStorage.clear(); localStorage.setItem('sc_lang', 'fr'); } catch (e) {}
    window.__natifs = []; window.confirm = m => { window.__natifs.push('confirm: ' + m); return true; }; window.alert = m => { window.__natifs.push('alert: ' + m); };
    /* Accélère les temporisations d'affichage (dépêches, pauses entre IA) : 50 ms au plus. */
    const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, Math.min(ms || 0, 50), ...a);
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => rapport.erreurs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.evaluate(({ civ, diff, nb }) => { lvSolo(); setDifficulty(diff); selectCiv(civ);
    selectedAiCivs = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'].filter(c => c !== civ).slice(0, nb - 1); startGame(); }, { civ: CIV, diff: DIFF, nb: NB });
  await p.waitForTimeout(800);
  /* Sondes moteur : l'ordinateur ne doit JAMAIS jouer la nation du joueur. */
  await p.evaluate(() => {
    window.__sondes = []; window.__moi = G.player.civ.id; window.__audit = []; window.__compte = { coups: 0, joueur: 0, revenus: 0 };
    const R = ['energy', 'materials', 'science', 'morale', 'force'];
    const NOMS = { 'énergie': 'energy', 'energie': 'energy', 'matériaux': 'materials', 'materiaux': 'materials', 'science': 'science', 'savoir': 'science', 'moral': 'morale', 'jeton': 'force', 'jetons': 'force' };
    const snap = () => Object.fromEntries(allPlayers().map(n => [n.civ.id, { energy: n.res.energy || 0, materials: n.res.materials || 0, science: n.res.science || 0, morale: n.res.morale || 0, force: n.forceTokens || 0 }]));
    let base = { s: snap(), j: (G._journal || []).length, l: (G.log || [])[0] };
    const borne = () => { base = { s: snap(), j: (G._journal || []).length, l: (G.log || [])[0] }; };
    const logDepuis = () => { const o = []; for (const e of (G.log || [])) { if (e === base.l) break; o.push(_logTexte(e).replace(/<[^>]+>/g, '').slice(0, 140)); if (o.length > 25) break; } return o.reverse(); };
    window.__borne = borne;
    const gainsDe = txt => { const g = {}; String(txt || '').replace(/\+(\d+)\s*(énergie|energie|matériaux|materiaux|science|savoir|moral|jetons?)(?![^.,;]*\/\s*tour)/gi, (m, n, r) => { const k = NOMS[r.toLowerCase()]; g[k] = (g[k] || 0) + (+n); return m; }); return g; };
    const comparer = (acteur, quoi) => {
      const s1 = snap(), lignes = (G._journal || []).slice(base.j);
      const att = {}; R.forEach(r => att[r] = 0);
      const miennes = lignes.filter(e => e && e.nat === acteur.civ.name);
      miennes.forEach(e => { for (const r of R) att[r] -= (e.cost && e.cost[r]) || 0; const g = gainsDe(e.gain); for (const r in g) att[r] += g[r]; });
      const d = {}; R.forEach(r => d[r] = s1[acteur.civ.id][r] - base.s[acteur.civ.id][r]);
      const ecarts = R.filter(r => d[r] !== att[r]);
      const autres = allPlayers().filter(n => n !== acteur).map(n => { const x = R.filter(r => r !== 'morale' && s1[n.civ.id][r] !== base.s[n.civ.id][r]).map(r => r + ' ' + (s1[n.civ.id][r] - base.s[n.civ.id][r])); return x.length ? n.civ.name + ' : ' + x.join(', ') : ''; }).filter(Boolean);
      if (ecarts.length || autres.length) window.__audit.push({ t: G.turn, quoi, nation: acteur.civ.name, actions: miennes.map(e => e.name + ' [coût ' + JSON.stringify(e.cost) + ' gain « ' + e.gain + ' »]'), mesure: d, attendu: att, ecarts, autres, journal: logDepuis() });
      borne();
    };
    window.__comparer = comparer;
    const d0 = doAITurn;
    window.doAITurn = doAITurn = function (nat, ...a) {
      if (nat && nat.civ && nat.civ.id === window.__moi) window.__sondes.push('T' + G.turn + ' : doAITurn sur la nation du joueur (' + nat.civ.id + ')');
      borne(); const r = d0.call(this, nat, ...a); window.__compte.coups++; comparer(nat, 'coup IA'); return r;
    };
    const pa = playerActed; window.playerActed = playerActed = function (...a) { window.__compte.joueur++; comparer(G.player, 'coup joueur'); return pa.apply(this, a); };
    const pt = passTurnIL; window.passTurnIL = passTurnIL = function (...a) { comparer(G.player, 'fin des actions du joueur'); return pt.apply(this, a); };
    const si = startInterleaved; window.startInterleaved = startInterleaved = function (...a) { const r = si.apply(this, a); borne(); return r; };
    /* REVENUS : ce que `revenusBruts` calcule pour chaque nation doit être ce qui arrive dans ses stocks. */
    const rb = revenusBruts; let calc = {};
    window.revenusBruts = revenusBruts = function (n, o) { const g = rb.call(this, n, o); if (window.__dansRevenus) calc[n.civ.id] = Object.assign({}, g); return g; };
    const dr = doRevenues;
    window.doRevenues = doRevenues = function (...a) {
      const s0 = snap(); calc = {}; window.__dansRevenus = true; let r; try { r = dr.apply(this, a); } finally { window.__dansRevenus = false; }
      const s1 = snap(); window.__compte.revenus++;
      for (const n of allPlayers()) { const g = calc[n.civ.id]; if (!g) continue; const m = n._moraleRev;
        for (const k of ['energy', 'materials', 'science']) { let e = g[k] || 0; if (m === 0) e = 0; else if (m === 1) e = Math.floor(e / 2);
          const d = s1[n.civ.id][k] - s0[n.civ.id][k]; if (d !== e) window.__audit.push({ t: G.turn, quoi: 'revenu', nation: n.civ.name, ressource: k, calcule: g[k] || 0, verse: d, moral: m }); } }
      /* rpt (revenu permanent des cartes) contre la somme des rGain des cartes possédées */
      for (const n of allPlayers()) { const att = {}; for (const c of (n.cards || [])) if (c && c.rGain) for (const k in c.rGain) att[k] = (att[k] || 0) + c.rGain[k];
        const ec = ['energy', 'materials', 'science', 'morale'].filter(k => (n.rpt && n.rpt[k] || 0) !== (att[k] || 0)).map(k => k + ' rpt=' + ((n.rpt && n.rpt[k]) || 0) + ' cartes=' + (att[k] || 0));
        if (ec.length) { const cle = n.civ.id + ec.join(); if (!window['__rpt' + cle]) { window['__rpt' + cle] = 1; window.__audit.push({ t: G.turn, quoi: 'rpt≠cartes', nation: n.civ.name, ecarts: ec, cartes: (n.cards || []).map(c => c.id).join(' ') }); } } }
      borne(); return r;
    };
  });
  if (process.env.BOOST) await p.evaluate(() => { const P = G.player; P.res.energy += 15; P.res.materials += 20; P.res.science += 20; window.__borne(); });
  const lent = {};
  let attenteRaid = 0, dernierRaidTour = 0;

  let dernierEtat = '', depuis = Date.now(), tour = 0, actionsTour = 0;
  while (Date.now() - t0 < MAX_MS) {
    const etat = await p.evaluate(() => ({ phase: G.phase, tour: G.turn, main: !!G._humanActive, ac: G.player && G.player.acLeft,
      flux: (typeof fluxNom === 'function') ? fluxNom() : '', q: (G._pendings || []).map(x => x && x.kind).join(','), log: (G.log || []).length,
      toast: !!(document.getElementById('action-toast') && document.getElementById('action-toast').classList.contains('show')) }));
    if (etat.phase === 'over') { rapport.fin = 'partie terminée au tour ' + etat.tour; break; }
    if (etat.tour !== tour) { tour = etat.tour; actionsTour = 0; rapport.tours.push({ tour, t: Math.round((Date.now() - t0) / 1000) + ' s' }); console.log('— tour ' + tour + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)'); }
    if (etat.toast) rapport.ecarts.push('tour ' + tour + ' : bandeau « action faite » affiché (supprimé le 30/09)');
    const cle = JSON.stringify([etat.phase, etat.tour, etat.main, etat.ac, etat.flux, etat.q, etat.log]);
    if (cle !== dernierEtat) { dernierEtat = cle; depuis = Date.now(); }

    const persp = await p.evaluate(() => (G.phase === 'actions' && G.player && G.player.civ && G.player.civ.id !== window.__moi) ? ('T' + G.turn + ' : G.player = ' + G.player.civ.id + ' au lieu de ' + window.__moi) : '');
    if (persp && !rapport.ecarts.includes(persp)) { rapport.ecarts.push(persp); console.log('   ❌ ' + persp); }
    const fen = await p.evaluate(TROUVER);
    { const sig = await p.evaluate(ids => ids.map(i => { const r = document.getElementById(i); if (!r) return i;
        const q = s => { const e = r.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
        const txt = [q('.fen-kicker'), q('.fen-nation'), q('.fen-verb'), q('.fen-dep') || q('.fen-body') || q('h2') || q('h3')].filter(Boolean).join(' / ');
        return i + ' :: ' + (txt || r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 160); }).join(' || '), fen);
      if (sig !== (globalThis.__sig || '')) { globalThis.__sig = sig; if (sig) { const ph = await p.evaluate(() => G.phase + (G._humanActive ? '/main' : '')); rapport.sequence.push('T' + tour + ' [' + ph + '] ' + sig); console.log('   ▸ T' + tour + ' [' + ph + '] ' + sig); } } }
    if (attenteRaid && Date.now() > attenteRaid) {
      attenteRaid = 0;
      if (!fen.includes('sc-raid-result')) { const e = 'tour ' + tour + ' : raid du joueur sans fenêtre de résultat'; if (!rapport.ecarts.includes(e)) { rapport.ecarts.push(e); console.log('   ❌ ' + e); } }
      else console.log('   ✔ résultat du raid affiché');
    }
    if (fen.includes('sc-ability-reminder') && fen.some(x => x !== 'sc-ability-reminder' && x !== 'il-window')) {
      const e = 'tour ' + tour + ' : rappel de pouvoir affiché en même temps que ' + fen.filter(x => x !== 'sc-ability-reminder').join(', ');
      if (!rapport.ecarts.includes(e)) { rapport.ecarts.push(e); console.log('   ❌ ' + e); }
    }
    if (fen.length) {
      const id = fen[fen.length - 1];
      const titre = await p.evaluate(i => { const r = document.getElementById(i); const h = r && r.querySelector('h1,h2,h3,[class*="title"],[class*="titre"],[id$="-t"],b'); return ((h && h.textContent) || '').trim().slice(0, 40); }, id);
      const type = id + (titre ? ' · ' + titre.replace(/[0-9]+/g, '#') : '');
      if (!rapport.fenetres[type]) {
        await p.waitForTimeout(250);
        const bruts = await p.evaluate(SONDE + '(' + JSON.stringify(id) + ')');
        const fichier = Object.keys(rapport.fenetres).length.toString().padStart(2, '0') + '_' + id + '.png';
        await p.screenshot({ path: path.join(OUT, fichier) });
        rapport.fenetres[type] = { tour, fichier, defauts: bruts, vues: 0 };
        bruts.forEach(x => rapport.ecarts.push(type + ' : ' + x));
        console.log('   fenêtre : ' + type + (bruts.length ? '  ❌ ' + bruts.join(' | ') : '  ✔'));
      }
      rapport.fenetres[type].vues++;
      /* Joueur lent : 2 s devant chaque fenêtre de suite d'action avant de répondre. */
      if (LENTES.includes(id)) { if (!lent[id]) lent[id] = Date.now(); if (Date.now() - lent[id] < 2000) { await p.waitForTimeout(200); continue; } delete lent[id]; }
      const clic = await p.evaluate(REPONDRE + '(' + JSON.stringify(id) + ')');
      if (clic === 'rien à cliquer' && Date.now() - depuis > 15000) { rapport.ecarts.push(type + ' : aucune sortie cliquable'); await p.evaluate(i => { const e = document.getElementById(i); if (e) { e.classList.add('hidden'); e.style.display = 'none'; } }, id); }
      await p.waitForTimeout(120);
      continue;
    }
    if (etat.phase === 'actions' && etat.main) {
      /* À mon tour : une technologie si je peux (ouvre ✓/↩), sinon je passe. */
      const fait = await p.evaluate(n => {
        const P = G.player; if (P.acLeft < 1) { endTurn(); return 'passe'; }
        const ac0 = P.acLeft, essai = f => { try { f(); } catch (e) {} return P.acLeft < ac0 || _scConfirmArmed || !!document.querySelector('#war-combat-modal:not(.hidden), #route-token-modal:not(.hidden)'); };
        const ennemis = allPlayers().filter(x => x !== P);
        const ordre = ['colonie', 'tech', 'route', 'civique', 'amelio', 'raid', 'assaut'];
        const debut = (G.turn + n) % ordre.length;
        for (let k = 0; k < ordre.length; k++) {
          const quoi = ordre[(debut + k) % ordre.length];
          if (quoi === 'raid' && G.turn >= 2) for (const e of ennemis) for (const c of (e.colonies || [])) { if (c.nodeId === e.civ.home) continue; if (essai(() => doRaidTarget(e.civ.id, c.nodeId))) return 'raid ' + c.nodeId; }
          if (quoi === 'route') for (const c of (P.colonies || [])) for (const adj of ((NODES[c.nodeId] || {}).conn || [])) { if (P.routes.some(r => (r.from === c.nodeId && r.to === adj) || (r.to === c.nodeId && r.from === adj))) continue; if (essai(() => doEstablishRoute(c.nodeId, adj))) return 'route ' + c.nodeId + '→' + adj; }
          if (quoi === 'assaut' && G.turn >= 4) for (const e of ennemis) for (const c of (e.colonies || [])) { if (c.nodeId === e.civ.home) continue; if (essai(() => attackColony(c.nodeId))) return 'assaut ' + c.nodeId; }
          if (quoi === 'colonie') for (const id of Object.keys(NODES)) { if (allPlayers().some(x => (x.colonies || []).some(c => c.nodeId === id))) continue; if (essai(() => doColonize(id))) return 'colonie ' + id; }
          if (quoi === 'amelio') for (const c of (P.colonies || [])) { if (essai(() => doUpgrade(c.nodeId))) return 'amélioration ' + c.nodeId; }
          if (quoi === 'civique' && typeof CIVIC_MARKET !== 'undefined') for (const c of CIVIC_MARKET) { if (!c || c.calmAction || c.diploAction) continue; if (essai(() => buyMarket(c.id))) return 'civique ' + c.id; }
          if (quoi === 'tech') { const c = CARDS_POOL.slice().sort((a, b) => (b.id === 'dyson3') - (a.id === 'dyson3') || (b.branch === 'mines_energie') - (a.branch === 'mines_energie')).find(c => c.branch && isTechAvailable(c, P) && !(P.cards || []).some(x => x.id === c.id) && (typeof canAfford !== 'function' || canAfford(P, c))); if (c && essai(() => buyTech(c.id))) return 'tech ' + c.id; }
        }
        endTurn(); return 'passe';
      }, actionsTour);
      if (/^raid/.test(fait)) { attenteRaid = Date.now() + 1500; dernierRaidTour = tour; }
      if (fait !== 'passe') console.log('   joueur : ' + fait);
      actionsTour++;
      await p.waitForTimeout(150);
      continue;
    }
    if (Date.now() - depuis > 40000) {
      const diag = await p.evaluate(() => { const d = (typeof scDiagEtatPartie === 'function') ? scDiagEtatPartie(8) : { phase: G.phase };
        try { d.pilote = { actif: _piloteLocalActif(), enCours: _piloteHumainEnCours, fenetre: _scAnyModalOpen(), ask: typeof askLocalDecision,
          ouvertes: ['eot-modal','strategy-modal','agenda-sel-modal','invest-modal','invest2-modal','invest-active-modal','event-modal','event-announce-modal','dyson-modal','espionage-modal','empath-copy-modal','war-modal','war-combat-modal','discovery-modal','peace-modal','forced-war-modal','route-token-modal','forge-modal','accord-modal','sc-stuck-modal','sc-ability-reminder','sc-attack-notice'].filter(i => { const e = document.getElementById(i); return e && !e.classList.contains('hidden') && e.style.display !== 'none'; }) }; } catch (e) { d.pilote = String(e); }
        return d; });
      console.log('   diagnostic du figeage : ' + JSON.stringify(diag.pilote));
      rapport.figeages.push({ tour, etat: diag });
      rapport.ecarts.push('tour ' + tour + ' : partie FIGÉE depuis 40 s — flux ' + (diag.flux || '?') + ', questions ' + JSON.stringify(diag.questions || []));
      await p.screenshot({ path: path.join(OUT, 'fige_tour' + tour + '.png') });
      break;
    }
    await p.waitForTimeout(200);
  }
  if (!rapport.fin) rapport.fin = rapport.figeages.length ? 'arrêtée : partie figée' : 'arrêtée : durée maximale atteinte au tour ' + tour;
  rapport.natifs = await p.evaluate(() => window.__natifs).catch(() => []);
  rapport.natifs.forEach(x => rapport.ecarts.push('fenêtre native du navigateur : ' + x));
  rapport.erreurs.slice(0, 10).forEach(x => rapport.ecarts.push('erreur JavaScript : ' + x));
  (await p.evaluate(() => window.__sondes || []).catch(() => [])).forEach(x => rapport.ecarts.push(x));
  try { rapport.journal = await p.evaluate(() => (typeof scExportLog === 'function') ? '' : ''); } catch (e) {}
  rapport.audit = await p.evaluate(() => window.__audit || []).catch(() => []);
  rapport.compte = await p.evaluate(() => window.__compte).catch(() => null);
  rapport.duree = Math.round((Date.now() - t0) / 1000) + ' s';
  fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(rapport, null, 1));
  await b.close();
  console.log('\n' + '═'.repeat(70));
  console.log(rapport.fin + ' · ' + rapport.duree + ' · ' + Object.keys(rapport.fenetres).length + ' types de fenêtres vus');
  console.log('AUDIT : ' + JSON.stringify(rapport.compte) + ' · ' + rapport.audit.length + ' écart(s) de ressources');
  rapport.audit.forEach(x => console.log('   $ ' + JSON.stringify(x)));
  if (rapport.ecarts.length) { console.log('❌ ' + rapport.ecarts.length + ' écart(s) :'); [...new Set(rapport.ecarts)].forEach(e => console.log('   • ' + e)); process.exit(1); }
  console.log('✅ Partie complète : rappel jamais superposé, résultat de raid affiché, perspective tenue. Captures : ' + OUT);
})();
