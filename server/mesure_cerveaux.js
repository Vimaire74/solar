/* ============================================================================
   MESURE — LE CERVEAU CHERCHEUR JOUE-T-IL MIEUX QUE LA RECETTE ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 27/08 : « les parties avec IA sont trop faciles. Elles appliquent une recette de
   cuisine au lieu de réfléchir. Le problème de base est là. »

   CE QU'ON OPPOSE. Deux cerveaux, dans la MÊME partie, à la MÊME graine :
     · `historique` — la première action réalisable du classement d'utilité (95 poids réglés à la
       main, chacun notant une action DANS L'ABSOLU) ;
     · `chercheur`  — chaque candidat joué pour de faux, la position obtenue notée par
       `evaluerPosition`, le meilleur rejoué pour de vrai.

   ⚠️ LE TÊTE-À-TÊTE EST LE SEUL PROTOCOLE QUI PROUVE QUELQUE CHOSE. Comparer « 4 chercheurs » à
   « 4 historiques » ne dit rien : les scores d'une partie sont relatifs, et quatre nations également
   fortes se répartissent les mêmes points que quatre nations également faibles. On fait donc jouer
   les deux cerveaux DANS LA MÊME PARTIE, moitié-moitié, et on regarde qui gagne.

   ⚠️ ET ON PERMUTE LES SIÈGES. Les nations ne sont pas équivalentes, ni les positions de départ :
   attribuer toujours le chercheur aux mêmes civilisations mesurerait la civilisation, pas le
   cerveau. Chaque graine est donc jouée DEUX fois, avec les rôles échangés.

   Usage : node mesure_cerveaux.js            (PARTIES=<n> pour élargir l'échantillon)
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const PARTIES = parseInt(process.env.PARTIES || '6', 10);
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
/* Les deux cerveaux comparés — surchargeables : A=<nom> B=<nom>. Le témoin reste \`historique\`. */
const NOUVEAU = process.env.A || 'tacticien';   /* ⚠️ 'chercheur' était un nom MORT : inconnu, il retombait sur le témoin et la mesure comparait l'historique à lui-même (deux sens au score identique, 6 parties en 2 s). Corrigé le 17/09. */
const TEMOIN  = process.env.B || 'historique';

function graine(n) {
  let x = n >>> 0;
  Math.random = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/* `cerveauPar` : civId → nom du cerveau. Le moteur ne lit qu'un cerveau global (`G._cerveauIA`) ;
   pour en donner un DIFFÉRENT à chaque nation, on le pose juste avant que la nation ne joue. */
function partie(seed, cerveauPar) {
  graine(seed);
  const d = new GameDriver(HTML);
  d.boot(CIVS.map(c => ({ civId: c, isAI: true })), () => {});
  const sb = d.sb, G = sb.__G;
  /* ⚠️ CHAQUE NATION DOIT JOUER AVEC SON PROPRE CERVEAU, et le moteur n'en connaît qu'un à la fois.
     On enveloppe donc `doAITurn` : avant chaque tour d'IA, on pose le cerveau de CETTE nation.
     Sans cela, la dernière valeur écrite servirait à tout le monde et la mesure comparerait un
     cerveau à lui-même. */
  const originel = sb.doAITurn;
  sb.doAITurn = function (nat, oneShot) {
    G._cerveauIA = (nat && nat.civ && cerveauPar[nat.civ.id]) || TEMOIN;
    return originel.call(null, nat, oneShot);
  };
  let r = d.pump(), g = 0;
  while (g++ < 120000) {
    if (!r) break;
    if (G.turn > G.maxTurns) break;
    try {
      if (r.kind === 'decision') { r = d.answer(r.pending.id, {}); continue; }
      if (r.kind === 'action') { r = d.act(r.civId, { type: 'pass' }); continue; }
      if (r.kind === 'confirm') { r = d.commit(r.civId); continue; }
    } catch (e) { break; }
    break;
  }
  const res = {};
  for (const p of [G.player].concat(G.ais || [])) res[p.civ.id] = sb.calcVP(p).total;
  return res;
}

console.log('═'.repeat(80));
console.log('CERVEAUX EN TÊTE-À-TÊTE — ' + (PARTIES * 2) + ' parties (chaque graine jouée dans les deux sens)');
console.log('═'.repeat(80) + '\n');

let vict = { chercheur: 0, historique: 0, egal: 0 };
let somme = { chercheur: 0, historique: 0 }, n = { chercheur: 0, historique: 0 };
const t0 = Date.now();

for (let k = 0; k < PARTIES; k++) {
  const seed = 1000 + k * 7717;
  for (const sens of [0, 1]) {
    const cerveauPar = {};
    CIVS.forEach((c, i) => { cerveauPar[c] = ((i % 2) === sens) ? NOUVEAU : TEMOIN; });
    let sc;
    try { sc = partie(seed, cerveauPar); } catch (e) { console.log('  partie ' + seed + '/' + sens + ' interrompue : ' + e.message); continue; }
    let meilleurC = -1, meilleurH = -1;
    for (const c of CIVS) {
      const v = sc[c]; if (v === undefined) continue;
      if (cerveauPar[c] === NOUVEAU) { somme.chercheur += v; n.chercheur++; if (v > meilleurC) meilleurC = v; }
      else { somme.historique += v; n.historique++; if (v > meilleurH) meilleurH = v; }
    }
    if (meilleurC > meilleurH) vict.chercheur++;
    else if (meilleurH > meilleurC) vict.historique++;
    else vict.egal++;
    console.log('  graine ' + seed + ' sens ' + sens + ' — '
      + CIVS.map(c => c.slice(0, 4) + ' ' + (sc[c] === undefined ? '?' : sc[c]) + (cerveauPar[c] === NOUVEAU ? '*' : ' ')).join(' · ')
      + '   (* = chercheur)');
  }
}

const moy = (s, c) => c ? (s / c).toFixed(1) : '—';
console.log('\n' + '═'.repeat(80));
console.log('BILAN — ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log('═'.repeat(80));
console.log(('   parties gagnées par ' + NOUVEAU).padEnd(38, '.') + ' ' + vict.chercheur);
console.log(('   parties gagnées par ' + TEMOIN).padEnd(38, '.') + ' ' + vict.historique);
console.log('   égalités ........................... ' + vict.egal);
console.log('   VP moyen — ' + NOUVEAU + ' ' + moy(somme.chercheur, n.chercheur)
  + '  ·  ' + TEMOIN + ' ' + moy(somme.historique, n.historique));
console.log('═'.repeat(80));
console.log('LECTURE. « Gagnée » = la meilleure nation d\'un camp bat la meilleure de l\'autre. Le VP');
console.log('moyen complète le tableau : un cerveau peut gagner souvent de peu, ou dominer parfois.');
console.log('Un écart faible sur douze parties ne prouve rien — élargir avec PARTIES=<n>.');
