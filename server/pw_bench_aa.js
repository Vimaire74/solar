/* BANC PLAYWRIGHT (cloud, pas la VM) — réglage Aa : la taille calculée de <body> suit scTaille(), le cran
   mémorisé est relu au chargement, les anciens crans 11/13/15/17 migrent en 14/16/18/20.
   Prérequis : copie du jeu servie sur http://localhost:8765 (python3 -m http.server 8765), Chromium Playwright.
   Voir docs/POINT_DEPART_NOUVELLE_TACHE.md §7.4. RED avec body{font-size:16px} en fin de feuille (5 KO), GREEN v10.62. */
// Bench Aa : la taille calculée de <body> doit suivre scTaille(), et le cran mémorisé doit
// être relu au chargement (script de tête), y compris l'ancien cran 13 migré en 16.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto('http://localhost:8765/play.html');
  await pg.waitForTimeout(800);
  const fs = () => pg.evaluate(() => getComputedStyle(document.body).fontSize);
  let ko = 0;
  const check = (nom, got, exp) => { const ok = got === exp; if (!ok) ko++; console.log((ok ? 'OK ' : 'KO ') + nom + ' : ' + got + (ok ? '' : ' (attendu ' + exp + ')')); };
  check('défaut', await fs(), '16px');
  for (const px of [14, 18, 20, 16]) {
    await pg.evaluate(p => scTaille(p), px);
    check('scTaille(' + px + ')', await fs(), px + 'px');
    const pressed = await pg.evaluate(() => [...document.querySelectorAll('#sc-taille button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.fs));
    check('bouton allumé ' + px, pressed.join(','), String(px));
  }
  // rechargement : le cran mémorisé (18) est relu avant le premier rendu
  await pg.evaluate(() => scTaille(18));
  await pg.reload(); await pg.waitForTimeout(600);
  check('rechargement 18', await fs(), '18px');
  // migration d'un ancien cran (13 → 16, 17 → 20)
  await pg.evaluate(() => localStorage.setItem('sc_taille', '17'));
  await pg.reload(); await pg.waitForTimeout(600);
  check('migration 17→20', await fs(), '20px');
  check('localStorage migré', await pg.evaluate(() => localStorage.getItem('sc_taille')), '20');
  await pg.evaluate(() => localStorage.setItem('sc_taille', '13'));
  await pg.reload(); await pg.waitForTimeout(600);
  check('migration 13→16', await fs(), '16px');
  await b.close();
  console.log(ko ? 'ROUGE (' + ko + ' KO)' : 'VERT');
  process.exit(ko ? 1 : 0);
})();
