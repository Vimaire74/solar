/* ============================================================================
   MESURE — POURQUOI Y A-T-IL TROP DE MORAL ? (une seule partie, lue tour par tour)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 27/08 : « La perte de moral due à la guerre ou à d'autres événements est-elle
   bien implémentée ? Il me semble que je perds jamais plus de moral... » Puis, devant une première
   version de ce banc qui agrégeait huit parties : « ton test avec des points collectifs pour toutes
   les nations n'a aucun sens. Fais une seule partie avec 4 joueurs et dis-moi pourquoi on a trop de
   moral. »

   ⚠️ IL AVAIT RAISON, ET LA CRITIQUE PORTE PLUS LOIN QUE LA PRÉSENTATION. Un total sur 32 nations
   ne dit pas si UNE nation sature : il peut décrire quatre nations à 5 de moral aussi bien que deux
   à 10 et deux à 0. La saturation est un phénomène qui se produit dans le temps, chez un joueur
   donné — la moyenne la fait disparaître au moment précis où on essaie de la voir.

   CE QUE CE BANC MONTRE, DANS L'ORDRE :
     1. le moral de CHAQUE nation à CHAQUE tour, avec ce qu'elle a gagné et ce qui a été JETÉ ;
     2. d'où vient ce revenu de moral, poste par poste (lu dans `revenusBruts`, pas recopié) ;
     3. ce qui le fait baisser, fonction par fonction, avec la pile d'appel comme preuve ;
     4. la conclusion arithmétique : combien de moral produit, combien jeté.

   ⚠️ « JETÉ » EST LE CHIFFRE QUI COMPTE, et il n'apparaît nulle part dans le jeu.
   `p.res[r] = Math.min(cap, p.res[r] + gain)` ne laisse aucune trace du gain perdu : ni au journal,
   ni au bilan de fin de tour. Le joueur voit « +3❤️ » annoncé et son moral ne bouge pas de 3. On le
   reconstitue ici par (moral avant + revenu brut) − moral après.

   ⚠️ ON PASSE PAR `GameDriver`, PAS PAR UNE BOUCLE À LA MAIN. Ma première version appelait
   `doAITurn` puis `doRevenues`/`doMaintenance` directement : `G.warWins` restait à 0/0, parce que
   sauter `stDysonPuisGuerres` supprime TOUTE la résolution des combats. Les pertes de guerre qu'on
   cherchait à compter étaient absentes de la mesure censée les compter.

   Usage : node mesure_moral.js          (SEED=<n> pour rejouer la même partie)
   ========================================================================== */
'use strict';
const path = require('path');

/* ⚠️ SANS TIRAGE REPRODUCTIBLE, ON NE COMPARE RIEN. Le 27/08, après avoir ajouté l'usure de guerre,
   j'ai relancé cette mesure et lu « 160 de moral distribué → 80 ». Le chiffre ne voulait rien dire :
   ce n'était pas la même partie. Une nation de plus au niveau 3, un événement différent, et le total
   double ou s'effondre sans qu'aucune règle ait changé.
   `server/game-core.js` passe le `Math` de l'hôte au bac à sable : remplacer `Math.random` ICI rend
   donc TOUTE la partie déterministe, moteur compris. SEED=<n> pour rejouer exactement le même
   déroulement — c'est la seule façon de mesurer un changement de règle plutôt qu'un tirage. */
const SEED = parseInt(process.env.SEED || '20260827', 10);
{
  let x = SEED >>> 0;
  Math.random = function () {           // xorshift32 — court, sans dépendance, reproductible
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

/* Quelle fonction du moteur a bougé le moral ? On remonte la pile jusqu'au premier nom utile. */
function cause() {
  const lignes = (new Error()).stack.split('\n').slice(3, 16);
  for (const l of lignes) {
    const m = /at ([A-Za-z_$][\w$]*)/.exec(l);
    if (!m) continue;
    const f = m[1];
    if (/^(Object|Module|Array|Function|set|get|unePartie)$/.test(f)) continue;
    return f;
  }
  return '(inconnu)';
}
function reponseIA(p) {
  const o = p.payload || {};
  if (p.kind === 'war_combat') return o.cols && o.cols.length ? { action: 'attack', node: o.cols[0].node, tokens: 3 } : { action: 'hold' };
  if (p.kind === 'peace_offer') return { accept: Math.random() < 0.4 };
  if (o.options && o.options.length) { const c = o.options[Math.floor(Math.random() * o.options.length)];
    return { agendaId: c.id, cardId: c.id, value: c.id, targetId: c.id, branch: c.branch, node: c.node, ids: c.ids || [c.id] }; }
  return {};
}

const d = new GameDriver(HTML);
d.boot([{ civId: 'terriens', isAI: true }, { civId: 'martiens', isAI: true },
        { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
const sb = d.sb, G = sb.__G;
const nations = [G.player].concat(G.ais || []);

/* ── Instrumentation : chaque écriture de `res.morale`, avec sa cause ─────── */
const pertes = {}, gainsParCause = {};
const suivi = new Map();                       // nation → { avantRevenu }
for (const n of nations) {
  suivi.set(n, { avantRevenu: n.res.morale || 0 });
  let v = n.res.morale || 0;
  Object.defineProperty(n.res, 'morale', {
    configurable: true, enumerable: true,
    get() { return v; },
    set(nv) {
      nv = nv || 0;
      const dd = nv - v;
      if (dd !== 0) {
        const c = cause();
        if (dd > 0) gainsParCause[c] = (gainsParCause[c] || 0) + dd;
        else { pertes[c] = (pertes[c] || 0) + (-dd); }
      }
      /* On retient le moral d'AVANT le versement des revenus : c'est le seul instant où l'on peut
         encore calculer ce que le plafond va jeter. */
      if (cause() === 'doRevenues' && dd !== 0) suivi.get(n).avantRevenu = v;
      v = nv;
    }
  });
}

/* ── Déroulement de la partie, relevé à chaque changement de tour ─────────── */
const lignesTour = [];
let r = d.pump(), garde = 0, tourVu = 0;
const releve = (tour) => {
  const l = { tour, nats: [] };
  for (const n of nations) {
    const cap = sb.realResCap(n).morale;
    const rev = (n._lastRevs && n._lastRevs.morale) || 0;
    const avant = suivi.get(n).avantRevenu;
    const jete = Math.max(0, (avant + rev) - Math.min(cap, avant + rev));
    l.nats.push({ m: n.res.morale || 0, cap, rev, jete, cols: (n.colonies || []).length,
                  gouv: n.govForm || null });
    suivi.get(n).avantRevenu = n.res.morale || 0;
  }
  lignesTour.push(l);
};
while (garde++ < 60000) {
  if (!r) break;
  if (G.turn > G.maxTurns) break;
  if (G.turn !== tourVu) { if (tourVu) releve(tourVu); tourVu = G.turn; }
  try {
    if (r.kind === 'decision') { r = d.answer(r.pending.id, reponseIA(r.pending)); continue; }
    if (r.kind === 'action')   { r = d.act(r.civId, { type: 'pass' }); continue; }
    if (r.kind === 'confirm')  { r = d.commit(r.civId); continue; }
  } catch (e) { break; }
  break;
}
releve(tourVu);

/* ── 1. LE TABLEAU, NATION PAR NATION, TOUR PAR TOUR ──────────────────────── */
const L = '═'.repeat(92);
console.log(L);
console.log('MORAL — UNE partie, 4 nations, tour par tour   (graine ' + SEED + ')');
console.log(L);
console.log('\nPour chaque nation : moral / plafond · (+revenu du tour) · ⊘ = moral JETÉ par le plafond\n');
const entete = 'TOUR │ ' + nations.map(n => (n.civ.emoji + ' ' + n.civ.name).padEnd(20)).join('│ ');
console.log(entete);
console.log('─'.repeat(entete.length));
for (const l of lignesTour) {
  const cells = l.nats.map(x => {
    const base = x.m + '/' + x.cap + '  +' + x.rev + (x.jete ? '  ⊘' + x.jete : '     ');
    return base.padEnd(20);
  });
  console.log(String(l.tour).padStart(4) + ' │ ' + cells.join('│ '));
}

/* ── 2. D'OÙ VIENT LE REVENU DE MORAL — poste par poste ───────────────────── */
console.log('\n' + L);
console.log('D\'OÙ VIENT LE MORAL — postes de revenu à la FIN de la partie (lus dans revenusBruts)');
console.log(L);
for (const n of nations) {
  const det = [];
  let g = {};
  try { g = sb.revenusBruts(n, { detail: det }) || {}; } catch (e) {}
  const postes = det.filter(x => x.o && x.o.morale).map(x => x.label + ' ' + (x.o.morale > 0 ? '+' : '') + x.o.morale);
  console.log('\n' + n.civ.emoji + ' ' + n.civ.name + ' — revenu de moral : +' + (g.morale || 0)
    + '/tour · plafond ' + sb.realResCap(n).morale + ' · ' + (n.colonies || []).length + ' colonie(s)'
    + (n.govForm ? ' · ' + n.govForm : ''));
  if (postes.length) for (const p of postes) console.log('     ' + p);
  else console.log('     (aucun poste de moral ce tour)');
}

/* ── 3. CE QUI FAIT BAISSER LE MORAL ──────────────────────────────────────── */
console.log('\n' + L);
console.log('CE QUI FAIT MONTER ET BAISSER — sur toute la partie, les 4 nations réunies');
console.log(L);
const tri = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
console.log('\nGAINS');
for (const [c, v] of tri(gainsParCause)) console.log('   +' + String(v).padEnd(6) + c);
console.log('\nPERTES');
for (const [c, v] of tri(pertes)) console.log('   −' + String(v).padEnd(6) + c);

/* ── 4. LA CONCLUSION ARITHMÉTIQUE ────────────────────────────────────────── */
const totalJete = lignesTour.reduce((s, l) => s + l.nats.reduce((t, x) => t + x.jete, 0), 0);
const totalRev = lignesTour.reduce((s, l) => s + l.nats.reduce((t, x) => t + x.rev, 0), 0);
const toursNat = lignesTour.length * nations.length;
const auPlafond = lignesTour.reduce((s, l) => s + l.nats.filter(x => x.m >= x.cap).length, 0);
/* ⚠️ LE CHIFFRE À SURVEILLER DEPUIS QUE LA GUERRE COÛTE VRAIMENT. Moral 0 = guerre civile = aucun
   revenu. Une nation qui y tombe ne peut plus rien produire, donc plus rien dépenser pour remonter :
   c'est un piège dont on ne sort que par une carte civique déjà payable. Un malus de guerre trop
   lourd ne rend pas la guerre coûteuse, il élimine le perdant du reste de la partie. */
const aZero = lignesTour.reduce((s, l) => s + l.nats.filter(x => x.m === 0).length, 0);
const pireSerie = (() => {
  let pire = 0;
  for (let i = 0; i < nations.length; i++) {
    let cour = 0;
    for (const l of lignesTour) { if (l.nats[i].m === 0) { cour++; pire = Math.max(pire, cour); } else cour = 0; }
  }
  return pire;
})();
const totalPertes = Object.values(pertes).reduce((a, b) => a + b, 0);
const pertesHorsPlafond = totalPertes - (pertes.enforceCaps || 0) - (pertes.doRevenues || 0);
console.log('\n' + L);
console.log('BILAN DE CETTE PARTIE');
console.log(L);
console.log('   revenu de moral distribué .............. +' + totalRev);
console.log('   moral JETÉ par le plafond .............. −' + totalJete
  + '   (' + (totalRev ? (100 * totalJete / totalRev).toFixed(0) : '0') + ' % du revenu)');
console.log('   pertes RÉELLES (guerre, conquête, gouv.) −' + pertesHorsPlafond);
console.log('   tours-nation à MORAL 0 (guerre civile) . ' + aZero + '/' + toursNat
  + '   (' + (100 * aZero / toursNat).toFixed(0) + ' %) · plus longue série : ' + pireSerie + ' tour(s) d\'affilée');
console.log('   tours-nation passés AU PLAFOND ......... ' + auPlafond + '/' + toursNat
  + '   (' + (100 * auPlafond / toursNat).toFixed(0) + ' %)');
console.log('\n' + L);
