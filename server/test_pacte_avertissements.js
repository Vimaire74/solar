/* ============================================================================
   TEST — LE SOMMET DIPLOMATIQUE DIT LA VÉRITÉ, ET DANS L'ORDRE
   ----------------------------------------------------------------------------
   POURQUOI. Deux défauts vus dans les logs de Marc du 23/09.

   (A) LE PACTE QUI ÉCHOUE EN SILENCE — partie C062, tour 2 :
         « 🌍 Terriens — 🕊️ pas assez de matériaux pour le pacte avec Martiens (6 requis). »
       Marc avait coché le pacte, il n'avait pas les 6🪨, le jeu a renoncé sans rien lui dire
       d'autre qu'une ligne parmi trente. Il a ensuite joué quatre tours en se croyant protégé,
       et s'est fait piller par le Martien aux tours 1, 3, 4 et 5. La règle du pacte marche ;
       c'est l'interface qui l'a laissé croire que c'était signé.

   (B) LA CONCLUSION ÉCRITE AVANT LA DÉCISION — partie 821C, tour 6 :
         🕊️ Jupitériens propose un pacte à Terriens — en attente de sa réponse…
         🕊️ Jupitériens — sommet diplomatique : aucun pacte signé.      ← écrit trop tôt
         🕊️ Terriens — sommet diplomatique : aucun pacte signé.
         🕊️ Terriens REFUSE le pacte de Jupitériens.                    ← la vraie réponse
       Le proposant concluait « aucun pacte signé » alors que la réponse n'était pas arrivée.
       Le journal racontait donc la fin avant le milieu.

   CE QUE CE BANC VERROUILLE :
     · manque de matériaux → le proposant reçoit un AVIS, pas seulement une ligne de journal ;
     · une réponse en attente → pas de « aucun pacte signé » tant qu'elle n'est pas là ;
     · CONTRE-ÉPREUVE : quand rien n'est coché, « aucun pacte signé » est bien écrit — on n'a
       pas supprimé la ligne, on l'a seulement remise à sa place ;
     · CONTRE-ÉPREUVE : le banc sait voir un avis (on en émet un à la main).

   Usage : node test_pacte_avertissements.js
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

/* On capture les avis (`notifyNationHit`) et on neutralise l'envoi réseau : ce banc mesure ce
   que le jeu DIT au joueur, pas comment il l'achemine. */
function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 2; G.phase = 'actions';
  G.player._isAI = false;
  G.player.res.materials = (opts.mat === undefined) ? 20 : opts.mat;
  vm.runInContext(`
    __avis = [];
    notifyNationHit = function(nat, titre, texte){
      __avis.push({ nation: nat && nat.civ && nat.civ.id, titre: String(titre||''), texte: String(texte||'') });
    };
    _emitRemote = function(){ return null; };
    _evCloseOverlay = function(){};
    _appelerSuite = function(){};
    _accordsVerifierFin = function(){};
  `, sb);
  if (opts.humainEnFace) {
    /* Le partenaire est un humain distant : la proposition part en fenêtre et attend. */
    vm.runInContext(`_decisionActive = function(){ return true; };`, sb);
    G.ais[0]._isAI = false;
  }
  return { sb, G };
}

const avisDe = sb => vm.runInContext('JSON.stringify(__avis)', sb);
const journal = G => (G.log || []).map(e => String(e.fr || e.msg || e.texte || '')).join('\n');

function textesJournal(sb, G) {
  return (G.log || []).map(e => { try { return String(sb._logTexte(e)); } catch (x) { return ''; } });
}

console.log('═'.repeat(84));
console.log('SOMMET DIPLOMATIQUE — CE QUI EST DIT, ET QUAND');
console.log('═'.repeat(84) + '\n');

console.log('1. Pas assez de matériaux : le joueur doit être AVERTI, pas seulement journalisé');
{
  const { sb, G } = montage({ mat: 3 });          // il en faut 6
  vm.runInContext(`_evDiploSel = { martiens: true };`, sb);
  sb._evDiploConfirm(G.player.civ.id);
  const avis = JSON.parse(avisDe(sb));
  const pourMoi = avis.filter(a => a.nation === G.player.civ.id);
  const lignes = textesJournal(sb, G);
  const ligneManque = lignes.some(l => /pas assez de mat/i.test(l));
  note('avis reçus par le joueur : ' + pourMoi.length + ' · ligne de journal : ' + (ligneManque ? 'oui' : 'non'));
  if (!ligneManque) ko('même la ligne de journal a disparu — le montage ne mesure rien');
  const averti = pourMoi.some(a => /mat[ée]riaux|pacte/i.test(a.titre + ' ' + a.texte));
  if (averti) ok('le joueur reçoit un avis : le pacte n\'a pas été conclu, faute de matériaux');
  else ko('aucun avis — le pacte échoue en silence, comme en partie C062');
}

console.log('\n2. Une réponse en attente : pas de conclusion prématurée');
{
  const { sb, G } = montage({ mat: 20, humainEnFace: true });
  vm.runInContext(`_evDiploSel = { martiens: true };`, sb);
  sb._evDiploConfirm(G.player.civ.id);
  const lignes = textesJournal(sb, G);
  const attente = lignes.some(l => /en attente de sa r[ée]ponse/i.test(l));
  const conclusion = lignes.some(l => /aucun pacte sign/i.test(l));
  note('ligne « en attente » : ' + (attente ? 'oui' : 'non') + ' · ligne « aucun pacte signé » : ' + (conclusion ? 'oui' : 'non'));
  if (!attente) ko('la proposition n\'a pas été mise en attente — le montage ne mesure rien');
  if (conclusion) ko('« aucun pacte signé » est écrit alors que la réponse n\'est pas arrivée');
  else ok('aucune conclusion tant que la réponse manque');
}

console.log('\n3. CONTRE-ÉPREUVE — rien de coché : la conclusion est bien écrite');
{
  /* Sans ce point, on « corrigerait » en supprimant la ligne partout, et le §2 serait vert
     pendant qu'un sommet sans suite ne dirait plus rien du tout. */
  const { sb, G } = montage({ mat: 20 });
  vm.runInContext(`_evDiploSel = {};`, sb);
  sb._evDiploConfirm(G.player.civ.id);
  const lignes = textesJournal(sb, G);
  if (lignes.some(l => /aucun pacte sign/i.test(l))) ok('« aucun pacte signé » est toujours écrit quand il n\'y a rien à attendre');
  else ko('la ligne a disparu — on a coupé trop large');
}

console.log('\n4. CONTRE-ÉPREUVE — le banc sait voir un avis');
{
  const { sb } = montage({});
  vm.runInContext(`notifyNationHit({civ:{id:'terriens'}}, 'titre test', 'texte test');`, sb);
  const avis = JSON.parse(avisDe(sb));
  if (avis.some(a => a.titre === 'titre test')) ok('un avis émis à la main est bien capté');
  else ko('la capture des avis ne fonctionne pas — le §1 ne prouverait rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le sommet avertit quand il échoue, et ne conclut pas avant d\'avoir la réponse.');
console.log('═'.repeat(84));
