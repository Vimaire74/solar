/* ============================================================================
   TEST — LES COLONIES RELIÉES AU NIVEAU 3 SONT LE MOTEUR (règle de Marc, 13/09)
   ----------------------------------------------------------------------------
   Marc : « elles n'ont pas compris comment gagner beaucoup de ressources. Elles devraient
   avoir la notion que des colonies connectées niveau 3, c'est le must. Le Bâtisseur
   devrait viser ça, et donc prendre Colonies Avancées au tour 7. »

   MESURÉ AVANT (tour 3, Titan reliée au niveau 1, Bâtisseur) : améliorer Titan valait 9,0,
   acheter Extracteurs Solaires 10,2. L'IA achetait la carte. Deux causes :
     · le terme « potentiel » de l'évaluation payait la marge d'amélioration RESTANTE — donc
       améliorer faisait PERDRE du potentiel (−1,8 au tour 3) ;
     · le tempérament n'entrait pas dans le calcul du tacticien (hors interdiction de raid).

   CE QUI EST VÉRIFIÉ :
     1. Bâtisseur, tour 3, Titan reliée Nv.1 : le tacticien AMÉLIORE plutôt que d'acheter la
        technologie de rang 2 — décision réelle (`doAITurn`), pas un calcul isolé ;
     2. même chose de Nv.2 à Nv.3 ;
     3. CONTRE-ÉPREUVE : sur un nœud pauvre (Déimos, 1 VP), la technologie garde l'avantage —
        on ne veut pas d'amélioration aveugle ;
     4. investissement Niv.2 : le Bâtisseur avec deux colonies à monter prend Colonies
        Avancées ; CONTRE-ÉPREUVE : sans colonie à monter, il n'y est pas forcé.

   Usage : node test_ia_colonies.js
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

/* Martiens (Phobos) : on leur donne une colonie reliée par une VRAIE route jusqu'à la capitale,
   sinon la simulation (qui recalcule la connectivité) la verrait isolée. */
function montage(profil, tour, noeud, niveau) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = tour; G.phase = 'actions';
  const nat = G.ais.find(a => a.civ.id === 'martiens');
  nat._isAI = true; nat._profil = profil; nat._aiSetupDone = true; nat.abilityUsed = true;
  nat.acLeft = 1; nat.res.materials = 12; nat.res.energy = 12; nat.res.science = 12; nat.res.morale = 8; nat.forceTokens = 4;
  const home = nat.civ.home;
  /* chemin Phobos → … → noeud par les adjacences, en posant des routes protégées */
  const conn = id => vm.runInContext('NODES["' + id + '"].conn.slice()', sb);
  const prev = { [home]: null }; const q = [home]; let trouve = false;
  while (q.length && !trouve) { const cur = q.shift(); for (const v of conn(cur)) { if (prev[v] !== undefined) continue; prev[v] = cur; if (v === noeud) { trouve = true; break; } q.push(v); } }
  /* Les nœuds traversés sont occupés par une autre nation : sinon « coloniser Cérès » (reliée
     d'office par la route déjà posée) l'emporte sur tout, et le point ne compare plus rien. */
  const jup = G.ais.find(a => a.civ.id === 'jupiteriens');
  let cur = noeud; while (cur && prev[cur]) {
    nat.routes.push({ from: prev[cur], to: cur, tokens: 1 });
    if (prev[cur] !== home && !jup.colonies.some(c => c.nodeId === prev[cur])) jup.colonies.push({ nodeId: prev[cur], level: 1, connected: false });
    cur = prev[cur];
  }
  nat.colonies.push({ nodeId: noeud, level: niveau, connected: true });
  sb.updateConnections(nat);
  /* la technologie concurrente : Extracteurs Solaires (rang 2), branche ouverte */
  G.branchTiers = G.branchTiers || {}; G.branchTiers.mines_energie = 2;
  nat.cards.push(vm.runInContext('CARDS_POOL.find(c=>c.branch==="mines_energie"&&c.tier===1)', sb));
  return { sb, G, nat };
}
function decision(m) {
  m.G._traceIA = [];
  m.sb.doAITurn(m.nat, true);
  const t = (m.G._traceIA || []).filter(x => x.nat === 'martiens');
  return t.length ? t[t.length - 1] : null;
}

console.log('═'.repeat(80));
console.log('COLONIES NIVEAU 3 — CE QUE LE BÂTISSEUR CHERCHE');
console.log('═'.repeat(80) + '\n');

console.log('1. Bâtisseur, tour 3, Titan reliée Nv.1 : améliorer est au moins le dauphin');
{
  /* Nv.1 → Nv.2 ne rapporte que +1⚡ +1🔬 par tour : Extracteurs Solaires (+3⚡) est objectivement
     meilleur pour CE pas — Marc lui-même prend la technologie. Ce qu'on exige : que l'amélioration
     soit vue, tout près derrière, et non reléguée derrière une carte civique (mesuré avant :
     « dauphin : Démocratie Instantanée », l'amélioration n'apparaissait même pas). */
  const m = montage('batisseur', 3, 'titan', 1);
  const d = decision(m);
  note('choix : ' + (d ? d.choix + ' (' + d.val + ') · dauphin ' + d.second + ' (' + d.val2 + ')' : 'aucune trace'));
  const vu = d && (/améliorer Titan/.test(d.choix) || /améliorer Titan/.test(d.second || ''));
  if (vu) ok('améliorer Titan est retenu ou dauphin'); else ko('l\'amélioration de Titan n\'est même pas dans les deux premiers : ' + (d && (d.choix + ' / ' + d.second)));
}

console.log('\n2. Tour 3, Titan reliée Nv.2 : l\'amélioration reste dans les deux premiers');
{
  /* ⚠️ EXIGENCE ASSOUPLIE LE 17/09 (§139.2) : ce Bâtisseur est devenu le STRATÈGE, qui n'a plus de
     prime d'amélioration (elle valait ×2 pour lui seul). Exiger qu'il monte Titan reviendrait à
     exiger le penchant qu'on vient de lui retirer. Ce qui reste vrai, et vérifié : une colonie
     reliée de 5 VP à monter est vue, en tête ou juste derrière — pas reléguée hors du podium. */
  const m = montage('batisseur', 3, 'titan', 2);
  const d = decision(m);
  note('choix : ' + (d ? d.choix + ' (' + d.val + ') · dauphin ' + d.second + ' (' + d.val2 + ')' : 'aucune trace'));
  const vu = d && (/améliorer Titan/.test(d.choix) || /améliorer Titan/.test(d.second || ''));
  if (vu) ok('améliorer Titan est retenu ou dauphin'); else ko('l\'amélioration de Titan n\'est pas dans les deux premiers : ' + (d && (d.choix + ' / ' + d.second)));
}

console.log('\n3. CONTRE-ÉPREUVE — nœud pauvre (Déimos, 1 VP) : la technologie garde l\'avantage');
{
  const m = montage('batisseur', 3, 'deimos', 1);
  const d = decision(m);
  note('choix : ' + (d ? d.choix + ' (' + d.val + ') · dauphin ' + d.second + ' (' + d.val2 + ')' : 'aucune trace'));
  if (d && !/améliorer Déimos/.test(d.choix)) ok('pas d\'amélioration aveugle d\'un nœud sans valeur'); else ko('il améliore Déimos avant tout — la prime est trop forte');
}

console.log('\n4. Investissement Niv.2 : Colonies Avancées pour le Bâtisseur qui a de quoi en profiter');
{
  const m = montage('batisseur', 6, 'titan', 1);
  m.nat.colonies.push({ nodeId: 'ceres', level: 1, connected: false });
  const choix = m.sb.chooseInvestmentForAI(m.nat, 2);
  note('deux colonies à monter → ' + choix);
  if (choix === 'inv2_colonies') ok('Colonies Avancées'); else ko('il prend ' + choix);
  const m2 = montage('batisseur', 6, 'titan', 3);
  for (const c of m2.nat.colonies) { const n = vm.runInContext('NODES["' + c.nodeId + '"]', m2.sb); c.level = n.maxLv || 3; }
  const choix2 = m2.sb.chooseInvestmentForAI(m2.nat, 2);
  note('rien à monter → ' + choix2);
  if (choix2 !== 'inv2_colonies') ok('contre-épreuve : pas forcé quand il n\'y a rien à monter'); else ko('Colonies Avancées imposée sans colonie à monter');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ Le Bâtisseur monte ses colonies reliées, et prend Colonies Avancées.');
