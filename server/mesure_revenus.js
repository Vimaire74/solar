/* ============================================================================
   MESURE — LES TROIS CALCULS DE REVENU DISENT-ILS LA MÊME CHOSE ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il mesure, et c'est délibéré : avant de décider s'il
   faut fusionner les copies du calcul de revenu, il faut savoir lesquelles divergent
   et sur quoi. Marc, 2026-08-09 : « je me méfie de cette phrase, on va en discuter. »

   Il y a trois calculs, et ils devraient s'accorder :

     A · `doRevenues()`          — celui qui CRÉDITE réellement les ressources ;
     B · `revenueBreakdownHTML()`— l'infobulle « Revenu par tour », ligne « Total brut » ;
     C · `_netIncome()`          — l'estimation du revenu NET (barre du haut, menu Empire).

   On compare :
     · A vs B sur le BRUT (avant entretien) ;
     · C vs (A − entretien réel) sur le NET, c'est-à-dire : ce que le jeu ANNONCE au
       joueur contre ce qui lui arrive VRAIMENT après un tour complet.

   LIMITES ASSUMÉES DE LA MESURE — à connaître avant de conclure :
     · on garde le moral ≥ 2 et beaucoup de ressources, pour qu'aucune règle de moral
       ni pénalité d'entretien impayé ne vienne brouiller la comparaison ;
     · l'ordre reproduit celui d'`endTurn` : revenus PUIS entretien ;
     · on ne mesure que la nation du joueur (`G.player`), parce que `doRevenues` traite
       certaines sources uniquement pour elle — ce qui est en soi une divergence possible.

   Usage :  node mesure_revenus.js [nombre d'états]     (défaut : 60)
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const N = parseInt(process.argv[2] || '60', 10);

const RES = ['energy', 'materials', 'science', 'morale'];
const SYM = { energy: '⚡', materials: '🪨', science: '🔬', morale: '❤️' };

/* Un générateur reproductible : un défaut trouvé doit pouvoir être rejoué. */
let graine = 12345;
function alea() { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x7fffffff; }
const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
const parfois = pr => alea() < pr;

/* Quelques `spec` de cartes qui touchent le revenu ou l'entretien. On fabrique des cartes
   minimales : `hasSpec` ne regarde que `spec`. */
const SPECS = ['terra3', 'bio2_bonus', 'upkeep_e_disc', 'route_force_free', 'empath_routes'];

function etatAleatoire(i) {
  const sb = loadLogic(HTML);
  const civs = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];
  const moi = civs[i % 4];
  sb.initGame(moi, civs.filter(c => c !== moi).slice(0, 2));
  const G = sb.__G, p = G.player;

  /* ⚠️ `NODES` est un `const` au sommet de moteur.js : il n'apparaît PAS sur l'objet global du
     bac à sable (`sb.NODES` vaut `undefined`). On le lit donc DANS le contexte. Sans cela, la
     liste des nœuds serait vide, les colonies fabriquées n'auraient aucun nœud, et la mesure
     ne verrait aucun revenu — elle conclurait « tout va bien » sans avoir rien mesuré. */
  const noeuds = vm.runInContext(
    'Object.keys(NODES).filter(k=>NODES[k] && !NODES[k].decorative && !NODES[k].noColonize)', sb)
    .filter(id => id !== p.civ.home);
  const nb = entre(0, 5);
  p.colonies = [{ nodeId: p.civ.home, level: 1, connected: true }];
  for (let k = 0; k < nb && k < noeuds.length; k++) {
    p.colonies.push({
      nodeId: noeuds[(entre(0, 999)) % noeuds.length], level: entre(1, 3),
      connected: parfois(0.85), foreignConnected: parfois(0.15)
    });
  }
  p.routes = new Array(entre(0, 4)).fill(0).map((_, k) => ({ id: 'r' + k }));
  p.cards = SPECS.filter(() => parfois(0.25)).map(s => ({ id: s + '_x', spec: s }));
  p.rpt = {}; for (const r of RES) if (parfois(0.35)) p.rpt[r] = entre(1, 3);
  G.commercialAccords = new Array(entre(0, 2)).fill(0).map((_, k) => ({ id: 'a' + k }));

  if (parfois(0.5)) {
    p.investBonus = { turnsLeft: entre(1, 3) };
    const q = entre(0, 4);
    if (q === 0) p.investBonus.matBonus = 4;        // Industrialisation
    else if (q === 1) p.investBonus.sciBonus = 3;   // Recherche Intensive
    else if (q === 2) p.investBonus.moraleBonus = 2;// Agriculture Durable
    else if (q === 3) p.investBonus.matX2 = true;
    else p.investBonus.sciX2 = true;
  }
  if (parfois(0.35)) {
    p.investBonus2 = { turnsLeft: entre(1, 3) };
    if (parfois(0.5)) p.investBonus2.moraleFlat = 4;   // Confort Population
    else p.investBonus2.moraleX2 = true;
  }
  if (parfois(0.2)) p.govFormMorale = 1;
  if (parfois(0.2)) p.govFormUpkeep = { energy: 1 };

  // Moral ≥ 2 et large provision : aucune règle de moral, aucun entretien impayé.
  p.res = { energy: 400, materials: 400, science: 400, morale: 6 };
  return { sb, p, G };
}

/* BRUT réellement crédité : delta sur les ressources après doRevenues seul. */
function brutReel(sb, p) {
  const av = {}; for (const r of RES) av[r] = p.res[r] || 0;
  sb.doRevenues();
  const d = {}; for (const r of RES) d[r] = (p.res[r] || 0) - av[r];
  return d;
}
/* BRUT annoncé par l'infobulle : on lit la ligne « Total brut ». */
function brutAffiche(sb, p) {
  const h = sb.revenueBreakdownHTML(p) || '';
  const m = h.match(/Total brut \(avant entretien\)\s*:\s*([\s\S]*?)<\/div>/);
  const d = { energy: 0, materials: 0, science: 0, morale: 0 };
  if (!m) return d;
  const txt = m[1];
  // « +3<i class=ri-science></i> » → science:+3
  const re = /([+-]?\d+)\s*<i class=ri-(energy|materials|science|morale)><\/i>/g;
  let x; while ((x = re.exec(txt))) d[x[2]] += parseInt(x[1], 10);
  return d;
}

const ecarts = { brut: {}, net: {} };
function noter(cat, r, delta, contexte) {
  const c = ecarts[cat][r] || (ecarts[cat][r] = { n: 0, exemples: [] });
  c.n++;
  if (c.exemples.length < 3) c.exemples.push(delta + ' (' + contexte + ')');
}
/* Décrit en clair ce que porte l'état, pour rendre un écart interprétable. */
function contexte(p) {
  const t = [];
  if (p.investBonus) { for (const k of ['matBonus', 'sciBonus', 'moraleBonus', 'matX2', 'sciX2']) if (p.investBonus[k]) t.push(k); }
  if (p.investBonus2) { for (const k of ['moraleFlat', 'moraleX2']) if (p.investBonus2[k]) t.push(k); }
  for (const c of p.cards) t.push(c.spec);
  if (p.colonies.some(c => c.foreignConnected)) t.push('connexion étrangère');
  t.push(p.civ.id);
  return t.join(', ') || 'rien de particulier';
}

console.log('═'.repeat(74));
console.log('MESURE — LES TROIS CALCULS DE REVENU S\'ACCORDENT-ILS ? (' + N + ' états)');
console.log('═'.repeat(74) + '\n');

let nBrut = 0, nNet = 0;

/* ⚠️ `doRevenues` MODIFIE l'état : impossible de mesurer A puis B sur le même objet.
   On reconstruit donc le MÊME état trois fois à partir de la même graine — un exemplaire
   par calcul. C'est la seule façon d'être sûr qu'on compare la même situation, et pas
   trois tirages voisins. */
const resultats = [];
for (let i = 0; i < N; i++) {
  graine = 12345 + i * 7919;  const e1 = etatAleatoire(i);
  graine = 12345 + i * 7919;  const e2 = etatAleatoire(i);
  graine = 12345 + i * 7919;  const e3 = etatAleatoire(i);

  const ctx = contexte(e1.p);
  const affiche = brutAffiche(e1.sb, e1.p);          // B — lu AVANT tout crédit
  const reel = brutReel(e2.sb, e2.p);                // A
  const annonceNet = e3.sb._netIncome(e3.p);         // C

  for (const r of RES) {
    if ((affiche[r] || 0) !== (reel[r] || 0)) {
      noter('brut', r, (affiche[r] || 0) - (reel[r] || 0), ctx); nBrut++;
    }
  }
  // NET : ce qui reste après un tour complet (revenus puis entretien), contre l'estimation.
  const av = {}; for (const r of RES) av[r] = e3.p.res[r] || 0;
  e3.sb.doRevenues(); e3.sb.doMaintenance();
  for (const r of RES) {
    const vrai = (e3.p.res[r] || 0) - av[r];
    if ((annonceNet[r] || 0) !== vrai) { noter('net', r, (annonceNet[r] || 0) - vrai, ctx); nNet++; }
  }
  resultats.push({ i, ctx });
}

function rapport(titre, cat, total) {
  console.log(titre);
  const cles = Object.keys(ecarts[cat]);
  if (!cles.length) { console.log('   ✔ aucun écart sur ' + N + ' états.\n'); return; }
  console.log('   ' + total + ' écart(s) au total, sur ' + N + ' états :');
  for (const r of RES) {
    const c = ecarts[cat][r]; if (!c) continue;
    console.log('   · ' + SYM[r] + ' ' + r + ' — ' + c.n + ' état(s). Écarts (annoncé − réel) :');
    for (const ex of c.exemples) console.log('       ' + ex);
  }
  console.log('');
}
rapport('1. BRUT — infobulle « Total brut » contre ce qui est réellement crédité', 'brut', nBrut);

/* ═══════════ 3. ATTRIBUTION — quelle RÈGLE exactement manque, et où ? ═══════════
   La liste de contextes ci-dessus dit qu'il y a des écarts ; elle ne dit pas lesquels.
   Ici on isole chaque règle : un état minimal (une colonie connectée, rien d'autre),
   puis le MÊME état avec la règle activée. Si l'écart apparaît, la règle est absente
   du calcul qui n'a pas bougé. C'est ce qui rend le rapport exploitable. */
function etatNu(civ) {
  const sb = loadLogic(HTML);
  const autres = ['terriens','martiens','jupiteriens','ceinturiens'].filter(c => c !== civ);
  sb.initGame(civ, autres.slice(0, 1));
  const G = sb.__G, p = G.player;
  const noeuds = vm.runInContext(
    'Object.keys(NODES).filter(k=>NODES[k] && !NODES[k].decorative && !NODES[k].noColonize)', sb)
    .filter(id => id !== p.civ.home);
  p.colonies = [{ nodeId: p.civ.home, level: 1, connected: true },
                { nodeId: noeuds[0], level: 2, connected: true }];
  p.routes = []; p.cards = []; p.rpt = {};
  G.commercialAccords = [];
  p.investBonus = null; p.investBonus2 = null;
  p.govFormMorale = 0; p.govFormUpkeep = null;
  p.res = { energy: 400, materials: 400, science: 400, morale: 6 };
  return { sb, p, G };
}
const REGLES = [
  { nom: 'Passif Ceinturiens (+1⚡/tour)',            civ: 'ceinturiens', pose: () => {} },
  { nom: 'Passif Jupitériens (+1⚡/tour)',            civ: 'jupiteriens', pose: () => {} },
  { nom: 'Réseau Empathique (empath_routes)',        pose: (p) => { p.cards.push({ id: 'e', spec: 'empath_routes' }); p.routes = [{}, {}, {}, {}]; } },
  { nom: 'Industrialisation Lourde (matBonus +4🪨)', pose: (p) => { p.investBonus = { turnsLeft: 3, matBonus: 4 }; } },
  { nom: 'Recherche Intensive (sciBonus +3🔬)',       pose: (p) => { p.investBonus = { turnsLeft: 3, sciBonus: 3 }; } },
  { nom: 'Agriculture Durable (moraleBonus +2❤️)',    pose: (p) => { p.investBonus = { turnsLeft: 3, moraleBonus: 2 }; } },
  { nom: 'Confort Population (moraleFlat +4❤️)',      pose: (p) => { p.investBonus2 = { turnsLeft: 3, moraleFlat: 4 }; } },
  { nom: 'Confort Population (moraleX2)',            pose: (p) => { p.investBonus2 = { turnsLeft: 3, moraleX2: true }; } },
  { nom: 'Industrialisation (matX2)',                pose: (p) => { p.investBonus = { turnsLeft: 3, matX2: true }; } },
  { nom: 'Démocratie Directe (govFormMorale +1❤️)',   pose: (p) => { p.govFormMorale = 1; } },
  { nom: 'Terraformation (terra3)',                  pose: (p) => { p.cards.push({ id: 't', spec: 'terra3' }); } },
  { nom: 'Connexion étrangère (colonie voisine)',    pose: (p) => { p.colonies[1].foreignConnected = true; } },
  { nom: 'Accord commercial',                        pose: (p, G) => { G.commercialAccords = [{ id: 'a' }]; } },
  { nom: 'Revenus permanents (rpt)',                 pose: (p) => { p.rpt = { science: 2, materials: 1 }; } }
];
console.log('3. ATTRIBUTION — chaque règle, isolée');
/* Deux façons de mesurer, selon la nature de la règle :
   · une règle qu'on peut POSER (une carte, un investissement) → on compare l'état sans et
     l'état avec ; si l'écart bilan/réel change, c'est elle ;
   · un PASSIF DE NATION, qu'on ne peut pas retirer → on mesure directement l'écart
     bilan/réel sur un état nu. Comparer deux nations différentes ne marcherait pas : leurs
     capitales n'ont pas les mêmes ressources, et on attribuerait au passif une différence
     qui vient du nœud d'origine. (Premier jet de cette mesure : c'est l'erreur que j'ai
     faite, et elle donnait « Ceinturiens : bilan −1 / réel +0 », ce qui n'a aucun sens.) */
let nReg = 0;
const ecartEtat = (e1, e2) => {   // e1 et e2 = deux exemplaires du MÊME état
  const a = brutAffiche(e1.sb, e1.p), r = brutReel(e2.sb, e2.p), d = {};
  for (const res of RES) d[res] = (a[res] || 0) - (r[res] || 0);
  return d;
};
for (const r of REGLES) {
  const civ = r.civ || 'terriens';
  let souci = [];
  if (r.civ) {
    const g = ecartEtat(etatNu(civ), etatNu(civ));
    for (const res of RES) if (g[res]) souci.push(SYM[res] + ' le bilan oublie ' + (-g[res]) + ' ' + SYM[res]);
  } else {
    const sans = ecartEtat(etatNu(civ), etatNu(civ));
    const a1 = etatNu(civ), a2 = etatNu(civ);
    r.pose(a1.p, a1.G); r.pose(a2.p, a2.G);
    const avec = ecartEtat(a1, a2);
    for (const res of RES) {
      const d = (avec[res] || 0) - (sans[res] || 0);
      if (d) souci.push(SYM[res] + ' le bilan oublie ' + (-d) + ' ' + SYM[res]);
    }
  }
  if (souci.length) { nReg++; console.log('   ❌ ' + r.nom + ' → ' + souci.join(', ')); }
  else console.log('   ✔ ' + r.nom);
}
console.log('   → ' + nReg + ' règle(s) sur ' + REGLES.length + ' absentes du bilan.\n');

rapport('2. NET — estimation (barre du haut, menu Empire) contre le tour réellement joué', 'net', nNet);

console.log('═'.repeat(74));
if (nBrut || nNet) {
  console.log('CONCLUSION : les calculs NE s\'accordent PAS. ' + nBrut + ' écart(s) sur le brut, '
    + nNet + ' sur le net.');
  process.exitCode = 1;
} else {
  console.log('CONCLUSION : les trois calculs s\'accordent sur les ' + N + ' états mesurés.');
}
console.log('═'.repeat(74));
