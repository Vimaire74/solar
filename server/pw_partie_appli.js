/* ============================================================================
   pw_partie_appli.js — UNE PARTIE COMPLÈTE DANS L'APPLI ÉMULÉE, CHAQUE FENÊTRE CONTRÔLÉE (30/09/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 30/09 : « oui je veux ça, il faut que tu puisses vérifier les visuels ».
   `pw_parcours_appli.js` contrôle les fenêtres qu'on lui a apprises. Celui-ci JOUE : il lance une
   partie solo dans l'appli émulée (Chromium, `window.Capacitor` natif, 360×800 tactile) et va
   jusqu'au bout. À chaque fenêtre qui s'ouvre — quelle qu'elle soit — il :
     1. la sonde : bouton au fond système du navigateur, <select>, case native, débordement à droite,
        texte coupé (scrollWidth > clientWidth sur un bouton) ;
     2. la photographie une fois par type (dans OUT) — pour que JE regarde les visuels ;
     3. répond comme un joueur : le bouton principal du jeu, jamais un bouton destructeur.
   À son tour, le joueur achète une technologie quand il peut (ce qui ouvre ✓/↩), puis passe.
   Il signale aussi : partie FIGÉE (aucun progrès pendant 40 s sans fenêtre à répondre, avec l'état
   du flux), erreurs JavaScript, confirm()/alert(), bandeau « action faite » (supprimé le 30/09).

   UNE SEULE PARTIE par exécution (règle de Marc, 20/09 : pas plus d'une partie de test sans GO).
   USAGE (CONTENEUR CLOUD) : jeu servi comme pour pw_parcours_appli.js, puis
     node server/pw_partie_appli.js         → rapport + OUT/<fenêtre>.png + OUT/rapport.json
   Variables : URL, OUT, CIV (défaut ceinturiens), DIFF (normal), MAX_MIN (durée max, 12).
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/tmp/claude-0/node_modules/playwright'); }
const URL = process.env.URL || 'http://127.0.0.1:8766/index.html';
const OUT = process.env.OUT || '/tmp/claude-0/partie';
const CIV = process.env.CIV || 'ceinturiens', DIFF = process.env.DIFF || 'normal';
const MAX_MS = (parseFloat(process.env.MAX_MIN) || 12) * 60000;
fs.mkdirSync(OUT, { recursive: true });

/* Ce qui compte comme « une fenêtre à l'écran » : les modales du jeu, l'overlay d'événement, les
   fenêtres construites à la volée (scDemander, diagnostic, bloqué, rappel de pouvoir), le bandeau ✓/↩. */
const TROUVER = `(() => {
  const vis = e => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length && !e.classList.contains('hidden');
  const l = [];
  document.querySelectorAll('[id$="-modal"], #sc-ask, #sc-diag, #sc-ability-reminder, #sc-attack-notice, #aad-overlay, #calm-overlay, #il-window, #sc-ov, #sc-decision').forEach(e => { if (vis(e)) l.push(e.id); });
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
  const choix = root.querySelector('.agsel-ag:not(.ag-selected), .strat-opt, .inv-opt, .esp-l[aria-pressed="false"], .pacte-l[aria-pressed="false"]');
  if (choix && ok(choix) && !root.dataset.__pwChoisi) { root.dataset.__pwChoisi = '1'; choix.click(); }
  /* .fw-choice : les choix de la guerre populaire sont des blocs cliquables, pas des <button>. */
  const prio = ['.fw-choice', '.fen-btn.ok', '.fen-btn.go', '#ev-pactes-go', '#ev-accords-go', '.esp-go', '.eot-btn', '.agsel-go', '.btn-go', '.fen-btn', '.war-btn', '.evm-btn', '.disc-btn', '.npop-btn', '.inv-opt', '.strat-opt', 'button'];
  for (const s of prio) for (const b of root.querySelectorAll(s)) if (ok(b) && !DANGER.test(b.textContent || '')) return clic(b);
  return 'rien à cliquer';
})`;

(async () => {
  const t0 = Date.now();
  const rapport = { fenetres: {}, ecarts: [], erreurs: [], natifs: [], figeages: [], tours: [], fin: null };
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
  await p.evaluate(({ civ, diff }) => { lvSolo(); setDifficulty(diff); selectCiv(civ); startGame(); }, { civ: CIV, diff: DIFF });
  await p.waitForTimeout(800);

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

    const fen = await p.evaluate(TROUVER);
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
      const clic = await p.evaluate(REPONDRE + '(' + JSON.stringify(id) + ')');
      if (clic === 'rien à cliquer' && Date.now() - depuis > 15000) { rapport.ecarts.push(type + ' : aucune sortie cliquable'); await p.evaluate(i => { const e = document.getElementById(i); if (e) { e.classList.add('hidden'); e.style.display = 'none'; } }, id); }
      await p.waitForTimeout(120);
      continue;
    }
    if (etat.phase === 'actions' && etat.main) {
      /* À mon tour : une technologie si je peux (ouvre ✓/↩), sinon je passe. */
      const fait = await p.evaluate(n => {
        if (n < 1 && G.player.acLeft > 0) {
          const c = CARDS_POOL.find(c => c.branch && isTechAvailable(c, G.player) && !(G.player.cards || []).some(x => x.id === c.id) && (typeof canAfford !== 'function' || canAfford(G.player, c)));
          if (c) { const avant = (G.log || []).length; buyTech(c.id); if ((G.log || []).length !== avant || _scConfirmArmed) return 'tech ' + c.id; }
        }
        endTurn(); return 'passe';
      }, actionsTour);
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
  rapport.duree = Math.round((Date.now() - t0) / 1000) + ' s';
  fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(rapport, null, 1));
  await b.close();
  console.log('\n' + '═'.repeat(70));
  console.log(rapport.fin + ' · ' + rapport.duree + ' · ' + Object.keys(rapport.fenetres).length + ' types de fenêtres vus');
  if (rapport.ecarts.length) { console.log('❌ ' + rapport.ecarts.length + ' écart(s) :'); [...new Set(rapport.ecarts)].forEach(e => console.log('   • ' + e)); process.exit(1); }
  console.log('✅ Partie complète sans défaut détecté. Captures : ' + OUT);
})();
