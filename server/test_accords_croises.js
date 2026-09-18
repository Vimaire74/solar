/* ============================================================================
   TEST — DEUX NATIONS QUI SE PROPOSENT LE MÊME ACCORD LE SIGNENT, SANS SECONDE QUESTION
   ----------------------------------------------------------------------------
   POURQUOI. Partie 20C9 (Marc, 18/09), tour 8, sommet commercial. Il proposait un accord aux
   Terriens ; les Terriens lui proposaient le même. Son journal :
       🤝 Terriens propose un accord commercial à Jupitériens — en attente de sa réponse…
       🤝 Accord commercial conclu : Jupitériens ↔ Terriens
       🤝 Terriens et Jupitériens étaient déjà liés — il n'existe qu'un accord par couple
   Trois lignes pour un seul accord, dont la dernière annule la première. « J'ai proposé un accord
   aux Terriens et seulement à eux, et après j'ai accepté leur accord. Le jeu gère mal une double
   proposition entre deux mêmes nations. »
   La cause : au sommet SIMULTANÉ, toutes les IA choisissent avant que l'humain ne réponde. La
   question lui arrive donc AVANT que son propre choix ne soit traité — et quand il l'est, la
   question posée devient sans objet mais reste à l'écran.
   La règle est de Marc, posée le 26/08 : « si je le propose et qu'il le propose, alors on devrait
   juste voir accord signé entre les deux nations, point. » `_evAccordConclude` la tenait déjà pour
   les accords DÉJÀ signés ; il manquait le cas d'une proposition encore EN VOL.
   Usage : node test_accords_croises.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('jupiteriens', ['terriens', 'martiens', 'ceinturiens']);
  const G = sb.__G; G.turn = 8; G.phase = 'actions';
  const jup = G.player, ter = G.ais[0];
  jup._isAI = false; G.ais.forEach(a => a._isAI = true);
  for (const n of [jup].concat(G.ais)) { n.res.morale = 8; n.res.materials = 8; n.res.energy = 8; n.acLeft = 3; }
  const questions = [];
  sb.setDecisionSink(p => questions.push(p));
  return { sb, G, jup, ter, questions };
}
const lignes = m => (m.G.log || []).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, ''));
const vp = (m, nat) => vm.runInContext('((G.player.civ.id==="' + nat + '"?G.player:G.ais.find(a=>a.civ.id==="' + nat + '")).tempVP)||0', m.sb);
/* On ne compte que les QUESTIONS D'ACCORD : `_evAccordConclude` envoie aussi une notice de
   signature à chaque signataire, qui passe par le même émetteur sans rien demander à personne. */
const demandes = m => m.questions.filter(q => q && q.kind === 'accord_request').length;
const ouvertesAccord = m => ((m.G._pendings) || []).filter(q => q && q.kind === 'accord_request').length;

console.log('§1 Les Terriens proposent au joueur, puis le joueur choisit les Terriens');
{
  const m = montage();
  /* Le sommet simultané : `accordsRestants` non vide, donc `_evCommPick` suit ce chemin. */
  const d = vm.runInContext('fluxDonnees()', m.sb);
  d.accordsRestants = ['jupiteriens']; d.accordsPaires = [];
  /* 1. L'IA propose à l'humain : une question part, une paire est mise en vol. */
  vm.runInContext('_evCommPick("jupiteriens","terriens")', m.sb);
  const enVol = (vm.runInContext('fluxDonnees()', m.sb).accordsPaires || []).length;
  note('propositions en vol après le choix des Terriens : ' + enVol);
  if (enVol === 1) ok('la proposition des Terriens attend la réponse du joueur');
  else ko('paires en vol : ' + enVol + ' au lieu de 1');
  const qAvant = demandes(m);

  /* 2. Le joueur choisit les Terriens à son tour — proposition croisée. */
  vm.runInContext('_evCommPick("terriens","jupiteriens")', m.sb);

  const L = lignes(m);
  if (L.some(x => /se sont propos/i.test(x) && /sign/i.test(x))) ok('le journal dit que l\'accord est signé sans autre question');
  else ko('aucune ligne « proposé l\'un à l\'autre — signé »');
  if (!L.some(x => /déjà liés/i.test(x))) ok('plus de ligne « étaient déjà liés »');
  else ko('la ligne « étaient déjà liés » subsiste');
  if (demandes(m) === qAvant) ok('aucune nouvelle demande d\'accord posée');
  else ko(demandes(m) - qAvant + ' demande(s) d\'accord de plus');
}

console.log('§2 La question restée en vol est retirée de l\'écran');
{
  const m = montage();
  const d = vm.runInContext('fluxDonnees()', m.sb);
  d.accordsRestants = ['jupiteriens']; d.accordsPaires = [];
  vm.runInContext('_evCommPick("jupiteriens","terriens")', m.sb);
  const ouvertesAvant = ouvertesAccord(m);
  vm.runInContext('_evCommPick("terriens","jupiteriens")', m.sb);
  const ouvertesApres = ouvertesAccord(m);
  const paires = (vm.runInContext('fluxDonnees()', m.sb).accordsPaires || []).length;
  note('demandes d\'accord ouvertes ' + ouvertesAvant + ' → ' + ouvertesApres + ' · paires en vol ' + paires);
  if (ouvertesAvant === 1 && ouvertesApres === 0) ok('la question d\'accord a été retirée de l\'écran');
  else ko('demandes ouvertes ' + ouvertesAvant + ' → ' + ouvertesApres + ' (attendu 1 → 0)');
  if (paires === 0) ok('plus aucune proposition en attente');
  else ko(paires + ' paire(s) encore en vol');
}

console.log('§3 L\'accord est signé UNE fois : +3 VP chacun, pas +6');
{
  const m = montage();
  const d = vm.runInContext('fluxDonnees()', m.sb);
  d.accordsRestants = ['jupiteriens']; d.accordsPaires = [];
  const vAv = vp(m, 'jupiteriens'), tAv = vp(m, 'terriens');
  vm.runInContext('_evCommPick("jupiteriens","terriens")', m.sb);
  vm.runInContext('_evCommPick("terriens","jupiteriens")', m.sb);
  const dJ = vp(m, 'jupiteriens') - vAv, dT = vp(m, 'terriens') - tAv;
  note('Jupitériens +' + dJ + ' VP · Terriens +' + dT + ' VP');
  if (dJ === 3 && dT === 3) ok('+3 VP de chaque côté, une seule fois');
  else ko('VP : +' + dJ + ' / +' + dT + ' au lieu de +3 / +3');
  const conclus = lignes(m).filter(x => /Accord commercial conclu/i.test(x)).length;
  if (conclus === 1) ok('une seule ligne « Accord commercial conclu »');
  else ko(conclus + ' lignes « conclu »');
}

console.log('§4 Une proposition NON croisée pose toujours sa question');
{
  const m = montage();
  const d = vm.runInContext('fluxDonnees()', m.sb);
  d.accordsRestants = ['jupiteriens']; d.accordsPaires = [];
  const qAvant = demandes(m);
  vm.runInContext('_evCommPick("jupiteriens","martiens")', m.sb);
  if (demandes(m) === qAvant + 1) ok('les Martiens proposent : la question est bien posée au joueur');
  else ko('aucune question posée pour une proposition simple');
  const paires = (vm.runInContext('fluxDonnees()', m.sb).accordsPaires || []).length;
  if (paires === 1) ok('la paire attend sa réponse');
  else ko('paires : ' + paires);
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_accords_croises : deux propositions entre les mêmes nations donnent UN accord, sans question résiduelle.');
