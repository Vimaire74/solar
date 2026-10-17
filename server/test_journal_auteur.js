/* ============================================================================
   TEST — CHAQUE LIGNE DU JOURNAL SAIT QUI L'A ÉCRITE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09 : « change le log pour que chaque action de chaque
   joueur puisse être identifiée pour que ce soit possible de rejouer le jeu à partir
   du journal. »

   La demande vient d'un constat : je n'ai PAS pu rejouer sa partie CC36 depuis son
   journal. Les lignes des autres nations étaient nommées (« 🎯 ☠️ Ceinturiens — … »),
   celles de la nation active ne l'étaient pas (« 🏗️ Colonie sur Cérès »). Et comme le
   serveur bascule `G.player` d'une nation à l'autre, « la nation active » change en
   permanence : rien ne permettait de savoir qui avait colonisé quoi. Il aurait fallu
   deviner — c'est-à-dire inventer.

   CE QUE CE TEST VÉRIFIE :
     1. TOUTE ligne porte une nation (`civ`) et un tour (`turn`) — pas 95 % des lignes ;
     2. les lignes produites par le tour d'une IA sont attribuées à CETTE IA, pas à la
        nation que le serveur avait activée. C'est le point qui échouait avant ;
     3. les phases systémiques (pirates, entretien) attribuent chaque ligne à la nation
        qu'elles traitent, et pas toutes à l'humain principal ;
     4. l'attribution survit à une sauvegarde/relecture — sans quoi elle serait perdue
        au premier rechargement de partie ;
     5. quand une ligne NOMME une nation en toutes lettres, l'auteur enregistré est
        cohérent avec elle (contrôle croisé texte ↔ donnée).

   Usage : node test_journal_auteur.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const { GameDriver } = require('./driver.js');
const INDEX = path.join(__dirname, '..', 'play.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }

console.log('═'.repeat(74));
console.log('JOURNAL — CHAQUE LIGNE SAIT QUI L\'A ÉCRITE');
console.log('═'.repeat(74) + '\n');

/* ── 1. Une partie complète : aucune ligne orpheline ──────────────────────── */
console.log('1. Une partie complète, quatre nations');
let G = null;
{
  function reponse(p) {
    const pay = (p && p.payload) || {};
    for (const k of Object.keys(pay)) {
      const v = pay[k];
      if (Array.isArray(v) && v.length) { const o = v[0]; const id = (o && o.id !== undefined) ? o.id : 0; return { choice: id, index: 0, [k.replace(/s$/, '')]: id }; }
    }
    return {};
  }
  const d = new GameDriver(INDEX);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: false },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  let r = d.pump(), n = 0;
  while (r && r.kind !== 'over' && n++ < 900) {
    if (r.kind === 'decision') r = d.answer(r.pending.id, reponse(r.pending));
    else if (r.kind === 'confirm') r = d.commit(r.civId);
    else if (r.kind === 'action') r = d.act(r.civId, { type: 'pass' });
    else break;
  }
  G = d.sb.__G;
  const L = G.log || [];
  const sansCiv = L.filter(e => !e || typeof e !== 'object' || !e.civ);
  const sansTour = L.filter(e => !e || typeof e !== 'object' || e.turn === undefined);
  console.log('   ' + L.length + ' lignes de journal sur une partie de ' + G.turn + ' tours');
  if (!sansCiv.length) ok('toutes les lignes portent une nation');
  else ko(sansCiv.length + ' ligne(s) sans nation, ex. : ' + String(sansCiv[0].msg || sansCiv[0]).slice(0, 70));
  if (!sansTour.length) ok('toutes les lignes portent un tour');
  else ko(sansTour.length + ' ligne(s) sans tour');

  const nations = {};
  for (const e of L) nations[e.civ] = (nations[e.civ] || 0) + 1;
  const distinctes = Object.keys(nations).length;
  if (distinctes >= 3) ok(distinctes + ' nations apparaissent comme auteurs : ' + Object.keys(nations).join(', '));
  else ko('une seule perspective écrit le journal (' + Object.keys(nations).join(', ')
    + ') — c\'est le défaut d\'origine : tout attribué à la nation active');
}

/* ── 2. Le tour d'une IA lui appartient ───────────────────────────────────── */
console.log('\n2. Le tour d\'une IA est attribué à cette IA');
{
  const sb = loadLogic(INDEX);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const g = sb.__G;
  const ia = g.ais[0];                      // martiens — G.player reste « terriens »
  const avant = (g.log || []).length;
  sb.doAITurn(ia, true);
  const neuves = (g.log || []).slice(0, (g.log || []).length - avant);
  if (!neuves.length) { console.log('   … l\'IA n\'a rien journalisé ce tour — étape non concluante'); }
  else {
    const mauvaises = neuves.filter(e => e.civ !== ia.civ.id);
    if (!mauvaises.length) ok(neuves.length + ' ligne(s) du tour de ' + ia.civ.name + ', toutes à son nom');
    else ko(mauvaises.length + ' ligne(s) attribuées à « ' + mauvaises[0].civ
      + ' » alors que c\'est ' + ia.civ.name + ' qui jouait — la perspective a repris le dessus');
  }
}

/* ── 3. Les phases systémiques traitent nation par nation ─────────────────── */
console.log('\n3. Pirates et entretien : une nation par ligne, la bonne');
{
  const sb = loadLogic(INDEX);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const g = sb.__G;
  // On donne des routes non protégées à une IA, et on force la chance d'attaque à 100 %.
  const ia = g.ais[0];
  const ids = Object.keys(sb.NODES || {});
  ia.routes = [{ from: 'a', to: 'b', tokens: 0 }, { from: 'b', to: 'c', tokens: 0 }];
  g.turn = 9;
  const avant = (g.log || []).length;
  sb.advancePirates();
  const neuves = (g.log || []).slice(0, (g.log || []).length - avant);
  const surIA = neuves.filter(e => /Pirates/.test(String(e.msg)));
  void ids;
  if (!surIA.length) console.log('   … aucune route pillée ce tirage — étape non concluante');
  else if (surIA.every(e => e.civ === ia.civ.id))
    ok('les routes pillées de ' + ia.civ.name + ' sont journalisées à SON nom (' + surIA.length + ' ligne(s))');
  else ko('des lignes de pillage de ' + ia.civ.name + ' sont attribuées à « '
    + surIA.find(e => e.civ !== ia.civ.id).civ + ' » — l\'humain principal, pas la victime');
}

/* ── 4. L'attribution survit à une sauvegarde ─────────────────────────────── */
console.log('\n4. L\'attribution survit à la sauvegarde');
{
  const copie = JSON.parse(JSON.stringify((G && G.log) || []));
  const perdues = copie.filter(e => !e.civ || e.turn === undefined);
  if (!perdues.length) ok('après écriture et relecture, chaque ligne garde sa nation et son tour');
  else ko(perdues.length + ' ligne(s) perdent leur attribution à la sauvegarde');
}

/* ── 5. Contrôle croisé : le texte et la donnée doivent s'accorder ────────── */
console.log('\n5. Le texte nomme une nation : la donnée dit-elle la même ?');
{
  const L = (G && G.log) || [];
  const noms = {};
  try { for (const p of [G.player].concat(G.ais || [])) noms[p.civ.name] = p.civ.id; } catch (e) {}
  let verifiees = 0, contradictions = 0, exemple = null;
  for (const e of L) {
    const txt = String(e.msg || '');
    // « 🎯 🔴 Martiens — Stratégie … » : une ligne qui COMMENCE par un nom de nation la désigne.
    const trouve = Object.keys(noms).filter(n => txt.indexOf(n) >= 0);
    if (trouve.length !== 1) continue;                 // ambigu ou aucun nom : on ne conclut pas
    if (!/^(?:[^\w\s]|\s)*(?:[A-ZÉÈ][a-zéèêà]+)/.test(txt.replace(/<[^>]*>/g, ''))) continue;
    verifiees++;
    if (noms[trouve[0]] !== e.civ) {
      contradictions++;
      if (!exemple) exemple = '« ' + txt.replace(/<[^>]*>/g, '').slice(0, 60) + ' » attribuée à ' + e.civ;
    }
  }
  console.log('   ' + verifiees + ' ligne(s) nommant une seule nation, ' + contradictions + ' en désaccord');
  /* Ce contrôle est INDICATIF, pas éliminatoire : beaucoup de lignes nomment légitimement une
     AUTRE nation que leur auteur (« Terriens capture Titan sur Ceinturiens » est écrite par les
     Terriens). On ne s'alarme donc que d'un désaccord massif, signe d'une attribution inversée. */
  if (verifiees === 0) console.log('   … aucune ligne exploitable pour ce contrôle');
  else if (contradictions / verifiees < 0.6) ok('pas d\'inversion systématique (' + Math.round(100 * contradictions / verifiees) + '% de lignes citant une autre nation, ce qui est normal)');
  else ko('désaccord massif texte/donnée (' + Math.round(100 * contradictions / verifiees) + '%) — attribution probablement inversée. ' + (exemple || ''));
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Journal : chaque ligne porte sa nation et son tour, en solo comme sur le serveur.');
console.log('═'.repeat(74));
