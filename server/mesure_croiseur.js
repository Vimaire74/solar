/* ============================================================================
   MESURE — LE SUPERCROISEUR COCHÉ ARRIVE-T-IL JUSQU'AU COMBAT ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie du 16/08, tour 10. Il possède le Supercroiseur, confirme avoir coché la
   case à chaque combat, et le journal donne :

       combat 1 : 1 jeton  → puissance 1   « techs : … Supercroiseur »   défaite 1 vs 4
       combat 2 : 2 jetons → puissance 2   « techs : … Supercroiseur »   défaite 2 vs 3
       combat 3 : 6 jetons → puissance 11 (+5 supercroiseur)             victoire

   Les deux premiers sont des assauts de la PHASE D'ACTIONS (intention `{type:'attack'}` envoyée au
   serveur) ; le troisième est un combat de FIN DE TOUR (question `war_combat`). Seul le second
   chemin transportait le champ `cruiser`. Le premier envoyait `{type:'attack', node, tokens}` —
   et le serveur, qui pose `G._cruiserDeployed = !!a.cruiser`, lisait donc `undefined`.

   DEUX MESURES, PARCE QU'IL Y A DEUX PIÈCES.
     1. LE SERVEUR honore-t-il le champ ? On applique la MÊME action deux fois, avec et sans
        `cruiser:true`, et on compare les puissances. L'écart doit valoir exactement la puissance du
        croiseur. Le cas « sans » est la reproduction fidèle de ce qu'a vécu Marc : c'est lui la
        contre-épreuve, et il doit ÉCHOUER à déployer, sinon le banc ne prouve rien.
     2. LE CLIENT envoie-t-il le champ ? Une mesure du serveur seul serait un piège : il pouvait
        déjà lire `a.cruiser` avant le correctif — c'est le client qui ne l'écrivait pas. On vérifie
        donc que les deux intentions d'attaque d'`online.js` le portent.

   Usage : node mesure_croiseur.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { Engine } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

/* Une nation adverse avec une colonie connectée et prenable, et un joueur qui a le croiseur. */
function montage(sb) {
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  const moi = G.player, cible = G.ais[0];
  G.turn = 8; G.phase = 'actions';
  moi._isAI = false; moi.acLeft = 5;
  moi.hasCruiser = true; moi.cruiserPower = 5; moi.cruiserCooldown = 0;
  moi.forceTokens = 20; moi.res.materials = 20; moi.res.energy = 12; moi.res.morale = 8;
  cible._isAI = true; cible.forceTokens = 1; cible.res.materials = 1; cible.res.energy = 1;
  /* Au tour 1 personne n'a de colonie hors base : on en pose une à la cible, sinon il n'y a
     simplement rien à assaillir et le banc se croirait « sans écart » faute de combat. */
  let col = (cible.colonies || []).find(c => c.nodeId !== cible.civ.home);
  if (!col) {
    const pris = new Set();
    for (const n of [G.player].concat(G.ais)) for (const c of (n.colonies || [])) pris.add(c.nodeId);
    const tous = vm.runInContext('Object.keys(NODES).filter(id=>!NODES[id].decorative)', sb);
    const libre = tous.find(id => !pris.has(id));
    if (!libre) return { sb, G, moi, cible, node: null };
    col = { nodeId: libre, level: 1, connected: true };
    cible.colonies.push(col);
  }
  col.connected = true;
  return { sb, G, moi, cible, node: col.nodeId };
}

/* Rejoue l'action d'assaut telle que le serveur la reçoit, et lit la puissance obtenue. */
function assaut(avecCroiseur) {
  const eng = new Engine(HTML);
  const m = montage(eng.sb);                      // le montage se fait DANS le bac à sable du moteur
  if (!m.node) return { erreur: 'aucune colonie assaillable dans le montage' };
  const action = { type: 'attack', node: m.node, tokens: 3 };
  if (avecCroiseur) action.cruiser = true;        // ce que le client envoie DÉSORMAIS
  try { eng.apply(action); } catch (e) { return { erreur: e.message }; }
  let puissance = null, deploye = false, mention = null;
  for (const l of (m.G.log || [])) {
    const t = String((l && (l.msg || l.t || l.text)) || l);
    if (t.includes('Supercroiseur déployé')) deploye = true;
    if (puissance === null && t.includes(m.moi.civ.name) && t.includes('jeton(s) engagé(s) ·')) {
      const p = t.match(/puissance (\d+)/); if (p) puissance = parseInt(p[1], 10);
      if (/Supercroiseur/.test(t)) mention = /DÉPLOYÉ/.test(t) ? 'déployé' : 'au port';
    }
  }
  return { puissance, deploye, mention };
}

console.log('═'.repeat(78));
console.log('SUPERCROISEUR — du clic jusqu\'au calcul de puissance');
console.log('═'.repeat(78) + '\n');

let dur = 0;

console.log('1. LE SERVEUR HONORE-T-IL LE CHAMP `cruiser` ?');
const sans = assaut(false), avec = assaut(true);
if (sans.erreur || avec.erreur) {
  console.log('   ININTERPRÉTABLE — ' + (sans.erreur || avec.erreur));
  process.exit(1);
}
console.log('   sans `cruiser` (l\'ancien client) : puissance ' + sans.puissance
  + ' · déployé : ' + (sans.deploye ? 'oui' : 'non') + ' · récapitulatif : ' + (sans.mention || '—'));
console.log('   avec `cruiser:true`              : puissance ' + avec.puissance
  + ' · déployé : ' + (avec.deploye ? 'oui' : 'non') + ' · récapitulatif : ' + (avec.mention || '—'));
if (sans.deploye) { console.log('   ⚠️ CONTRE-ÉPREUVE INVALIDE : le croiseur part même sans le champ — le banc ne mesure rien.'); dur = 1; }
else if (!avec.deploye) { console.log('   ❌ Le champ est envoyé mais le croiseur ne part pas.'); dur = 1; }
else if (avec.puissance - sans.puissance !== 5) { console.log('   ❌ Écart de puissance ' + (avec.puissance - sans.puissance) + ', attendu 5.'); dur = 1; }
else console.log('   ✔ +5 exactement, et seulement quand la case est cochée.');
/* L'AFFICHAGE : sans déploiement, le récapitulatif ne doit plus annoncer une force absente. */
if (sans.mention === 'déployé') { console.log('   ❌ Le récapitulatif annonce « déployé » alors qu\'il ne l\'est pas.'); dur = 1; }
else if (sans.mention === 'au port') console.log('   ✔ Le récapitulatif dit « au port » au lieu de laisser croire au +5.');

console.log('\n2. LE CLIENT ENVOIE-T-IL LE CHAMP ?');
/* Sans ce second point, le premier serait un faux vert : le serveur savait DÉJÀ lire `a.cruiser`
   avant le correctif — c'est l'intention construite par online.js qui ne l'écrivait pas. */
const src = fs.readFileSync(path.join(__dirname, '..', 'online.js'), 'utf8');
for (const nom of ['confirmWarCombat']) {   // `confirmAttack` (ancienne fenêtre) supprimé le 06/09
  const i = src.indexOf(nom + ':');
  const bloc = i >= 0 ? src.slice(i, src.indexOf('\n  },', i) + 1) : '';
  const ok = /type:\s*'attack'[\s\S]*cruiser\s*:/.test(bloc);
  console.log('   ' + (ok ? '✔' : '❌') + ' ' + nom + ' — l\'intention ' + (ok ? 'porte' : 'NE PORTE PAS') + ' le croiseur');
  if (!ok) dur = 1;
}

console.log('\n' + '─'.repeat(78));
console.log(dur ? '❌ Le croiseur ne traverse pas encore toute la chaîne.'
                : '✔ Coché côté client, transmis, déployé, compté — et annoncé pour ce qu\'il est.');
process.exit(dur);
