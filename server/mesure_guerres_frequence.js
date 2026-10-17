/* ============================================================================
   MESURE — À QUELLE FRÉQUENCE LA GUERRE ÉCLATE-T-ELLE, ET CE QU'ELLE COÛTE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 16/09 : en étalant le coût de la guerre, « les joueurs ou les IA vont
   temporiser ». C'est une prédiction sur le COMPORTEMENT, pas une règle : elle se mesure, elle ne
   se décrète pas. Le report de l'usure (§135) avait produit l'inverse de l'effet attendu — les
   guerres étaient devenues un peu PLUS fréquentes, ce qui a été dit tel quel. Ce fichier donne le
   chiffre, avant et après un changement de règle, sur des parties entières jouées par les
   ordinateurs seuls.

   ⚠️ LA DIPLOMATIE EST COMPTÉE ICI AUSSI, DEPUIS LE 16/09. La mémoire des agressions (§134 étape 4)
   durcit les réponses des nations qu'on a attaquées. Le risque est qu'elles ne signent plus jamais
   rien — une punition déguisée en règle. On compte donc, dans les MÊMES parties, les accords, les
   pactes et les refus : si la baisse des guerres s'accompagnait d'une diplomatie morte, ce ne
   serait pas un progrès, et la mesure doit pouvoir le dire.

   CE QUI EST COMPTÉ, ET POURQUOI CHAQUE LIGNE. Les guerres DÉCLARÉES disent si le jeu bascule
   souvent dans l'état de guerre ; les prélèvements d'USURE disent ce que cet état coûte réellement
   en moral cumulé ; les ASSAUTS disent si la baisse des guerres vient d'une vraie temporisation ou
   simplement de moins de combats ; le MORAL et les VP de fin de partie disent si l'équilibre général
   a bougé. Sans la ligne des assauts, une baisse des guerres se lirait comme un succès alors qu'elle
   pourrait n'être qu'une paralysie.

   COMMENT COMPARER DEUX VERSIONS. Ce script lit le moteur tel qu'il est sur le disque. Pour un
   avant/après, on exécute une fois, on remet l'ancien `moteur.js`, on exécute à nouveau avec les
   MÊMES graines (le tirage est déterministe, voir `graine`), puis on remet le nouveau.

   ⚠️ SIX PARTIES NE PROUVENT RIEN À ELLES SEULES. Un écart inférieur à une guerre par partie est du
   bruit. Élargir avec PARTIES=<n> avant de conclure quoi que ce soit.

   Usage : node mesure_guerres_frequence.js        (PARTIES=<n>, défaut 6 ; DEPART=<n> décale les graines)
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const PARTIES = parseInt(process.env.PARTIES || '6', 10);
const DEPART  = parseInt(process.env.DEPART  || '0', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

function graine(n) {
  let x = (n + 1) >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const nu = s => String(s || '').replace(/<[^>]+>/g, '');

function partie(seed) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  let r = d.pump(), garde = 0;
  while (garde++ < 120000) {
    if (!r) break;
    if (G.turn > G.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action')   { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm')  { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const lignes = (G.log || []).map(e => nu((e && e.msg) || e));
  const nations = [G.player].concat(G.ais || []);
  /* La tension la plus haute du plateau : elle dit à quelle distance du seuil de 10 le jeu se
     termine. Une baisse des guerres avec une tension au plafond ne serait pas une accalmie. */
  let tensMax = 0, tensSom = 0, tensN = 0;
  for (const a of nations) for (const b of nations) {
    if (a === b) continue;
    const v = sb.getTens(a.civ.id, b.civ.id) || 0;
    tensMax = Math.max(tensMax, v); tensSom += v; tensN++;
  }
  return {
    guerres : lignes.filter(x => /GUERRE DÉCLARÉE/.test(x)).length,
    usure   : lignes.filter(x => /usure de guerre : −/.test(x)).length,
    captures: lignes.filter(x => /captur/i.test(x)).length,
    repousse: lignes.filter(x => /repouss/i.test(x) && !/Tension/.test(x)).length,
    paix    : lignes.filter(x => /PAIX|paix (signée|acceptée)/i.test(x)).length,
    accords : lignes.filter(x => /Accord commercial conclu/.test(x)).length,
    pactes  : lignes.filter(x => /Pacte de non-agression :/.test(x)).length,
    refus   : lignes.filter(x => /REFUSE l'accord|REFUSE le pacte/.test(x)).length,
    rancune : lignes.filter(x => /n'ont pas oublié/.test(x)).length,   // refus explicitement dus à la mémoire
    moral   : nations.reduce((s, p) => s + (p.res.morale || 0), 0) / nations.length,
    ausol   : nations.filter(p => (p.res.morale || 0) <= 1).length,
    vp      : nations.reduce((s, p) => s + sb.calcVP(p).total, 0) / nations.length,
    tensMax : tensMax,
    tensMoy : tensN ? tensSom / tensN : 0
  };
}

const moy = (a, k) => a.length ? a.reduce((s, x) => s + x[k], 0) / a.length : 0;
const f = (x, n) => x.toFixed(n === undefined ? 2 : n);

console.log('═'.repeat(78));
console.log('FRÉQUENCE DES GUERRES — ' + PARTIES + ' partie(s) tout-ordinateur, graines ' + DEPART + '…' + (DEPART + PARTIES - 1));
console.log('═'.repeat(78));
const res = [];
const t0 = Date.now();
for (let k = 0; k < PARTIES; k++) {
  try { const p = partie(DEPART + k); res.push(p);
        console.log('  partie ' + (DEPART + k) + ' : ' + p.guerres + ' guerre(s) · ' + p.usure + ' prélèvement(s) d\'usure · '
          + p.captures + ' capture(s) · ' + p.repousse + ' assaut(s) repoussé(s) · tension max ' + p.tensMax
          + ' · moral ' + f(p.moral, 1) + ' · VP ' + f(p.vp, 0)); }
  catch (e) { console.log('  ⚠ partie ' + k + ' : ' + e.message.split('\n')[0]); }
}
if (!res.length) { console.log('aucune partie jouée'); process.exit(1); }
console.log('─'.repeat(78));
console.log('guerres déclarées / partie ........ ' + f(moy(res, 'guerres')));
console.log('prélèvements d\'usure / partie ..... ' + f(moy(res, 'usure'), 1));
console.log('captures de colonie / partie ...... ' + f(moy(res, 'captures'), 1));
console.log('assauts repoussés / partie ........ ' + f(moy(res, 'repousse'), 1));
console.log('moral moyen en fin de partie ...... ' + f(moy(res, 'moral')));
console.log('nations à 0 ou 1 de moral ......... ' + f(moy(res, 'ausol'), 2) + ' / 4');
console.log('VP moyen .......................... ' + f(moy(res, 'vp'), 1));
console.log('accords commerciaux conclus ....... ' + f(moy(res, 'accords'), 1));
console.log('pactes de non-agression signés .... ' + f(moy(res, 'pactes'), 1));
console.log('refus (accord ou pacte) ........... ' + f(moy(res, 'refus'), 1)
  + '   dont dus à la rancune : ' + f(moy(res, 'rancune'), 1));
console.log('tension moyenne entre nations ..... ' + f(moy(res, 'tensMoy')) + '/10   (max observé ' + Math.max(...res.map(r => r.tensMax)) + ')');
console.log('─'.repeat(78));
console.log(Math.round((Date.now() - t0) / 1000) + ' s. ⚠️ ' + PARTIES + ' parties : un écart de moins d\'une guerre par partie est du bruit.');
