/* ============================================================================
   MESURE — LA TENSION MONTE-T-ELLE VRAIMENT ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie 140A du 23/08 : « les tensions ne semblent pas vraiment interpolées
   correctement. Y en a jamais alors que j'avais mis des règles de déclenchement de tensions. »

   LA CAUSE TROUVÉE. La toute première ligne d'`updateTension` :

       if(G.warState) return;      // pas de montée de tension pendant la guerre

   `G.warState` est un drapeau LOCAL — « la nation que je regarde est en guerre ». Dès qu'un conflit
   s'ouvrait quelque part sur le plateau, la fonction sortait AVANT tout : plus de griefs, plus
   d'érosion, plus de manifestations, plus de guerre populaire, pour PERSONNE. La partie de Marc a
   connu sa première guerre au tour 4 ; le système dormait depuis.

   L'intention était juste — deux nations déjà en guerre n'ont pas à accumuler de la rancune — mais
   elle se décide couple par couple, ce que fait maintenant `_warBetween(x,y)` dans chaque boucle.

   CE QU'ON MESURE : sur des parties entières tout-ordinateur, la tension maximale atteinte par
   couple, le nombre de couples qui franchissent 6 (manifestations) et 10 (guerre populaire).

   ⚠️ CONTRE-ÉPREUVE. Le témoin figé `server/temoin_v9.69/` porte la ligne fautive : il doit montrer
   des tensions nettement plus basses. Sans cette colonne, un chiffre élevé ne prouverait rien — il
   pourrait venir du tirage.

   Usage : node mesure_tensions.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');

const PARTIES = 10;
const MOTEURS = [
  { nom: 'AVANT (témoin v9.69, figé)', html: path.join(__dirname, 'temoin_v9.69', 'play.html') },
  { nom: 'APRÈS (dossier de travail)', html: path.join(__dirname, '..', 'play.html') },
];

function unePartie(html) {
  const sb = loadLogic(html);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.player._isAI = true;
  try { if (typeof sb.attribuerProfilsIA === 'function') sb.attribuerProfilsIA(); } catch (e) {}
  const tous = () => [G.player].concat(G.ais);
  let maxTens = 0, couples6 = new Set(), couples10 = new Set(), guerresPop = 0;
  /* ⚠️ COMPTER LES GUERRES NE DIT PAS SI LE JEU EST DEVENU UNE MÊLÉE. Une guerre dure une manche
     et s'arrête : dix guerres brèves réparties sur douze tours ne se ressemblent pas du tout à
     dix guerres qui se chevauchent. Ce qu'on veut savoir, c'est combien de TOURS une nation passe
     en guerre — c'est cela que le joueur ressent. On relève donc, à chaque fin de tour, combien de
     nations sont engagées dans au moins un conflit. */
  let toursNation = 0, toursNationEnGuerre = 0;
  const releve = () => {
    for (const x of tous()) for (const y of tous()) {
      if (x === y) continue;
      let t = 0; try { t = sb.getTens(x.civ.id, y.civ.id) || 0; } catch (e) {}
      if (t > maxTens) maxTens = t;
      const cle = x.civ.id + '>' + y.civ.id;
      if (t >= 6) couples6.add(cle);
      if (t >= 10) couples10.add(cle);
    }
    for (const n of tous()) {
      toursNation++;
      let enGuerre = false;
      for (const o of tous()) {
        if (o === n) continue;
        try { if (sb._warBetween(n.civ.id, o.civ.id)) enGuerre = true; } catch (e) {}
      }
      if (enGuerre) toursNationEnGuerre++;
    }
  };
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
    releve();
    G.turn++;
  }
  for (const l of (G.log || [])) {
    const m = String((l && (l.msg || l.t)) || l);
    if (/Guerre [Pp]opulaire|guerre populaire/.test(m)) guerresPop++;
  }
  return { maxTens, c6: couples6.size, c10: couples10.size, guerresPop, toursNation, toursNationEnGuerre };
}

console.log('═'.repeat(78));
console.log('TENSIONS — ' + PARTIES + ' parties tout-ordinateur par moteur');
console.log('═'.repeat(78) + '\n');

const bilans = [];
for (const mot of MOTEURS) {
  const t = { maxTens: 0, c6: 0, c10: 0, guerresPop: 0, toursNation: 0, toursNationEnGuerre: 0 };
  let err = null;
  for (let k = 0; k < PARTIES; k++) {
    try { const c = unePartie(mot.html); t.maxTens = Math.max(t.maxTens, c.maxTens); t.c6 += c.c6; t.c10 += c.c10; t.guerresPop += c.guerresPop; t.toursNation += c.toursNation; t.toursNationEnGuerre += c.toursNationEnGuerre; }
    catch (e) { err = e.message; break; }
  }
  if (err) { console.log(mot.nom + ' : ININTERPRÉTABLE — ' + err + '\n'); bilans.push(null); continue; }
  console.log(mot.nom);
  console.log('   tension la plus haute atteinte ..... ' + t.maxTens + '/10');
  console.log('   couples ≥ 6 (manifestations) ....... ' + t.c6);
  console.log('   couples ≥ 10 (guerre populaire) .... ' + t.c10);
  console.log('   guerres populaires déclenchées ..... ' + t.guerresPop);
  console.log('   part des tours passés en guerre ..... '
    + (t.toursNation ? Math.round(100 * t.toursNationEnGuerre / t.toursNation) : 0) + ' %\n');
  bilans.push(t);
}

const [av, ap] = bilans;
console.log('─'.repeat(78));
if (!av || !ap) { console.log('Comparaison impossible.'); process.exit(1); }
let dur = 0;
if (ap.c6 <= av.c6) { console.log('❌ Couples à 6 ou plus : ' + av.c6 + ' → ' + ap.c6 + ' (la tension ne monte pas davantage).'); dur = 1; }
else console.log('✔ Couples atteignant 6 (manifestations) : ' + av.c6 + ' → ' + ap.c6);
console.log('  tension maximale : ' + av.maxTens + '/10 → ' + ap.maxTens + '/10');
console.log('  couples à 10     : ' + av.c10 + ' → ' + ap.c10 + '   ·   guerres populaires : ' + av.guerresPop + ' → ' + ap.guerresPop);
/* ⚠️ ON VÉRIFIE AUSSI QUE ÇA N'EXPLOSE PAS. Une tension qui monte trop vite transforme chaque
   partie en mêlée générale : le but est qu'elle VIVE, pas qu'elle domine.
   ⚠️ LE NOMBRE DE GUERRES NE SUFFIT PAS À DIRE ÇA, ET C'EST UNE LEÇON PAYÉE. Ce banc jugeait sur
   « plus de trois guerres populaires par partie = explosif ». Sur dix parties, ce compteur varie
   du simple au double d'un tirage à l'autre — 11, 18, 22, 25 sur le TÉMOIN FIGÉ, dont le code ne
   change pas. Un seuil posé sur un chiffre aussi instable ne mesure que le hasard.
   On juge donc sur la PART DES TOURS passés en guerre : chaque partie y contribue par dizaines de
   relevés au lieu d'un seul compteur, et c'est en outre ce que le joueur ressent réellement. Une
   guerre de temps en temps fait vivre la partie ; la moitié du temps en guerre, c'est une mêlée. */
const pct = ap.toursNation ? (100 * ap.toursNationEnGuerre / ap.toursNation) : 0;
const pctAv = av.toursNation ? (100 * av.toursNationEnGuerre / av.toursNation) : 0;
console.log('  part des tours passés en guerre : ' + Math.round(pctAv) + ' % → ' + Math.round(pct) + ' %');
if (pct > 45) { console.log('❌ les nations passent ' + Math.round(pct) + ' % de leurs tours en guerre : le jeu est devenu une mêlée.'); dur = 1; }
else console.log('✔ contre-épreuve : la guerre reste un événement, pas l\'état normal du plateau');
process.exit(dur);
