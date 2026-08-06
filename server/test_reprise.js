/* ============================================================================
   TEST — UNE PARTIE SAUVEGARDÉE PENDANT UNE QUESTION REPART-ELLE ?
   ----------------------------------------------------------------------------
   C'est LA mesure de la migration vers la machine à états. Pas une impression :
   on sauvegarde une partie au milieu d'une question, on la restaure dans un moteur
   NEUF, et on regarde si elle va jusqu'au bout.

   Pourquoi ça n'était pas possible avant : chaque question posée mettait sa suite
   de côté sous forme de FONCTION (`_pendingDecisions[id] = {cb, adapt}`). JSON
   n'écrit pas de fonctions. L'état revenait parfait, et la partie s'arrêtait sur
   la première question, sa suite envolée — sans message, ce qui était le pire.

   Ce test balaie les familles de questions une par une et dit, pour chacune, si
   le flux correspondant est migré. La colonne « dette » compte les questions en
   attente qui reposent ENCORE sur une fonction : l'objectif est zéro partout.

   Usage : node test_reprise.js
   ========================================================================== */
'use strict';
const path = require('path');
const { GameDriver } = require('./driver.js');

const HTML = process.env.GAME_HTML || path.join(__dirname, '..', 'index.html');
const SIEGES = [
  { civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: false },
  { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }
];

/* Les familles de questions, par flux. On s'arrête à la PREMIÈRE rencontrée de la
   famille visée, on sauvegarde là, et on tente la reprise. */
const FAMILLES = [
  { nom: 'GUERRE',       motif: /peace_offer|war_combat|defense|war_result/ },
  { nom: 'ÉVÉNEMENTS',   motif: /event_announce|event_result|event_comm|event_diplo|accord_/ },
  { nom: 'FIN DE TOUR',  motif: /^eot$/ },
  { nom: 'AGENDA / STRATÉGIE', motif: /agenda|strategy/ },
  { nom: 'INVESTISSEMENTS',    motif: /invest/ }
];

function reponse(p) {
  const pay = (p && p.payload) || {};
  for (const k of Object.keys(pay)) {
    const v = pay[k];
    if (Array.isArray(v) && v.length) { const o = v[0]; const id = (o && o.id !== undefined) ? o.id : 0; return { choice: id, index: 0, [k.replace(/s$/, '')]: id }; }
  }
  return {};
}

/* Joue jusqu'à rencontrer une question de la famille visée. */
function jusqua(motif) {
  const d = new GameDriver(HTML);
  d.boot(SIEGES, () => {});
  let r = d.pump(), n = 0;
  while (r && r.kind !== 'over' && n++ < 500) {
    if (r.kind === 'decision') {
      if (motif.test(r.pending.kind)) return { d, arret: r };
      r = d.answer(r.pending.id, reponse(r.pending));
    } else if (r.kind === 'action') r = d.act(r.civId, { type: 'pass' });
    else if (r.kind === 'confirm') r = d.commit(r.civId);
    else break;
  }
  return { d, arret: null };
}

/* Restaure dans un moteur neuf et joue jusqu'au bout. */
function repartDe(texte) {
  const d2 = new GameDriver(HTML);
  d2.boot(SIEGES, () => {});
  d2.sb.scSetG(d2.sb.scDeserialize(texte));
  d2.sb.rehydrateState(d2.state());
  d2.sb.refreshWarViews();
  d2.roster = [d2.state().player, ...d2.state().ais];
  for (const s of SIEGES) { const n = d2.roster.find(p => p.civ.id === s.civId); if (n) n._isAI = !!s.isAI; }
  let r = d2.pump(), m = 0;
  try {
    while (r && r.kind !== 'over' && m++ < 800) {
      if (r.kind === 'decision') r = d2.answer(r.pending.id, reponse(r.pending));
      else if (r.kind === 'action') r = d2.act(r.civId, { type: 'pass' });
      else if (r.kind === 'confirm') r = d2.commit(r.civId);
      else break;
    }
  } catch (e) { return { ok: false, msg: e.message.split('\n')[0], tour: d2.state().turn }; }
  if (r && r.kind === 'over') return { ok: true, tour: d2.state().turn };
  return { ok: false, msg: 'arrêt sur « ' + (r && r.kind) + ' »', tour: d2.state().turn };
}

console.log('═'.repeat(76));
console.log('REPRISE D\'UNE PARTIE SAUVEGARDÉE PENDANT UNE QUESTION');
console.log('═'.repeat(76));

let migres = 0, testes = 0, dette = 0;
for (const f of FAMILLES) {
  const { d, arret } = jusqua(f.motif);
  if (!arret) { console.log('\n' + f.nom.padEnd(22) + ' — aucune question de cette famille dans cette partie (non testé)'); continue; }
  testes++;
  const n = d.sb.fluxDetteDecisions();
  dette += n;
  const texte = d.sb.scSerialize();
  const res = repartDe(texte);
  if (res.ok) migres++;
  console.log('\n' + f.nom.padEnd(22) + ' — sauvegarde pendant « ' + arret.pending.kind + ' » (tour ' + d.state().turn + ')');
  console.log('   questions en attente reposant encore sur une FONCTION : ' + n);
  console.log('   reprise : ' + (res.ok
    ? '✅ la partie est allée jusqu\'au bout (tour ' + res.tour + ')'
    : '❌ ' + res.msg + ' (tour ' + res.tour + ')'));
}

console.log('\n' + '═'.repeat(76));
console.log('MIGRATION : ' + migres + ' / ' + testes + ' famille(s) de questions reprennent correctement.');
if (migres < testes) {
  console.log('Il reste des flux dont la suite est encore une FONCTION. Le message d\'erreur');
  console.log('ci-dessus NOMME la question perdue : c\'est par là qu\'il faut continuer.');
  process.exitCode = 1;
} else {
  console.log('✅ Toutes les familles testées reprennent. Le flux est devenu une donnée.');
}
