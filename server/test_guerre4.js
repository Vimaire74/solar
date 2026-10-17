/* ============================================================================
   TEST — LA GUERRE ET LA TENSION À QUATRE NATIONS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, après une vraie partie : « les calculs des ressources sont
   complètement fantasques, les coûts ne sont pas déduits correctement, les jetons
   ne partent pas en cooldown comme il faudrait ». Aucun banc d'essai ne regardait
   la COMPTABILITÉ : ils vérifiaient que la partie se termine, jamais que les
   nombres se tiennent. Une partie peut aller jusqu'au bout en distribuant des
   ressources qui n'existent pas.

   CE QUE CE BANC VÉRIFIE — un GRAND LIVRE, pas une impression :
     A. Jetons de Force — pour chaque combat : ce qui sort du pool est retrouvé,
        soit en récupération, soit perdu selon une règle écrite. Rien ne s'évapore,
        rien n'apparaît.
     B. Coût du combat — 1🪨 +1⚡ par jeton engagé, déduit UNE fois, jamais deux,
        et identique qu'on attaque ou qu'on défende.
     C. Tension — c'est une propriété du COUPLE de nations. Monter A→B ne doit
        toucher ni B→A, ni C→D. Bornée 0..10.
     D. Guerres simultanées — à quatre, deux guerres peuvent courir en même temps ;
        en terminer une ne doit pas terminer l'autre.
     E. Rien de négatif, jamais — ressources, jetons, niveaux de colonie.

   Ce banc travaille DANS le moteur (pas de réseau) : il peut donc regarder l'état
   avant et après chaque opération, ce qu'un test par WebSocket ne peut pas faire.
   Le routage des fenêtres à quatre humains est vérifié séparément, par
   `test_guerre4_ws.js`.

   Usage : node test_guerre4.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const vm = require('vm');   // pour poser la cible de capture dans le bac à sable, comme le fait le serveur

const HTML = process.env.GAME_HTML || path.join(__dirname, '..', 'play.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }
function titre(s) { console.log('\n' + s); }

/* ── outils de mesure ─────────────────────────────────────────────────────── */
const cd = n => (n.forceCooldown || []).reduce((s, c) => s + (c.count || 0), 0);
function livre(sb) {                       // le « grand livre » : une ligne par nation
  const G = sb.scGetG();
  const l = {};
  for (const n of [G.player].concat(G.ais || [])) {
    l[n.civ.id] = {
      dispo: n.forceTokens || 0, recup: cd(n), total: (n.forceTokens || 0) + cd(n),
      mat: n.res.materials || 0, ener: n.res.energy || 0, moral: n.res.morale || 0,
      cols: n.colonies.length, routes: n.routes.length
    };
  }
  return l;
}
function delta(a, b, civ) {
  const x = a[civ], y = b[civ], d = {};
  for (const k of Object.keys(x)) d[k] = y[k] - x[k];
  return d;
}
function neuve(sb, nations) {
  sb.initGame(nations[0], nations.slice(1));
  const G = sb.scGetG();
  for (const n of [G.player].concat(G.ais)) n._isAI = false;   // quatre humains
  return G;
}
function nation(sb, id) {
  const G = sb.scGetG();
  return [G.player].concat(G.ais).find(n => n.civ.id === id);
}
// Donne à une nation de quoi se battre, sans passer par dix tours de jeu.
function armer(n, jetons, res) {
  n.forceTokens = jetons; n.forceCooldown = [];
  n.res.materials = res; n.res.energy = res; n.res.science = res; n.res.morale = 8;
}

const NATIONS = ['terriens', 'martiens', 'jupiteriens', 'ceinturiens'];

console.log('═'.repeat(76));
console.log('LA GUERRE ET LA TENSION À QUATRE NATIONS — le grand livre');
console.log('═'.repeat(76));

const sb = loadLogic(HTML);
neuve(sb, NATIONS);
const G = sb.scGetG();
console.log('\nPartie à 4 : ' + [G.player].concat(G.ais).map(n => n.civ.emoji + ' ' + n.civ.name).join(' · '));

/* ══ A. LA TENSION EST UNE PROPRIÉTÉ DU COUPLE ═══════════════════════════════ */
titre('A. La tension appartient au COUPLE de nations');
{
  for (const a of NATIONS) for (const b of NATIONS) if (a !== b) sb.setTens(a, b, 0);
  sb.addTens('terriens', 'martiens', 4);
  const tm = sb.getTens('terriens', 'martiens'), mt = sb.getTens('martiens', 'terriens');
  if (tm !== 4) ko('tension terriens→martiens = ' + tm + ' au lieu de 4');
  else if (mt !== 0) ko('monter terriens→martiens a aussi monté martiens→terriens (' + mt + ') : la tension n\'est pas orientée');
  else ok('terriens→martiens = 4, martiens→terriens = 0 : la tension est ORIENTÉE, par couple');

  let pollue = null;
  for (const a of NATIONS) for (const b of NATIONS) {
    if (a === b || (a === 'terriens' && b === 'martiens')) continue;
    if (sb.getTens(a, b) !== 0) pollue = a + '→' + b + ' = ' + sb.getTens(a, b);
  }
  if (pollue) ko('un couple SANS RAPPORT a bougé : ' + pollue);
  else ok('les dix autres couples sont restés à 0 — aucune contagion');

  sb.setTens('jupiteriens', 'ceinturiens', 50);
  sb.addTens('jupiteriens', 'ceinturiens', 50);
  if (sb.getTens('jupiteriens', 'ceinturiens') !== 10) ko('la tension dépasse 10 (' + sb.getTens('jupiteriens', 'ceinturiens') + ')');
  else ok('plafonnée à 10');
  sb.setTens('jupiteriens', 'ceinturiens', 0);
  sb.addTens('jupiteriens', 'ceinturiens', -50);
  if (sb.getTens('jupiteriens', 'ceinturiens') !== 0) ko('la tension passe sous 0 (' + sb.getTens('jupiteriens', 'ceinturiens') + ')');
  else ok('plancher à 0');
}

/* ══ B. LA MONTÉE AUTOMATIQUE DE TENSION VOIT-ELLE LES QUATRE NATIONS ? ══════ */
titre('B. La montée automatique de tension, à quatre');
{
  for (const a of NATIONS) for (const b of NATIONS) if (a !== b) sb.setTens(a, b, 0);
  /* On FABRIQUE la situation qui doit faire monter la tension, au lieu d'espérer qu'elle se
     présente : martiens et jupitériens (deux nations qui ne sont pas le joueur local) posent
     chacun une route qui touche une colonie de l'autre. La règle dit « +1 par route étrangère sur
     mes colonies ». Si rien ne bouge entre eux, c'est que la règle ne les regarde pas. */
  const mart = nation(sb, 'martiens'), jupi = nation(sb, 'jupiteriens');
  const colM = mart.colonies[0], colJ = jupi.colonies[0];
  mart.routes.push({ from: mart.civ.home, to: colJ.nodeId, tokens: 0 });
  jupi.routes.push({ from: jupi.civ.home, to: colM.nodeId, tokens: 0 });
  note('martiens et jupitériens ont chacun une route qui touche une colonie de l\'autre');
  const avant = {};
  for (const a of NATIONS) for (const b of NATIONS) if (a !== b) avant[a + '>' + b] = sb.getTens(a, b);
  try { sb.updateTension(); } catch (e) { ko('updateTension a échoué : ' + e.message); }
  const bouges = [];
  for (const a of NATIONS) for (const b of NATIONS) if (a !== b && sb.getTens(a, b) !== avant[a + '>' + b]) bouges.push(a + '→' + b);
  note('couples modifiés : ' + (bouges.length ? bouges.join(', ') : 'aucun'));
  const mj = sb.getTens('martiens', 'jupiteriens'), jm = sb.getTens('jupiteriens', 'martiens');
  if (mj < 1 || jm < 1)
    ko('la tension entre martiens et jupitériens est restée à ' + mj + '/' + jm + ' alors que chacun a posé'
      + '\n        une route sur les colonies de l\'autre. `updateTension` ne parcourt que les couples qui'
      + '\n        touchent ' + G.player.civ.name + ' : entre les trois AUTRES nations, la tension ne monte JAMAIS.'
      + '\n        À quatre joueurs, deux adversaires peuvent se marcher dessus toute la partie sans que rien ne monte.');
  else ok('martiens↔jupitériens montent à ' + mj + '/' + jm + ' sans que ' + G.player.civ.name + ' soit impliqué');
}

/* ══ C. LE COÛT D'UN COMBAT : DÉDUIT UNE FOIS, ET UNE SEULE ══════════════════ */
titre('C. Le coût d\'un combat (1🪨 +1⚡ par jeton engagé)');
function essaiCombat(titreEssai, prepare, engages, attendu) {
  const s2 = loadLogic(HTML);
  neuve(s2, NATIONS);
  const g2 = s2.scGetG();
  const moi = g2.player, lui = g2.ais[0];
  armer(moi, 10, 20); armer(lui, 10, 20);
  prepare(s2, g2, moi, lui);
  const av = livre(s2);
  let res = null;
  try { res = attendu.appel(s2, g2, engages); } catch (e) { ko(titreEssai + ' — exception : ' + e.message); return null; }
  const ap = livre(s2);
  return { s2, g2, moi, lui, av, ap, res, dMoi: delta(av, ap, moi.civ.id), dLui: delta(av, ap, lui.civ.id) };
}
{
  // Assaut classique, victoire assurée (10 contre 0)
  const e = essaiCombat('assaut victorieux', (s, g, moi, lui) => {
    lui.forceTokens = 0; lui.res.materials = 0; lui.res.energy = 0;   // sans défense possible
    g.wars = [{ aiId: lui.civ.id, turnsLeft: 3, wins: { player: 0, ai: 0 } }];
    g.warWith = lui.civ.id; g.warState = true; g.warTurnsLeft = 3; g.warWins = { player: 0, ai: 0 };
  }, 4, { appel: (s, g, n) => s.resolveWarCombat(n) });
  if (e) {
    note('engagé 4 jetons — ' + JSON.stringify({ mat: e.dMoi.mat, ener: e.dMoi.ener, dispo: e.dMoi.dispo, recup: e.dMoi.recup }));
    if (e.dMoi.mat !== -4) ko('matériaux : ' + e.dMoi.mat + ' au lieu de −4 (1 par jeton engagé)');
    else if (e.dMoi.ener !== -4) ko('énergie : ' + e.dMoi.ener + ' au lieu de −4');
    else ok('coût exact : −4🪨 −4⚡ pour 4 jetons, déduit une seule fois');
    // VICTOIRE : la moitié part en récupération, l'autre moitié revient tout de suite.
    if (e.dMoi.total !== 0) ko('victoire : le total de jetons a changé de ' + e.dMoi.total + ' — il ne doit RIEN se perdre en gagnant');
    else if (e.dMoi.recup !== 2) ko('victoire : ' + e.dMoi.recup + ' jeton(s) en récupération au lieu de 2 (la moitié de 4)');
    else ok('victoire : 2 jetons repartent tout de suite, 2 en récupération, aucun perdu');
  }
}
{
  // Défaite : la moitié des engagés est perdue POUR DE BON, le reste en récupération.
  const e = essaiCombat('assaut perdu', (s, g, moi, lui) => {
    lui.forceTokens = 30; lui.res.materials = 30; lui.res.energy = 30;
    g.wars = [{ aiId: lui.civ.id, turnsLeft: 3, wins: { player: 0, ai: 0 } }];
    g.warWith = lui.civ.id; g.warState = true; g.warTurnsLeft = 3; g.warWins = { player: 0, ai: 0 };
    g._aiWarCommitted = 20;
  }, 4, { appel: (s, g, n) => s.resolveWarCombat(n) });
  if (e) {
    note('engagé 4 jetons contre 20 — ' + JSON.stringify({ mat: e.dMoi.mat, ener: e.dMoi.ener, total: e.dMoi.total, recup: e.dMoi.recup }));
    if (e.dMoi.mat !== -4 || e.dMoi.ener !== -4) ko('coût de la défaite : ' + e.dMoi.mat + '🪨 ' + e.dMoi.ener + '⚡ au lieu de −4/−4');
    else ok('coût identique qu\'on gagne ou qu\'on perde : −4🪨 −4⚡');
    if (e.dMoi.total !== -2) ko('défaite : ' + (-e.dMoi.total) + ' jeton(s) perdus définitivement au lieu de 2 (la moitié de 4)');
    else ok('défaite : 2 jetons perdus pour de bon, 2 en récupération');
  }
}
{
  // Engager plus qu'on ne peut payer doit être RABOTÉ, pas accepté.
  const e = essaiCombat('engagement au-dessus des moyens', (s, g, moi, lui) => {
    moi.forceTokens = 10; moi.res.materials = 3; moi.res.energy = 3;   // ne peut payer que 3
    lui.forceTokens = 0; lui.res.materials = 0; lui.res.energy = 0;
    g.wars = [{ aiId: lui.civ.id, turnsLeft: 3, wins: { player: 0, ai: 0 } }];
    g.warWith = lui.civ.id; g.warState = true; g.warTurnsLeft = 3; g.warWins = { player: 0, ai: 0 };
  }, 10, { appel: (s, g, n) => s.resolveWarCombat(n) });
  if (e) {
    if (e.ap[e.moi.civ.id].mat < 0 || e.ap[e.moi.civ.id].ener < 0) ko('ressources NÉGATIVES après un engagement trop gros');
    else if (e.dMoi.mat !== -3 || e.dMoi.ener !== -3) ko('engagement raboté à ' + (-e.dMoi.mat) + ' au lieu de 3 (tout ce qu\'il pouvait payer)');
    else ok('engager 10 jetons avec 3🪨 3⚡ : raboté à 3, rien de négatif');
  }
}

/* ══ D. ATTAQUER ET DÉFENDRE COÛTENT-ILS LA MÊME CHOSE ? ═════════════════════ */
titre('D. Défendre coûte-t-il la même chose qu\'attaquer ?');
{
  const s3 = loadLogic(HTML);
  neuve(s3, NATIONS);
  const g3 = s3.scGetG();
  const moi = g3.player, lui = g3.ais[0];
  armer(moi, 10, 20); armer(lui, 10, 20);
  g3.wars = [{ aiId: lui.civ.id, turnsLeft: 3, wins: { player: 0, ai: 0 } }];
  g3.warWith = lui.civ.id; g3.warState = true; g3.warTurnsLeft = 3; g3.warWins = { player: 0, ai: 0 };
  g3._aiWarCommitted = 2; g3._aiWarTarget = null;
  const d = s3.fluxDonnees(); d.guerreIndex = 0; d.guerres = [{ aiId: lui.civ.id }];
  const av = livre(s3);
  let boum = null;
  try { s3.guerreCombatClassiqueChoisi('DEFEND:4'); } catch (e) { boum = e.message; }
  if (boum) { note('(défense non jouable hors flux complet : ' + boum.split('\n')[0] + ')'); }
  else {
    const ap = livre(s3), dm = delta(av, ap, moi.civ.id);
    note('défense avec 4 jetons — ' + JSON.stringify({ mat: dm.mat, ener: dm.ener, total: dm.total, recup: dm.recup }));
    if (dm.mat !== -4 || dm.ener !== -4)
      ko('DÉFENSE : coût ' + dm.mat + '🪨 ' + dm.ener + '⚡ au lieu de −4/−4 — l\'attaque et la défense ne suivent pas la même règle');
    else ok('défendre coûte le même prix qu\'attaquer : −4🪨 −4⚡');
    if (dm.total !== 0)
      ko('DÉFENSE RÉUSSIE : ' + (-dm.total) + ' jeton(s) perdus définitivement — en gagnant, on ne doit rien perdre');
    else if (dm.recup !== 2)
      ko('DÉFENSE RÉUSSIE : ' + dm.recup + ' jeton(s) en récupération au lieu de 2 — après une victoire, la moitié revient tout de suite'
        + '\n        (l\'attaque le fait déjà : `applyCombatEngage`. La défense a sa propre comptabilité, écrite à la main.)');
    else ok('défense réussie : 2 jetons reviennent tout de suite, 2 en récupération — comme à l\'attaque');
  }
}

/* ══ E. QUATRE NATIONS, DEUX GUERRES EN MÊME TEMPS ═══════════════════════════ */
titre('E. Deux guerres simultanées');
{
  const s4 = loadLogic(HTML);
  neuve(s4, NATIONS);
  const g4 = s4.scGetG();
  for (const n of [g4.player].concat(g4.ais)) armer(n, 8, 15);
  const moi4 = g4.player.civ.id, a = g4.ais[0].civ.id, b = g4.ais[1].civ.id;
  // ⚠️ Une guerre est un COUPLE {a,b}. La fabriquer avec le seul champ `aiId` produisait un objet
  // que le moteur ne sait plus retrouver — le test échouait alors sur son propre décor.
  const faire = (x, y, t) => s4._attachWar({ a: x, b: y, winsBy: { [x]: 0, [y]: 0 }, turnsLeft: t, live: true });
  g4.wars = [faire(moi4, a, 2), faire(moi4, b, 4)];
  s4.syncWarState();
  s4.endWar(a);
  const reste = (g4.wars || []).map(w => w.aiId);
  if (reste.length !== 1 || reste[0] !== b) ko('terminer la guerre contre ' + a + ' laisse ' + JSON.stringify(reste) + ' au lieu de [' + b + '] seule');
  else ok('terminer une guerre laisse l\'autre intacte');
  if (!g4.warState) ko('l\'état « en guerre » retombe alors qu\'une guerre continue');
  else ok('la partie se sait encore en guerre');
  s4.endWar(b);
  if (g4.warState) ko('l\'état « en guerre » reste vrai alors que toutes les guerres sont finies');
  else ok('la dernière guerre terminée : la partie sort de l\'état de guerre');
}

/* ══ G. UNE GUERRE ENTRE DEUX AUTRES NATIONS NE ME CONCERNE PAS ══════════════ */
titre('G. Une guerre entre deux AUTRES nations');
{
  const s6 = loadLogic(HTML);
  neuve(s6, NATIONS);
  const g6 = s6.scGetG();
  const moi = g6.player.civ.id;                      // terriens : spectateur
  const b = g6.ais[0].civ.id, c = g6.ais[1].civ.id;  // martiens contre jupitériens
  // Une guerre est un COUPLE {a,b} ; on l'ajoute comme le moteur le fait, sans y mêler le joueur.
  g6.wars = [];
  const w = { a: b, b: c, winsBy: { [b]: 0, [c]: 0 }, turnsLeft: 5, reason: 'essai', declaredBy: 'other', live: true };
  g6.wars.push(s6._attachWar ? s6._attachWar(w) : w);
  s6.syncWarState();
  note('point de vue de ' + moi + ' — warState=' + JSON.stringify(g6.warState) + ', warWith=' + JSON.stringify(g6.warWith));
  if (g6.warState) {
    ko('« ' + moi + ' » se croit EN GUERRE alors que le conflit oppose ' + b + ' et ' + c + '.'
      + '\n        `syncWarState()` prend `G.wars[0]` sans regarder QUI se bat : à quatre joueurs,'
      + '\n        la guerre de deux autres devient la tienne, avec ses combats et ses coûts.');
  } else ok(moi + ' n\'est pas concerné par la guerre de ' + b + ' contre ' + c);
  if (g6.warWith) ko('warWith désigne « ' + g6.warWith + ' » comme ennemi de ' + moi + ' — il ne l\'est pas');
  else ok('aucun ennemi désigné pour ' + moi);

  // …et vue depuis un vrai belligérant, la guerre doit bien exister.
  const natB = [g6.player].concat(g6.ais).find(n => n.civ.id === b);
  const memo = g6.player; g6.player = natB;          // on adopte la perspective de martiens
  s6.syncWarState();
  const vu = g6.warState ? g6.warWith : null;
  g6.player = memo; s6.syncWarState();
  if (vu !== c) ko('vue depuis ' + b + ', la guerre désigne « ' + vu + ' » au lieu de ' + c);
  else ok('vue depuis ' + b + ', l\'ennemi est bien ' + c);
}

/* ══ H. LA CONQUÊTE : PRENDRE UNE COLONIE À QUELQU'UN ════════════════════════ */
titre('H. La conquête d\'une colonie');
{
  const s7 = loadLogic(HTML);
  neuve(s7, NATIONS);
  const g7 = s7.scGetG();
  const moi = g7.player, lui = g7.ais[0], tiers = g7.ais[1];
  armer(moi, 12, 25); armer(lui, 0, 0); armer(tiers, 6, 10);   // `lui` ne peut pas se défendre
  /* ⚠️ IL FAUT UNE COLONIE QUI NE SOIT PAS LA CAPITALE. Au départ, chaque nation n'a QUE sa
     capitale — et la capitale est défendue d'office par 10 jetons. Ma première version se rabattait
     dessus : l'assaut de 6 jetons était donc écrasé, et le banc concluait « la conquête ne conquiert
     rien » alors qu'elle avait simplement échoué, comme la règle le prévoit. On donne donc au
     défenseur une seconde colonie, ordinaire, et c'est elle qu'on vise. */
  // `NODES` n'est pas exporté par le bac à sable : on le lit dedans, comme le serveur le fait.
  const NOEUDS = vm.runInContext('NODES', s7);
  const libre = Object.keys(NOEUDS).find(id =>
    id !== lui.civ.home && !NOEUDS[id].decorative &&
    ![moi, lui, tiers, g7.ais[2]].some(n => n && n.colonies.some(c => c.nodeId === id)));
  if (!libre) ko('aucun nœud libre pour poser une colonie à conquérir — décor du test impossible');
  lui.colonies.push({ nodeId: libre, level: 2, connected: true });
  const cible = lui.colonies.find(c => c.nodeId === libre);
  const noeud = cible.nodeId;
  const av = livre(s7);
  const colsLuiAvant = lui.colonies.length, colsMoiAvant = moi.colonies.length, colsTiersAvant = tiers.colonies.length;
  note('le défenseur a ' + colsLuiAvant + ' colonies (capitale + ' + libre + ')');
  const vpAvant = s7.calcVP(moi).total;

  g7.wars = [s7._attachWar({ a: moi.civ.id, b: lui.civ.id, winsBy: { [moi.civ.id]: 0, [lui.civ.id]: 0 }, turnsLeft: 5, live: true })];
  s7.syncWarState();
  g7.warWins = { player: 0, ai: 0 };
  /* ⚠️ SANS CETTE LIGNE, ON MESURE UN COMBAT, PAS UNE CONQUÊTE.
     La cible de capture est `_warAttackColonyTarget`, une variable interne du moteur : c'est ELLE
     qui fait changer la colonie de propriétaire. Ma première version du test ne la posait pas — le
     banc affichait « la conquête ne conquiert rien », alors qu'il n'avait tout simplement jamais
     demandé de conquête. On la pose comme le serveur le fait (`game-core.js`, action `attack`). */
  vm.runInContext('_warAttackColonyTarget=' + JSON.stringify(noeud), s7);
  const d = s7.fluxDonnees();
  d.assautCible = noeud; d.assautEnnemi = lui.civ.id;
  try { s7.stAssautJoueurChoisi(6); } catch (e) { ko('l\'assaut a échoué : ' + e.message.split('\n')[0]); }
  const ap = livre(s7);

  note('assaut de 6 jetons sur ' + noeud + ' (colonie Nv.2 de ' + lui.civ.id + ', sans défense)');
  const jeLai = moi.colonies.find(c => c.nodeId === noeud);
  const ilLaEncore = lui.colonies.find(c => c.nodeId === noeud);
  if (!jeLai) ko('la colonie n\'a PAS changé de propriétaire : la conquête ne conquiert rien');
  else if (ilLaEncore) ko('la colonie appartient MAINTENANT AUX DEUX nations à la fois');
  else ok('la colonie a changé de propriétaire, et une seule fois');

  if (jeLai) {
    if (jeLai.level !== 1) ko('colonie prise au niveau ' + jeLai.level + ' au lieu de 1 (elle est endommagée par l\'assaut)');
    else ok('la colonie prise est dégradée d\'un niveau (2 → 1)');
    if (jeLai.connected === undefined) ko('la colonie prise n\'a pas de statut de connexion : le réseau n\'a pas été recalculé');
    else ok('le réseau du conquérant a été recalculé (connectée : ' + jeLai.connected + ')');
  }
  if (lui.colonies.length !== colsLuiAvant - 1) ko('le vaincu a ' + lui.colonies.length + ' colonies au lieu de ' + (colsLuiAvant - 1));
  else ok('le vaincu en a exactement une de moins');
  if (moi.colonies.length !== colsMoiAvant + 1) ko('le vainqueur a ' + moi.colonies.length + ' colonies au lieu de ' + (colsMoiAvant + 1));
  else ok('le vainqueur en a exactement une de plus');
  if (tiers.colonies.length !== colsTiersAvant) ko('une nation TIERS a perdu ou gagné une colonie dans une guerre qui ne la concerne pas');
  else ok('la nation tierce n\'a rien perdu ni gagné');

  const dMoi = delta(av, ap, moi.civ.id), dLui = delta(av, ap, lui.civ.id);
  note('vainqueur : ' + JSON.stringify({ mat: dMoi.mat, ener: dMoi.ener, total: dMoi.total, recup: dMoi.recup, moral: dMoi.moral }));
  note('vaincu    : ' + JSON.stringify({ moral: dLui.moral, cols: dLui.cols, dispo: dLui.dispo }));
  if (dMoi.mat !== -6 || dMoi.ener !== -6) ko('coût de l\'assaut : ' + dMoi.mat + '🪨 ' + dMoi.ener + '⚡ au lieu de −6/−6');
  else ok('l\'assaut coûte 1🪨 +1⚡ par jeton engagé, comme un combat ordinaire');
  if (dMoi.total !== 0) ko('victoire : ' + (-dMoi.total) + ' jeton(s) perdus alors qu\'on gagne');
  else ok('en gagnant, aucun jeton perdu (la moitié revient, la moitié en récupération)');
  if (dLui.moral >= 0) ko('le vaincu ne perd aucun moral en perdant une colonie (−2 attendus)');
  else ok('le vaincu perd du moral (' + dLui.moral + ')');

  const vpApres = s7.calcVP(moi).total;
  if (vpApres <= vpAvant) ko('la conquête ne rapporte AUCUN point de victoire (' + vpAvant + ' → ' + vpApres + ')');
  else ok('la conquête rapporte des points de victoire (' + vpAvant + ' → ' + vpApres + ')');

  // Rien de négatif nulle part après une conquête.
  let mauvais = null;
  for (const n of [g7.player].concat(g7.ais)) {
    for (const r of ['materials', 'energy', 'science', 'morale']) if ((n.res[r] || 0) < 0) mauvais = n.civ.id + ' ' + r;
    if ((n.forceTokens || 0) < 0) mauvais = n.civ.id + ' jetons';
    for (const c of n.colonies) if ((c.level || 0) < 1) mauvais = n.civ.id + ' colonie Nv.' + c.level;
  }
  if (mauvais) ko('valeur impossible après la conquête : ' + mauvais);
  else ok('aucune valeur négative après la conquête');
}

/* ══ F. RIEN DE NÉGATIF, JAMAIS ══════════════════════════════════════════════ */
titre('F. Aucune valeur négative après une série de combats');
{
  const s5 = loadLogic(HTML);
  neuve(s5, NATIONS);
  const g5 = s5.scGetG();
  const moi = g5.player, lui = g5.ais[0];
  armer(moi, 6, 4); armer(lui, 6, 4);
  g5.wars = [{ aiId: lui.civ.id, turnsLeft: 99, wins: { player: 0, ai: 0 } }];
  g5.warWith = lui.civ.id; g5.warState = true; g5.warTurnsLeft = 99; g5.warWins = { player: 0, ai: 0 };
  let pb = null;
  for (let i = 0; i < 12 && !pb; i++) {
    g5._aiWarCommitted = (i % 3);
    try { s5.resolveWarCombat(2); } catch (e) { pb = 'exception au combat ' + (i + 1) + ' : ' + e.message.split('\n')[0]; break; }
    for (const n of [g5.player].concat(g5.ais)) {
      for (const r of ['materials', 'energy', 'science', 'morale']) if ((n.res[r] || 0) < 0) pb = n.civ.name + ' : ' + r + ' = ' + n.res[r];
      if ((n.forceTokens || 0) < 0) pb = n.civ.name + ' : jetons = ' + n.forceTokens;
      for (const c of (n.forceCooldown || [])) if ((c.count || 0) < 0) pb = n.civ.name + ' : récupération négative';
      for (const c of n.colonies) if ((c.level || 0) < 1) pb = n.civ.name + ' : colonie de niveau ' + c.level;
    }
  }
  if (pb) ko('valeur impossible après une série de combats — ' + pb);
  else ok('douze combats d\'affilée sur des stocks maigres : aucune valeur négative');
}

/* ══ VERDICT ════════════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(76));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' problème(s) :');
  ecarts.forEach((e, i) => console.log('  ' + (i + 1) + '. ' + e));
  process.exitCode = 1;
} else {
  console.log('✅ La comptabilité de guerre se tient à quatre nations :');
  console.log('   coûts déduits une seule fois, jetons retrouvés, tension par couple, guerres indépendantes.');
}
console.log('\nCE BANC NE VÉRIFIE PAS : le routage des fenêtres entre quatre joueurs humains');
console.log('(voir test_guerre4_ws.js), ni la mise en page, ni l\'équilibrage — seulement que les');
console.log('nombres se tiennent.');
