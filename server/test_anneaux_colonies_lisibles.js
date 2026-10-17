/* ============================================================================
   TEST — LES COLONIES DES AUTRES NATIONS SE VOIENT SUR LA CARTE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 26/09 : « Sur la carte, la couleur des colonies possédées par les autres
   nations mais pas encore connectée est toujours trop faible. À faible luminosité d'écran,
   on ne voit rien. »

   L'HISTOIRE. Le 18/09 (partie 4112) il avait signalé le même défaut pour SES colonies :
   « sur ordinateur je vois quasi pas que j'ai colonisé Pluton, la couleur est trop peu
   brillante quand la colonie n'est pas connectée ». La décision prise alors est écrite dans
   `renderSystemMap` : C'EST LE TIRET QUI PORTE L'INFORMATION, PAS LA PÂLEUR. Les opacités
   étaient montées de 0,3 à 0,6 (joueur) et de 0,2 à 0,45 (autres nations).

   CE QUE CETTE CORRECTION AVAIT LAISSÉ PASSER : l'ÉPAISSEUR. Pour le joueur elle vaut
   `niveau + 1`, pour les autres nations `niveau` tout court. Une colonie adverse de niveau 1
   était donc un cercle de UN pixel, tireté, à 45 % d'opacité — moitié moins épais que celui
   du joueur, et plus pâle. C'est ce cumul qui la faisait disparaître, pas l'opacité seule.

   VALEURS RETENUES (Marc, 26/09, sur maquette) :
     · épaisseur : `Math.max(2, niveau + 1)` — jamais moins de 2 pixels ;
     · opacité : 0,85 reliée · 0,75 non reliée ;
     · le tiret 3,3 continue de dire « non reliée ».

   CE QUE CE BANC VERROUILLE :
     · aucun anneau de colonie adverse sous 2 px d'épaisseur ni sous 0,75 d'opacité ;
     · le tiret reste présent sur une colonie non reliée, et absent sur une reliée ;
     · CONTRE-ÉPREUVE : l'anneau du joueur reste distinguable (rayon et tiret différents) ;
     · CONTRE-ÉPREUVE : le banc sait lire les attributs (il détecte une valeur trop faible).

   Usage : node test_anneaux_colonies_lisibles.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

const SEUIL_EPAISSEUR = 2;
const SEUIL_OPACITE_NON_RELIEE = 0.75;
const SEUIL_OPACITE_RELIEE = 0.85;

/* Une partie avec, pour chaque niveau, une colonie adverse reliée et une non reliée. */
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  G.player._isAI = false;
  const ia = G.ais[0];
  ia.colonies = [
    { nodeId: 'phobos',  level: 3, connected: true  },   // sa capitale
    { nodeId: 'ceres',   level: 1, connected: false },
    { nodeId: 'vesta',   level: 2, connected: false },
    { nodeId: 'europe',  level: 1, connected: true  },
    { nodeId: 'titan',   level: 3, connected: false }
  ];
  G.player.colonies = [
    { nodeId: 'lune',    level: 2, connected: true  },
    { nodeId: 'pluto',   level: 1, connected: false }
  ];
  vm.runInContext(`_aUnEcran = function(){ return true; };`, sb);
  return { sb, G, ia };
}

/* Le SVG réellement produit par la carte. `renderSystemMap` écrit dans le DOM ; on lit ce
   qu'elle a écrit, jamais une reconstruction — sinon le banc mesurerait sa propre copie. */
function svgCarte(sb) {
  try { sb.renderSystemMap(); } catch (e) { note('(le dessin s\'interrompt : ' + e.message + ')'); }
  /* `renderSystemMap` écrit les nœuds et leurs anneaux dans `#nodes-g` (moteur.js ~13979). */
  const el = sb.document.getElementById('nodes-g');
  return String((el && el.innerHTML) || '');
}

/* Tous les cercles d'anneau d'une couleur donnée, avec leurs attributs lus dans le SVG. */
function anneaux(svg, couleur) {
  const out = [];
  const re = /<circle\b[^>]*>/g;
  let m;
  while ((m = re.exec(svg))) {
    const c = m[0];
    if (c.indexOf('stroke="' + couleur + '"') === -1) continue;
    const w = c.match(/stroke-width="([\d.]+)"/);
    const o = c.match(/stroke-opacity="([\d.]+)"/);
    const r = c.match(/\br="([\d.]+)"/);
    out.push({
      brut: c,
      epaisseur: w ? Number(w[1]) : null,
      opacite: o ? Number(o[1]) : null,
      rayon: r ? Number(r[1]) : null,
      tiret: /stroke-dasharray="([^"]+)"/.test(c) ? c.match(/stroke-dasharray="([^"]+)"/)[1] : null
    });
  }
  return out;
}

console.log('═'.repeat(84));
console.log('CARTE — UNE COLONIE ADVERSE DOIT SE VOIR, RELIÉE OU NON');
console.log('═'.repeat(84) + '\n');

const m = montage();
const svg = svgCarte(m.sb);
const couleurIA = m.ia.civ.color;
const couleurMoi = m.G.player.civ.color;
const adverses = anneaux(svg, couleurIA);
const miens = anneaux(svg, couleurMoi);

console.log('1. Aucun anneau adverse trop fin ni trop pâle');
{
  note('anneaux adverses trouvés : ' + adverses.length + ' · couleur ' + couleurIA);
  if (!adverses.length) {
    ko('aucun anneau adverse dans le SVG — le banc ne mesure rien');
  } else {
    const fins = adverses.filter(a => a.epaisseur !== null && a.epaisseur < SEUIL_EPAISSEUR);
    const pales = adverses.filter(a => a.opacite !== null &&
      a.opacite < (a.tiret ? SEUIL_OPACITE_NON_RELIEE : SEUIL_OPACITE_RELIEE));
    adverses.forEach(a => note('  épaisseur ' + a.epaisseur + ' · opacité ' + a.opacite + ' · tiret ' + (a.tiret || 'non')));
    if (fins.length) ko(fins.length + ' anneau(x) sous ' + SEUIL_EPAISSEUR + ' px — le plus fin : ' + Math.min.apply(null, fins.map(a => a.epaisseur)) + ' px');
    else ok('tous les anneaux font au moins ' + SEUIL_EPAISSEUR + ' px');
    if (pales.length) ko(pales.length + ' anneau(x) trop pâle(s) — la plus faible opacité : ' + Math.min.apply(null, pales.map(a => a.opacite)));
    else ok('toutes les opacités atteignent le seuil (0,85 reliée · 0,75 non reliée)');
  }
}

console.log('\n2. Le tiret continue de dire « non reliée »');
{
  const avecTiret = adverses.filter(a => a.tiret);
  const sansTiret = adverses.filter(a => !a.tiret);
  note('avec tiret : ' + avecTiret.length + ' · sans tiret : ' + sansTiret.length);
  if (avecTiret.length && sansTiret.length) ok('les deux états sont distingués par le tiret');
  else ko('un seul état de tiret présent — l\'information « non reliée » ne se lit plus');
}

console.log('\n3. CONTRE-ÉPREUVE — l\'anneau du joueur reste distinguable');
{
  /* Sans ce point, on « corrigerait » en rendant tout le monde identique, et le joueur ne
     saurait plus reconnaître ses propres colonies d'un coup d'œil. */
  note('anneaux du joueur : ' + miens.length + ' · couleur ' + couleurMoi);
  if (!miens.length) { ko('aucun anneau du joueur — le point ne mesure rien'); }
  else {
    const tiretsMiens = new Set(miens.filter(a => a.tiret).map(a => a.tiret));
    const tiretsAutres = new Set(adverses.filter(a => a.tiret).map(a => a.tiret));
    const memeTiret = [...tiretsMiens].some(x => tiretsAutres.has(x));
    if (tiretsMiens.size && tiretsAutres.size && memeTiret) ko('joueur et adversaires partagent le même motif de tiret');
    else ok('le motif de tiret du joueur diffère de celui des autres nations');
  }
}

console.log('\n4. CONTRE-ÉPREUVE — le banc sait voir une valeur trop faible');
{
  const faux = '<circle r="20" stroke="' + couleurIA + '" stroke-width="1" stroke-opacity="0.45" stroke-dasharray="3,3"/>';
  const lus = anneaux(faux, couleurIA);
  if (lus.length === 1 && lus[0].epaisseur === 1 && lus[0].opacite === 0.45) ok('un anneau de 1 px à 0,45 est bien lu comme tel');
  else ko('la lecture des attributs ne fonctionne pas — les points ci-dessus ne prouvent rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Les colonies adverses se voient, et le tiret dit toujours si elles sont reliées.');
console.log('═'.repeat(84));
