/* ============================================================================
   pw_rappel_route.js — LE RAPPEL DE POUVOIR ATTEND LA FIN DE L'ACTION (03/10/2026)
   ----------------------------------------------------------------------------
   Scénario précis (complément de pw_rappel_fenetres.js, qui joue une partie entière) : le joueur a
   2 AC, pose une route et RESTE 7,5 s sur la fenêtre du jeton. Attendu :
     §1 pendant ces 7,5 s, pas de rappel de pouvoir, et les ordinateurs ne jouent pas (la main reste) ;
     §2 jeton choisi puis ✓ : les ordinateurs jouent, la main revient à 1 AC, et le rappel S'AFFICHE
        (seul) — il n'a pas été perdu en route ;
     §3 un raid : la fenêtre de résultat s'affiche, et le rappel ne vient pas par-dessus.
   CONTRE-ÉPREUVE : sur le moteur d'avant (v11.21 du 02/10), §1 est rouge.
   USAGE (conteneur) : jeu servi sur 8766, `node pw_rappel_route.js`.
   ========================================================================== */
'use strict';
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/tmp/claude-0/node_modules/playwright'); }
const URL = process.env.URL || 'http://127.0.0.1:8766/index.html';
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const TROUVER = `(() => {
  const vis = e => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length && !e.classList.contains('hidden');
  const l = [];
  document.querySelectorAll('[id$="-modal"], #sc-ask, #sc-diag, #sc-ability-reminder, #sc-attack-notice, #aad-overlay, #calm-overlay, #il-window, #sc-ov, #sc-decision').forEach(e => { if (vis(e)) l.push(e.id); });
  const c = document.getElementById('sc-confirm'); if (c && c.classList.contains('show')) l.push('sc-confirm');
  return l;
})()`;

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
  const choix = root.querySelector('.agsel-ag:not(.ag-selected), .strat-opt, .inv-opt, .esp-l[aria-pressed="false"], .pacte-l[aria-pressed="false"]');
  if (choix && ok(choix) && !root.dataset.__pwChoisi) { root.dataset.__pwChoisi = '1'; choix.click(); }
  /* .fw-choice : les choix de la guerre populaire sont des blocs cliquables, pas des <button>. */
  const prio = ['.fw-choice', '.fen-btn.ok', '.fen-btn.go', '#ev-pactes-go', '#ev-accords-go', '.esp-go', '.eot-btn', '.agsel-go', '.btn-go', '.fen-btn', '.war-btn', '.evm-btn', '.disc-btn', '.npop-btn', '.inv-opt', '.strat-opt', 'button'];
  /* 02/10 : le bouton de repli (.fen-reduire, REPRISE 176.2 et 188) est un <button> : un joueur ne répond pas avec. */
  for (const s of prio) for (const b of root.querySelectorAll(s)) if (ok(b) && !b.classList.contains('fen-reduire') && !DANGER.test(b.textContent || '')) return clic(b);
  return 'rien à cliquer';
})`;

const VIS = `(i => { const e = document.getElementById(i); return !!(e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getClientRects().length); })`;
(async () => {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, locale: 'fr-CH' });
  await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, platform: 'android', registerPlugin: () => ({ addListener() {}, exitApp() {} }), Plugins: {} }; try { localStorage.clear(); localStorage.setItem('sc_lang', 'fr'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1200);
  await p.evaluate(() => { lvSolo(); setDifficulty('normal'); selectCiv('ceinturiens'); startGame(); });
  /* Arriver à la main du joueur au tour 1 : on répond aux fenêtres d'ouverture comme pw_partie_appli. */
  for (let i = 0; i < 200; i++) {
    const s = await p.evaluate(() => ({ main: !!G._humanActive, phase: G.phase }));
    const fen = await p.evaluate(TROUVER);
    if (s.main && s.phase === 'actions' && !fen.length) break;
    if (fen.length) await p.evaluate(REPONDRE + '(' + JSON.stringify(fen[fen.length - 1]) + ')');
    await p.waitForTimeout(250);
  }
  console.log('main au joueur : ' + JSON.stringify(await p.evaluate(() => ({ main: !!G._humanActive, tour: G.turn, ac: G.player.acLeft }))));
  const route = await p.evaluate(() => { const P = G.player; P.acLeft = 2; P.forceTokens = Math.max(P.forceTokens, 3); P.res.materials = 10; P.res.energy = 10;
    for (const c of P.colonies) for (const adj of (NODES[c.nodeId].conn || [])) { if (P.routes.some(r => (r.from === c.nodeId && r.to === adj) || (r.to === c.nodeId && r.from === adj))) continue; const a = P.acLeft; doEstablishRoute(c.nodeId, adj); if (P.acLeft < a) return c.nodeId + '→' + adj; }
    return null; });
  console.log('route posée : ' + route);
  console.log('§1 7,5 s sur la fenêtre du jeton');
  const log0 = await p.evaluate(() => (G.log || []).length);
  await p.waitForTimeout(7500);   // au-delà des 6 s de l'ancien plafond
  const s1 = await p.evaluate(v => ({ jeton: eval(v)('route-token-modal'), rappel: eval(v)('sc-ability-reminder'), main: !!G._humanActive, idx: G._ilIdx }), VIS);
  if (s1.jeton) ok('fenêtre du jeton toujours là'); else ko('la fenêtre du jeton a disparu');
  if (!s1.rappel) ok('aucun rappel de pouvoir par-dessus'); else ko('rappel de pouvoir affiché par-dessus le choix du jeton');
  if (s1.main) ok('la main reste au joueur (les ordinateurs attendent)'); else ko('les ordinateurs ont joué pendant le choix du jeton');
  console.log('§2 jeton choisi, ✓, retour de la main');
  await p.evaluate(REPONDRE + '("route-token-modal")');
  await p.waitForTimeout(400);
  await p.evaluate(() => { const x = document.querySelector('#sc-confirm .scc-ok'); if (x && document.getElementById('sc-confirm').classList.contains('show')) x.click(); });
  let s2 = null;
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(500);
    { const fen = await p.evaluate(TROUVER); const autre = fen.filter(x => x !== 'sc-ability-reminder'); if (autre.length) await p.evaluate(REPONDRE + '(' + JSON.stringify(autre[autre.length - 1]) + ')'); }
    s2 = await p.evaluate(v => ({ main: !!G._humanActive, ac: G.player.acLeft, rappel: eval(v)('sc-ability-reminder'), autres: _scAnyModalOpen() && !eval(v)('sc-ability-reminder') }), VIS);
    if (s2.main && s2.rappel) break; }
  if (s2 && s2.main && s2.ac === 1) ok('main revenue au joueur à 1 AC'); else ko('état au retour : ' + JSON.stringify(s2));
  if (s2 && s2.rappel && !s2.autres) ok('le rappel de pouvoir s\'affiche, seul'); else ko('rappel absent ou superposé : ' + JSON.stringify(s2));
  console.log('§3 raid : résultat affiché, rappel pas par-dessus');
  await p.evaluate(() => { try { _scAbilityReminderSkip(); } catch (e) {} });
  const raid = await p.evaluate(() => { const P = G.player; P.acLeft = 1; P.forceTokens = Math.max(P.forceTokens, 4); P._rappelPouvoirTour = -1;
    for (const e of allPlayers().filter(x => x !== P)) for (const c of e.colonies) { if (c.nodeId === e.civ.home) continue; const a = P.acLeft; doRaidTarget(e.civ.id, c.nodeId); if (P.acLeft < a) return c.nodeId; }
    for (const e of allPlayers().filter(x => x !== P)) { const a = P.acLeft; doRaidTarget(e.civ.id, e.civ.home); if (P.acLeft < a) return e.civ.home; }
    return null; });
  console.log('raid : ' + raid);
  await p.waitForTimeout(3000);
  const s3 = await p.evaluate(v => ({ res: eval(v)('sc-raid-result'), rappel: eval(v)('sc-ability-reminder'), txt: (document.getElementById('sc-raid-result') || {}).innerText || '' }), VIS);
  if (raid && s3.res) ok('fenêtre de résultat : « ' + s3.txt.replace(/\s+/g, ' ').slice(0, 90) + ' »'); else ko('pas de fenêtre de résultat de raid (raid ' + raid + ')');
  if (!s3.rappel) ok('aucun rappel par-dessus le résultat'); else ko('rappel par-dessus le résultat du raid');
  errs.slice(0, 5).forEach(e => ko('erreur JavaScript : ' + e));
  await b.close();
  console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ le rappel attend la fin de l\'action ; le raid affiche son résultat');
  process.exit(ecarts.length ? 1 : 0);
})();
