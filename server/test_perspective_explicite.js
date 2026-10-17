/* ============================================================================
   TEST — UNE ACTION S'EXÉCUTE POUR LA NATION QU'ON LUI DÉSIGNE
   ----------------------------------------------------------------------------
   POURQUOI. La « maladie de fond » de ce projet, décrite dans `ARCHITECTURE_AVENIR.md` : les
   fonctions du moteur lisent `G.player` — « la nation actuellement AFFICHÉE » — au lieu de recevoir
   la nation qui AGIT. En solo les deux coïncident toujours ; à quatre, elles ne coïncident que si
   le serveur a pensé à faire tourner `G.player` juste avant l'appel.

   Ce n'est pas une inquiétude théorique. Les trois défauts les plus graves d'août en venaient tous :
     · attaquer un joueur humain ne faisait RIEN (`getNodeOwnerAI` n'admet que les IA) ;
     · l'accord commercial de deux AUTRES nations s'affichait comme le mien ;
     · la tension se figeait pour TOUT LE MONDE dès qu'une guerre existait quelque part.

   CE QUI A ÉTÉ FAIT. Cinq fonctions reçoivent désormais la nation en argument FACULTATIF :
   `resolveWarCombat`, `doColonize`, `doEstablishRoute`, `buyTech`, `buyGeneral`. Sans l'argument,
   comportement identique à avant. Avec, l'action s'exécute pour la nation nommée.

   ⚠️ CE BANC EXISTE PARCE QU'UN RENOMMAGE N'EST PAS UNE CORRECTION. Remplacer `G.player` par une
   variable locale ne prouve rien tant qu'on ne montre pas que l'action peut RÉELLEMENT s'exécuter
   pour quelqu'un d'autre — et que la nation affichée n'en est pas affectée. C'est ce qu'on mesure :
   l'effet chez la nation désignée, ET l'absence d'effet chez la nation active.

   Usage : node test_perspective_explicite.js
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

function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) {
    n.acLeft = 6; n.res.materials = 20; n.res.energy = 12; n.res.science = 10; n.res.morale = 8;
    n.forceTokens = 8; n._milBoughtThisTurn = new Set();
  }
  const autre = G.ais.find(a => a.civ.id === 'ceinturiens');
  return { sb, G, moi: G.player, autre };
}
/* Un nœud libre, adjacent à une colonie de la nation visée si possible. */
function noeudLibre(m, nat) {
  const NODES = vm.runInContext('NODES', m.sb);
  const pris = new Set();
  for (const n of [m.G.player].concat(m.G.ais)) for (const c of (n.colonies || [])) pris.add(c.nodeId);
  for (const c of (nat.colonies || []))
    for (const adj of ((NODES[c.nodeId] || {}).conn || []))
      if (!pris.has(adj) && !NODES[adj].decorative && !NODES[adj].noColonize) return adj;
  return Object.keys(NODES).find(id => !pris.has(id) && !NODES[id].decorative && !NODES[id].noColonize);
}

console.log('═'.repeat(80));
console.log('PERSPECTIVE — « POUR QUI ? » DEVIENT UNE QUESTION QU\'ON POSE');
console.log('═'.repeat(80) + '\n');

/* ── 1. Coloniser pour une autre nation ───────────────────────────────────── */
console.log('1. doColonize(nœud, AUTRE NATION)');
{
  const m = partie();
  const n = noeudLibre(m, m.autre);
  const colMoiAvant = m.moi.colonies.length, colAutreAvant = m.autre.colonies.length;
  const acMoiAvant = m.moi.acLeft, acAutreAvant = m.autre.acLeft;
  m.sb.doColonize(n, m.autre);
  note('nœud ' + n + ' — colonies : moi ' + colMoiAvant + '→' + m.moi.colonies.length
    + ' · autre ' + colAutreAvant + '→' + m.autre.colonies.length
    + ' · AC : moi ' + acMoiAvant + '→' + m.moi.acLeft + ' · autre ' + acAutreAvant + '→' + m.autre.acLeft);
  if (m.autre.colonies.length === colAutreAvant + 1) ok('la colonie va bien à la nation désignée');
  else ko('la nation désignée n\'a pas reçu la colonie');
  if (m.moi.colonies.length === colMoiAvant) ok('la nation ACTIVE n\'a rien reçu');
  else ko('la nation active a été colonisée à sa place — la perspective fuit encore');
  if (m.moi.acLeft === acMoiAvant) ok('et ses AC n\'ont pas été débités');
  else ko('les AC de la nation active ont été débités (' + (acMoiAvant - m.moi.acLeft) + ')');
}

/* ── 2. CONTRE-ÉPREUVE — sans argument, rien ne change ────────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — sans argument, l\'action reste celle de la nation active');
{
  /* C'est la garantie de non-régression : des dizaines d'appels existants n'ont pas été modifiés.
     Si l'argument facultatif avait changé leur comportement par défaut, tout le jeu basculerait. */
  const m = partie();
  const n = noeudLibre(m, m.moi);
  const avantMoi = m.moi.colonies.length, avantAutre = m.autre.colonies.length;
  m.sb.doColonize(n);
  if (m.moi.colonies.length === avantMoi + 1) ok('sans argument, c\'est bien la nation active qui colonise');
  else ko('la nation active n\'a pas colonisé : les appels existants sont cassés');
  if (m.autre.colonies.length === avantAutre) ok('et personne d\'autre n\'est touché');
  else ko('une autre nation a été affectée');
}

/* ── 3. Acheter une technologie pour une autre nation ─────────────────────── */
console.log('\n3. buyTech(carte, AUTRE NATION)');
{
  const m = partie();
  const id = vm.runInContext("(CARDS_POOL.find(c=>c.branch&&c.tier===1)||{}).id", m.sb);
  const avantMoi = m.moi.cards.length, avantAutre = m.autre.cards.length;
  m.sb.buyTech(id, m.autre);
  note('carte ' + id + ' — cartes : moi ' + avantMoi + '→' + m.moi.cards.length
    + ' · autre ' + avantAutre + '→' + m.autre.cards.length);
  if (m.autre.cards.length > avantAutre) ok('la technologie va à la nation désignée');
  else ko('la nation désignée n\'a pas reçu la technologie');
  if (m.moi.cards.length === avantMoi) ok('la nation active n\'a rien acheté');
  else ko('la nation active a acheté à sa place');
}

/* ── 4. Une carte militaire pour une autre nation ─────────────────────────── */
console.log('\n4. buyGeneral(carte, AUTRE NATION)');
{
  const m = partie();
  const avantMoi = m.moi.cards.length, avantAutre = m.autre.cards.length;
  m.sb.buyGeneral('mil3', m.autre);            // Supercroiseur
  if (m.autre.cards.some(c => c.id === 'mil3')) ok('la carte militaire va à la nation désignée');
  else ko('la nation désignée n\'a pas reçu la carte');
  if (!m.moi.cards.some(c => c.id === 'mil3')) ok('la nation active ne l\'a pas');
  else ko('la nation active a acheté à sa place');
}

/* ── 5. Un combat livré par une autre nation ──────────────────────────────── */
console.log('\n5. resolveWarCombat(jetons, AUTRE NATION)');
{
  const m = partie();
  const cible = m.G.ais.find(a => a.civ.id === 'jupiteriens');
  if (!cible.colonies.some(c => c.nodeId === 'ceres')) cible.colonies.push({ nodeId: 'ceres', level: 1, connected: true });
  cible.forceTokens = 0; cible.res.materials = 0; cible.res.energy = 0;
  m.sb.declarerGuerre(m.autre, cible, 'banc de perspective', 'ai');
  m.G.warWith = cible.civ.id;
  vm.runInContext("_warAttackColonyTarget='ceres'", m.sb);
  const jetMoiAvant = m.moi.forceTokens, jetAutreAvant = m.autre.forceTokens;
  m.sb.setDecisionSink(() => {});
  try { m.sb.resolveWarCombat(3, m.autre); } catch (e) { note('exception : ' + e.message); }
  note('jetons — moi ' + jetMoiAvant + '→' + m.moi.forceTokens + ' · autre ' + jetAutreAvant + '→' + m.autre.forceTokens);
  if (m.autre.forceTokens < jetAutreAvant) ok('c\'est la nation désignée qui a engagé ses jetons');
  else ko('la nation désignée n\'a rien engagé');
  if (m.moi.forceTokens === jetMoiAvant) ok('la nation active n\'a pas payé le combat des autres');
  else ko('la nation active a perdu ' + (jetMoiAvant - m.moi.forceTokens) + ' jeton(s) pour un combat qui n\'est pas le sien');
}

/* ── 6. Ce qui reste — on le compte, on ne le cache pas ───────────────────── */
console.log('\n6. INVENTAIRE — combien de `G.player` restent dans les fonctions traitées ?');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'moteur.js'), 'utf8').split('\n');
  const compte = (nom) => {
    const d = src.findIndex(l => l.startsWith('function ' + nom + '('));
    if (d < 0) return -1;
    let f = d + 1; while (f < src.length && src[f] !== '}') f++;
    return src.slice(d, f + 1).reduce((s, l) => s + (l.split('G.player').length - 1), 0);
  };
  /* ⚠️ L'OBJECTIF N'EST PAS ZÉRO, ET C'EST IMPORTANT. Chaque fonction garde EXACTEMENT UNE lecture :
     `const _n = nation || G.player;` — le repli documenté, celui qui préserve les dizaines d'appels
     existants. Ce qu'on a supprimé, ce sont les lectures ÉPARPILLÉES dans le corps, invisibles à la
     relecture. Passer de vingt-et-une lectures implicites à un repli explicite, c'est là toute la
     correction : la perspective devient une décision qu'on lit en tête de fonction.
     `resolveWarCombat` en tolère deux : son repli, plus `G.warWins.player` — une clé de compteur,
     littéralement le mot « player », que renommer obligerait à migrer les sauvegardes. */
  for (const [nom, tolere, pourquoi] of [
    ['resolveWarCombat', 2, 'le repli + la clé de compteur `G.warWins.player`'],
    ['doColonize', 1, 'le repli `nation || G.player`'],
    ['doEstablishRoute', 1, 'le repli `nation || G.player`'],
    /* ⚠️ `buyTech` EN TOLÈRE QUATRE, ET IL FAUT DIRE POURQUOI PLUTÔT QUE DE RELEVER LE SEUIL EN
       SILENCE. Trois lectures ont été ajoutées le 29/08, toutes de la forme `_n === G.player` :
       c'est la question « est-ce MOI qui regarde ? », pas « de quelle nation parle la règle ».
       §39.3 l'autorise explicitement : *si une fonction applique une RÈGLE elle reçoit la nation ;
       si elle AFFICHE elle peut lire `G.player`.* Et c'est justement leur ABSENCE qui a produit le
       défaut de la partie 4680 : la fenêtre du bâtisseur de la Sphère de Dyson s'ouvrait chez Marc
       quand l'IA achetait, et il annulait l'achat d'une autre nation.
       ⚠️ Ce que ce banc doit continuer d'interdire, c'est une lecture de `G.player` là où la RÈGLE
       s'applique — `_n.res`, `_n.cards`, `_n.acLeft`. Les quatre lectures tolérées sont : le repli,
       et trois comparaisons d'identité. Si le compte monte encore, il faut regarder ce qui a été
       ajouté avant de relever le seuil. */
    ['buyTech', 4, 'le repli, plus trois `_n === G.player` — la question « est-ce moi qui regarde ? » (§39.3)'],
    ['buyGeneral', 1, 'le repli `nation || G.player`'],
  ]) {
    const n = compte(nom);
    if (n < 0) ko(nom + ' introuvable — a-t-elle été renommée ?');
    else if (n <= tolere) ok(nom + ' : ' + n + ' lecture(s) de G.player — ' + pourquoi);
    else ko(nom + ' : ' + n + ' lectures de G.player, ' + (n - tolere) + ' de trop (attendu au plus ' + tolere + ' : ' + pourquoi + ')');
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ Cinq actions savent enfin POUR QUI elles s\'exécutent, sans rien changer aux appels');
console.log('  existants — et la nation affichée n\'est plus affectée par les actions des autres.');
