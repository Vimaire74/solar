/* ============================================================================
   pw_parcours_appli.js — L'APPLI ÉMULÉE DANS CHROMIUM, FENÊTRE PAR FENÊTRE (30/09/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 30/09 : « beaucoup de problèmes ont resurgi […] il faudrait que tu puisses la
   tester toi-même ». Les bancs Node passent par un DÉCOR (game-core.js) : pas de CSS, pas de mise
   en page, pas de minuterie. Ils ne peuvent donc PAS voir un bouton sans style, un bandeau qui
   passe par-dessus une fenêtre, ou une case qui déborde. Ce banc charge le vrai index.html dans
   Chromium, déguisé en appli : `window.Capacitor` natif (donc `html.app-natif`, solo local, sans
   serveur), `app-natif.js` injecté comme le fait build-www.js, écran 360×800 tactile du Flip 6.

   CE QU'IL VÉRIFIE (chaque point a sa contre-épreuve) :
   A. Aucun élément « brut » du navigateur dans les fenêtres ouvertes : bouton au fond système,
      <select>, <input type=checkbox>, confirm()/alert() appelés.
   B. Pactes : on peut en choisir PLUSIEURS, le bouton compte et porte le style du jeu.
   C. Accords commerciaux : le bouton « Passer » porte le style du jeu.
   D. Bandeau d'action : jamais affiché pendant que ✓/↩ attend la validation.
   E. Rien ne déborde à droite (scrollWidth ≤ largeur) dans ces fenêtres.

   USAGE (dans le CONTENEUR CLOUD seulement — Chromium n'existe pas dans la VM du Mac) :
     copie du jeu servie par `python3 -m http.server 8766` dans un dossier où index.html a reçu
     `<script src="app-natif.js">` (voir build-www.js) ; puis
     node server/pw_parcours_appli.js            (URL par défaut http://127.0.0.1:8766/index.html)
   Captures dans /tmp/claude-0/parcours/ — pour MOI, pas à envoyer à Marc (sa règle du 16/09).
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/tmp/claude-0/node_modules/playwright'); }
const URL = process.env.URL || 'http://127.0.0.1:8766/index.html';
const OUT = process.env.OUT || '/tmp/claude-0/parcours';
fs.mkdirSync(OUT, { recursive: true });
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

/* Un bouton « brut » : fond système du navigateur (buttonface) et bordure système. */
const SONDE = `(function(root){
  const bruts=[];
  root.querySelectorAll('button').forEach(b=>{
    if(!b.offsetParent)return;
    const cs=getComputedStyle(b);
    const fond=cs.backgroundColor, bord=cs.borderStyle;
    if(fond==='rgb(239, 239, 239)'||fond==='rgb(240, 240, 240)'||fond==='buttonface'||bord==='outset')
      bruts.push('bouton brut : « '+(b.textContent||'').trim().slice(0,40)+' » ('+fond+')');
  });
  root.querySelectorAll('select, input[type=checkbox], input[type=radio]').forEach(e=>{ if(e.offsetParent) bruts.push('élément natif : <'+e.tagName.toLowerCase()+(e.type?' type='+e.type:'')+'>'); });
  const deb=[...root.querySelectorAll('*')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>window.innerWidth+1).slice(0,3)
    .map(e=>'déborde : <'+e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:'')+'> droite='+Math.round(e.getBoundingClientRect().right));
  return bruts.concat(deb);
})`;

(async () => {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'fr-CH',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F741B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, platform: 'android', registerPlugin: () => ({ addListener() {}, exitApp() {} }), Plugins: {} };
    try { localStorage.setItem('sc_lang', 'fr'); } catch (e) {}
    window.__natifs = []; window.confirm = m => { window.__natifs.push('confirm: ' + m); return true; }; window.alert = m => { window.__natifs.push('alert: ' + m); };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1500);
  const natif = await p.evaluate(() => document.documentElement.classList.contains('app-natif'));
  if (natif) ok('page reconnue comme l\'appli (html.app-natif)'); else ko('la page ne se croit pas dans l\'appli : le banc ne mesure pas l\'appli');
  await p.evaluate(() => { lvSolo(); setDifficulty('normal'); selectCiv('ceinturiens'); startGame(); });
  await p.waitForTimeout(1500);
  /* ⚠️ La fenêtre d'événement s'appelle `event-choice-modal` : la masquer par la classe `hidden`
     l'empêche de se rouvrir (`_evOverlay` ne pose que `display`). Premier jet de ce banc : la fenêtre
     des accords ne s'ouvrait jamais, et le point C était VERT sans rien mesurer. */
  const fermer = () => p.evaluate(() => {
    document.querySelectorAll('[id$="-modal"]').forEach(e => { if (e.id !== 'event-choice-modal') e.classList.add('hidden'); });
    try { _evCloseOverlay(); } catch (e) {} try { _scHideConfirm(); } catch (e) {}
  });
  /* Une fenêtre annoncée doit ÊTRE à l'écran : sinon le point qui la mesure ne prouve rien. */
  const ouverte = async (sel, nom) => { const v = await p.evaluate(s => { const e = document.querySelector(s); return !!(e && e.offsetParent !== null || (e && getComputedStyle(e).display !== 'none' && e.getClientRects().length)); }, sel); if (!v) ko(nom + ' : la fenêtre ne s\'est pas ouverte — mesure impossible'); return v; };

  console.log('\nB. PACTES DE NON-AGRESSION');
  await fermer();
  await p.evaluate(() => { G.player.res.materials = 20; showDiploEventModal(null); });
  await p.waitForTimeout(300);
  await ouverte('#event-choice-modal', 'pactes');
  const lignes = await p.$$('.pacte-l');
  if (lignes.length >= 2) ok(lignes.length + ' lignes de pacte'); else ko('moins de deux lignes de pacte (' + lignes.length + ')');
  for (const l of lignes) await l.tap();
  const pac = await p.evaluate(() => ({ appuyes: [...document.querySelectorAll('.pacte-l')].filter(e => e.getAttribute('aria-pressed') === 'true').length, go: document.getElementById('ev-pactes-go').textContent }));
  if (pac.appuyes === lignes.length && /2/.test(pac.go)) ok('plusieurs pactes choisis à la fois : « ' + pac.go + ' »'); else ko('choix multiple impossible : ' + JSON.stringify(pac));
  let bruts = await p.evaluate(SONDE + '(document.body)');
  if (!bruts.length) ok('fenêtre des pactes : aucun élément brut, rien ne déborde'); else bruts.forEach(x => ko('pactes — ' + x));
  await p.screenshot({ path: path.join(OUT, 'pactes.png') });

  console.log('\nC. ACCORDS COMMERCIAUX');
  await fermer();
  await p.evaluate(() => showCommEventModal(null));
  await p.waitForTimeout(300);
  await ouverte('#event-choice-modal', 'accords');
  const nCand = await p.evaluate(() => [...document.querySelectorAll('#event-choice-modal button')].filter(b => /_evCommPick\('/.test(b.getAttribute('onclick') || '')).length);
  if (nCand >= 1) ok(nCand + ' nation(s) proposée(s) pour un accord'); else {
    const lignesA = await p.$$('#event-choice-modal .pacte-l');
    if (lignesA.length >= 2) ok(lignesA.length + ' nations proposées pour un accord'); else ko('moins de deux nations proposées dans la fenêtre des accords');
    for (const l of lignesA) await l.tap();
    const acc = await p.evaluate(() => ({ n: _evCommChoisies().length, go: (document.getElementById('ev-accords-go') || {}).textContent }));
    if (acc.n === lignesA.length && /2/.test(acc.go || '')) ok('plusieurs accords choisis à la fois : « ' + acc.go + ' »'); else ko('accords : choix multiple impossible ' + JSON.stringify(acc));
  }
  bruts = await p.evaluate(SONDE + '(document.body)');
  if (!bruts.length) ok('fenêtre des accords : aucun élément brut, rien ne déborde'); else bruts.forEach(x => ko('accords — ' + x));
  await p.screenshot({ path: path.join(OUT, 'accords.png') });

  console.log('\nD. BANDEAU D\'ACTION ET VALIDATION');
  await fermer();
  const d = await p.evaluate(async () => {
    G.phase = 'actions'; G.player.acLeft = 3; G.player.res = { materials: 20, energy: 20, science: 20, morale: 5 };
    const carte = CARDS_POOL.find(c => c.tier === 1 && c.branch && isTechAvailable(c, G.player));
    if (!carte) return { erreur: 'aucune technologie de rang 1 achetable' };
    buyTech(carte.id);
    let vu = false, valider = false;
    for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 100)); const t = document.getElementById('action-toast'); if (t && t.classList.contains('show')) vu = true; if (_scConfirmArmed) valider = true; }
    try { _scValidate ? _scValidate() : document.querySelector('#sc-confirm .scc-ok').click(); } catch (e) { try { document.querySelector('#sc-confirm .scc-ok').click(); } catch (e2) {} }
    for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 100)); const t = document.getElementById('action-toast'); if (t && t.classList.contains('show')) vu = true; }
    return { carte: carte.id, vu, valider, existe: !!document.getElementById('action-toast') };
  });
  /* Règle de Marc (30/09) : plus AUCUN bandeau « action faite » — ni avant, ni après la validation. */
  if (d.erreur) ko(d.erreur);
  else if (!d.valider) ko('achat de ' + d.carte + ' : le bandeau ✓/↩ ne s\'est pas armé — l\'action n\'a pas eu lieu, mesure impossible');
  else if (d.vu || d.existe) ko('bandeau « action faite » encore présent (affiché : ' + d.vu + ', élément : ' + d.existe + ')');
  else ok('achat de ' + d.carte + ' : ✓/↩ armé, aucun bandeau « action faite », avant comme après la validation');
  await p.screenshot({ path: path.join(OUT, 'validation.png') });

  console.log('\nE. TITRES DES FENÊTRES D\'AVIS');
  /* Une nouvelle qui ne te vise pas n'est pas « On t'attaque » (banc de partie, 30/09). */
  const e = await p.evaluate(() => {
    const lire = h => { const d = document.createElement('div'); d.innerHTML = fenAttaques(h, {}); return (d.textContent || '').replace(/\s+/g, ' '); };
    const nouvelle = lire([{ title: '⚔️ Guerre : 🔴 Martiens contre 🌍 Terriens', body: 'Tu n\'es pas concerné — mais leurs routes en territoire ennemi tombent.' },
                           { title: '🕵️ Espionnage réussi', body: '1 technologie volée à Terriens' }, { title: '🛡️ Aucun assaut contre toi', body: 'Terriens n\'a pas attaqué.' }]);
    const coup = lire([{ title: 'Terriens attaque Cérès', body: 'Assaut repoussé', genre: 'coup' }]);
    let moral = null;
    try { G.player.res.morale = 0; showMoraleWarning(); moral = (document.querySelector('#dyson-modal .fen-kicker') || {}).textContent || ''; document.getElementById('dyson-modal').classList.add('hidden'); } catch (x) { moral = 'erreur ' + x.message; }
    return { nouvelle, coup, moral };
  });
  if (/Nouvelles/i.test(e.nouvelle) && !/attaqu|coups? port/i.test(e.nouvelle.replace(/Aucun assaut contre toi|n'a pas attaqué/g, ''))) ok('nouvelles sans attaque : titre « Nouvelles »'); else ko('nouvelles titrées comme une attaque : ' + e.nouvelle.slice(0, 90));
  if (/attaqué par/i.test(e.coup) && /Terriens/.test(e.coup)) ok('coup déclaré : « attaqué par Terriens » (contre-épreuve)'); else ko('coup déclaré non reconnu : ' + e.coup.slice(0, 90));
  if (e.moral && !/Dyson/i.test(e.moral)) ok('fenêtre « Moral à 0 » : sur-titre « ' + e.moral.trim() + ' »'); else ko('fenêtre « Moral à 0 » : sur-titre « ' + e.moral + ' »');

  console.log('\nF. FENÊTRES RÉDUCTIBLES, ET ✓/↩ QUI ARRIVE SEUL (01/10)');
  /* Marc, 01/10 : « les fenêtres d'informations ne sont pas toutes réductibles […] j'aurais voulu
     aller voir dans le journal » ; « la fenêtre pour valider ou annuler une action doit arriver juste
     après l'action, directement après ». */
  await fermer();
  const f = await p.evaluate(async () => {
    const r = {}; const att = ms => new Promise(x => setTimeout(x, ms));
    const visible = e => !!(e && getComputedStyle(e).display !== 'none' && e.getClientRects().length);
    const eot = document.getElementById('eot-modal'); eot.classList.remove('hidden'); await att(50);
    const btn = eot.querySelector('.fen-reduire'); r.bouton = visible(btn); r.boutonH = btn ? Math.round(btn.getBoundingClientRect().height) : 0;
    if (btn) btn.click(); await att(50);
    const past = document.getElementById('sc-pastille');
    r.replie = !visible(eot); r.pastille = visible(past); r.pastilleTexte = past ? (past.textContent || '').trim() : '';
    /* Le journal est-il atteignable ? l'onglet du bas doit être l'élément touché à son centre. */
    const tab = document.querySelector('.mtab[data-tab="journal"]'); let touche = null;
    if (tab) { const b = tab.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); touche = e && (e === tab || tab.contains(e)); }
    r.journalAtteignable = touche; try { uiTab("journal"); } catch (e) {} await att(50);
    r.journalActif = !!document.querySelector('#mp-journal.active');
    if (past) past.click(); await att(50);
    r.revenue = visible(eot) && !visible(past);
    if (btn) btn.click(); await att(50); eot.classList.add('hidden'); await att(900);   // fermée par le jeu pendant le repli
    r.pastilleEffacee = !visible(past); r.classeRetiree = !eot.classList.contains('fen-replie');
    try { uiTab('map'); } catch (e) {}
    /* ✓/↩ ferme les dépêches ; hors tour, l'action est refusée. */
    G.phase = 'actions'; G._il = true; G._humanActive = true; G.player.acLeft = 3; G.player.res = { materials: 20, energy: 20, science: 20, morale: 5 };
    fenDepechesMontrer(['Martiens achète Biosphère'], { kicker: 'Tour des autres nations' }); await att(50);
    r.depAvant = visible(document.getElementById('sc-depeches'));
    const carte = CARDS_POOL.find(c => c.tier === 1 && c.branch && isTechAvailable(c, G.player) && !possedeCarte(G.player, c.id));
    if (carte) buyTech(carte.id); await att(100);
    r.arme = _scConfirmArmed; r.depApres = visible(document.getElementById('sc-depeches'));
    try { scConfirmCancel(); } catch (e) {} await att(100);
    G._humanActive = false; const n = G.player.cards.length;
    const carte2 = CARDS_POOL.find(c => c.tier === 1 && c.branch && isTechAvailable(c, G.player) && !possedeCarte(G.player, c.id));
    if (carte2) buyTech(carte2.id); await att(50);
    r.horsTourRefuse = G.player.cards.length === n && !_scConfirmArmed; r.hint = (document.getElementById('hint') || {}).textContent || '';
    G._humanActive = true;
    return r;
  });
  if (f.bouton && f.boutonH >= 36) ok('bilan de fin de tour : bouton « – » présent (' + f.boutonH + ' px)'); else ko('bouton « – » absent ou trop petit (' + f.boutonH + ' px)');
  if (f.replie && f.pastille) ok('repliée : fenêtre masquée, pastille « ' + f.pastilleTexte.slice(0, 40) + ' »'); else ko('repli : fenêtre masquée=' + f.replie + ', pastille=' + f.pastille);
  if (f.journalAtteignable && f.journalActif) ok('le journal est atteignable pendant le repli'); else ko('journal inatteignable pendant le repli (touché=' + f.journalAtteignable + ', actif=' + f.journalActif + ')');
  if (f.revenue) ok('la pastille rend la fenêtre'); else ko('la pastille ne rend pas la fenêtre');
  if (f.pastilleEffacee && f.classeRetiree) ok('fermée par le jeu pendant le repli : pastille effacée, classe retirée (contre-épreuve)'); else ko('fermeture pendant le repli : pastille=' + !f.pastilleEffacee + ', classe=' + !f.classeRetiree);
  if (f.depAvant && f.arme && !f.depApres) ok('✓/↩ armé → les dépêches se ferment'); else ko('dépêches : avant=' + f.depAvant + ', armé=' + f.arme + ', après=' + f.depApres);
  if (f.horsTourRefuse && /autres nations/i.test(f.hint)) ok('hors tour : achat refusé, indication « ' + f.hint.slice(0, 50) + ' »'); else ko('hors tour : refusé=' + f.horsTourRefuse + ', indication=« ' + f.hint + ' »');
  await p.screenshot({ path: path.join(OUT, 'reduite.png') });

  /* ⚠️ Les trois sections qui suivent REMPLACENT les §F/§G/§H annoncés en REPRISE §172.6 : elles avaient
     été écrites dans la copie du conteneur et jamais rapportées sur le Mac (constat du 01/10, §176.5).
     Réécrites le 01/10 (GO de Marc), vérifiées rouges sur la v11.06 (lot17) et vertes sur la v11.10. */
  console.log('\nG. ACTION REFUSÉE → FENÊTRE « ACTION IMPOSSIBLE » (§172.2)');
  await fermer();
  const g = await p.evaluate(async () => {
    const r = {}; const att = ms => new Promise(x => setTimeout(x, ms));
    const visible = e => !!(e && getComputedStyle(e).display !== 'none' && e.getClientRects().length);
    G.phase = 'actions'; G._il = true; G._humanActive = true; G.player.acLeft = 3;
    const carte = CARDS_POOL.find(c => c.tier === 1 && c.branch && isTechAvailable(c, G.player) && !possedeCarte(G.player, c.id));
    if (!carte) return { erreur: 'aucune technologie de rang 1 achetable' };
    G.player.res = { materials: 0, energy: 0, science: 0, morale: 5 };   // trop pauvre : refus de règle
    buyTech(carte.id); await att(150);
    const f = document.getElementById('sc-refus'); r.fenetre = visible(f); r.texte = f ? (f.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const b = document.getElementById('sc-refus-ok'); r.boutonH = b ? Math.round(b.getBoundingClientRect().height) : 0;
    if (b) b.click(); await att(100); r.fermee = !document.getElementById('sc-refus');
    G.player.res = { materials: 20, energy: 20, science: 20, morale: 5 };   // contre-épreuve : achat valide → aucune fenêtre
    const n = G.player.cards.length; buyTech(carte.id); await att(150);
    r.valideSansFenetre = !document.getElementById('sc-refus') && G.player.cards.length === n + 1;
    try { scConfirmCancel(); } catch (e) {}
    return r;
  });
  if (g.erreur) ko(g.erreur);
  else {
    if (g.fenetre && /Action impossible/i.test(g.texte)) ok('fenêtre « Action impossible » après un achat trop cher'); else ko('pas de fenêtre de refus (visible=' + g.fenetre + ') : ' + g.texte.slice(0, 80));
    if (/Rien n.a été prélevé/i.test(g.texte) && /manque|Pas assez|insuffisant/i.test(g.texte)) ok('la raison et « Rien n\'a été prélevé » y sont'); else ko('texte du refus incomplet : ' + g.texte.slice(0, 120));
    if (g.boutonH >= 44) ok('bouton « Compris » ' + g.boutonH + ' px, et il ferme (' + g.fermee + ')'); else ko('bouton « Compris » ' + g.boutonH + ' px');
    if (g.valideSansFenetre) ok('contre-épreuve : un achat valide n\'ouvre aucune fenêtre'); else ko('un achat valide ouvre la fenêtre de refus, ou n\'a pas eu lieu');
  }

  console.log('\nH. PLUS AUCUNE FENÊTRE VERTE « X A FAIT Y » (§172.1)');
  const h = await p.evaluate(async () => {
    const r = {}; const att = ms => new Promise(x => setTimeout(x, ms));
    const visible = e => !!(e && getComputedStyle(e).display !== 'none' && e.getClientRects().length);
    G.phase = 'actions'; G._il = true; G._humanActive = true; G.player.acLeft = 3; G.player.abilityUsed = false;
    G.player.res = { materials: 20, energy: 20, science: 20, morale: 5 };
    r.gainToastAvant = typeof gainToast === 'function';          // la fonction du moteur a été retirée
    useAbility(); let vu = false;
    for (let i = 0; i < 8; i++) { await att(100); if (visible(document.getElementById('sc-gaintoast')) || visible(document.getElementById('action-toast'))) vu = true; }
    r.vu = vu; r.utilise = !!G.player.abilityUsed;
    try { scConfirmCancel(); } catch (e) {}
    return r;
  });
  if (!h.utilise) ko('le pouvoir national n\'a pas été joué — mesure impossible');
  else if (h.vu || h.gainToastAvant) ko('fenêtre verte encore là (affichée : ' + h.vu + ', gainToast existe : ' + h.gainToastAvant + ')');
  else ok('pouvoir national joué : aucune fenêtre verte, `gainToast` n\'existe plus');

  console.log('\nI. TOUT CHOIX SE VALIDE — INVESTISSEMENT NIV.1 (§172.3, §172.4)');
  /* En dernier : valider l'investissement avance le tour (strategy draft). */
  await fermer();
  const i = await p.evaluate(async () => {
    const r = {}; const att = ms => new Promise(x => setTimeout(x, ms));
    const visible = e => !!(e && getComputedStyle(e).display !== 'none' && e.getClientRects().length);
    G.player.res = { materials: 20, energy: 20, science: 20, morale: 5 };
    showInvestmentModal(); await att(100);
    const m = document.getElementById('invest-modal'); r.ouverte = visible(m);
    const opts = [...document.querySelectorAll('#inv-opts .inv-opt:not(.inv-nope)')];
    r.options = opts.length; r.directes = opts.filter(o => o.getAttribute('onclick')).length;   // 0 attendu : un toucher ne doit plus appliquer
    const go = m.querySelector('.choix-valider button'); r.valider = !!go; r.desactiveAvant = !!(go && go.disabled);
    const pick = (document.getElementById('inv-ai-pick') || {}).textContent || '';
    r.adversesCaches = !INVESTMENT_CARDS.some(c => pick.indexOf(c.name) >= 0) && !/IA aussi/i.test(document.getElementById('inv-opts').textContent || '');
    const avant = G.player._inv1 || null;
    if (opts[0]) opts[0].click(); await att(50);
    r.selectionne = opts[0] ? opts[0].getAttribute('aria-pressed') === 'true' : false; r.activeApres = !!(go && !go.disabled);
    r.pasAppliqueAuToucher = (G.player._inv1 || null) === avant;
    if (go) go.click(); await att(100);
    r.applique = !!G.player._inv1 && G.player._inv1 !== avant; r.fermee = !visible(m);
    return r;
  });
  if (!i.ouverte || !i.options) ko('fenêtre d\'investissement absente ou sans option (' + i.options + ')');
  else {
    if (i.directes === 0 && i.valider && i.desactiveAvant) ok('un toucher SÉLECTIONNE : aucune option à action directe, « Valider ce choix » présent et inactif'); else ko('options à action directe : ' + i.directes + ', bouton : ' + i.valider + ', inactif avant : ' + i.desactiveAvant);
    if (i.selectionne && i.activeApres && i.pasAppliqueAuToucher) ok('option touchée : sélectionnée, bouton actif, rien d\'appliqué'); else ko('toucher : sélectionnée=' + i.selectionne + ', bouton actif=' + i.activeApres + ', non appliqué=' + i.pasAppliqueAuToucher);
    if (i.applique && i.fermee) ok('« Valider ce choix » applique l\'investissement et ferme'); else ko('validation : appliqué=' + i.applique + ', fermée=' + i.fermee);
    if (i.adversesCaches) ok('investissements adverses cachés avant ton choix'); else ko('les investissements adverses se voient avant le choix');
  }
  await p.screenshot({ path: path.join(OUT, 'investissement.png') });

  console.log('\nA. FENÊTRES NATIVES DU NAVIGATEUR');
  const nat = await p.evaluate(() => window.__natifs);
  if (!nat.length) ok('aucun confirm()/alert() pendant le parcours'); else nat.forEach(x => ko('fenêtre native : ' + x));
  if (errs.length) errs.slice(0, 5).forEach(e => ko('erreur JavaScript : ' + e)); else ok('aucune erreur JavaScript');

  await b.close();
  console.log('\n' + '═'.repeat(70));
  if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
  console.log('✅ Parcours appli vert. Captures : ' + OUT);
})();
