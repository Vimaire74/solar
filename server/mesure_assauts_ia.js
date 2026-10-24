/* ============================================================================
   MESURE — LES IA GAGNENT-ELLES LES ASSAUTS QU'ELLES LANCENT ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie du 16/08 à quatre joueurs : « les IA gèrent très mal la guerre ».
   Son journal donnait le chiffre, cinq fois de suite :

       2⚔️ vs 2🛡️ · 1⚔️ vs 1🛡️ · 4⚔️ vs 4🛡️ · 2⚔️ vs 2🛡️ · 4⚔️ vs 4🛡️

   Cinq assauts, cinq ÉGALITÉS PARFAITES, cinq défaites, 13 jetons perdus. La victoire exige
   `aPow > dPow` — l'égalité revient au défenseur. Une signature aussi régulière n'est pas de la
   malchance : c'est une erreur de calcul. L'IA choisissait sa cible en comparant ses jetons à
   `perceivedForce(ai,r).val`, la force de la NATION, alors que la défense d'une COLONIE ajoute
   la garnison (+1, toujours là), le bonus de combat du défenseur et les cohabitants.

   CE QU'ON MESURE, ET POURQUOI CE N'EST PAS « EST-CE QUE ÇA MARCHE ».
     · le taux de victoire des assauts d'IA ;
     · le nombre d'assauts perdus À L'ÉGALITÉ — c'est LA signature du défaut, et elle doit
       tomber à zéro : on ne mesure pas un progrès vague, on mesure la disparition d'un motif ;
     · les jetons engagés en pure perte ;
     · les renoncements, qui doivent apparaître : une IA qui ne renonce JAMAIS n'a pas de
       jugement, elle a un réflexe.

   ⚠️ CONTRE-ÉPREUVE OBLIGATOIRE. Le banc tourne sur DEUX moteurs : celui du dossier de travail et
   le témoin figé `server/temoin_v9.69/`, resté au moteur d'avant le correctif. Sans cette seconde
   colonne, un bon chiffre ne prouve rien — il pourrait venir d'un tirage favorable, d'un autre
   correctif, ou d'un banc qui ne déclenche simplement aucun assaut.

   Usage : node mesure_assauts_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');

const PARTIES = 12;
const MOTEURS = [
  /* ⚠️ TÉMOIN FIGÉ, ET SURTOUT PAS LE DOSSIER D'ENVOI. Ce banc lisait `Pour uploader/lot16/`,
     qui se trouvait être en retard d'une version — jusqu'au jour où on l'a synchronisé. Les deux
     colonnes seraient alors devenues identiques, l'écart nul, et le banc aurait cessé de prouver
     quoi que ce soit tout en restant vert d'apparence. `server/temoin_v9.69/` ne bouge plus. */
  { nom: 'AVANT (témoin v9.69, figé)', html: path.join(__dirname, 'temoin_v9.69', 'index.html') },
  { nom: 'APRÈS (dossier de travail)',  html: path.join(__dirname, '..', 'play.html') },
];

/* « X capture Y sur Z (4⚔️ vs 2🛡️, Nv.1) » et « Z repousse l'assaut de X (2⚔️ vs 2🛡️) ». */
const RE_COMBAT = /\((\d+)⚔️ vs (\d+)🛡️/;

function unePartie(html) {
  const sb = loadLogic(html);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.player._isAI = true;                       // table entièrement tenue par l'ordinateur
  try { if (typeof sb.attribuerProfilsIA === 'function') sb.attribuerProfilsIA(); } catch (e) {}
  const tous = () => [G.player].concat(G.ais);
  while (G.turn <= G.maxTurns) {
    try { sb.startTurn(); } catch (e) { for (const p of tous()) p.acLeft = p.acMax; }
    const ordre = tous().slice();
    for (const p of ordre) { p._passedRound = false; p._aiSetupDone = false; }
    let i = 0, g = 0;
    while (g++ < 2000) {
      if (ordre.every(p => p._passedRound)) break;
      const p = ordre[i % ordre.length];
      if (p._passedRound) { i++; continue; }
      let agi = false; try { agi = sb.doAITurn(p, true); } catch (e) { p._passedRound = true; }
      if (!agi || p.acLeft <= 0) p._passedRound = true;
      i++;
    }
    try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
    try { sb.updateWarRisk(); sb.updateTension(); } catch (e) {}
    G.turn++;
  }
  const c = { gagnes: 0, perdus: 0, egalites: 0, renonces: 0, jetonsPerdus: 0 };
  for (const l of (G.log || [])) {
    const m = String((l && (l.msg || l.t || l.text)) || l);
    if (m.includes('renonce à l\'assaut')) { c.renonces++; continue; }
    const hit = m.match(RE_COMBAT);
    if (!hit) continue;
    const a = parseInt(hit[1], 10), d = parseInt(hit[2], 10);
    if (m.includes('capture')) c.gagnes++;
    else if (m.includes('repousse l\'assaut')) {
      c.perdus++; c.jetonsPerdus += a;
      if (a === d) c.egalites++;          // LA signature du défaut
    }
  }
  return c;
}

console.log('═'.repeat(78));
console.log('ASSAUTS DES IA — ' + PARTIES + ' parties tout-ordinateur par moteur');
console.log('═'.repeat(78) + '\n');

const bilans = [];
for (const mot of MOTEURS) {
  const t = { gagnes: 0, perdus: 0, egalites: 0, renonces: 0, jetonsPerdus: 0 };
  let erreur = null;
  for (let k = 0; k < PARTIES; k++) {
    try { const c = unePartie(mot.html); for (const key of Object.keys(t)) t[key] += c[key]; }
    catch (e) { erreur = e.message; break; }
  }
  if (erreur) { console.log(mot.nom + ' : ININTERPRÉTABLE — ' + erreur + '\n'); bilans.push(null); continue; }
  const tot = t.gagnes + t.perdus;
  console.log(mot.nom);
  console.log('   assauts résolus ...... ' + tot);
  console.log('   gagnés ............... ' + t.gagnes + (tot ? '  (' + Math.round(100 * t.gagnes / tot) + ' %)' : ''));
  console.log('   perdus ............... ' + t.perdus);
  console.log('   ↳ perdus À ÉGALITÉ ... ' + t.egalites + '   ← la signature du défaut');
  console.log('   jetons perdus ........ ' + t.jetonsPerdus);
  console.log('   renoncements ......... ' + t.renonces + '\n');
  bilans.push(t);
}

const [av, ap] = bilans;
if (!av || !ap) { console.log('Comparaison impossible : un des deux moteurs n\'a pas tourné.'); process.exit(1); }
console.log('─'.repeat(78));
let dur = 0;
if (av.egalites === 0) { console.log('⚠️ Le moteur AVANT ne montre AUCUNE défaite à l\'égalité : le banc ne reproduit pas'); console.log('   le motif observé chez Marc — le résultat APRÈS ne prouve donc rien.'); dur = 1; }
else if (ap.egalites > 0) { console.log('❌ Il reste ' + ap.egalites + ' défaite(s) à l\'égalité APRÈS correctif (' + av.egalites + ' avant).'); dur = 1; }
else console.log('✔ Défaites à l\'égalité : ' + av.egalites + ' avant → 0 après. Le motif a disparu.');
const tAv = av.gagnes + av.perdus, tAp = ap.gagnes + ap.perdus;
console.log('  taux de victoire : ' + (tAv ? Math.round(100 * av.gagnes / tAv) : 0) + ' % → ' + (tAp ? Math.round(100 * ap.gagnes / tAp) : 0) + ' %');
console.log('  jetons perdus    : ' + av.jetonsPerdus + ' → ' + ap.jetonsPerdus);
if (ap.renonces === 0 && tAp > 0) console.log('  ⚠️ aucun renoncement : vérifier que la porte de sortie est atteignable.');
process.exit(dur);
