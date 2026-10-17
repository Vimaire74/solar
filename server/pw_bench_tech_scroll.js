/* BANC PLAYWRIGHT (cloud, pas la VM) — menu Techs : la liste garde sa position quand render() repasse
   (tour d'une autre nation, synchro en ligne) ; seul techRiviere() remonte en haut. Marc, 16/09 (§130).
   Prérequis : copie du jeu servie sur http://localhost:8765, Chromium Playwright. RED avant v10.62 (scrollTop=0 à chaque rendu). */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto('http://localhost:8765/play.html'); await pg.waitForTimeout(600);
  await pg.evaluate(() => { lvSolo(); setDifficulty('normal'); selectCiv('terriens'); startGame(); });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { document.querySelectorAll('[id$="-modal"]').forEach(m => { m.style.display = 'none'; }); uiTab('tech'); });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    const body = document.getElementById('tech-body');
    const max = body.scrollHeight - body.clientHeight;
    body.scrollTop = 250; const a = body.scrollTop;
    render();                       // rendu = « une autre nation a joué »
    const apres = body.scrollTop;
    techRiviere('civ'); const civ = body.scrollTop;
    return { max, a, apres, civ };
  });
  let ko = 0;
  const check = (n, c) => { console.log((c ? 'OK ' : 'KO ') + n); if (!c) ko++; };
  check('la liste est assez longue pour défiler (max ' + r.max + ')', r.max > 250);
  check('position avant rendu : ' + r.a, r.a === 250);
  check('position conservée après render() : ' + r.apres, r.apres === 250);
  check('changement de rivière → retour en haut : ' + r.civ, r.civ === 0);
  await b.close();
  console.log(ko ? 'ROUGE' : 'VERT'); process.exit(ko ? 1 : 0);
})();
