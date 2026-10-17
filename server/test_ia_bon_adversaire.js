/* ============================================================================
   TEST — UNE IA EN GUERRE RAISONNE SUR SON VRAI BELLIGÉRANT
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie C04C, tour 10 : « 🕊️ ☠️ Ceinturiens cherche la paix avec 🌍 Terriens »
   alors que la guerre en cours est Martiens ↔ Ceinturiens. Une nation ne peut pas demander la paix
   à quelqu'un contre qui elle n'est pas en guerre. Reproduit en banc dès le premier essai.

   LA CAUSE, ET ELLE EST PLUS GRAVE QUE LA PHRASE. Dans `aiWarPolicy` :

       const myWar = _warOf(ai.civ.id);     // ✅ la vraie guerre, lue dans `G.wars`
       const _e    = aiEnnemi(ai);          // ❌ un champ MÉMORISÉ, `ai._enemyId`

   `ai._enemyId` est écrit en début de tour par `_aiResolveTarget` : c'est la CIBLE que l'IA s'est
   choisie (typiquement la nation la plus riche — donc le joueur humain), pas son adversaire de
   guerre. Toute la politique de guerre est ensuite calculée contre cette cible : la force comparée
   (`pForce`), les colonies visées (`_e.colonies`), la colonie à reprendre, et la conclusion
   « winnable ». Une IA en guerre contre une petite IA voisine se croyait donc en guerre contre
   Marc et ses dix-neuf jetons — elle concluait « je ne peux pas gagner », demandait la paix, et
   tenait sa position.

   ⚠️ C'EST L'EXPLICATION DES GUERRES ENTRE IA QUI NE SE MÈNENT PAS. Dans C04C, la guerre
   Jupitériens ↔ Martiens déclarée au tour 6 n'a produit AUCUN combat jusqu'à la fin, pendant que
   les deux nations perdaient 4🙂 par tour d'usure. Elles ne se battaient pas parce qu'elles
   regardaient toutes les deux ailleurs. J'avais d'abord attribué cela au flux de fenêtres — c'était
   faux, et ce banc mesure la vraie cause.

   Usage : node test_ia_bon_adversaire.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function partie() {
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: true },
          { civId: 'jupiteriens', isAI: true }, { civId: 'ceinturiens', isAI: true }], () => {});
  const G = d.sb.__G;
  G.turn = 6; G.phase = 'actions';
  return { d, G };
}
const nat = (G, id) => [G.player].concat(G.ais || []).find(p => p && p.civ && p.civ.id === id);
function guerre(G, idA, idB) {
  G.wars = [{ a: idA, b: idB, winsBy: { [idA]: 0, [idB]: 0 }, turnsLeft: 99, justDeclared: false,
              reason: 'test', declaredBy: 'other', agresseurCiv: idA, live: true, aiRecaptureTarget: null }];
}
/* Donne à la victime une colonie ordinaire et reliée, en plus de sa capitale.
   ⚠️ HISTORIQUE, PARCE QUE ÇA M'A COÛTÉ DEUX FAUX DIAGNOSTICS. Mon premier jet laissait aux
   Martiens leur seule colonie de départ, Phobos — leur capitale. À l'époque l'IA s'interdisait de
   viser une capitale : aucune cible, donc « je ne peux pas gagner », donc demande de paix, quelle
   que soit la force comparée — le banc rougissait pour une raison étrangère à ce qu'il mesurait.
   Depuis la v10.05 la capitale EST attaquable (choix de Marc), et le piège s'est inversé : la cible
   existe toujours, et c'est le rapport de forces qui décide. On garde donc cette colonie ordinaire
   pour que ce soit bien la FORCE, et non la disponibilité d'une cible, qui explique la décision. */
function colonieOrdinaire(n) {
  if (!n.colonies.some(c => c.nodeId === 'encelade'))
    n.colonies.push({ nodeId: 'encelade', level: 1, connected: true });
}
/* Fait jouer un tour COMPLET à l'IA visée et rend les lignes de journal produites.
   ⚠️ LE SECOND ARGUMENT DE `doAITurn(nat, oneShot)` N'EST PAS UN OBJET D'OPTIONS : passer `{}` vaut
   `oneShot = true`. Et c'est bien ce qu'il faut ici — en mode `oneShot`, l'IA fait sa mise en place
   (dont `aiWarPolicy`) puis joue une action et rend la main. Sans lui, elle déroule un tour complet
   qui, dans un montage artificiel comme celui-ci, se termine en silence : le banc mesurait alors
   une fonction qui n'avait pas tourné, et rendait des verts qui ne prouvaient rien. Je m'y suis
   laissé prendre dans les deux sens avant de le vérifier. */
function tourDe(m, id) {
  const G = m.G, n = nat(G, id), avant = G.log.length;
  try { m.d.sb.doAITurn(n, {}); } catch (e) { /* la fin de tour peut ouvrir une décision */ }
  return G.log.slice(0, Math.max(0, G.log.length - avant)).map(e => e.msg);
}
const cherchePaixAvec = lignes => {
  const l = lignes.find(m => /cherche la paix avec/.test(m));
  if (!l) return null;
  return /Terriens/.test(l) ? 'terriens' : /Martiens/.test(l) ? 'martiens'
       : /Jupitériens/.test(l) ? 'jupiteriens' : /Ceinturiens/.test(l) ? 'ceinturiens' : '?';
};

console.log('═'.repeat(84));
console.log('L\'IA EN GUERRE — CONTRE QUI CROIT-ELLE SE BATTRE ?');
console.log('═'.repeat(84) + '\n');

/* ── 1. La demande de paix va au belligérant, pas à la cible du tour ───────── */
console.log('1. Une IA en guerre contre une autre IA demande la paix À CETTE IA');
{
  const m = partie();
  guerre(m.G, 'jupiteriens', 'martiens');
  /* Jupitériens est faible : elle voudra la paix. La question est : à QUI la demande-t-elle ?
     Le joueur humain est fait très riche, pour être la cible naturelle de `_aiResolveTarget`. */
  const J = nat(m.G, 'jupiteriens'), T = nat(m.G, 'terriens');
  /* ⚠️ CE POINT DOIT ÊTRE DÉTERMINISTE, ET IL NE L'ÉTAIT PAS. Ma première version comptait sur
     l'absence de cible (Martiens réduit à sa capitale) : depuis que la capitale est attaquable,
     la cible existe, et c'est le RAPPORT DE FORCES qui décide — or il est lu à travers le
     brouillard (`perceivedForce` : ±3 au hasard sans le 📡 Réseau Orbital). Le banc passait ou
     échouait selon le tirage. On lève donc le brouillard sur Jupitériens (elle voit exact), on lui
     donne un adversaire écrasant, et on lui laisse une vraie colonie à convoiter : elle renonce
     alors pour une raison NETTE, et l'on peut vérifier à qui elle adresse sa demande.
     Avant correction, elle répondait « Terriens » — une nation contre qui elle n'était pas en
     guerre. C'est le symptôme exact du tour 10 de la partie C04C. */
  const _orb = vm.runInContext("CARDS_POOL.find(c=>c.spec==='intel_2')", m.d.sb);
  if (_orb) J.cards = (J.cards || []).concat([_orb]);
  colonieOrdinaire(nat(m.G, 'martiens'));
  nat(m.G, 'martiens').forceTokens = 20;
  J.forceTokens = 1; J.res.morale = 8; J.res.energy = 20; J.res.materials = 20;
  T.forceTokens = 25; T.res.materials = 80; T.res.energy = 80;
  const qui = cherchePaixAvec(tourDe(m, 'jupiteriens'));
  note('destinataire de la demande de paix : ' + (qui || 'aucune demande émise'));
  if (qui === 'martiens') ok('elle s\'adresse à son vrai belligérant');
  else if (qui === null) ko('aucune demande émise — le scénario ne mesure plus rien');
  else ko('elle demande la paix à ' + qui + ', contre qui elle n\'est pas en guerre');
}

/* ── 2. CONTRE-ÉPREUVE — en guerre contre le joueur, elle nomme le joueur ──── */
console.log('\n2. CONTRE-ÉPREUVE — en guerre contre le joueur, c\'est bien lui qu\'elle nomme');
{
  /* Sans ce point, on « corrigerait » en excluant purement et simplement le joueur du calcul. */
  const m = partie();
  guerre(m.G, 'jupiteriens', 'terriens');
  const J = nat(m.G, 'jupiteriens'), T = nat(m.G, 'terriens');
  colonieOrdinaire(T);
  J.forceTokens = 0; J.res.morale = 4; J.res.energy = 0; J.res.materials = 0;
  T.forceTokens = 20;
  const qui = cherchePaixAvec(tourDe(m, 'jupiteriens'));
  note('destinataire : ' + (qui || 'aucune demande émise'));
  if (qui === 'terriens' || qui === null) ok('le joueur reste un adversaire comme un autre');
  else ko('elle s\'adresse à ' + qui + ' alors que sa guerre est contre le joueur');
}

/* ── 3. LE POINT QUI COMPTE — elle ne renonce pas à cause d'un tiers ───────── */
console.log('\n3. Une IA en guerre contre un adversaire FAIBLE ne doit pas renoncer');
{
  /* ⚠️ C'EST ICI QUE SE JOUE « LES GUERRES ENTRE IA NE SE MÈNENT PAS ». Jupitériens est solide,
     son belligérant Martiens est à genoux, et le joueur humain est écrasant mais HORS DE CETTE
     GUERRE. En lisant `ai._enemyId` (= le joueur, le plus riche), elle se croyait perdue d'avance
     et demandait la paix. En lisant sa vraie guerre, elle doit vouloir se battre. */
  const m = partie();
  guerre(m.G, 'jupiteriens', 'martiens');
  const J = nat(m.G, 'jupiteriens'), M = nat(m.G, 'martiens'), T = nat(m.G, 'terriens');
  colonieOrdinaire(M);
  J.forceTokens = 8; J.res.morale = 8; J.res.energy = 20; J.res.materials = 20;
  M.forceTokens = 0; M.res.morale = 4; M.res.energy = 0; M.res.materials = 0;
  T.forceTokens = 25; T.res.materials = 80; T.res.energy = 80;
  const lignes = tourDe(m, 'jupiteriens');
  const renonce = /cherche la paix/.test(lignes.join('\n'));
  note('Jupitériens 8 jetons vs Martiens 0 · le joueur (hors guerre) en a 25');
  note(renonce ? 'elle demande la paix' : 'elle ne demande pas la paix');
  if (!renonce) ok('elle juge sa guerre sur son adversaire, pas sur un tiers');
  else ko('elle renonce face à un adversaire sans jetons — elle regarde le joueur, pas lui');
}

/* ── 4. CONTRE-ÉPREUVE UNITAIRE — `adversaireDeGuerre` dit bien qui est en face ── */
console.log('\n4. CONTRE-ÉPREUVE — la fonction ajoutée rend le bon camp, des deux côtés');
{
  /* ⚠️ POURQUOI UN CONTRÔLE UNITAIRE ICI. Les points 1 à 3 passent par un tour d'IA complet, avec
     ses mises en place et ses retours anticipés : j'ai vu ce montage rendre des verts qui ne
     prouvaient rien parce que la fonction visée n'avait pas tourné. Ce point-ci ne dépend d'aucun
     tour : il interroge directement la fonction que la correction ajoute, dans les deux sens et
     dans le cas d'une nation étrangère à la guerre — ce qui garantit qu'on n'a pas simplement
     rendu l'IA aveugle à tout le monde. */
  const m = partie();
  guerre(m.G, 'jupiteriens', 'martiens');
  const w = m.G.wars[0];
  const f = m.d.sb.adversaireDeGuerre;
  if (typeof f !== 'function') { ko('`adversaireDeGuerre` introuvable'); }
  else {
    const vuDeJ = f(nat(m.G, 'jupiteriens'), w), vuDeM = f(nat(m.G, 'martiens'), w);
    const vuDeT = f(nat(m.G, 'terriens'), w);
    note('vu des Jupitériens : ' + ((vuDeJ && vuDeJ.civ.id) || 'null')
       + ' · vu des Martiens : ' + ((vuDeM && vuDeM.civ.id) || 'null')
       + ' · vu des Terriens (hors guerre) : ' + ((vuDeT && vuDeT.civ.id) || 'null'));
    if (vuDeJ && vuDeJ.civ.id === 'martiens') ok('depuis l\'un des camps, elle rend l\'autre');
    else ko('depuis les Jupitériens elle rend ' + ((vuDeJ && vuDeJ.civ.id) || 'null'));
    if (vuDeM && vuDeM.civ.id === 'jupiteriens') ok('et réciproquement');
    else ko('depuis les Martiens elle rend ' + ((vuDeM && vuDeM.civ.id) || 'null'));
    if (vuDeT === null) ok('une nation étrangère à la guerre n\'a pas d\'adversaire dans celle-ci');
    else ko('elle donne un adversaire à une nation qui n\'est pas dans cette guerre');
  }
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une IA en guerre lit sa guerre : elle s\'adresse à son belligérant, mesure ses');
console.log('   forces contre les siennes, et ne renonce qu\'en face de LUI.');
console.log('═'.repeat(84));
