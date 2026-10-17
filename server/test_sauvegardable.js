/* ============================================================================
   TEST — UNE PARTIE EST-ELLE TOUJOURS ENREGISTRABLE ?
   ----------------------------------------------------------------------------
   POURQUOI CE BANC EXISTE. `ai._enemy` contenait l'OBJET de la nation ciblée. Si deux nations
   se ciblent mutuellement — A→B et B→A — la structure boucle, `JSON.stringify` lève
   « Converting circular structure to JSON », et `scSerialize` échoue : la partie n'est plus
   enregistrable DU TOUT. Sur un serveur qui sauvegarde après chaque avancée, c'est tout perdre
   au redémarrage.

   ⚠️ DATER LE DÉFAUT CORRECTEMENT. Ce banc, passé sur le moteur du 15/08, échoue AUSSI — dès le
   tour 1. Le défaut est donc ANTÉRIEUR aux guerres entre IA. Ce qui a changé le 16/08, c'est son
   ACCESSIBILITÉ : tant que les IA ne visaient que le joueur humain, la structure restait un arbre
   et le cycle n'existait qu'en configuration de banc. Depuis qu'elles se font la guerre entre
   elles, deux IA peuvent se cibler mutuellement dans une VRAIE partie. Un défaut latent rendu
   atteignable n'est pas une régression, mais ce n'est pas non plus « pas mon problème ».

   Le cas ne se produit pas à tous les coups : il faut que deux nations se ciblent le même tour.
   `test_reprise.js` ne l'attrapait qu'une fois sur quatre, et par un plantage brut. Un banc dédié,
   qui essaie d'enregistrer après CHAQUE action, le voit immédiatement.

   ⚠️ CE QU'IL VÉRIFIE VRAIMENT : `scSerialize` — la fonction que le jeu utilise, pas un
   `JSON.stringify` de circonstance qui pourrait se comporter autrement.

   Usage : node test_sauvegardable.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
console.log('═'.repeat(76));
console.log('UNE PARTIE RESTE-T-ELLE ENREGISTRABLE À CHAQUE INSTANT ?');
console.log('═'.repeat(76) + '\n');

let tours = 0, guerres = 0, ciblesCroisees = 0;
for (let partie = 0; partie < 5; partie++) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.player._isAI = true;                       // « l'IA est une nation comme une autre »
  const tous = () => [G.player].concat(G.ais);
  while (G.turn <= G.maxTurns) {
    try { sb.startTurn(); } catch (e) { for (const p of tous()) p.acLeft = p.acMax; }
    const ordre = tous().slice();
    for (const p of ordre) { p._passedRound = false; p._aiSetupDone = false; }
    let i = 0, garde = 0;
    while (garde++ < 2000) {
      if (ordre.every(p => p._passedRound)) break;
      const p = ordre[i % ordre.length];
      if (p._passedRound) { i++; continue; }
      let agi = false;
      try { agi = sb.doAITurn(p, true); } catch (e) { p._passedRound = true; }
      if (!agi || p.acLeft <= 0) p._passedRound = true;
      i++;
      /* On tente d'enregistrer APRÈS CHAQUE ACTION : c'est ce que fait le serveur, et c'est
         pendant le tour d'une IA que les cibles sont posées. */
      try { sb.scSerialize(); }
      catch (e) {
        ecarts.push('partie ' + (partie + 1) + ', tour ' + G.turn + ' : ' + e.message.split('\n')[0]);
        garde = 99999; break;
      }
    }
    try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
    try { sb.updateWarRisk(); sb.updateTension(); } catch (e) {}
    try { sb.scSerialize(); } catch (e) { ecarts.push('partie ' + (partie + 1) + ', fin du tour ' + G.turn + ' : ' + e.message.split('\n')[0]); }
    tours++;
    G.turn++;
    if (ecarts.length) break;
  }
  guerres += (G.wars || []).length;
  /* CONTRE-ÉPREUVE DE PERTINENCE : le défaut n'apparaît QUE si deux nations se ciblent
     mutuellement. Si ça n'arrive jamais, ce banc ne prouve rien — on le dit. */
  const ids = new Map(); for (const n of tous()) ids.set(n.civ.id, n._enemyId || null);
  for (const [a, b] of ids) if (b && ids.get(b) === a) ciblesCroisees++;
  if (ecarts.length) break;
}

console.log('   tours joués                        : ' + tours);
console.log('   guerres ouvertes (5 parties)       : ' + guerres);
console.log('   cas de ciblage MUTUEL observés     : ' + ciblesCroisees
  + (ciblesCroisees ? '   ✔ le cas qui produisait le cycle est bien survenu'
                    : '   ⚠️ jamais rencontré : ce banc ne prouve pas grand-chose ce coup-ci'));
console.log('');
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' échec(s) d\'enregistrement :');
  for (const e of ecarts) console.log('   · ' + e);
  console.log('\n   Une partie qui ne s\'enregistre pas est une partie perdue au prochain');
  console.log('   redémarrage. Cherche un objet nation rangé sur une autre nation :');
  console.log('   `node mesure_identite_nations.js`.');
  process.exitCode = 1;
} else {
  console.log('✅ La partie s\'enregistre à chaque instant, sur ' + tours + ' tours joués.');
}
console.log('═'.repeat(76));
