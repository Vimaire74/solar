/* ============================================================================
   TEST — LE RAPPORT DE FIN DE PARTIE DOIT MONTRER SON CALCUL
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-25 : « J'aimerais que tu fasses un rapport de fin de partie plus
   détaillé, je te l'ai déjà demandé je crois. Il faut mettre dans le calcul de points les règles
   qui expliquent ça et le calcul complet des points pour chaque élément calculé, notamment bonus
   spéciaux qui n'est pas clair. »

   CE QU'IL Y AVAIT. Huit totaux et une règle par ligne. « Colonies … 59 » sans dire QUELLE colonie
   rapporte quoi ; « Événements … 25 » sans dire d'où venaient ces points ; et « Bonus divers … 0 ·
   aucun », qui ne dit même pas ce que cette catégorie contiendrait. Impossible de vérifier un
   score, donc impossible de distinguer une règle mal comprise d'une erreur de comptabilité — c'est
   exactement ce qui a fait douter Marc du décompte.

   CE QUE CE BANC VÉRIFIE, ET DANS QUEL ORDRE D'IMPORTANCE :
     1. que le DÉTAIL ne change AUCUN total (un rapport ne doit jamais modifier ce qu'il décrit) ;
     2. que l'arithmétique affichée se recompose bien en ce total ;
     3. que les points d'événement disent d'où ils viennent (`gagnerVP` retient le motif) ;
     4. qu'un poste à ZÉRO explique pourquoi il est à zéro ;
     5. que le rapport SOLO et le rapport SERVEUR disent la même chose — deux chemins, une vérité.

   Usage : node test_rapport_final.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['martiens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 9;
  return { sb, G, moi: G.player, A: G.ais[0], B: G.ais[1] };
}
/* Le corps du rapport SERVEUR, extrait de `server.js` — le module n'exporte rien (le requérir
   démarrerait un serveur). Même méthode que `test_reponses_assainies.js`. */
function corpsRapportServeur() {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').split('\n');
  /* v10.78 : `corpsRapport(entry, lang)` s'appuie sur `tL` (dictionnaires) et `plainText` — on extrait
     les trois fonctions, avec un `DICTS` vide (le rapport est alors rendu en français, tel quel). */
  const bloc = nom => {
    const d = src.findIndex(l => l.startsWith('function ' + nom + '('));
    if (d < 0) throw new Error(nom + ' introuvable dans server.js');
    let f = d + 1; while (f < src.length && src[f] !== '}') f++;
    return src.slice(d, f + 1).join('\n');
  };
  return new Function('const DICTS = {};\n' + bloc('tL') + '\n' + bloc('plainText') + '\n' + bloc('corpsRapport') + '\nreturn corpsRapport;')();
}

console.log('═'.repeat(80));
console.log('RAPPORT DE FIN DE PARTIE — MONTRER LE CALCUL, PAS SEULEMENT LE TOTAL');
console.log('═'.repeat(80) + '\n');

/* ── 1. LE DÉTAIL NE DOIT RIEN CHANGER AUX TOTAUX ─────────────────────────── */
console.log('1. CONTRE-ÉPREUVE D\'ABORD — les totaux sont intacts');
{
  /* Le risque le plus grave d'un correctif « d'affichage » : toucher au calcul en croyant ne
     toucher qu'au texte. On vérifie donc que la somme des huit postes fait toujours le total. */
  const m = partie();
  for (const p of [m.moi, m.A, m.B]) {
    const v = m.sb.calcVP(p);
    const somme = (v.colVP || 0) + (v.routeVP || 0) + (v.cardsVP || 0) + (v.techBonusVP || 0)
      + (v.rptVP || 0) + (v.agendasVP || 0) + (v.evtVP || 0) + (v.extraVP || 0);
    if (somme === v.total) ok(p.civ.name + ' : les huit postes font bien ' + v.total + ' VP');
    else ko(p.civ.name + ' : somme ' + somme + ' ≠ total ' + v.total + ' — le rapport a modifié le calcul');
  }
}

/* ── 2. L'ARITHMÉTIQUE AFFICHÉE SE RECOMPOSE ──────────────────────────────── */
console.log('\n2. Chaque colonie montre son calcul, et la somme retombe sur le poste');
{
  const m = partie();
  const p = m.moi;
  p.colonies.push({ nodeId: 'ganymede', level: 3, connected: true });
  p.colonies.push({ nodeId: 'callisto', level: 2, connected: false });
  const v = m.sb.calcVP(p);
  const lignes = (v.det && v.det.colonies) || [];
  for (const l of lignes) note(l);
  if (lignes.length === p.colonies.filter(c => { const N = vm.runInContext('NODES', m.sb); return !(N[c.nodeId] || {}).decorative; }).length)
    ok('une ligne par colonie, sans oubli');
  else ko(lignes.length + ' ligne(s) pour ' + p.colonies.length + ' colonie(s)');
  /* On relit le « → N » terminal de chaque ligne et on additionne : c'est ce que ferait un joueur
     qui vérifie son score à la main. Si la somme ne retombe pas, le rapport ment. */
  let somme = 0;
  for (const l of lignes) { const mm = /→\s*(\d+)/.exec(l); if (mm) somme += parseInt(mm[1], 10); }
  note('somme des lignes : ' + somme + ' · poste Colonies : ' + v.colVP);
  if (somme === v.colVP) ok('l\'addition affichée retombe exactement sur le poste');
  else ko('les lignes affichées font ' + somme + ' alors que le poste vaut ' + v.colVP);
  /* Une colonie ISOLÉE doit se voir comme telle : c'est la moitié des points, et la question
     revient à chaque partie. */
  if (lignes.some(x => /isolée/.test(x))) ok('une colonie isolée est signalée comme telle (×0,5)');
  else ko('rien ne distingue une colonie isolée d\'une colonie reliée');
}

/* ── 3. LES POINTS D'ÉVÉNEMENT DISENT D'OÙ ILS VIENNENT ───────────────────── */
console.log('\n3. Les VP d\'événement portent leur motif');
{
  /* C'est le poste le plus opaque du rapport de Marc : « Événements … 25 » sans un mot. */
  const m = partie();
  m.sb.gagnerVP(m.moi, 2, 'Combat gagné contre Martiens');
  m.sb.gagnerVP(m.moi, 6, 'Événement : Conférence Scientifique');
  const v = m.sb.calcVP(m.moi);
  const lignes = (v.det && v.det.evt) || [];
  for (const l of lignes) note(l);
  if (v.evtVP === 8) ok('les points sont bien crédités (2 + 6 = 8)');
  else ko('total événements ' + v.evtVP + ' au lieu de 8');
  if (lignes.length === 2) ok('chaque gain a sa ligne');
  else ko(lignes.length + ' ligne(s) de détail pour deux gains');
  if (lignes.some(x => /Combat gagné/.test(x)) && lignes.some(x => /Conférence/.test(x)))
    ok('et le motif de chacun est nommé');
  else ko('les motifs ne sont pas repris — le poste reste muet');
}

/* ── 4. UN POSTE À ZÉRO EXPLIQUE POURQUOI ─────────────────────────────────── */
console.log('\n4. Un poste à zéro dit pourquoi il est à zéro');
{
  const m = partie();
  const corps = corpsRapportServeur();
  const v = m.sb.calcVP(m.A);
  const scores = [{ civId: m.A.civ.id, name: m.A.civ.name, vp: v.total, user: null,
    agenda: (m.A.agenda && m.A.agenda.name) || null,
    detail: { colVP: v.colVP, routeVP: v.routeVP, cardsVP: v.cardsVP, techBonusVP: v.techBonusVP,
      rptVP: v.rptVP, agendasVP: v.agendasVP, evtVP: v.evtVP, extraVP: v.extraVP,
      extraDetail: v.extraDetail || [], det: v.det || null } }];
  const txt = corps({ code: 'BANC', dateFr: '25/08/2026', turn: 9, joueurs: [], scores, journal: [], bugs: [] });
  const lignes = txt.split('\n');
  const posteVide = lignes.findIndex(l => /Revenus par tour .* 0 /.test(l));
  if (posteVide >= 0 && /·/.test(lignes[posteVide + 1] || '')) ok('« Revenus par tour … 0 » est suivi de son explication');
  else ko('un poste à zéro reste sans explication — c\'est là que le lecteur soupçonne une erreur');
  if (/Bonus divers/.test(txt) && /Extra-Solaire/.test(txt))
    ok('« Bonus divers » dit enfin ce qu\'il contiendrait (le reproche de Marc)');
  else ko('« Bonus divers » reste opaque');
  if (/TOTAL \.+ /.test(txt)) ok('et le rapport se termine par un total récapitulé');
  else ko('aucune ligne de total en bas du bloc');
}

/* ── 5. SOLO ET SERVEUR DISENT LA MÊME CHOSE ──────────────────────────────── */
console.log('\n5. Le rapport SOLO et le rapport SERVEUR ne divergent pas');
{
  /* ⚠️ LA MALADIE DOCUMENTÉE DU PROJET : deux chemins pour une même vérité finissent toujours par
     dire deux choses. Le rapport solo se contentait de trois lignes de totaux pendant que le
     serveur détaillait tout. On vérifie que les mêmes lignes de calcul apparaissent des deux côtés. */
  const m = partie();
  m.moi.colonies.push({ nodeId: 'ganymede', level: 3, connected: true });
  m.sb.gagnerVP(m.moi, 2, 'Combat gagné contre Martiens');
  const v = m.sb.calcVP(m.moi);
  const solo = m.sb.buildJournalReport();
  const corps = corpsRapportServeur();
  const scores = [{ civId: m.moi.civ.id, name: m.moi.civ.name, vp: v.total, user: 'marc@guerir.ch',
    agenda: (m.moi.agenda && m.moi.agenda.name) || null,
    detail: { colVP: v.colVP, routeVP: v.routeVP, cardsVP: v.cardsVP, techBonusVP: v.techBonusVP,
      rptVP: v.rptVP, agendasVP: v.agendasVP, evtVP: v.evtVP, extraVP: v.extraVP,
      extraDetail: v.extraDetail || [], det: v.det || null } }];
  const serveur = corps({ code: 'BANC', dateFr: '25/08/2026', turn: 9, joueurs: [], scores, journal: [], bugs: [] });
  const temoins = ((v.det && v.det.colonies) || []).slice(0, 2)
    .concat((v.det && v.det.evt) || []);
  let manquantes = 0;
  for (const t of temoins) {
    const cle = String(t).slice(0, 30);
    if (solo.indexOf(cle) < 0) { manquantes++; note('absente du rapport SOLO : ' + cle + '…'); }
    if (serveur.indexOf(cle) < 0) { manquantes++; note('absente du rapport SERVEUR : ' + cle + '…'); }
  }
  note(temoins.length + ' ligne(s) de calcul vérifiée(s) des deux côtés');
  if (!manquantes) ok('les mêmes lignes de calcul figurent dans les deux rapports');
  else ko(manquantes + ' ligne(s) présente(s) d\'un côté seulement — les deux chemins divergent');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le rapport montre son calcul poste par poste, explique ses zéros, nomme l\'origine');
console.log('   de chaque point d\'événement — et dit la même chose en solo et en ligne.');
console.log('═'.repeat(80));
