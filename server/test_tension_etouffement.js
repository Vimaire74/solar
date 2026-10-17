/* ============================================================================
   TEST — LE RAID QUI FAIT MAL, ET LA COLÈRE DES NATIONS ENFERMÉES
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-24, après avoir relu les causes de tension une à une :

     · « Le raid doit voler le revenu de la colonie du tour et pas seulement deux ressources à
       choix. » — et la tension monte de +3 chez la victime (Marc, 04/09 : +5 était « trop violent »,
       retour au réglage d'origine ; plus aucun malus de moral au raid), +1 chez le pillard.
     · « Si une nation bloque la progression vers des colonies (par exemple en colonisant sur le
       chemin qu'on veut prendre) +4 de tension. »
     · « Si les autres nations ont trois colonies ou plus et qu'une nation n'arrive pas à en avoir
       plus qu'une ou deux, +6 de tension populaire. Si ça continue chaque tour +1 jusqu'à la
       guerre. Ça forcera les IA faibles à faire quelque chose contre les autres. »
     · « Un tempérament acculée c'est bien, implémente. »

   CE QUE CE BANC MESURE, ET POURQUOI CHAQUE CAS PORTE SA CONTRE-ÉPREUVE.
   Une règle de tension est une règle qui DÉCLENCHE : si elle se déclenche trop, elle met le
   plateau entier en guerre. C'est exactement ce qui s'est produit au premier réglage — les deux
   nouveaux griefs étaient RÉPÉTÉS à chaque tour, `mesure_tensions.js` a relevé 67 guerres
   populaires en dix parties contre 10 sur le témoin figé. La tension s'accumule d'un tour sur
   l'autre et le seuil est 10 : un grief permanent de +4 déclare la guerre en trois tours, à tout
   le monde, dès que la carte se remplit.
   Chaque cas vérifie donc DEUX choses opposées : que la règle se déclenche quand elle doit, et
   qu'elle NE se déclenche PAS quand elle ne doit pas — voisinage ordinaire, tour suivant, nation
   non désignée. Sans cette seconde moitié, un banc vert ne prouverait que l'existence du code.

   MÉTHODE. On isole. Les scénarios sont construits sans route, sans technologie de rang 3 et avec
   des écarts de colonies trop faibles pour réveiller les autres griefs : la variation de tension
   observée après `updateTension()` est donc entièrement imputable à la règle testée. Le banc
   affiche la variation brute, pas seulement un verdict.

   Usage : node test_tension_etouffement.js
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

/* Une partie neutre : personne n'a de route, personne n'a de carte, les tensions sont à zéro et
   la nation active est une IA comme les autres (« l'IA est une nation comme une autre »). */
function partie() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  for (const n of [G.player].concat(G.ais)) {
    n.routes = []; n.cards = []; n.acLeft = 6;
    n.res.energy = 20; n.res.materials = 20; n.res.science = 20; n.res.morale = 10;
    n.forceTokens = 6; n.forceCooldown = [];
  }
  G.tens = {};
  return { sb, G, A: G.ais[0], B: G.ais[1], C: G.ais[2] };
}
const NODESde = sb => vm.runInContext('NODES', sb);
/* Voisins colonisables d'un nœud — les seules cases par lesquelles une nation peut sortir. */
function voisins(sb, id) {
  const N = NODESde(sb);
  return ((N[id] || {}).conn || []).filter(a => N[a] && !N[a].decorative && !N[a].noColonize);
}
/* Un nœud dont on connaît le voisinage, choisi pour que le scénario reste lisible. */
function noeudAvecVoisins(sb, min, max) {
  const N = NODESde(sb);
  for (const id of Object.keys(N)) {
    if (N[id].decorative || N[id].noColonize) continue;
    const v = voisins(sb, id);
    if (v.length >= min && v.length <= max) return id;
  }
  return null;
}
/* Poser un décor de colonies sans passer par les règles d'achat : on teste la tension, pas la
   colonisation. `connected:false` pour les colonies de remplissage, qui ne doivent compter ni
   dans l'étouffement ni dans la domination. */
function poser(nat, ids, connected) {
  nat.colonies = ids.map(id => ({ nodeId: id, level: 1, connected: !!connected }));
}
const tens = (sb, x, y) => sb.getTens(x.civ.id, y.civ.id) || 0;

console.log('═'.repeat(80));
console.log('RAID, BLOCAGE, ÉTOUFFEMENT — LES NOUVELLES COLÈRES');
console.log('═'.repeat(80) + '\n');

/* ── 1. LE RAID VOLE LA PRODUCTION D'UNE COLONIE ──────────────────────────── */
console.log('1. Le butin d\'un raid est le revenu de la colonie pillée');
{
  const m = partie();
  const N = NODESde(m.sb);
  /* On choisit la colonie la plus productive de la victime et on calcule ce qu'elle rapporte
     par la MÊME fonction que les revenus de fin de tour — c'est tout l'intérêt de l'avoir
     extraite : le butin et le revenu ne peuvent plus diverger. */
  const cible = m.B;
  const col = (cible.colonies || []).filter(c => c.connected)[0];
  if (!col) ko('la victime n\'a aucune colonie connectée — scénario invalide');
  else {
    const attendu = m.sb.revenuDuneColonie(cible, col);
    const b = m.sb.butinDeRaid(cible, col.nodeId);
    note('colonie ' + ((N[col.nodeId] || {}).name || col.nodeId) + ' — revenu du tour : '
      + JSON.stringify(attendu) + ' · butin annoncé : ' + JSON.stringify(b.butin));
    const memeCol = b.col && b.col.nodeId === col.nodeId;
    if (memeCol) ok('le butin porte bien sur la colonie désignée');
    else ko('butinDeRaid a pillé une autre colonie que celle demandée');
    let concorde = true;
    for (const k of ['energy', 'materials', 'science'])
      if ((b.butin[k] || 0) !== Math.min(attendu[k] || 0, cible.res[k] || 0)) concorde = false;
    if (concorde) ok('chaque ressource volée vaut le revenu du tour, plafonné à ce qu\'elle possède');
    else ko('le butin ne correspond pas au revenu de la colonie');
    if (!('morale' in b.butin)) ok('le moral n\'est pas pillable — on ne vole pas l\'opinion d\'un peuple');
    else ko('le raid vole du moral');
  }
}

/* ── 2. CONTRE-ÉPREUVE — des coffres vides ne donnent rien ────────────────── */
console.log('\n2. CONTRE-ÉPREUVE — une nation sans réserve ne peut être dépouillée');
{
  /* Le revenu est le MONTANT du vol, pas sa source : si la victime a déjà tout dépensé, le
     pillard repart les mains vides. Sans ce plafond, un raid créerait des ressources. */
  const m = partie();
  m.B.res.energy = 0; m.B.res.materials = 0; m.B.res.science = 0;
  const b = m.sb.butinDeRaid(m.B, null);
  const total = Object.values(b.butin).reduce((s, v) => s + v, 0);
  note('coffres vides — butin total : ' + total);
  if (total === 0) ok('rien à prendre : le raid ne fabrique pas de ressources');
  else ko('le raid a volé ' + total + ' ressource(s) à une nation qui n\'avait rien');
}

/* ── 3. LA TENSION APRÈS UN RAID : +3 CHEZ LA VICTIME, +1 CHEZ LE PILLARD ── */
console.log('\n3. Un raid coûte 5 de tension à qui le subit, 1 à qui le commet');
{
  const m = partie();
  const pillard = m.G.player, victime = m.B;
  const avantV = tens(m.sb, victime, pillard), avantP = tens(m.sb, pillard, victime);
  const enAvant = victime.res.energy + victime.res.materials + victime.res.science;
  m.sb.setDecisionSink(() => {});
  m.sb.doRaidTarget(victime.civ.id, null, pillard);
  const apresV = tens(m.sb, victime, pillard), apresP = tens(m.sb, pillard, victime);
  const enApres = victime.res.energy + victime.res.materials + victime.res.science;
  note('tension victime→pillard ' + avantV + '→' + apresV + ' · pillard→victime ' + avantP + '→' + apresP
    + ' · réserves de la victime ' + enAvant + '→' + enApres);
  if (apresV - avantV === 3) ok('la victime en veut au pillard : +3');
  else ko('tension de la victime +' + (apresV - avantV) + ' au lieu de +3');
  if (apresP - avantP === 1) ok('le pillard se méfie de celle qu\'il a volée : +1');
  else ko('tension du pillard +' + (apresP - avantP) + ' au lieu de +1');
  if (enApres < enAvant) ok('et le vol a réellement eu lieu (' + (enAvant - enApres) + ' ressource(s) déplacées)');
  else ko('aucune ressource n\'a changé de main : le raid n\'a rien fait');
}

/* ── 4. BLOCAGE DE CHEMIN — +4, UNE SEULE FOIS ────────────────────────────── */
console.log('\n4. Une nation qui barre la seule sortie d\'une autre : +4');
{
  const m = partie();
  const centre = noeudAvecVoisins(m.sb, 2, 4);
  const v = voisins(m.sb, centre);
  /* A est seule sur `centre`. B occupe TOUTES ses sorties : A n'a plus nulle part où aller.
     Les colonies de B sont déclarées non connectées pour n'éveiller ni la domination ni
     l'étouffement — on veut lire le +4 et rien d'autre. */
  poser(m.A, [centre], true);
  poser(m.B, v, false);
  poser(m.C, [], false);
  poser(m.G.player, [], false);
  note('nœud ' + centre + ' — sorties : ' + v.join(', ') + ' (toutes tenues par ' + m.B.civ.name + ')');
  /* Marc, 21/09 : le blocage ne se juge qu'à partir du tour 4. Au tour 3, rien — et rien n'est
     « vu » : il reste facturable au tour 4. */
  m.G.turn = 3; const _t3a = tens(m.sb, m.A, m.B); m.sb.updateTension();
  if (tens(m.sb, m.A, m.B) <= _t3a) ok('tour 3 : pas de grief de blocage'); else ko('blocage facturé au tour 3');
  m.G.turn = 4;
  const bloque = m.sb.bloqueLExpansion(m.A, m.B);
  if (bloque) ok('bloqueLExpansion reconnaît l\'enfermement');
  else ko('bloqueLExpansion ne voit pas l\'enfermement — scénario ou règle en défaut');
  const avant = tens(m.sb, m.A, m.B);
  m.sb.updateTension();
  const apres = tens(m.sb, m.A, m.B);
  note('tension ' + m.A.civ.name + '→' + m.B.civ.name + ' : ' + avant + ' → ' + apres);
  if (apres - avant === 4) ok('la colère monte de 4 le tour où le blocage s\'installe');
  else ko('variation de ' + (apres - avant) + ' au lieu de +4');
  /* ⚠️ LE TOUR SUIVANT EST LE VRAI TEST. C'est ici que le premier réglage explosait : le grief
     étant réévalué à chaque tour, il ajoutait +4 indéfiniment et la guerre arrivait en trois
     tours. Le blocage est un ACTE, il se paie une fois. */
  m.G.turn++;
  m.sb.updateTension();
  const t3 = tens(m.sb, m.A, m.B);
  note('tour suivant, même situation : ' + apres + ' → ' + t3);
  if (t3 <= apres) ok('le tour suivant n\'ajoute rien — le grief est un acte, pas une rente');
  else ko('le blocage a rechargé +' + (t3 - apres) + ' au tour suivant : la tension va exploser');
}

/* ── 5. CONTRE-ÉPREUVE — être voisin n'est pas bloquer ─────────────────────── */
console.log('\n5. CONTRE-ÉPREUVE — un simple voisin ne bloque personne');
{
  /* Si la règle se contentait du voisinage, elle frapperait tout le monde en permanence : sur
     une carte pleine, chaque nation touche chaque autre. Il faut être RÉELLEMENT à l'étroit. */
  const m = partie();
  const centre = noeudAvecVoisins(m.sb, 3, 4);
  const v = voisins(m.sb, centre);
  poser(m.A, [centre], true);
  poser(m.B, [v[0]], false);          // B prend UNE sortie, les autres restent libres
  poser(m.C, [], false);
  poser(m.G.player, [], false);
  note('sorties de ' + m.A.civ.name + ' : ' + v.length + ' dont ' + (v.length - 1) + ' libre(s)');
  if (!m.sb.bloqueLExpansion(m.A, m.B)) ok('voisin mais pas bloquant : aucun grief');
  else ko('la règle se déclenche sur un simple voisinage — elle frappera tout le plateau');
  const avant = tens(m.sb, m.A, m.B);
  m.sb.updateTension();
  const apres = tens(m.sb, m.A, m.B);
  note('tension ' + avant + ' → ' + apres);
  if (apres <= avant) ok('et la tension ne monte pas');
  else ko('la tension a monté de ' + (apres - avant) + ' sans blocage réel');
}

/* ── 6. ÉTOUFFEMENT — +6 PUIS +1 PAR TOUR, CONTRE UNE SEULE NATION ────────── */
console.log('\n6. Une nation cantonnée à deux colonies quand les autres en ont cinq (dès le tour 6) : +6 puis +1');
{
  const m = partie();
  m.G.turn = 6;   // Marc, 21/09 : l'étouffement ne se juge qu'à partir du tour 6
  const N = NODESde(m.sb);
  const libres = Object.keys(N).filter(id => !N[id].decorative && !N[id].noColonize);
  /* A stagne à deux colonies ; B en a trois et occupe une de ses sorties — c'est donc B que la
     rue désigne. C en a trois aussi mais ne touche pas A : elle ne doit RIEN recevoir. */
  const centre = noeudAvecVoisins(m.sb, 3, 4);
  const v = voisins(m.sb, centre);
  const loin = libres.filter(id => id !== centre && !v.includes(id));
  poser(m.A, [centre], true);
  /* Marc, 21/09 : les autres doivent avoir CINQ colonies. Les colonies de remplissage sont non
     connectées pour ne pas réveiller la dominance (qui compte les colonies connectées). */
  poser(m.B, [v[0], loin[0], loin[1], loin[8], loin[9]], false); m.B.colonies[0].connected = true;
  poser(m.C, [loin[2], loin[3], loin[4], loin[10], loin[11]], false);
  /* ⚠️ TOUTES LES AUTRES, PAS SEULEMENT DEUX. La règle dit « si les AUTRES nations ont trois
     colonies ou plus » : la nation active doit donc être à trois elle aussi, sinon A n'est pas
     distancée par tout le monde — elle est simplement deuxième ex æquo. */
  poser(m.G.player, [loin[5], loin[6], loin[7], loin[12], loin[13]], false);
  note(m.A.civ.name + ' : 1 colonie · les TROIS autres : 5 chacune, dont '
    + m.B.civ.name + ' sur sa sortie');
  /* Contre-épreuves du calendrier et du seuil (Marc, 21/09). */
  m.G.turn = 5;
  if (!m.sb.estEtouffee(m.A)) ok('tour 5 : pas encore d\'étouffement'); else ko('étouffement jugé avant le tour 6');
  m.G.turn = 6;
  const _der = m.C.colonies.pop();
  if (!m.sb.estEtouffee(m.A)) ok('si une des autres n\'a que 4 colonies : pas d\'étouffement'); else ko('étouffement avec une nation à 4 colonies');
  m.C.colonies.push(_der);
  if (m.sb.estEtouffee(m.A)) ok('estEtouffee reconnaît la nation cantonnée');
  else ko('estEtouffee ne voit pas l\'étouffement — scénario ou règle en défaut');
  const princ = m.sb.principalBloqueur(m.A);
  if (princ === m.B) ok('le principal bloqueur désigné est bien celui qui occupe sa sortie');
  else ko('principalBloqueur désigne ' + (princ ? princ.civ.name : 'personne') + ' au lieu de ' + m.B.civ.name);

  const avB = tens(m.sb, m.A, m.B), avC = tens(m.sb, m.A, m.C);
  m.sb.updateTension();
  const apB = tens(m.sb, m.A, m.B), apC = tens(m.sb, m.A, m.C);
  note('tension ' + m.A.civ.name + '→' + m.B.civ.name + ' : ' + avB + '→' + apB
    + ' · vers ' + m.C.civ.name + ' : ' + avC + '→' + apC);
  if (apB - avB >= 6) ok('la colère éclate d\'un coup contre celle qui l\'enferme : +' + (apB - avB));
  else ko('variation de ' + (apB - avB) + ' au lieu de +6 au moins');
  /* ⚠️ UNE SEULE CIBLE, C'EST LE CHOIX DE MARC. Répartir la colère mettrait la nation la plus
     faible en guerre contre trois adversaires à la fois : elle serait balayée partout. */
  if (apC <= avC) ok('et les autres nations ne reçoivent rien — un seul ennemi désigné');
  else ko('la colère a aussi visé ' + m.C.civ.name + ' (+' + (apC - avC) + ') : trois fronts pour la plus faible');

  m.G.turn++;
  m.sb.updateTension();
  const t3 = tens(m.sb, m.A, m.B);
  note('tour suivant, toujours enfermée : ' + apB + ' → ' + t3);
  if (t3 - apB === 1) ok('puis la rancune s\'entretient de +1 par tour, jusqu\'à la guerre');
  else ko('variation de ' + (t3 - apB) + ' au tour suivant au lieu de +1');
}

/* ── 7. CONTRE-ÉPREUVE — ni au premier tour, ni pour une nation qui s'étend ── */
console.log('\n7. CONTRE-ÉPREUVE — l\'étouffement suppose que la partie ait commencé');
{
  const m = partie();
  m.G.turn = 1;
  if (!m.sb.estEtouffee(m.A)) ok('au tour 1, personne n\'étouffe : tout le monde débute à égalité');
  else ko('l\'étouffement se déclenche dès le tour 1, avant que quiconque ait pu s\'étendre');
  m.G.turn = 6;
  const N = NODESde(m.sb);
  const libres = Object.keys(N).filter(id => !N[id].decorative && !N[id].noColonize);
  poser(m.A, [libres[0], libres[1], libres[2]], true);
  if (!m.sb.estEtouffee(m.A)) ok('et une nation à trois colonies n\'étouffe plus');
  else ko('une nation à trois colonies est déclarée étouffée');
}

/* ── 8. LE TEMPÉRAMENT ACCULÉE ────────────────────────────────────────────── */
console.log('\n8. La nation enfermée bascule en tempérament « acculée »');
{
  /* La tension d'étouffement donne l'ENVIE de se battre ; elle ne donne pas les MOYENS. Sans
     ce tempérament, l'enfermée monterait à 10, déclarerait la guerre, et se ferait écraser au
     premier combat — elle est par construction la plus faible. Le tempérament la fait s'armer. */
  const m = partie();
  const P = vm.runInContext('PROFILS_IA', m.sb);
  m.A._profil = 'batisseur'; m.A._agresseeTour = null; m.A._etouffeDepuis = null;
  const base = m.sb.profilActifDe(m.A);
  if (base === P.batisseur) ok('sans rien de particulier, la nation garde son tempérament d\'origine');
  else ko('le tempérament d\'origine n\'est pas rendu');
  m.A._etouffeDepuis = 3;
  const sousPression = m.sb.profilActifDe(m.A);
  if (sousPression === P.acculee) ok('enfermée, elle devient « acculée »');
  else ko('l\'étouffement ne fait pas basculer le tempérament');
  if (P.acculee && P.acculee.mult.military > P.batisseur.mult.military
    && P.acculee.mult.colonize < P.batisseur.mult.colonize)
    ok('et « acculée » s\'arme plus qu\'elle ne colonise (military '
      + P.acculee.mult.military + ' · colonize ' + P.acculee.mult.colonize + ')');
  else ko('« acculée » n\'a pas le profil d\'une nation qui s\'arme');
  /* Être frappée est plus urgent qu'être enfermée : on riposte à qui vous frappe. */
  m.A._agresseeTour = m.G.turn;
  if (m.sb.profilActifDe(m.A) === P.assiegee) ok('mais si on la frappe, la riposte passe devant');
  else ko('une nation agressée ET enfermée ne riposte pas : l\'ordre des bascules est faux');
  m.A._agresseeTour = null; m.A._etouffeDepuis = null;
  if (m.sb.profilActifDe(m.A) === P.batisseur) ok('et elle redevient elle-même quand la cause disparaît');
  else ko('le tempérament ne revient pas à la normale : la bascule est devenue définitive');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le raid vole la production d\'une colonie et coûte 5 de tension ; le blocage et');
console.log('   l\'étouffement se paient une fois puis s\'entretiennent, contre une seule nation ;');
console.log('   et la nation acculée s\'arme au lieu de se jeter dans le vide.');
console.log('═'.repeat(80));
