/* ============================================================================
   MESURE — QUELLES DONNÉES DE `G` CONTIENNENT DES OBJETS NATION ?
   ----------------------------------------------------------------------------
   CE FICHIER NE CORRIGE RIEN. Il cherche une classe entière de défauts, révélée le
   2026-08-16 par le draft Stratégie.

   LE DÉFAUT, EN UNE PHRASE. Une file d'attente rangée dans `G` sous forme d'OBJETS nation
   fonctionne parfaitement tant que la partie vit en mémoire — et cesse de fonctionner dès
   qu'elle passe par JSON. Sauvegarde, redémarrage du serveur, reprise : les objets rangés
   deviennent des COPIES, plus jamais `===` aux nations rendues par `allPlayers()`. Toute
   comparaison d'identité (`file[0]===nat`, `file.indexOf(nat)`) échoue alors en silence, la
   file ne se vide jamais, et la même question est reposée éternellement au même joueur
   pendant que les autres regardent un sablier.

   Constaté sur `_stratOrder` : le joueur A recevait huit fois `decision:strategy` d'affilée.
   Une partie reprise sur deux ne repartait pas. Le draft étant la question la plus fréquente
   du jeu, c'était l'endroit le plus probable — mais rien ne dit que c'est le seul.

   CE QUE FAIT CETTE MESURE. Elle joue une partie, puis parcourt `G` et signale toute valeur
   qui EST une nation ou qui en CONTIENT — hors les emplacements légitimes (`G.player`,
   `G.ais`, qui sont les nations elles-mêmes). Chaque signalement est un endroit où une
   comparaison d'identité serait fausse après une reprise.

   ⚠️ ELLE NE PROUVE PAS QU'IL Y A DÉFAUT. Ranger une nation n'est pas fautif en soi ; c'est
   la COMPARER PAR IDENTITÉ qui l'est. La mesure donne la liste des endroits à relire.

   Usage : node mesure_identite_nations.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const sb = loadLogic(HTML);
sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
const G = sb.__G;
G.player._isAI = true;
/* On joue quelques tours pour que les files temporaires (draft, accords, espionnage,
   investissements) soient REMPLIES au moment de l'inspection : inspecter une partie qui vient de
   démarrer ne trouverait rien et donnerait une fausse tranquillité. */
const tous = () => [G.player].concat(G.ais);
while (G.turn <= 4) {
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
  }
  try { sb.advancePirates(); sb._applyMoraleFlags(); sb.doRevenues(); sb.doMaintenance(); } catch (e) {}
  try { sb.updateWarRisk(); sb.updateTension(); } catch (e) {}
  G.turn++;
}

/* ⚠️ INSPECTER AUSSI PENDANT UN SOMMET. La première version inspectait après quatre tours d'actions
   et ne voyait donc QUE les files permanentes : les files temporaires du sommet commercial et
   diplomatique (`accordsRestants`, `accordsPaires`, `fileAccords`) étaient vides, et le banc
   concluait à tort qu'il ne restait rien à relire. On force donc un sommet avant d'inspecter. */
try {
  const d = sb.fluxDonnees ? sb.fluxDonnees() : null;
  if (d) {
    d.fileAccords = tous().map(p => p.civ.id);
    if (typeof sb.stAccordsSuivant === 'function') sb.stAccordsSuivant();
  }
} catch (e) { console.log('   (sommet non déclenchable ici : ' + e.message + ')'); }

const nations = new Set(tous());
const estNation = v => v && typeof v === 'object' && v.civ && v.civ.id && v.res;
const trouve = [];
const vus = new WeakSet();
(function explore(o, chemin, prof) {
  if (!o || typeof o !== 'object' || prof > 6) return;
  if (vus.has(o)) return;
  vus.add(o);
  for (const [k, v] of Object.entries(o)) {
    const ici = chemin + '.' + k;
    if (chemin === 'G' && (k === 'player' || k === 'ais')) continue;   // leur place légitime
    if (estNation(v)) { trouve.push({ ou: ici, quoi: 'une nation (' + v.civ.id + ')', connue: nations.has(v) }); continue; }
    if (Array.isArray(v)) {
      const n = v.filter(estNation);
      if (n.length) { trouve.push({ ou: ici, quoi: n.length + ' nation(s) dans un tableau : ' + n.map(x => x.civ.id).join(', '), connue: n.every(x => nations.has(x)) }); continue; }
    }
    if (typeof v === 'object') explore(v, ici, prof + 1);
  }
})(G, 'G', 0);

console.log('═'.repeat(84));
console.log('OBJETS NATION RANGÉS DANS `G` — AUTANT D\'ENDROITS OÙ UNE REPRISE PEUT CASSER');
console.log('═'.repeat(84));
console.log('\nPartie jouée jusqu\'au tour ' + G.turn + ' avant inspection.\n');
if (!trouve.length) {
  console.log('   ✔ aucun objet nation rangé ailleurs que dans `G.player` / `G.ais`.');
  console.log('     Les files utilisent des identifiants : elles survivront à une sauvegarde.');
} else {
  console.log('   ' + trouve.length + ' emplacement(s) à relire — une comparaison d\'identité y serait');
  console.log('   fausse après une sauvegarde/restauration :\n');
  for (const t of trouve) console.log('   · ' + t.ou.padEnd(38) + ' → ' + t.quoi);
  console.log('\n   Pour chacun : vérifier s\'il est comparé par `===` ou `indexOf`. Si oui, ranger');
  console.log('   un identifiant (`civ.id`) plutôt que l\'objet — c\'est la règle du bloc @flux :');
  console.log('   « un nom se sérialise, une référence non ».');
}
console.log('\n' + '═'.repeat(84));
