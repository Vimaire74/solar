/* ⚠️⚠️⚠️ CE BANC NE JOUE PAS LE JEU — NE PAS S'Y FIER POUR LE MOTEUR COURANT (19/09/2026) ⚠️⚠️⚠️
   Sa boucle de tour est écrite à la main : `doAITurn(p, true)` en one-shot jusqu'à épuisement, puis
   `doRevenues` / `doMaintenance` / `updateTension` appelés directement. Pas d'événement, pas
   d'investissement, pas de résolution des guerres, pas de sommet. Le témoin v9.69 (heuristique)
   tourne bien là-dessous ; le tacticien y joue une partie amputée. Le 18/09 j'en ai tiré « les IA ne
   colonisent plus » (19 colonies contre 97) — faux : `mesure_colonisation_ia.js`, qui joue des
   parties ENTIÈRES par `GameDriver`, donne 2,96 colonies par nation, stable depuis le 16/09, et Marc
   voyait ses adversaires coloniser normalement. Voir REPRISE §145.7bis.
   À reconstruire sur `GameDriver` si l'on veut garder le comptage des cartes de marché. */
/* ============================================================================
   MESURE — LES IA RELIENT-ELLES CE QU'ELLES FONDENT ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie FDDD du 23/08, deux observations distinctes :
     · « le jupitérien fait rien plusieurs tours de suite se contentant d'accumuler des réserves » ;
     · « le martien a trop étiré son réseau de planètes ».

   Le journal donne les chiffres. Le Jupitérien (bâtisseur) achète DIX fois ☄️ Capture d'astéroïdes
   et CINQ fois 📖 Investissement dans la Recherche, pour UNE colonisation, UNE amélioration et
   ZÉRO route en dix tours. Le Martien fonde Ganymède, Europe et Pluton au tour 1 et construit sa
   première route au tour 7 : trois colonies muettes pendant six tours.

   LES DEUX DÉFAUTS ONT LA MÊME CONSÉQUENCE — des IA pauvres, donc sans armée, sans défense et sans
   conquête — mais deux causes distinctes :
     · `_routeUtil` rendait 18, valeur PLATE, quand `U.colonize` monte à 25-35 : fonder l'emportait
       toujours sur relier ;
     · la récolte au marché n'avait aucun plafond : elle repassait en tête à chaque action.

   CE QU'ON MESURE, sur des parties entières et tout-ordinateur :
     · les routes construites ;
     · les colonies encore DÉCONNECTÉES à la fin — c'est la mesure qui compte, une colonie isolée
       ne produit rien et coûte son entretien ;
     · les achats de cartes de marché répétables ;
     · les VP finaux, pour vérifier qu'on a bien enrichi les IA et pas seulement déplacé leurs clics.

   ⚠️ CONTRE-ÉPREUVE. Tout tourne aussi sur le témoin figé `server/temoin_v9.69/`. Sans lui, un bon
   chiffre ne prouverait rien : il pourrait venir du tirage, ou d'un banc qui ne fait jamais
   coloniser personne.

   Usage : node mesure_economie_ia.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');

const PARTIES = 10;
const MOTEURS = [
  { nom: 'AVANT (témoin v9.69, figé)', html: path.join(__dirname, 'temoin_v9.69', 'index.html') },
  { nom: 'APRÈS (dossier de travail)', html: path.join(__dirname, '..', 'index.html') },
];
/* Les trois cartes de marché répétables — celles que le Jupitérien empilait. */
const RE_MARCHE = /achète .*(Capture d'astéroïdes|Extraction d'He3|Investissement dans la Recherche)/;

function unePartie(html) {
  const sb = loadLogic(html);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.player._isAI = true;
  try { if (typeof sb.attribuerProfilsIA === 'function') sb.attribuerProfilsIA(); } catch (e) {}
  const tous = () => [G.player].concat(G.ais);
  while (G.turn <= G.maxTurns) {
    try { sb.startTurn(); } catch (e) { for (const p of tous()) p.acLeft = p.acMax; }
    const ordre = tous().slice();
    for (const p of ordre) { p._passedRound = false; p._aiSetupDone = false; p._recoltesTour = 0; }
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
  const c = { routes: 0, colonies: 0, marche: 0, isolees: 0, vp: 0 };
  for (const l of (G.log || [])) {
    const m = String((l && (l.msg || l.t || l.text)) || l);
    if (/🤖 .* route →/.test(m)) c.routes++;
    if (/🤖 .* colonise /.test(m)) c.colonies++;
    if (RE_MARCHE.test(m)) c.marche++;
  }
  for (const n of tous()) {
    c.isolees += (n.colonies || []).filter(x => !x.connected && x.nodeId !== n.civ.home).length;
    try { c.vp += sb.calcVP(n).total; } catch (e) {}
  }
  return c;
}

console.log('═'.repeat(78));
console.log('ÉCONOMIE DES IA — ' + PARTIES + ' parties tout-ordinateur par moteur');
console.log('═'.repeat(78) + '\n');

const bilans = [];
for (const mot of MOTEURS) {
  const t = { routes: 0, colonies: 0, marche: 0, isolees: 0, vp: 0 };
  let err = null;
  for (let k = 0; k < PARTIES; k++) {
    try { const c = unePartie(mot.html); for (const key of Object.keys(t)) t[key] += c[key]; }
    catch (e) { err = e.message; break; }
  }
  if (err) { console.log(mot.nom + ' : ININTERPRÉTABLE — ' + err + '\n'); bilans.push(null); continue; }
  console.log(mot.nom);
  console.log('   colonies fondées ............. ' + t.colonies);
  console.log('   routes construites ........... ' + t.routes);
  console.log('   colonies encore ISOLÉES ...... ' + t.isolees + '   ← ce qui ne produit rien');
  console.log('   cartes de marché achetées .... ' + t.marche);
  console.log('   VP cumulés ................... ' + t.vp + '\n');
  bilans.push(t);
}

const [av, ap] = bilans;
console.log('─'.repeat(78));
if (!av || !ap) { console.log('Comparaison impossible.'); process.exit(1); }
let dur = 0;
if (av.isolees === 0) { console.log('⚠️ Le témoin ne laisse AUCUNE colonie isolée : le banc ne reproduit pas le défaut.'); dur = 1; }
else if (ap.isolees >= av.isolees) { console.log('❌ Colonies isolées : ' + av.isolees + ' → ' + ap.isolees + ' (aucun progrès).'); dur = 1; }
else console.log('✔ Colonies isolées : ' + av.isolees + ' → ' + ap.isolees);
if (ap.routes <= av.routes) { console.log('❌ Routes construites : ' + av.routes + ' → ' + ap.routes + ' (elles ne relient pas davantage).'); dur = 1; }
else console.log('✔ Routes construites : ' + av.routes + ' → ' + ap.routes);
if (ap.marche >= av.marche) { console.log('❌ Cartes de marché : ' + av.marche + ' → ' + ap.marche + ' (le marché absorbe toujours les actions).'); dur = 1; }
else console.log('✔ Cartes de marché : ' + av.marche + ' → ' + ap.marche);
console.log('  colonies fondées : ' + av.colonies + ' → ' + ap.colonies + '   ·   VP cumulés : ' + av.vp + ' → ' + ap.vp);
/* ⚠️ ON VÉRIFIE AUSSI QU'ON N'A PAS CASSÉ L'EXPANSION. Amortir la colonisation pouvait produire des
   IA qui ne fondent plus rien : des colonies toutes reliées, et trois fois moins nombreuses. */
if (ap.colonies < av.colonies * 0.6) { console.log('❌ L\'expansion s\'est effondrée : l\'amortissement est trop fort.'); dur = 1; }
else console.log('✔ contre-épreuve : l\'expansion tient (pas d\'IA devenue casanière)');
process.exit(dur);
