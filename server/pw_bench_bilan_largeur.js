/* BANC PLAYWRIGHT (cloud, pas la VM) — v10.63, deux défauts vus par Marc dans la partie 96F6 :
     A. le BILAN DE TOUR débordait : `.eot-gain` en `white-space:nowrap` dans un flex sans
        `min-width:0` → la description de l'IA de Navigation faisait 940 px dans une carte de 378 px ;
     B. la LARGEUR SAUTAIT sur ordinateur : carte 1280 px, tous les autres onglets 480 px.
   Prérequis : copie du jeu servie sur http://localhost:8765, Chromium Playwright.
   Voir docs/POINT_DEPART_NOUVELLE_TACHE.md §7.4. RED avant v10.63, GREEN après. */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ko = 0;
  const check = (n, c, d) => { console.log((c ? 'OK ' : 'KO ') + n + (d !== undefined ? ' : ' + d : '')); if (!c) ko++; };

  for (const [w, h, tag] of [[390, 844, 'telephone'], [1280, 860, 'ordinateur']]) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    pg.on('pageerror', e => { console.log('PAGEERROR ' + e.message); ko++; });
    await pg.goto('http://localhost:8765/play.html');
    await pg.waitForTimeout(500);
    await pg.evaluate(() => { lvSolo(); setDifficulty('normal'); selectCiv('ceinturiens'); startGame(); });
    await pg.waitForTimeout(900);
    await pg.evaluate(() => { document.querySelectorAll('[id$="-modal"]').forEach(m => m.style.display = 'none'); });
    console.log('\n--- ' + tag + ' (' + w + 'px) ---');

    // ── B. une seule largeur pour tous les onglets ──
    const larg = await pg.evaluate(() => {
      const r = {};
      for (const t of ['map', 'tech', 'empire', 'diplo', 'journal']) {
        uiTab(t);
        r[t] = Math.round(document.body.getBoundingClientRect().width);
      }
      return r;
    });
    const valeurs = Object.values(larg);
    const memes = valeurs.every(v => v === valeurs[0]);
    check('tous les onglets ont la même largeur', memes, JSON.stringify(larg));
    if (tag === 'ordinateur') check('la largeur sur ordinateur dépasse la colonne téléphone', valeurs[0] > 480, valeurs[0] + 'px');

    // ── A. le bilan ne déborde pas, avec la description la plus longue du jeu ──
    const eot = await pg.evaluate(() => {
      // on prend la description la plus longue de tout le jeu, pas une au hasard
      let pire = '', src = '';
      const voir = (t, n) => { const s = String(t || ''); if (s.length > pire.length) { pire = s; src = n; } };
      try { for (const c of CARDS_POOL) voir(c.effect, c.name); } catch (e) {}
      try { for (const c of CIVIC_MARKET) voir(c.effect, c.name); } catch (e) {}
      const m = document.getElementById('eot-modal');
      m.style.display = 'flex'; m.classList.remove('hidden');
      const card = m.querySelector('.eot-card');
      card.innerHTML = '<div class="eot-section"><h4>Actions ce tour</h4>'
        + '<div class="eot-item" id="_t"><span class="eot-icon">🧠</span><span class="eot-name">' + src + '</span>'
        + '<span class="eot-paid">−1 AC 3🔬 1⚡</span><span class="eot-gain">' + pire + '</span></div></div>';
      const it = document.getElementById('_t'), cr = card.getBoundingClientRect(), ir = it.getBoundingClientRect();
      return { src, n: pire.length, carte: Math.round(cr.width),
               debordeLigne: Math.round(it.scrollWidth - it.clientWidth),
               sortDeLaCarte: Math.round(ir.right - cr.right),
               scrollCarte: card.scrollWidth - card.clientWidth,
               scrollPage: document.body.scrollWidth - document.body.clientWidth };
    });
    console.log('    carte la plus bavarde : « ' + eot.src + ' » (' + eot.n + ' caractères), cadre ' + eot.carte + 'px');
    check('la ligne ne déborde pas', eot.debordeLigne <= 1, eot.debordeLigne + 'px');
    check('elle ne sort pas de la carte', eot.sortDeLaCarte <= 1, eot.sortDeLaCarte + 'px');
    check('la carte n\'a pas de défilement horizontal', eot.scrollCarte <= 1, eot.scrollCarte + 'px');
    check('la page n\'a pas de défilement horizontal', eot.scrollPage <= 1, eot.scrollPage + 'px');
    await pg.close();
  }
  await b.close();
  console.log('\n' + (ko ? 'ROUGE (' + ko + ' KO)' : 'VERT'));
  process.exit(ko ? 1 : 0);
})();
