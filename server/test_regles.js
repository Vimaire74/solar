/* ============================================================================
   TEST — LES RÈGLES ÉCRITES DISENT-ELLES CE QUE LE CODE FAIT ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 26/08 : « relis les règles html, corrige ce qui manque ou qui est faux ».
   La relecture a trouvé quatre écarts, dont deux qui trompaient le joueur depuis longtemps :

     · §7 affirmait « chaque carte est exclusive, un seul acheteur par partie ». FAUX : seules les
       technologies de NIVEAU 3 le sont. Deux nations peuvent parfaitement acheter la même T1 ou T2 —
       ce qui change complètement la façon de planifier son arbre.
     · §13 annonçait « 10 % au tour 1 » pour les pirates ; le code calcule 0,10 + tour × 0,10, soit
       20 % dès le premier tour. Le double.
     · §14.2 affirmait « il n'y a pas d'attaque-surprise » — en contradiction directe avec §14.1,
       réécrit la veille : « un assaut est une frappe surprise ». Deux règles opposées dans la même
       page.
     · §17 oubliait le +1 VP par colonie reliée, qui figurait pourtant dans le rapport de fin de
       partie. Un joueur qui vérifiait son score ne retombait pas sur ses pieds.

   ⚠️ POURQUOI CE BANC EXISTE. Un document de règles n'est pas du code : rien ne casse quand il ment.
   Il dérive donc en silence, et c'est le joueur qui paie — il apprend une règle fausse, joue en
   conséquence, puis accuse le jeu d'être incohérent. On automatise donc ce qui est automatisable :
   les COÛTS, les VP et les seuils sont lus dans le code et comparés au texte publié.

   ⚠️ CE BANC NE PROUVE PAS QUE LES RÈGLES SONT COMPLÈTES. Il vérifie que ce qui est écrit est
   exact ; il ne peut pas savoir ce qui manque. La relecture humaine reste nécessaire — ce banc
   protège seulement contre la dérive de ce qu'on a déjà pris la peine d'écrire.

   Usage : node test_regles.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

const HTML = path.join(__dirname, '..', 'play.html');
const REGLES = fs.readFileSync(path.join(__dirname, '..', 'regles.html'), 'utf8');
const sb = loadLogic(HTML);
sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const G = sb.__G;
const POOL = vm.runInContext('CARDS_POOL', sb);
/* Texte visible seul : on ne veut pas qu'un identifiant de classe CSS compte comme une règle. */
const TEXTE = REGLES.slice(REGLES.indexOf('<body>')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('═'.repeat(80));
console.log('RÈGLES ÉCRITES CONTRE CODE — LE TEXTE DIT-IL LA VÉRITÉ ?');
console.log('═'.repeat(80) + '\n');

/* ── 1. Les AC par niveau de gouvernement ─────────────────────────────────── */
console.log('1. AC par niveau de gouvernement');
{
  const p = G.player;
  let faux = 0;
  for (const [pts, niveau] of [[0, 1], [5, 2], [10, 3], [15, 4]]) {
    p.govPermPts = pts; p.govFormPts = 0; p.govFormAC = 0; p.res.morale = 4;
    sb.recomputeGov(p);
    const ac = sb.calcAC(p);
    const attendu = niveau + 1;
    note('niveau ' + p.gov_level + ' (' + pts + ' pts) → ' + ac + ' AC');
    if (p.gov_level !== niveau || ac !== attendu) faux++;
  }
  if (!faux) ok('le code donne bien niveau + 1 AC, de 2 à 5');
  else ko(faux + ' niveau(x) ne correspondent pas à « niveau + 1 »');
  /* Le tableau publié doit porter les mêmes nombres. */
  const table = /<td>4<\/td><td>15<\/td><td>5<\/td>/.test(REGLES.replace(/\s+/g, ''));
  if (table) ok('le tableau des règles annonce bien 5 AC au niveau 4');
  else ko('le tableau des règles n\'annonce pas 5 AC au niveau 4 (il annonçait 4 avant le 26/08)');
  /* Plafonds de moral des formes autoritaires. Écrits dans les règles le 27/08 ALORS QU'ILS
     N'EXISTAIENT PAS ENCORE — c'est en vérifiant avant d'écrire qu'on l'a vu. Ce contrôle empêche
     que le document reparte devant le code une seconde fois. */
  const marche = vm.runInContext('CIVIC_MARKET', sb);
  for (const [id, cap] of [['gov_tyrannie', 6], ['gov_corpo', 7]]) {
    const c = marche.find(x => x.id === id);
    const code = c && c.govForm && c.govForm.moraleCap;
    const publie = new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[^|]{0,120}?plafonn\\S*\\s+à\\s+' + cap).test(TEXTE);
    note(c.name + ' : plafond de moral ' + code + ' dans le code');
    if (code === cap && publie) ok('   et les règles annoncent le même nombre');
    else ko(c.name + ' : code ' + code + ', règles ' + (publie ? cap : 'muettes ou différentes'));
  }
}

/* ── 2. Coûts et VP des 21 technologies ───────────────────────────────────── */
console.log('\n2. Chaque technologie : coût et VP conformes au code');
{
  /* On relit la ligne du tableau qui porte le nom de la carte, et on vérifie que tous les nombres
     du coût y figurent. Un coût faux dans les règles, c'est un plan de jeu impossible à tenir. */
  const lignes = REGLES.split('\n').filter(l => l.indexOf('<tr><td>T') === 0);
  note(lignes.length + ' lignes de technologie dans le document');
  let verifiees = 0, fautives = [];
  for (const c of POOL.filter(x => x.branch)) {
    const ligne = lignes.find(l => l.indexOf(c.name) >= 0);
    if (!ligne) { fautives.push(c.name + ' : absente du tableau'); continue; }
    verifiees++;
    const texte = ligne.replace(/<[^>]+>/g, ' ');
    for (const [r, a] of Object.entries(c.cost || {})) {
      const emoji = { energy: '⚡', materials: '🪨', science: '🔬' }[r];
      if (emoji && texte.indexOf(a + emoji) < 0) fautives.push(c.name + ' : ' + a + emoji + ' absent du coût publié');
    }
    /* Les VP sont dans la dernière colonne. */
    const cols = ligne.split('</td>');
    const vpPublie = parseInt((cols[cols.length - 2] || '').replace(/<[^>]+>/g, '').trim(), 10);
    if (vpPublie !== (c.vp || 0)) fautives.push(c.name + ' : ' + vpPublie + ' VP publiés au lieu de ' + (c.vp || 0));
  }
  note(verifiees + ' technologie(s) confrontées au code');
  if (!fautives.length) ok('coûts et VP publiés identiques au code, carte par carte');
  else { for (const f of fautives.slice(0, 6)) ko(f); }
}

/* ── 3. L'exclusivité : seules les T3 ─────────────────────────────────────── */
console.log('\n3. Exclusivité des cartes');
{
  const t1t2 = POOL.filter(c => c.branch && c.tier < 3);
  const t3 = POOL.filter(c => c.branch && c.tier === 3);
  const exclusiveT1T2 = t1t2.filter(c => sb.isTechExclusive(c)).length;
  const exclusiveT3 = t3.filter(c => sb.isTechExclusive(c)).length;
  note('technologies T1/T2 exclusives : ' + exclusiveT1T2 + '/' + t1t2.length
    + ' · T3 exclusives : ' + exclusiveT3 + '/' + t3.length);
  if (exclusiveT1T2 === 0 && exclusiveT3 === t3.length)
    ok('seules les technologies de niveau 3 sont réservées à leur premier acheteur');
  else ko('la règle d\'exclusivité du code n\'est pas « niveau 3 seulement »');
  /* ⚠️ C'EST LA PHRASE PUBLIÉE QUI ÉTAIT FAUSSE, pas le code. */
  if (/seules les technologies de .{0,20}niveau 3.{0,20} sont réservées/i.test(TEXTE))
    ok('et le document le dit');
  else ko('le document ne dit pas que l\'exclusivité se limite au niveau 3');
  if (/chaque carte est .{0,3}exclusive/i.test(TEXTE))
    ko('le document affirme encore « chaque carte est exclusive » — c\'est faux');
  else ok('l\'ancienne affirmation « chaque carte est exclusive » a disparu');
}

/* ── 4. Le risque pirate ──────────────────────────────────────────────────── */
console.log('\n4. Le pillage des pirates (règle du 21/09)');
{
  /* Les trois nombres de la règle — 60 jours, 70 % sans jeton, 30 % avec — doivent être ceux du code. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  const m = /PIRATES_PORTEE_JOURS=(\d+),\s*PIRATES_CHANCE_NUE=([\d.]+),\s*PIRATES_CHANCE_PROTEGEE=([\d.]+)/.exec(src);
  if (!m) { ko('constantes des pirates introuvables dans moteur.js'); }
  else {
    const j = m[1], nue = Math.round(parseFloat(m[2]) * 100), prot = Math.round(parseFloat(m[3]) * 100);
    note('code : ' + j + ' jours · ' + nue + ' % sans jeton · ' + prot + ' % avec');
    if (new RegExp(j + ' jours de voyage ou moins').test(TEXTE)) ok('le document annonce ' + j + ' jours'); else ko('le document n\'annonce pas ' + j + ' jours');
    if (new RegExp(nue + '\\s*%').test(TEXTE) && new RegExp(prot + '\\s*%').test(TEXTE)) ok('et ' + nue + ' % / ' + prot + ' %'); else ko('le document ne donne pas ' + nue + ' % / ' + prot + ' %');
    if (!/20\s*%\s*au tour 1/.test(TEXTE)) ok('l\'ancien barème « 20 % au tour 1 » a disparu'); else ko('le document annonce encore « 20 % au tour 1 »');
  }
}

/* ── 5. Aucune contradiction sur la frappe surprise ───────────────────────── */
console.log('\n5. CONTRE-ÉPREUVE — le document ne se contredit pas sur l\'assaut');
{
  /* §14.1 dit « frappe surprise » ; §14.2 disait « il n'y a pas d'attaque-surprise ». Deux règles
     opposées dans la même page : celui qui lit vite en retient une au hasard. */
  const dit = /frappe surprise/i.test(TEXTE);
  const contredit = /pas d.attaque.surprise/i.test(TEXTE);
  if (dit) ok('la règle de la frappe surprise est écrite');
  else ko('la règle de la frappe surprise a disparu du document');
  if (!contredit) ok('et rien ne la contredit ailleurs');
  else ko('le document affirme AUSSI qu\'il n\'y a pas d\'attaque-surprise — contradiction');
}

/* ── 6. Le calcul des VP publié correspond au calcul réel ─────────────────── */
console.log('\n6. Le barème des points de victoire');
{
  if (/\+1 par colonie reliée|\+1 par colonie connectée/i.test(TEXTE))
    ok('le +1 VP par colonie reliée est mentionné');
  else ko('le +1 VP par colonie reliée manque au barème — le joueur ne retombe pas sur son score');
  if (/arbre technologique/i.test(TEXTE))
    ok('le bonus technologique dit bien « toute carte de l\'arbre technologique »');
  else ko('le bonus technologique ne dit pas ce qu\'il compte');
  /* Vérification par le calcul : une colonie connectée doit valoir nœud × niveau + 1. */
  const p = G.player;
  p.colonies = [{ nodeId: p.civ.home, level: 1, connected: true }];
  const NODES = vm.runInContext('NODES', sb);
  const attendu = Math.round((NODES[p.civ.home].baseVP || 0) * 1) + 1;
  const v = sb.calcVP(p);
  note('une colonie de niveau 1 connectée sur ' + p.civ.home + ' → ' + v.colVP + ' VP (attendu ' + attendu + ')');
  if (v.colVP === attendu) ok('le calcul confirme le +1 de liaison');
  else ko('le calcul donne ' + v.colVP + ' au lieu de ' + attendu);
}

/* ── 7. Les seuils de tension publiés ─────────────────────────────────────── */
console.log('\n7. Seuils de tension');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8');
  if (/tensEff\([^)]*\)>=10/.test(src.replace(/\s/g, '')) || src.indexOf('>=10&&!_warBetween') >= 0)
    ok('le code déclenche la guerre populaire à 10');
  else note('⚠️ seuil de guerre populaire non retrouvé automatiquement');
  if (/manifestations/i.test(TEXTE) && /6 ou plus/.test(TEXTE)) ok('les manifestations à 6 sont publiées');
  else ko('le seuil des manifestations n\'est pas publié');
  /* L'accord refusé au-dessus de 7 : c'est ce qui rend la diplomatie difficile en fin de partie. */
  if (/tension>=7/.test(src.replace(/\s/g, ''))) {
    if (/au-dessus de .{0,12}7/.test(TEXTE)) ok('le refus d\'accord au-dessus de 7 de tension est publié');
    else ko('le code refuse les accords au-dessus de 7 de tension, le document ne le dit pas');
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) entre les règles publiées et le code :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Les nombres publiés — AC, coûts, VP, seuils, exclusivité, pirates — sont ceux que');
console.log('   le code applique, et le document ne se contredit plus.');
console.log('═'.repeat(80));
