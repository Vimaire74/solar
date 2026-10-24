/* ============================================================================
   TEST — UN ACCORD N'ENGAGE QUE CEUX QUI L'ONT SIGNÉ
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie FDDD du 23/08 : « les jupitériens m'ont proposé un accord commercial que
   j'ai refusé, plus tard je vois quand je l'attaque : "attaquer et rompre l'accord" sur la colonie
   que j'attaque, or j'ai validé aucun accord. »

   IL AVAIT RAISON, ET VOICI LA CHAÎNE. Au tour 8, le sommet conclut un accord Martiens ↔
   Jupitériens. `_evAccordConclude` l'enregistre sur une colonie du partenaire hors capitale : pour
   les Jupitériens, dont la base est Io, cela tombe sur Titan. Or `G.commercialAccords` n'est qu'une
   LISTE DE NŒUDS — elle ne dit pas qui a signé. Le registre des signataires existe depuis le 14/08,
   mais il n'avait été branché que sur le calcul des revenus. La fenêtre de nœud, elle, faisait
   encore `G.commercialAccords.includes(nodeId)` : Titan y figurait, donc Marc voyait un accord qui
   ne le concernait pas.

   SEPT ENDROITS posaient la question de cette façon. Ce banc vérifie la règle sur chacun des cas
   observables, plus la notice de refus que le pilote avalait avant que le joueur ne la voie.

   ⚠️ LA CONTRE-ÉPREUVE EST INDISPENSABLE ICI. « Je n'ai pas d'accord » est une réponse qu'un code
   cassé peut donner par accident — il suffirait que le nœud ne soit pas dans la liste. On vérifie
   donc AUSSI, sur le même montage, que l'accord existe bel et bien et qu'il lie les deux AUTRES.

   Usage : node test_accords_signataires.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const TEMOIN = path.join(__dirname, 'temoin_v9.69', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Le cas de Marc : un accord entre les DEUX autres nations, sur une colonie de l'une d'elles. */
function montage(html) {
  const sb = loadLogic(html);
  sb.initGame('ceinturiens', ['terriens', 'martiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player;
  const mars = G.ais.find(a => a.civ.id === 'martiens');
  const jupi = G.ais.find(a => a.civ.id === 'jupiteriens');
  G.turn = 8; G.phase = 'actions'; moi._isAI = false;
  /* Titan : colonie jovienne, exactement comme dans la partie de Marc. */
  if (!jupi.colonies.some(c => c.nodeId === 'titan')) jupi.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  return { sb, G, moi, mars, jupi };
}

console.log('═'.repeat(80));
console.log('ACCORDS — « J\'AI VALIDÉ AUCUN ACCORD »');
console.log('═'.repeat(80) + '\n');

/* ── 1. Un accord entre deux autres nations ne me concerne pas ────────────── */
console.log('1. ACCORD MARTIENS ↔ JUPITÉRIENS SUR TITAN — que voit le Ceinturien ?');
{
  const m = montage(HTML);
  m.sb._evAccordConclude(m.mars, m.jupi);
  const dansLaListe = (m.G.commercialAccords || []).includes('titan');
  const pourMoi = m.sb.accordAvecMoi('titan', m.moi);
  const pourEux = m.sb.accordConcerne('titan', m.mars, m.jupi);
  note('titan dans la liste : ' + dansLaListe + ' · me concerne : ' + pourMoi + ' · lie Mars et Jupiter : ' + pourEux);
  /* CONTRE-ÉPREUVE D'ABORD : sans accord réellement posé, la suite ne prouverait rien. */
  if (dansLaListe && pourEux) ok('contre-épreuve : l\'accord existe bien, et il lie les deux autres');
  else ko('le montage n\'a pas produit d\'accord entre Mars et Jupiter — ce banc ne prouve rien');
  if (!pourMoi) ok('il ne me concerne pas — plus de « Rompre l\'accord & Attaquer » sur Titan');
  else ko('le jeu me croit encore lié par un accord que je n\'ai pas signé');
}

/* ── 2. CONTRE-ÉPREUVE — le moteur d'avant se trompait bien ───────────────── */
console.log('\n2. CONTRE-ÉPREUVE — le même montage sur le témoin figé v9.69');
{
  if (!fs.existsSync(TEMOIN)) ko('témoin introuvable');
  else {
    const m = montage(TEMOIN);
    m.sb._evAccordConclude(m.mars, m.jupi);
    /* Le témoin n'a pas `accordAvecMoi` : on rejoue EXACTEMENT le test qu'il faisait. */
    const ceQuIlVoyait = (m.G.commercialAccords || []).includes('titan');
    note('critère de l\'époque (`commercialAccords.includes`) : ' + ceQuIlVoyait);
    if (ceQuIlVoyait) ok('l\'ancien moteur concluait « accord actif » — le défaut de Marc est reproduit');
    else ko('le témoin ne voyait pas d\'accord non plus : ce banc ne mesure pas le bon défaut');
  }
}

/* ── 3. Mon propre accord, lui, doit compter ──────────────────────────────── */
console.log('\n3. MON ACCORD À MOI — il doit être reconnu');
{
  const m = montage(HTML);
  m.sb._evAccordConclude(m.moi, m.jupi);
  const n = (m.G.commercialAccords || [])[0];
  note('accord posé sur : ' + n);
  if (n && m.sb.accordAvecMoi(n, m.moi)) ok('un accord que j\'ai signé me concerne bien');
  else ko('mon propre accord n\'est pas reconnu — la correction a coupé trop large');
  if (n && !m.sb.accordAvecMoi(n, m.mars)) ok('et il ne concerne pas le Martien, resté à l\'écart');
  else ko('le Martien est considéré comme partie à un accord qu\'il n\'a pas signé');
}

/* ── 4. Le sommet ne doit plus me retirer un partenaire libre ─────────────── */
console.log('\n4. SOMMET COMMERCIAL — un partenaire lié à un TIERS reste proposable');
{
  /* Le filtre des candidats écartait toute nation ayant un accord, avec qui que ce soit : un
     partenaire parfaitement libre à mon égard disparaissait de ma liste. */
  const m = montage(HTML);
  m.sb._evAccordConclude(m.mars, m.jupi);
  const libre = m.sb.accordEntre(m.moi, m.jupi);
  if (!libre) ok('les Jupitériens restent libres vis-à-vis de moi malgré leur accord avec Mars');
  else ko('le jeu me croit déjà lié aux Jupitériens');
  m.sb._evAccordConclude(m.moi, m.jupi);
  if (m.sb.accordEntre(m.moi, m.jupi)) ok('contre-épreuve : une fois signé avec eux, le lien est vu');
  else ko('contre-épreuve ÉCHOUÉE : mon accord avec les Jupitériens n\'est pas détecté');
}

/* ── 5. La notice de refus doit atteindre le joueur ───────────────────────── */
console.log('\n5. « ILS ONT REFUSÉ » — la notice ne doit plus être avalée par le pilote');
{
  /* Marc : « j'ai fait un accord avec le Terrien et j'ai pas vu si ils ont accepté ou pas. » Le
     journal disait qu'ils avaient refusé ; la notice, elle, était acquittée par `driver.js` avant
     d'être distribuée, parce qu'`accord_result` ne figurait pas parmi les notices BLOQUANTES. */
  const { GameDriver } = require('./driver.js');
  const faux = { sb: { __G: { phase: 'actions', turn: 5, maxTurns: 10 } } };
  faux._isBlockingNotice = GameDriver.prototype._isBlockingNotice.bind(faux);
  faux._isNotice = GameDriver.prototype._isNotice.bind(faux);
  const cas = [
    ['accord_result', true, 'le résultat de MA proposition d\'accord'],
    ['raid_result', true, 'le butin de MON raid'],
    ['event_announce', true, 'l\'annonce d\'événement'],
  ];
  for (const [kind, doitBloquer, quoi] of cas) {
    const p = { kind, notice: true, nation: 'ceinturiens' };
    const avale = faux._isNotice(p);
    if (avale !== doitBloquer) ok(quoi + ' → le joueur la reçoit');
    else ko(quoi + ' → toujours acquittée par le pilote, le joueur ne la voit jamais');
  }
  /* CONTRE-ÉPREUVE : une vraie information de fond doit RESTER acquittée automatiquement, sinon on
     impose un clic à chaque ligne de journal et le jeu devient injouable. */
  const fond = { kind: 'strategy_calm', notice: true, nation: 'ceinturiens' };
  if (faux._isNotice(fond)) ok('contre-épreuve : une notice de fond reste acquittée sans clic');
  else ko('contre-épreuve ÉCHOUÉE : tout est devenu bloquant, le joueur va cliquer sans arrêt');
}

/* ── 6. Le message de capture ne parle plus d'un « accord forcé » ─────────── */
console.log('\n6. CAPTURE — le message doit nommer le vrai accord');
{
  const m = montage(HTML);
  m.sb._evAccordConclude(m.mars, m.jupi);
  const avant = (m.G.log || []).length;
  try { m.sb.capturerNoeud(m.moi, 'titan'); } catch (e) { note('exception : ' + e.message); }
  const lignes = (m.G.log || []).slice(0, Math.max(0, (m.G.log || []).length - avant))
    .map(l => String((l && l.msg) || l));
  const ligne = lignes.find(t => /accord/i.test(t)) || '(aucune ligne sur l\'accord)';
  note(ligne);
  if (/accord forcé tombe avec la cohabitation/.test(ligne))
    ko('le message invoque toujours la cohabitation extra-solaire, qui n\'a rien à voir');
  else if (/Martiens/.test(ligne) && /Jupit/.test(ligne))
    ok('le message nomme les deux signataires réels');
  else ko('message inattendu : ' + ligne);
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ Un accord n\'engage que ses signataires, et le joueur est informé des réponses');
console.log('  à ses propres propositions.');
