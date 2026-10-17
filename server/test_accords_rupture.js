/* ============================================================================
   TEST — RUPTURE D'ACCORD, DOUBLONS, ET FUITE DU JOURNAL
   ----------------------------------------------------------------------------
   Trois défauts relevés par Marc en partie (2026-08-16), tous autour des accords.

   1. « J'ai rompu l'accord et attaqué, le jeu ne l'enregistre pas et me le redemande
      à l'attaque suivante. » — `breakAccordAndAttack` retirait le nœud de
      `G.commercialAccords` mais laissait son entrée dans `G.accordsParties`. Or c'est ce
      registre que lit `accordsDe()` : l'accord continuait de payer. Pire, `declarerGuerre`
      révoque en partant de la LISTE — le nœud n'y étant plus, l'entrée orpheline survivait.
   2. « Le Martien avec qui j'avais déjà un accord a voulu m'en proposer un autre. » —
      `_evCommCandidats` écartait les nations ayant un accord sur une de LEURS colonies, avec
      n'importe qui, et laissait passer celles avec qui on en avait déjà un posé sur une des
      NÔTRES. Deux erreurs symétriques.
   3. Le journal local affichait les revenus des QUATRE nations : `doRevenues` fournissait le
      journal à chaque nation de la boucle. Bruit, et fuite d'information sur les rivales.

   Usage : node test_accords_rupture.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 5; G.phase = 'actions';
  return { sb, G, moi: G.player };
}
const par = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);

console.log('═'.repeat(78));
console.log('ACCORDS — RUPTURE COMPLÈTE, PAS DE DOUBLON, JOURNAL QUI NE FUIT PAS');
console.log('═'.repeat(78) + '\n');

/* ── 1. Une guerre révoque l'accord DANS LES DEUX REGISTRES ────────────────── */
console.log('1. RUPTURE — la liste ET le registre des signataires');
{
  const { sb, G, moi } = partie();
  const mars = par(G, 'martiens');
  const noeud = mars.colonies[0].nodeId;
  G.commercialAccords.push(noeud);
  G.accordsParties = G.accordsParties || {};
  G.accordsParties[noeud] = [moi.civ.id, mars.civ.id];
  note('accord posé sur ' + noeud + ' entre terriens et martiens');
  if (sb.accordsDe(moi).length !== 1) ko('le montage a échoué : l\'accord ne compte pas pour le joueur');
  sb.declarerGuerre(moi, mars, 'test', 'player');
  const dansListe = (G.commercialAccords || []).includes(noeud);
  const dansRegistre = !!(G.accordsParties && G.accordsParties[noeud]);
  note('après la guerre — liste : ' + (dansListe ? 'ENCORE LÀ' : 'retiré') + ' · registre : ' + (dansRegistre ? 'ENCORE LÀ' : 'retiré'));
  if (!dansListe && !dansRegistre) ok('l\'accord disparaît des deux endroits');
  else ko('l\'accord survit ' + (dansListe ? 'dans la liste ' : '') + (dansRegistre ? 'dans le registre' : ''));
  if (sb.accordsDe(moi).length === 0) ok('il ne rapporte plus rien — `accordsDe` ne le compte plus');
  else ko('il continue de payer : ' + sb.accordsDe(moi).length + ' accord(s) comptabilisé(s)');
}

/* ── 2. `breakAccordAndAttack` ne laisse rien derrière lui ─────────────────── */
console.log('\n2. « Rompre l\'accord et attaquer » — même exigence');
{
  const { sb, G, moi } = partie();
  const mars = par(G, 'martiens');
  const noeud = mars.colonies[0].nodeId;
  G.commercialAccords.push(noeud);
  G.accordsParties = G.accordsParties || {};
  G.accordsParties[noeud] = [moi.civ.id, mars.civ.id];
  moi.res.materials = 20; moi.res.energy = 20; moi.forceTokens = 8; moi.acLeft = 4;
  try { sb.breakAccordAndAttack(noeud); } catch (e) { note('(fenêtre de combat non ouvrable hors navigateur : ' + e.message.split('\n')[0] + ')'); }
  const dansListe = (G.commercialAccords || []).includes(noeud);
  const dansRegistre = !!(G.accordsParties && G.accordsParties[noeud]);
  note('liste : ' + (dansListe ? 'ENCORE LÀ' : 'retiré') + ' · registre : ' + (dansRegistre ? 'ENCORE LÀ' : 'retiré'));
  if (!dansListe && !dansRegistre) ok('rien ne subsiste — l\'accord ne sera pas reproposé au tour suivant');
  else ko('reliquat : ' + (dansListe ? 'liste ' : '') + (dansRegistre ? 'registre' : ''));
}

/* ── 3. Pas deux accords entre les deux mêmes nations ──────────────────────── */
console.log('\n3. DOUBLON — une nation déjà liée n\'est plus une candidate');
{
  const { sb, G, moi } = partie();
  const mars = par(G, 'martiens'), jup = par(G, 'jupiteriens');
  /* L'accord est posé sur une colonie du JOUEUR : c'est le cas qui passait à travers, l'ancien
     filtre ne regardant que les colonies du candidat. */
  const noeud = moi.colonies[0].nodeId;
  G.commercialAccords.push(noeud);
  G.accordsParties = G.accordsParties || {};
  G.accordsParties[noeud] = [moi.civ.id, mars.civ.id];
  const cands = sb._evCommCandidats(moi).map(n => n.civ.id);
  note('candidats pour les terriens : ' + (cands.join(', ') || 'aucun'));
  if (!cands.includes('martiens')) ok('les martiens, déjà liés, ne sont plus proposés');
  else ko('les martiens restent candidats alors qu\'un accord existe déjà');
  /* CONTRE-ÉPREUVE : le filtre ne doit pas devenir trop large. Les jupitériens, qui n'ont rien
     signé avec nous, doivent rester proposables — c'était l'autre moitié du défaut. */
  if (cands.includes('jupiteriens')) ok('contre-épreuve : les jupitériens, non liés, restent candidats');
  else ko('contre-épreuve ÉCHOUÉE : le filtre écarte aussi des nations avec qui on n\'a rien signé');
  /* Et symétriquement, du point de vue martien. */
  const candsM = sb._evCommCandidats(mars).map(n => n.civ.id);
  if (!candsM.includes('terriens')) ok('symétrie : les terriens ne sont pas candidats pour les martiens');
  else ko('symétrie ÉCHOUÉE : le martien peut encore nous proposer un accord');
}

/* ── 4. Le journal ne raconte que MES revenus ──────────────────────────────── */
console.log('\n4. JOURNAL — les revenus des autres nations n\'apparaissent pas chez moi');
{
  const { sb, G, moi } = partie();
  /* On donne des accords à une IA, et aucun au joueur : si une ligne d'accord apparaît dans le
     journal, elle ne peut venir que d'elle. */
  const mars = par(G, 'martiens'), jup = par(G, 'jupiteriens');
  const n1 = mars.colonies[0].nodeId;
  G.commercialAccords.push(n1);
  G.accordsParties = G.accordsParties || {};
  G.accordsParties[n1] = [mars.civ.id, jup.civ.id];
  /* ⚠️ LE JOURNAL EMPILE À L'ENVERS : les lignes récentes sont en TÊTE, pas en queue. Mon premier
     jet lisait `slice(avant)` — c'est-à-dire les plus ANCIENNES — et concluait « 0 ligne écrite »
     alors que le moteur venait d'en écrire. On prend donc la tête, et on lit le champ `msg`. */
  const avant = (G.log || []).length;
  sb.doRevenues();
  const neuves = n => (G.log || []).slice(0, Math.max(0, (G.log || []).length - n));
  const lignes = neuves(avant).map(l => String((l && (l.msg || l.t || l.text)) || l));
  const fuite = lignes.filter(l => /Accord commercial/.test(l));
  note(lignes.length + ' ligne(s) écrites, dont ' + fuite.length + ' sur les accords');
  if (!fuite.length) ok('aucune ligne d\'accord : les revenus des rivales ne sont pas journalisés');
  else ko(fuite.length + ' ligne(s) d\'accord alors que le joueur n\'en a aucun : ' + fuite[0].slice(0, 70));

  /* CONTRE-ÉPREUVE : quand c'est MOI qui ai l'accord, la ligne doit bien s'afficher — sinon on
     aurait simplement éteint le journal, ce qui n'est pas le but. */
  const b = partie();
  const bm = par(b.G, 'martiens');
  const n2 = bm.colonies[0].nodeId;
  b.G.commercialAccords.push(n2);
  b.G.accordsParties = b.G.accordsParties || {};
  b.G.accordsParties[n2] = [b.moi.civ.id, bm.civ.id];
  const av2 = (b.G.log || []).length;
  b.sb.doRevenues();
  const l2 = (b.G.log || []).slice(0, Math.max(0, (b.G.log || []).length - av2))
    .map(l => String((l && (l.msg || l.t || l.text)) || l));
  if (l2.some(l => /Accord commercial/.test(l))) ok('contre-épreuve : mon propre accord est bien journalisé');
  else ko('contre-épreuve ÉCHOUÉE : plus aucune ligne d\'accord, même pour moi');
}

/* ── 4. RUPTURE DE COHABITATION : l'hôte perd sa colonie, le propriétaire garde la sienne ──
   Partie F04B (06/09) : le Jupitérien s'était posé sur Éris (capitale des Ceinturiens) par
   Exploration Extra-Solaire. À la guerre, c'est le CEINTURIEN qui a perdu Éris — sa capitale —
   et l'hôte est resté seul maître des lieux. */
console.log('\n4. COHABITATION — la guerre chasse l\'hôte, jamais le propriétaire (F04B)');
{
  const { sb, G, moi } = partie();
  const jup = par(G, 'jupiteriens');
  const home = moi.civ.home;
  jup.colonies.push({ nodeId: home, level: 1, connected: false, noUpgrade: true });
  note('hôte ' + jup.civ.id + ' posé sur ' + home + ' (capitale de ' + moi.civ.id + ')');
  const aMaCapitale = () => moi.colonies.some(c => c.nodeId === home);
  const hoteLa = () => jup.colonies.some(c => c.nodeId === home);
  if (!aMaCapitale()) ko('montage : la capitale n\'est pas dans mes colonies');
  // Cas A : c'est le PROPRIÉTAIRE qui déclare — l'ordre des deux tours de boucle fautif
  sb.declarerGuerre(moi, jup, 'test', 'player');
  note('après guerre déclarée par le propriétaire — capitale : ' + (aMaCapitale() ? 'gardée' : 'PERDUE') + ' · hôte : ' + (hoteLa() ? 'ENCORE LÀ' : 'chassé'));
  if (aMaCapitale()) ok('le propriétaire garde sa capitale'); else ko('le propriétaire a perdu sa capitale');
  if (!hoteLa()) ok('l\'hôte extra-solaire est chassé'); else ko('l\'hôte reste sur la capitale');
  // Cas B : c'est l'HÔTE qui déclare
  const b = partie();
  const bj = par(b.G, 'jupiteriens'); const bh = b.moi.civ.home;
  bj.colonies.push({ nodeId: bh, level: 1, connected: false, noUpgrade: true });
  b.sb.declarerGuerre(bj, b.moi, 'test', 'other');
  const bMoi = b.moi.colonies.some(c => c.nodeId === bh), bHote = bj.colonies.some(c => c.nodeId === bh);
  if (bMoi && !bHote) ok('idem quand c\'est l\'hôte qui déclare la guerre');
  else ko('hôte déclarant — capitale ' + (bMoi ? 'gardée' : 'PERDUE') + ', hôte ' + (bHote ? 'ENCORE LÀ' : 'chassé'));
  // Cas C : cohabitation sur une colonie ORDINAIRE — même règle, seul l'hôte tombe
  const c = partie();
  const cj = par(c.G, 'jupiteriens');
  const ordinaire = c.moi.colonies.find(x => x.nodeId !== c.moi.civ.home);
  if (!ordinaire) note('(pas de colonie ordinaire au départ — cas C sauté)');
  else {
    cj.colonies.push({ nodeId: ordinaire.nodeId, level: 1, connected: false, noUpgrade: true });
    c.sb.declarerGuerre(c.moi, cj, 'test', 'player');
    const cMoi = c.moi.colonies.some(x => x.nodeId === ordinaire.nodeId), cHote = cj.colonies.some(x => x.nodeId === ordinaire.nodeId);
    if (cMoi && !cHote) ok('colonie ordinaire partagée : seul l\'hôte tombe');
    else ko('colonie ordinaire — propriétaire ' + (cMoi ? 'gardé' : 'PERDU') + ', hôte ' + (cHote ? 'ENCORE LÀ' : 'chassé'));
  }
}

console.log('\n' + '═'.repeat(78));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Accords : rupture complète, aucun doublon entre deux mêmes nations,\n   et le journal ne montre que les revenus de la nation locale.');
console.log('═'.repeat(78));
