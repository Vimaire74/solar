/* ============================================================================
   TEST — LE PACTE DOIT LIER, L'ACCORD NE SE SIGNE QU'UNE FOIS, ET CHACUN VOIT LA RÉPONSE
   ----------------------------------------------------------------------------
   POURQUOI. Partie 792D, Marc, 26/08 :
     · « Accord diplomatique pas respecté, j'ai pu attaquer le jupitérien. »
     · « J'ai pas vu qu'il l'a refusé, il faut que les nations voient la réponse ! »
     · « L'accord commercial ne marche pas non plus dans ce sens : je propose mon accord et je ne
        vois pas sa réponse, et lui non plus. Si je le propose et qu'il le propose, alors on devrait
        juste voir accord signé entre les deux nations, point. »

   TROIS DÉFAUTS, TROUVÉS EN RELISANT SON RAPPORT DE FIN DE PARTIE.

   1. LE PACTE DE NON-AGRESSION NE SERVAIT À RIEN. `G._nonAgg` était écrit à deux endroits et lu
      NULLE PART dans le jeu — seul un banc le consultait. Aucun contrôle avant un assaut, un raid
      ou une déclaration de guerre. On payait 6🪨 pour une ligne de journal.
      Et il était indexé par la SEULE nation visée : un pacte l'aurait protégée de tout le monde.

   2. L'ACCORD COMMERCIAL A ÉTÉ SIGNÉ DEUX FOIS. Au sommet simultané, chaque nation choisit dans une
      liste de candidats calculée AVANT que les réponses n'arrivent. Terriens et Ceinturiens se sont
      choisis mutuellement : deux lignes « accord conclu », +6 VP au lieu de +3 de chaque côté, et
      un revenu doublé pendant six tours. C'est le rapport détaillé qui l'a rendu visible, en
      affichant deux fois la même ligne.

   3. PERSONNE NE VOYAIT LES RÉPONSES. Refus de pacte, accord signé : tout restait au journal, qui
      défile — et en ligne chacun ne lit que le sien.

   ⚠️ CHAQUE CAS PORTE SA CONTRE-ÉPREUVE. Un pacte qui interdit TOUT serait aussi faux qu'un pacte
   qui n'interdit rien : on vérifie donc qu'en dehors du couple lié, et une fois le pacte expiré,
   l'agression redevient possible.

   Usage : node test_pacte_et_accords.js
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

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) {
    n.routes = []; n.forceCooldown = []; n._attacksThisTurn = 0;
    n.res.materials = 20; n.res.energy = 20; n.res.science = 10; n.res.morale = 8;
    n.forceTokens = 8; n.acLeft = 5;
  }
  sb.setDecisionSink(() => {});
  return { sb, G, moi: G.player, A: G.ais[0], B: G.ais[1], C: G.ais[2] };
}
const journal = G => (G.log || []).map(l => String((l && (l.msg || l.t)) || l));

console.log('═'.repeat(80));
console.log('PACTE DE NON-AGRESSION ET ACCORDS — LIER, SIGNER UNE FOIS, RÉPONDRE');
console.log('═'.repeat(80) + '\n');

/* ── 1. LE PACTE INTERDIT L'AGRESSION ─────────────────────────────────────── */
console.log('1. Sous pacte : ni guerre, ni assaut, ni raid');
{
  const m = partie();
  m.sb.poserPacte(m.moi, m.A, 4);
  const t = m.sb.pacteEntre(m.moi, m.A);
  note('pacte posé au tour ' + m.G.turn + ' → expire au tour ' + t);
  if (t) ok('le pacte est enregistré, et par COUPLE');
  else ko('aucun pacte enregistré');

  const guerre = m.sb.declarerGuerre(m.moi, m.A, 'banc — tentative sous pacte', 'player');
  if (!guerre && !m.sb._warBetween(m.moi.civ.id, m.A.civ.id)) ok('la déclaration de guerre est refusée');
  else ko('la guerre a été déclarée malgré le pacte — c\'est le défaut de la partie 792D');

  const colA = m.A.colonies.find(c => c.nodeId !== m.A.civ.home) || m.A.colonies[0];
  const avantCol = m.A.colonies.length;
  try { m.sb.attackColony(colA.nodeId, m.moi); } catch (e) { note('(fenêtre absente hors navigateur)'); }
  if (m.A.colonies.length === avantCol && !m.sb._warBetween(m.moi.civ.id, m.A.civ.id))
    ok('l\'assaut est refusé');
  else ko('l\'assaut a eu lieu malgré le pacte');

  const avantRes = (m.A.res.energy || 0) + (m.A.res.materials || 0);
  m.sb.doRaidTarget(m.A.civ.id, null, m.moi);
  if ((m.A.res.energy || 0) + (m.A.res.materials || 0) === avantRes) ok('le raid est refusé');
  else ko('le raid a eu lieu malgré le pacte');

  const j = journal(m.G);
  if (j.some(x => /Pacte de non-agression en vigueur/.test(x))) ok('et le refus est EXPLIQUÉ au journal');
  else ko('le refus est silencieux — un bouton qui ne fait rien est pire qu\'un refus');
}

/* ── 2. CONTRE-ÉPREUVE — le pacte ne lie QUE ses deux signataires ──────────── */
console.log('\n2. CONTRE-ÉPREUVE — une nation tierce reste attaquable');
{
  /* Le risque exact de l'ancienne forme : `G._nonAgg` était indexé par la seule nation visée, donc
     un pacte l'aurait protégée de TOUT LE MONDE. On vérifie que le pacte est bien une relation. */
  const m = partie();
  m.sb.poserPacte(m.moi, m.A, 4);
  if (!m.sb.pacteEntre(m.moi, m.B)) ok('aucun pacte avec la nation tierce');
  else ko('le pacte déborde sur une nation qui ne l\'a pas signé');
  if (!m.sb.pacteEntre(m.A, m.B)) ok('ni entre les deux autres');
  else ko('le pacte lie des nations qui n\'ont rien signé');
  const guerre = m.sb.declarerGuerre(m.moi, m.B, 'banc — nation non liée', 'player');
  if (guerre || m.sb._warBetween(m.moi.civ.id, m.B.civ.id)) ok('et la guerre reste possible contre elle');
  else ko('la guerre est bloquée contre une nation non liée — le pacte protège trop');
}

/* ── 3. CONTRE-ÉPREUVE — le pacte EXPIRE ──────────────────────────────────── */
console.log('\n3. CONTRE-ÉPREUVE — passé quatre tours, tout redevient possible');
{
  const m = partie();
  m.sb.poserPacte(m.moi, m.A, 4);
  const fin = m.sb.pacteEntre(m.moi, m.A);
  m.G.turn = fin + 1;
  note('tour courant ' + m.G.turn + ' · le pacte expirait au tour ' + fin);
  if (!m.sb.pacteEntre(m.moi, m.A)) ok('le pacte est expiré');
  else ko('le pacte survit à son terme');
  const guerre = m.sb.declarerGuerre(m.moi, m.A, 'banc — après expiration', 'player');
  if (guerre || m.sb._warBetween(m.moi.civ.id, m.A.civ.id)) ok('et la guerre redevient possible');
  else ko('la guerre reste bloquée après l\'expiration');
}

/* ── 3bis. CONTRE-ÉPREUVE — un ACCORD ne doit PAS empêcher la conquête ─────── */
console.log('\n3bis. CONTRE-ÉPREUVE — un accord se rompt ; seul le pacte lie');
{
  /* ⚠️ CETTE CONTRE-ÉPREUVE MANQUAIT, ET C'EST POURQUOI LE DÉFAUT A VÉCU. Le banc vérifiait qu'un
     PACTE bloque l'agression ; il ne vérifiait nulle part qu'un ACCORD ne la bloque PAS. Marc,
     27/08 : « accord commercial bloque maintenant la conquête ».
     Reproduit : avec un accord posé sur la colonie d'un HUMAIN, « Rompre l'accord & Attaquer »
     était un CLIC MORT — 0 AC dépensé, aucune guerre, et « cette colonie n'appartient à aucune
     nation ». `breakAccordAndAttack` cherchait le défenseur avec `getNodeOwnerAI`, qui rend `null`
     dès que le propriétaire est humain. Défaut #77 du 23/08, corrigé alors dans `attackColony` et
     jamais reporté sur ce second chemin.
     ⚠️ ON ÉPROUVE LES DEUX NATURES DE DÉFENSEUR — IA et HUMAIN. Avec une IA seule, le défaut reste
     invisible : c'est précisément ce qui l'a laissé passer. */
  for (const humain of [false, true]) {
    const m = partie();
    const cible = m.A;
    cible._isAI = !humain;
    const col = cible.colonies[0];
    m.sb._accordEnregistrer(col.nodeId, m.moi, cible);
    const acAvant = m.moi.acLeft;
    try { m.sb.breakAccordAndAttack(col.nodeId); } catch (e) { ko('défenseur ' + (humain ? 'HUMAIN' : 'IA') + ' : jette — ' + e.message); continue; }
    const enGuerre = !!m.sb._warBetween(m.moi.civ.id, cible.civ.id);
    const paye = acAvant - m.moi.acLeft;
    note('défenseur ' + (humain ? 'HUMAIN ' : 'IA     ') + ' → guerre : ' + enGuerre + ' · AC dépensé : ' + paye);
    if (enGuerre && paye === 1) ok('l\'assaut part et coûte son AC (défenseur ' + (humain ? 'humain' : 'IA') + ')');
    else ko('défenseur ' + (humain ? 'humain' : 'IA') + ' : clic mort — guerre ' + enGuerre + ', ' + paye + ' AC');
    if (!(m.G.commercialAccords || []).length) ok('   et l\'accord est révoqué par la guerre');
    else ko('l\'accord survit à la guerre qu\'il était censé céder');
  }
  /* Et l'assaut ORDINAIRE, sur une nation avec qui on a un accord ailleurs, doit passer aussi. */
  const m2 = partie();
  m2.sb._accordEnregistrer(m2.A.colonies[0].nodeId, m2.moi, m2.A);
  m2.sb.attackColony(m2.A.colonies[0].nodeId, m2.moi);
  if (m2.sb._warBetween(m2.moi.civ.id, m2.A.civ.id)) ok('et `attackColony` n\'est pas bloquée non plus par un accord');
  else ko('`attackColony` refuse d\'attaquer une nation liée par un simple accord');
}

/* ── 4. L'ACCORD NE SE SIGNE QU'UNE FOIS ──────────────────────────────────── */
console.log('\n4. Deux nations qui se proposent l\'accord l\'une à l\'autre n\'en signent qu\'UN');
{
  const m = partie();
  const a = m.moi, b = m.A;
  const vpA = m.sb.calcVP(a).evtVP, vpB = m.sb.calcVP(b).evtVP;
  m.sb._evAccordConclude(a, b);          // il me le propose, j'accepte
  m.sb._evAccordConclude(b, a);          // …et je le lui proposais aussi
  const apresA = m.sb.calcVP(a), apresB = m.sb.calcVP(b);
  const gainA = apresA.evtVP - vpA, gainB = apresB.evtVP - vpB;
  note('VP d\'événement gagnés — ' + a.civ.name + ' : +' + gainA + ' · ' + b.civ.name + ' : +' + gainB);
  for (const l of (apresA.det.evt || [])) note('   ' + l);
  if (gainA === 3 && gainB === 3) ok('+3 VP une seule fois de chaque côté');
  else ko('+' + gainA + ' / +' + gainB + ' VP : l\'accord a été compté deux fois (défaut 792D)');
  const lignes = (apresA.det.evt || []).filter(x => /Accord commercial/.test(x));
  if (lignes.length === 1) ok('et le rapport n\'affiche qu\'une seule ligne d\'accord');
  else ko(lignes.length + ' lignes d\'accord dans le rapport');
  const j = journal(m.G);
  const conclus = j.filter(x => /Accord commercial conclu/.test(x));
  note('lignes « accord conclu » au journal : ' + conclus.length);
  if (conclus.length === 1) ok('une seule annonce au journal');
  else ko(conclus.length + ' annonces — « on devrait juste voir accord signé entre les deux nations, point »');
}

/* ── 5. CONTRE-ÉPREUVE — deux couples différents signent bien deux accords ── */
console.log('\n5. CONTRE-ÉPREUVE — la garde ne bloque pas les accords entre AUTRES nations');
{
  /* Réparer un doublon en interdisant le second accord tout court serait pire que le défaut. */
  const m = partie();
  m.sb._evAccordConclude(m.moi, m.A);
  m.sb._evAccordConclude(m.moi, m.B);
  const v = m.sb.calcVP(m.moi);
  const lignes = (v.det.evt || []).filter(x => /Accord commercial/.test(x));
  note('accords de ' + m.moi.civ.name + ' : ' + lignes.length);
  if (lignes.length === 2) ok('deux accords avec deux nations différentes : les deux comptent');
  else ko(lignes.length + ' accord(s) au lieu de 2 — la garde bloque des accords légitimes');
}

/* ── 5bis. LE MÊME COUPLE, PAR N'IMPORTE QUEL CHEMIN, N'A QU'UN ACCORD ────── */
console.log('\n5bis. UN SEUL accord par couple — quel que soit le chemin emprunté');
{
  /* ⚠️ CE BLOC EXISTE PARCE QUE LE BANC PRÉCÉDENT A LAISSÉ PASSER LE DÉFAUT.
     Le 26/08 j'ai corrigé le doublon d'accords en gardant `_evAccordConclude` — le chemin du
     SOMMET — et le §4 ci-dessus est resté vert. Or un accord n'est pas enregistré entre deux
     NATIONS mais sur un NŒUD, et QUATRE fonctions en créent : le sommet, un second chemin
     événementiel, l'action « Accord Commercial » sur un nœud, et la cohabitation extra-solaire.
     Trois d'entre elles ne contrôlaient rien. Signer avec le même voisin sur trois de ses colonies
     donnait trois accords, donc +3🪨 +3🙂/tour.

     Marc l'a vu d'un coup d'œil dans un relevé de moral, le 27/08 : « tu m'expliques accords
     commerciaux ×5 à 4 nations ? » — à quatre nations, on ne peut avoir que trois partenaires.
     Sa réaction sur le fond : « on a déjà corrigé ça !!!! »

     LA LEÇON EST SUR LE BANC AUTANT QUE SUR LE CODE : un banc qui n'éprouve qu'un seul chemin
     certifie un seul chemin. On passe donc ici par le POINT DE PASSAGE OBLIGÉ, `_accordEnregistrer`,
     celui que toute création d'accord doit franchir — présente ou future. */
  const m = partie();
  const a = m.moi, b = m.A;
  /* ⚠️ TROIS NŒUDS RÉELLEMENT DIFFÉRENTS. Ma première version prenait les colonies de la nation
     visée ; elle n'en avait qu'une, et le banc tentait donc deux fois « phobos ». La liste
     `commercialAccords` dédoublonne déjà les nœuds identiques (`includes`), si bien que
     l'assertion restait verte MÊME SANS LA GARDE — attrapé en la retirant volontairement.
     Un scénario qui ne peut pas produire le défaut ne prouve pas son absence. */
  const noeuds = ['ceres', 'vesta', b.civ.home].filter((x, i, t) => t.indexOf(x) === i);
  m.sb._accordEnregistrer(noeuds[0], a, b);
  m.sb._accordEnregistrer(noeuds[1], a, b);   // AUTRE nœud, MÊME couple
  m.sb._accordEnregistrer(noeuds[2], b, a);   // et dans l'autre sens
  const mes = m.sb.accordsDe(a);
  const avecB = mes.filter(nid => (m.G.accordsParties[nid] || []).includes(b.civ.id));
  note('nœuds tentés (tous distincts) : ' + noeuds.join(', '));
  note('accords retenus entre les deux nations : ' + avecB.length);
  if (avecB.length === 1) ok('un seul accord subsiste, quel que soit le nombre de nœuds tentés');
  else ko(avecB.length + ' accords entre les deux mêmes nations — le doublon est de retour');

  /* La garde doit VIVRE DANS `_accordEnregistrer`, pas chez ses appelants : c'est la seule forme
     dont un chemin ajouté demain héritera sans rien avoir à savoir. On le vérifie en appelant le
     point de passage NU, sans passer par aucune des quatre fonctions métier. */
  const avant = (m.G.commercialAccords || []).length;
  m.sb._accordEnregistrer('pluto', a, b);
  if ((m.G.commercialAccords || []).length === avant)
    ok('et la garde est DANS le point de passage — un chemin futur en héritera');
  else ko('la garde n\'est pas dans `_accordEnregistrer` : le prochain chemin ajouté la contournera');

  /* CONTRE-ÉPREUVE : la garde ne doit pas empêcher un PREMIER accord avec une autre nation. */
  const n3 = m.sb._accordEnregistrer(m.B.colonies[0].nodeId, a, m.B);
  const avecC = m.sb.accordsDe(a).filter(nid => (m.G.accordsParties[nid] || []).includes(m.B.civ.id));
  if (n3 && avecC.length === 1) ok('un premier accord avec une TROISIÈME nation passe toujours');
  else ko('la garde bloque un accord légitime avec une autre nation');
}

/* ── 5ter. ON REFUSE AVANT DE FAIRE PAYER ─────────────────────────────────── */
console.log('\n5ter. Le doublon est refusé AVANT que le proposant ne dépense');
{
  /* La garde de `_accordEnregistrer` suffit à protéger la RÈGLE — mais en silence, après que le
     proposant a dépensé 1 AC et donné 2🪨 à l'autre nation. `accordAcceptable` refuse en amont et
     dit pourquoi. Les deux gardes ne font pas double emploi : l'une protège la règle, l'autre le
     joueur. */
  const m = partie();
  const a = m.moi, b = m.A;
  const avant = m.sb.accordAcceptable(b, a);
  if (avant.ok) ok('sans accord préalable, la proposition est recevable');
  else ko('proposition refusée alors qu\'aucun accord n\'existe : ' + avant.raison);
  m.sb._accordEnregistrer(b.colonies[0].nodeId, a, b);
  const apres = m.sb.accordAcceptable(b, a);
  note('avis après signature : ' + (apres.ok ? 'recevable' : apres.raison));
  if (!apres.ok && /accord/i.test(apres.raison)) ok('une fois liées, une nouvelle proposition est refusée, avec son motif');
  else ko('la seconde proposition reste recevable — le joueur paierait 1 AC et 2🪨 pour rien');
}

/* ── 6. LES DEUX SIGNATAIRES VOIENT LE RÉSULTAT ───────────────────────────── */
console.log('\n6. L\'accord signé est notifié aux DEUX nations');
{
  const m = partie();
  /* Les deux nations sont humaines : chacune doit recevoir sa fenêtre. En solo une seule est
     devant l'écran, mais la notice part pour les deux — c'est ce que le multijoueur exige. */
  m.moi._isAI = false; m.A._isAI = false;
  const vues = [];
  m.sb.setDecisionSink(q => { if (q && q.kind) vues.push((q.civId || '?') + ':' + q.kind); });
  m.sb._evAccordConclude(m.moi, m.A);
  note('fenêtres émises : ' + (vues.join(', ') || 'aucune'));
  if (vues.length >= 2) ok('les deux signataires reçoivent une fenêtre');
  else ko(vues.length + ' fenêtre(s) : « je propose mon accord et je ne vois pas sa réponse, et lui non plus »');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le pacte lie ses deux signataires et rien qu\'eux, il expire, il interdit guerre,');
console.log('   assaut et raid ; l\'accord ne se signe qu\'une fois et les deux camps le voient.');
console.log('═'.repeat(80));
