/* ============================================================================
   MESURE — CE QUE CHAQUE NATION GAGNE, TOUR PAR TOUR
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il compare les quatre nations sur les mêmes bases.

   POURQUOI. Marc, 2026-08-14, après avoir ouvert cinq liaisons au centre de la carte
   (Phobos↔Vesta, Vesta↔Io, Vesta↔Europe, Lune↔Io, Lune↔Vesta) : « fais un test
   comparatif entre les nations comme avant pour voir ce que ce changement fait sur les
   gains en ressources tour par tour ».

   ⚠️ CE QUI CHANGE ET CE QUI NE CHANGE PAS. Déplacer un nœud (Phobos, Europe, Callisto)
   ne touche QUE l'affichage : `x` et `y` ne servent qu'au dessin. Ce sont les cinq
   nouvelles ADJACENCES qui peuvent changer l'économie — elles ouvrent des voisins
   colonisables plus tôt. La mesure sépare donc les deux, et compare le voisinage
   AVANT / APRÈS en retirant ces cinq liaisons.

   Aucun revenu n'est inventé : tout passe par `revenusBruts` et `_netIncome`, les
   fonctions du jeu.

   Usage :  node mesure_nations.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const CIVS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
/* Les cinq liaisons ouvertes le 2026-08-14 — pour pouvoir mesurer « avant ». */
const NOUVELLES = [['phobos', 'vesta'], ['vesta', 'io'], ['vesta', 'europe'], ['lune', 'io'], ['lune', 'vesta']];

function scene() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', CIVS.filter(c => c !== 'terriens'));
  return { sb, G: sb.__G };
}
const nat = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const R = ['energy', 'materials', 'science', 'morale'];
const E = { energy: '⚡', materials: '🪨', science: '🔬', morale: '🙂' };
const ligne = o => R.map(r => String(o[r] || 0).padStart(3) + E[r]).join(' ');

console.log('═'.repeat(84));
console.log('COMPARATIF DES NATIONS — GAINS PAR TOUR');
console.log('═'.repeat(84));

/* ── 1. Revenu du tour 1, capitale seule ──────────────────────────────────── */
console.log('\n1. TOUR 1 — capitale seule, rien de construit\n');
console.log('   nation          au départ                    revenu brut / tour');
{
  const { sb, G } = scene();
  for (const id of CIVS) {
    const p = nat(G, id);
    console.log('   ' + p.civ.name.padEnd(14) + ligne(p.res) + '   →   ' + ligne(sb.revenusBruts(p, {})));
  }
}

/* ── 2. Cumul sur trois tours, sans rien dépenser ─────────────────────────── */
console.log('\n2. CUMUL À LA FIN DU TOUR 3 — capitale seule, aucune dépense\n');
console.log('   nation          total accumulé');
{
  for (const id of CIVS) {
    const { sb, G } = scene();
    const p = nat(G, id);
    const stock = {}; for (const r of R) stock[r] = p.res[r] || 0;
    for (let t = 1; t <= 3; t++) { const g = sb.revenusBruts(p, {}); for (const r of R) stock[r] += (g[r] || 0); }
    console.log('   ' + p.civ.name.padEnd(14) + ligne(stock));
  }
}

/* ── 3. Le voisinage immédiat, avant et après les cinq liaisons ───────────── */
console.log('\n3. VOISINS DIRECTS DE LA CAPITALE — ce que les cinq liaisons ont ouvert\n');
{
  const { sb, G } = scene();
  const N = vm.runInContext('NODES', sb);
  const estNouvelle = (a, b) => NOUVELLES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (const id of CIVS) {
    const p = nat(G, id), h = p.civ.home;
    const vois = (N[h].conn || []).filter(v => N[v] && !N[v].decorative && !N[v].noColonize);
    const avant = vois.filter(v => !estNouvelle(h, v));
    const gagnes = vois.filter(v => estNouvelle(h, v));
    const somme = liste => { const o = {}; for (const v of liste) for (const [r, a] of Object.entries(N[v].res || {})) o[r] = (o[r] || 0) + a; return o; };
    console.log('   ' + p.civ.name.padEnd(14) + 'capitale ' + N[h].name);
    console.log('                 avant : ' + (avant.map(v => N[v].name).join(', ') || '—'));
    if (gagnes.length) {
      console.log('                 NOUVEAU : ' + gagnes.map(v => N[v].name + ' (' + ligne(N[v].res).trim() + ')').join(' · '));
      console.log('                 potentiel si tout est colonisé Nv.1 : ' + ligne(somme(avant)) + '  →  ' + ligne(somme(vois)));
    } else {
      console.log('                 aucune liaison nouvelle depuis cette capitale.');
    }
  }
}

/* ── 4. Tour 3 réaliste : deux voisins colonisés et reliés, revenu NET ────── */
console.log('\n4. TOUR 3 — deux meilleurs voisins colonisés ET reliés, revenu NET par tour\n');
console.log('   (net = brut moins l\'entretien des colonies et des routes — la vraie ligne du bilan)\n');
console.log('   nation          revenu NET / tour                 voisins pris');
{
  /* On classe les voisins par richesse totale, comme le ferait un joueur : c'est le
     même critère pour les quatre nations, sinon la comparaison ne vaut rien. */
  for (const id of CIVS) {
    const { sb, G } = scene();
    const N = vm.runInContext('NODES', sb);
    const p = nat(G, id), h = p.civ.home;
    const val = v => Object.values(N[v].res || {}).reduce((a, b) => a + b, 0);
    const vois = (N[h].conn || []).filter(v => N[v] && !N[v].decorative && !N[v].noColonize)
      .sort((a, b) => val(b) - val(a)).slice(0, 2);
    for (const v of vois) { p.colonies.push({ nodeId: v, level: 1, connected: true }); p.routes.push({ from: h, to: v, tokens: 1 }); }
    sb.updateConnections(p);
    G.turn = 3;
    const net = sb._netIncome ? sb._netIncome(p) : sb.revenusBruts(p, {});
    console.log('   ' + p.civ.name.padEnd(14) + ligne(net) + '   ' + vois.map(v => N[v].name).join(' + '));
  }
}

/* ── 5. Distance à la grappe jovienne, AVANT et APRÈS les cinq liaisons ───── */
console.log('\n5. DISTANCE À LA GRAPPE JOVIENNE (Io, Europe, Ganymède, Callisto)\n');
console.log('   — c\'est le poste de points le plus riche du jeu ; y accéder tôt décide la partie.\n');
{
  const LUNES = ['io', 'europe', 'ganymede', 'callisto'];
  /* On mesure DEUX FOIS : une fois avec la carte actuelle, une fois après avoir retiré les cinq
     liaisons. C'est la seule façon honnête d'attribuer un écart au changement plutôt qu'au hasard
     de la topologie. */
  const distances = (retirer) => {
    const { sb, G } = scene();
    if (retirer) vm.runInContext(NOUVELLES.map(([a, b]) =>
      'NODES.' + a + '.conn=NODES.' + a + '.conn.filter(x=>x!=="' + b + '");' +
      'NODES.' + b + '.conn=NODES.' + b + '.conn.filter(x=>x!=="' + a + '");').join(''), sb);
    const d = (a, b) => vm.runInContext('getNodeDistance(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')', sb);
    const out = {};
    for (const id of CIVS) out[id] = LUNES.map(l => d(nat(G, id).civ.home, l));
    return out;
  };
  const avant = distances(true), apres = distances(false);
  console.log('   nation           Io      Europe    Ganymède   Callisto     (sauts depuis la capitale)');
  for (const id of CIVS) {
    const cell = (i) => {
      const a = avant[id][i], b = apres[id][i];
      return (a === b ? String(b) : (a + '→' + b)).padStart(10);
    };
    console.log('   ' + nat(scene().G, id).civ.name.padEnd(14) + [0, 1, 2, 3].map(cell).join(''));
  }
  console.log('\n   Lecture : « 3→1 » = trois sauts avant les cinq liaisons, un seul maintenant.');
}

console.log('\n' + '═'.repeat(84));
