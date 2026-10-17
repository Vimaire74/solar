/* ============================================================================
   TEST — UNE CAPITALE SE DÉFEND À 10 ET VAUT +10 VP, PAR TOUS LES CHEMINS
   ----------------------------------------------------------------------------
   Marc, partie B628 (05/09) : « le Terrien a éliminé la capitale ceinturienne » — journal :
   « Terriens capture Éris sur Ceinturiens (6⚔️ vs 5🛡️) ». Une CAPITALE prise à 6 contre 5 : la
   garnison de 10 (§14, `garrisonOf`) n'était pas comptée dans le combat entre deux ordinateurs —
   ce corps datait de l'ancien cerveau, qui excluait les capitales de ses cibles, et le « +1 » écrit
   en dur ne se voyait pas. Depuis que le tacticien passe par cette porte (§92), il se voyait.
   Et : « on devrait donner un bonus de +10 VP quand on conquiert une capitale d'un autre joueur ».

   RÈGLES VERROUILLÉES ICI :
     1. combat IA → IA sur une capitale : la défense compte 10 de garnison — avec 6 jetons, on n'y
        entre pas ; avec 20, on y entre ;
     2. la prise d'une capitale rapporte +10 VP au vainqueur, par la porte unique `capturerNoeud`,
        donc pour l'IA qui prend une capitale d'IA comme pour l'humain (fenêtre de fin de tour) et
        pour l'IA qui prend une capitale humaine (fenêtre de défense) ;
     3. CONTRE-ÉPREUVE — une colonie ordinaire ne rapporte pas ces 10 VP ;
     4. UNE SEULE PORTE : `resolveAiAssaultOnPlayer` (quatrième copie de la capture, trouvée le 05/09)
        passe désormais par `capturerNoeud` — le +10 et le moral de l'abandon y sont donc aussi.

   Usage : node test_capitale_conquise.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const MOTEUR = path.join(__dirname, '..', 'moteur.js');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(jetons) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 8; G.phase = 'actions';
  const hum = G.player, jup = G.ais[0], cei = G.ais[1];
  hum._isAI = false; jup._isAI = true; cei._isAI = true;
  jup.acLeft = 3; jup.forceTokens = jetons; jup.res.materials = 30; jup.res.energy = 30; jup.res.morale = 8;
  cei.forceTokens = 2; cei.res.materials = 2; cei.res.energy = 2;
  /* Voisinage : une colonie jupitérienne à côté d'Éris (capitale ceinturienne). */
  jup.colonies.push({ nodeId: 'pluto', level: 2, connected: true });
  sb.setDecisionSink(function () {});
  return { sb, G, hum, jup, cei };
}
const vpDe = (m, n) => m.sb.calcVP(n).total;
const tempVP = n => n.tempVP || 0;

console.log('═'.repeat(84));
console.log('CAPITALE — GARNISON DE 10 AU COMBAT, ET +10 VP À LA PRISE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Garnison de 10 dans le combat IA → IA ─────────────────────────────── */
console.log('1. Combat IA → IA sur une capitale : 6 jetons n\'y entrent pas, 20 y entrent');
{
  const m = montage(6);
  const home = m.cei.civ.home;
  const av = (m.G.log || []).length;
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: home });
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  const prise = m.jup.colonies.some(c => c.nodeId === home);
  note('6 jetons contre ' + home + ' : prise = ' + prise + ' · ' + (j.find(t => /renonce|repouss|capture/i.test(t)) || '').slice(0, 90));
  if (!prise) ok('la capitale tient : la garnison de 10 est comptée (le défaut de B628 : « 6⚔️ vs 5🛡️ »)');
  else ko('capitale prise avec 6 jetons — la garnison est encore comptée 1');

  const m2 = montage(20);
  const av2 = (m2.G.log || []).length;
  m2.sb.appliquerCoup(m2.jup, { type: 'assaut', node: home });
  const j2 = (m2.G.log || []).slice(0, (m2.G.log || []).length - av2).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  const prise2 = m2.jup.colonies.some(c => c.nodeId === home);
  note('20 jetons : prise = ' + prise2 + ' · ' + (j2.find(t => /vs/i.test(t)) || '').slice(0, 90));
  if (prise2) ok('avec la force, la capitale tombe — la règle ne l\'interdit pas, elle la rend chère');
  else ko('20 jetons ne prennent pas une capitale à 2 jetons + 10 de garnison');
  if (j2.some(t => /vs 1[2-9]/.test(t) || /vs 2[0-9]/.test(t))) ok('et le journal montre une défense à deux chiffres');
  else ko('la défense affichée reste petite : ' + (j2.find(t => /vs/.test(t)) || ''));
}

/* ── 2. +10 VP par tous les chemins ───────────────────────────────────────── */
console.log('\n2. Prendre une capitale rapporte +10 VP — IA → IA, et IA → humain');
{
  const m = montage(20);
  const home = m.cei.civ.home;
  const avantVP = tempVP(m.jup);
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: home });
  const gain = tempVP(m.jup) - avantVP;
  const motif = (m.jup._vpDetail || []).slice(-1)[0];
  note('IA → IA : VP de bonus ' + avantVP + ' → ' + tempVP(m.jup) + ' · motif : ' + (motif && motif.raison));
  /* 14/09 : toute victoire de combat vaut +2 (test_combat_vp_equitable.js) → +10 capitale +2 combat. */
  if (gain === 12) ok('+10 VP pour la capitale ceinturienne (+2 de combat gagné)');
  else ko('gain de ' + gain + ' VP au lieu de 12 (10 capitale + 2 combat)');

  /* IA → humain : par la fenêtre de défense, chemin `resolveAiAssaultOnPlayer` (la 4e copie). */
  const m3 = montage(20);
  const homeH = m3.hum.civ.home;
  m3.hum.forceTokens = 0; m3.hum.res.materials = 0; m3.hum.res.energy = 0;
  m3.jup.colonies.push({ nodeId: 'vesta', level: 2, connected: true });   // voisin de Lune
  m3.G._pendings = [];
  const av3 = tempVP(m3.jup);
  m3.sb.appliquerCoup(m3.jup, { type: 'assaut', node: homeH });
  const q = (m3.G._pendings || []).find(p => p.kind === 'defense');
  if (q) m3.sb.resolveDecision(q.id, { defTokens: 0, cruiser: false });
  const prise3 = m3.jup.colonies.some(c => c.nodeId === homeH);
  note('IA → humain (' + homeH + ') : fenêtre posée = ' + !!q + ' · prise = ' + prise3 + ' · VP ' + av3 + ' → ' + tempVP(m3.jup));
  if (prise3 && tempVP(m3.jup) - av3 === 12) ok('+10 VP aussi par la fenêtre de défense (+2 de combat gagné) — la capture passe par la porte unique');
  else if (!prise3) ko('la capitale humaine n\'a pas été prise (20 jetons contre 0 + 10 de garnison) : le point ne mesure rien');
  else ko('capture par la fenêtre de défense : ' + (tempVP(m3.jup) - av3) + ' VP au lieu de 12 (10 capitale + 2 combat)');
}

/* ── 3. CONTRE-ÉPREUVE — une colonie ordinaire ne vaut pas +10 ───────────── */
console.log('\n3. CONTRE-ÉPREUVE — une colonie ordinaire ne rapporte pas ces 10 VP');
{
  const m = montage(12);
  m.cei.colonies.push({ nodeId: 'triton', level: 2, connected: true });
  const av = tempVP(m.jup);
  m.sb.appliquerCoup(m.jup, { type: 'assaut', node: 'triton' });
  const prise = m.jup.colonies.some(c => c.nodeId === 'triton');
  note('Triton (ordinaire) : prise = ' + prise + ' · VP ' + av + ' → ' + tempVP(m.jup));
  /* 14/09 : +2 de combat gagné pour toute capture (test_combat_vp_equitable.js) — mais pas les +10. */
  if (prise && tempVP(m.jup) - av === 2) ok('prise à +2 (combat gagné) seulement — les 10 VP sont réservés aux capitales');
  else if (!prise) ko('Triton n\'a pas été prise : le point ne mesure rien');
  else ko('une colonie ordinaire a rapporté ' + (tempVP(m.jup) - av) + ' VP au lieu de 2');
}

/* ── 4. UNE SEULE PORTE ────────────────────────────────────────────────────── */
console.log('\n4. La capture n\'est écrite qu\'une fois : `resolveAiAssaultOnPlayer` passe par `capturerNoeud`');
{
  const src = fs.readFileSync(MOTEUR, 'utf8');
  /* ⚠️ CHERCHER LA VRAIE FONCTION, PAS SON ENVELOPPE. Depuis §102 (07/09),
     `resolveAiAssaultOnPlayer` n'est plus qu'un `logAuteur(...)` de trois lignes autour de
     `_resolveAiAssaultOnPlayer`, qui porte le corps. Le banc lisait l'enveloppe : il n'y trouvait
     évidemment ni capture à la main ni `capturerNoeud`, et rougissait alors que la règle qu'il
     protège était intacte. Un banc qui rougit à faux est pire qu'un banc absent. */
  const i = src.indexOf('function _resolveAiAssaultOnPlayer(');
  const j = src.indexOf('\n}\n', i);
  const corps = src.slice(i, j);
  const aLaMain = /colonies\.push\(\{nodeId:col\.nodeId/.test(corps);
  const porte = /capturerNoeud\(ai,col\.nodeId\)/.test(corps);
  note('capture à la main dans resolveAiAssaultOnPlayer : ' + aLaMain + ' · appel à capturerNoeud : ' + porte);
  if (!aLaMain && porte) ok('la quatrième copie a disparu');
  else ko('la capture vit encore à deux endroits');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une capitale se défend à 10 partout, et la prendre vaut +10 VP par tous les chemins.');
console.log('═'.repeat(84));
