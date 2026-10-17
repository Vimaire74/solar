/* ============================================================================
   BANC — LA GUERRE, COMPTÉE JETON PAR JETON, À TROIS HUMAINS
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09 : « vérifie encore la mécanique de guerre en simulant
   une partie à trois joueurs humains. Vérifie bien les décomptes de ressources et
   jetons. Utilise le croiseur, les tech de niveau 3, la tech empathe et télépathe et
   les autres investissements militaires. Vérifie tous les coûts et le retour des
   jetons après récupération, les pertes de jetons, les pertes de colonies, les
   messages de résultats. »

   CE QU'IL FAIT, ET POURQUOI COMME ÇA. Il travaille DANS le moteur, pas par le
   réseau : c'est la seule façon de lire l'état exactement avant et exactement après
   chaque combat. Un test par WebSocket prouve que les fenêtres arrivent au bon
   joueur (`test_guerre4_ws.js` s'en charge) ; il ne peut pas dire si un jeton s'est
   évaporé.

   LE GRAND LIVRE. Pour chaque combat et pour CHAQUE camp :

       pool_avant  =  pool_après  +  partis_en_récupération  +  perdus_définitivement

   Rien ne s'évapore, rien n'apparaît. Les règles attendues :
     · tous les jetons engagés quittent le pool ;
     · le VAINQUEUR en récupère la moitié haute tout de suite, l'autre moitié part en
       récupération ; il ne perd rien ;
     · le PERDANT perd ⌊e/2⌋ définitivement, le reste part en récupération ;
     · coût : 1🪨 +1⚡ par jeton engagé, DIVISÉ PAR DEUX avec IA de Navigation — la
       demi-part étant toujours portée par l'énergie (⌊e/2⌋🪨 et ⌈e/2⌉⚡) ;
     · récupération : retour au tour +2, ou +1 avec Stratégie Guerrière.

   ⚠️ UN COÛT QUI TOMBE À ZÉRO EST UN DÉFAUT, PAS UNE ÉCONOMIE. `applyCombatEngage`
   prélève en `Math.max(0, …)` : si une nation n'a pas de quoi payer, la facture est
   silencieusement rabotée et elle combat à crédit. Le banc mesure donc le coût RÉEL
   et le compare au coût DÛ ; il provisionne largement les nations pour que ce cas ne
   se produise pas par accident, et le teste séparément à la fin.

   Usage : node test_guerre_complete.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }
function note(s) { console.log('     ' + s); }
function titre(s) { console.log('\n' + s); }

const RES = ['energy', 'materials', 'science', 'morale'];

/* ── Une partie à TROIS HUMAINS, richement dotée ──────────────────────────────
   Toutes les nations sont humaines (`_isAI = false`) : c'est la configuration de
   Marc, et elle change le comportement du moteur (défense demandée au joueur au lieu
   d'être décidée par `defenseIA`). */
function partie3Humains() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'ceinturiens']);
  const G = sb.__G;
  for (const p of [G.player].concat(G.ais)) {
    p._isAI = false;
    p.res = { energy: 60, materials: 60, science: 60, morale: 8 };
    p.forceTokens = 12;
    p.forceCooldown = [];
    p.cards = [];
    p.hasCruiser = false; p.cruiserCooldown = 0;
  }
  G.turn = 5;
  return { sb, G };
}
const nation = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
const enCd = p => (p.forceCooldown || []).reduce((s, c) => s + (c.count || 0), 0);
/* Donne une carte à une nation. On prend la VRAIE carte du jeu quand elle existe : elle porte
   `spec`, mais aussi `combatBonus`, `forceBonus`… — et depuis le 2026-08-09 la puissance de combat
   lit `combatBonus` sur la carte. Une carte bricolée avec le seul `spec` donnerait donc 0.
   ⚠️ C'est précisément ce qui a fait échouer ce banc au moment de la correction, et c'est une bonne
   nouvelle : le test s'appuyait sur le même raccourci que le code. On ne passe pas par l'achat réel
   (ressources, prérequis, rivière) — hors sujet pour la comptabilité. */
const donner = (p, sbOuSpec, ...reste) => {
  const sb = (typeof sbOuSpec === 'object') ? sbOuSpec : null;
  const specs = sb ? reste : [sbOuSpec].concat(reste);
  for (const sp of specs) {
    let carte = null;
    if (sb) { try { carte = vm.runInContext('CARDS_POOL.find(c=>c.spec===' + JSON.stringify(sp) + '||c.spec2===' + JSON.stringify(sp) + ')', sb); } catch (e) {} }
    p.cards.push(carte ? Object.assign({}, carte) : { id: sp + '_x', spec: sp, name: sp, emoji: '🔧' });
  }
};
const prixDu = (p, e, sb) => {
  const half = sb.hasSpec(p, 'nav2_war');
  return { m: half ? Math.floor(e / 2) : e, e: half ? Math.ceil(e / 2) : e };
};

/* Photographie complète d'une nation, avant/après. */
function photo(p) {
  const o = { pool: p.forceTokens || 0, cd: enCd(p), cols: p.colonies.map(c => c.nodeId + ':' + c.level).sort().join(','), nbCols: p.colonies.length };
  for (const r of RES) o[r] = p.res[r] || 0;
  return o;
}

/* Vérifie le grand livre d'UN camp après un combat. */
function grandLivre(nom, av, ap, engages, gagnant, prix, extra) {
  const partisCd = ap.cd - av.cd;
  const perdusAttendus = gagnant ? 0 : Math.floor(engages / 2);
  const cdAttendu = gagnant ? Math.floor(engages / 2) : (engages - Math.floor(engages / 2));
  const revenuTOutDeSuite = gagnant ? (engages - Math.floor(engages / 2)) : 0;
  // pool_après attendu = pool_avant − engagés + revenus tout de suite − pertes annexes (garnison)
  const poolAttendu = av.pool - engages + revenuTOutDeSuite - (extra && extra.garnisonDetruite ? 1 : 0);

  if (partisCd === cdAttendu) ok(nom + ' — ' + partisCd + ' jeton(s) partis en récupération (attendu ' + cdAttendu + ')');
  else ko(nom + ' — ' + partisCd + ' jeton(s) en récupération au lieu de ' + cdAttendu);

  if (ap.pool === poolAttendu) ok(nom + ' — pool ' + av.pool + ' → ' + ap.pool + ' (attendu ' + poolAttendu + ')');
  else ko(nom + ' — pool ' + av.pool + ' → ' + ap.pool + ', attendu ' + poolAttendu
    + ' [engagés ' + engages + ', ' + (gagnant ? 'vainqueur' : 'perdant') + (extra && extra.garnisonDetruite ? ', garnison détruite' : '') + ']');

  // Conservation : ce qui sort du pool se retrouve, ou est perdu selon la règle.
  const sortis = av.pool - ap.pool;
  const retrouves = partisCd + perdusAttendus + (extra && extra.garnisonDetruite ? 1 : 0);
  if (sortis === retrouves) ok(nom + ' — conservation : ' + sortis + ' sorti(s) = ' + partisCd + ' en récup. + ' + perdusAttendus + ' perdu(s)' + (extra && extra.garnisonDetruite ? ' + 1 garnison' : ''));
  else ko(nom + ' — ' + sortis + ' jeton(s) sortis du pool mais ' + retrouves + ' seulement retrouvés : ' + (sortis - retrouves) + ' évaporé(s)');

  // Coût en ressources, exactement celui qui est dû.
  const dM = av.materials - ap.materials, dE = av.energy - ap.energy;
  const attM = prix.m + ((extra && extra.croiseur) ? extra.croiseur.materials : 0);
  const attE = prix.e + ((extra && extra.croiseur) ? extra.croiseur.energy : 0);
  if (dM === attM && dE === attE) ok(nom + ' — coût −' + dM + '🪨 −' + dE + '⚡ (attendu −' + attM + '🪨 −' + attE + '⚡)');
  else ko(nom + ' — coût −' + dM + '🪨 −' + dE + '⚡ au lieu de −' + attM + '🪨 −' + attE + '⚡');
}

console.log('═'.repeat(78));
console.log('GUERRE À TROIS HUMAINS — GRAND LIVRE DES JETONS ET DES RESSOURCES');
console.log('═'.repeat(78));

/* ═══════════════ PARTIE 1 ═══════════════ */
console.log('\n\n########## PARTIE 1 — assauts, croiseur, empathes, techs Nv.3 ##########');

/* ── 1. Assaut simple, sans aucune technologie ────────────────────────────── */
titre('1. Assaut nu : 6 jetons contre 4, aucune technologie');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  sb.declareWar('essai', 'player', cible.civ.id);
  G.warWith = cible.civ.id;
  const av1 = photo(moi), av2 = photo(cible);
  G._aiWarCommitted = 4;                       // ce que le défenseur humain engage
  const r = sb.resolveWarCombat(6);
  const ap1 = photo(moi), ap2 = photo(cible);
  note('puissances : attaquant ' + r.pPow + ' · défenseur ' + r.aPow + ' → ' + r.cls);
  // Défenseur : 4 jetons + garnison (aucune cible désignée → garrisonOf rend 1)
  if (r.pPow === 6 && r.aPow === 5) ok('puissances justes : 6 contre 4+1 de garnison');
  else ko('puissances : ' + r.pPow + ' contre ' + r.aPow + ' — attendu 6 contre 5');
  grandLivre('attaquant', av1, ap1, 6, true, prixDu(moi, 6, sb));
  grandLivre('défenseur', av2, ap2, 4, false, prixDu(cible, 4, sb));
}

/* ── 2. IA de Navigation : le coût est divisé par deux, la demie sur l'énergie ─ */
titre('2. IA de Navigation (nav2_war) : coût ÷2, demi-part sur l\'énergie');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  donner(moi, sb, 'nav2_war');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  const av1 = photo(moi), av2 = photo(cible);
  G._aiWarCommitted = 2;
  sb.resolveWarCombat(5);                       // 5 jetons impairs : 2🪨 et 3⚡
  const ap1 = photo(moi), ap2 = photo(cible);
  const dM = av1.materials - ap1.materials, dE = av1.energy - ap1.energy;
  if (dM === 2 && dE === 3) ok('5 jetons → −2🪨 −3⚡ : la demi-part est bien portée par l\'énergie');
  else ko('5 jetons → −' + dM + '🪨 −' + dE + '⚡, attendu −2🪨 −3⚡');
  grandLivre('attaquant (Navigation)', av1, ap1, 5, true, prixDu(moi, 5, sb));
  grandLivre('défenseur', av2, ap2, 2, false, prixDu(cible, 2, sb));
}

/* ── 3. Supercroiseur : +5 de puissance, 5🪨 5⚡, réparation si défaite ────── */
titre('3. Supercroiseur');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  moi.hasCruiser = true; moi.cruiserPower = 5;
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  if (sb.cruiserAvailable(moi)) ok('croiseur disponible avant emploi');
  else ko('croiseur indisponible alors qu\'il est possédé et hors récupération');
  const av1 = photo(moi), av2 = photo(cible);
  G._cruiserDeployed = true; G._aiWarCommitted = 2;
  const r = sb.resolveWarCombat(3);
  const ap1 = photo(moi);
  if (r.pPow === 8) ok('puissance 3 jetons + 5 croiseur = 8');
  else ko('puissance ' + r.pPow + ' au lieu de 8 (3 jetons + croiseur)');
  grandLivre('attaquant (croiseur)', av1, ap1, 3, true, prixDu(moi, 3, sb), { croiseur: { materials: 5, energy: 5 } });
  void av2;

  // Défaite en déployant le croiseur → il part en réparation, il n'est PAS perdu.
  const b = partie3Humains();
  const m2 = b.G.player, c2 = nation(b.G, 'martiens');
  m2.hasCruiser = true; m2.cruiserPower = 5;
  b.sb.declareWar('essai', 'player', c2.civ.id); b.G.warWith = c2.civ.id;
  b.G._cruiserDeployed = true; b.G._aiWarCommitted = 12;      // le défenseur écrase
  b.sb.resolveWarCombat(1);
  if (m2.hasCruiser) ok('croiseur conservé après la défaite (pas détruit)');
  else ko('le croiseur a été PERDU sur une défaite — il doit seulement être en réparation');
  if (m2.cruiserCooldown > b.G.turn && !b.sb.cruiserAvailable(m2)) ok('croiseur en réparation jusqu\'au tour ' + m2.cruiserCooldown);
  else ko('croiseur toujours disponible après une défaite où il était déployé');

  // Croiseur impayable : il ne doit pas se déployer gratuitement.
  const c = partie3Humains();
  const m3 = c.G.player, c3 = nation(c.G, 'martiens');
  m3.hasCruiser = true; m3.res.materials = 3; m3.res.energy = 3;   // < 5/5
  c.sb.declareWar('essai', 'player', c3.civ.id); c.G.warWith = c3.civ.id;
  c.G._cruiserDeployed = true; c.G._aiWarCommitted = 0;
  const r3 = c.sb.resolveWarCombat(2);
  if (r3.pPow === 2) ok('croiseur impayable : non déployé, puissance 2 (pas 7)');
  else ko('croiseur déployé sans en avoir les moyens : puissance ' + r3.pPow);
}

/* ── 4. Empathes et Télépathie : +2 chacun, des DEUX côtés ────────────────── */
titre('4. Lien Empathe (+2) et Télépathie (+2), attaquant comme défenseur');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  donner(moi, sb, 'empath_routes', 'empath_tele');
  donner(cible, sb, 'empath_routes');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  G._aiWarCommitted = 3;
  const r = sb.resolveWarCombat(4);
  if (r.pPow === 8) ok('attaquant : 4 jetons +2 empathes +2 télépathie = 8');
  else ko('attaquant : puissance ' + r.pPow + ' au lieu de 8');
  if (r.aPow === 6) ok('défenseur : 3 jetons +2 empathes +1 garnison = 6');
  else ko('défenseur : puissance ' + r.aPow + ' au lieu de 6');
}

/* ── 5. Capture d'une colonie : niveau, moral, jeton de garnison ──────────── */
titre('5. Capture d\'une colonie ennemie');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  const noeuds = vm.runInContext('Object.keys(NODES).filter(k=>NODES[k]&&!NODES[k].decorative&&!NODES[k].noColonize)', sb);
  const cibleNode = noeuds.find(n => n !== cible.civ.home && n !== moi.civ.home);
  cible.colonies.push({ nodeId: cibleNode, level: 3, connected: true });
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  vm.runInContext('_warAttackColonyTarget=' + JSON.stringify(cibleNode) + ';', sb);
  const av1 = photo(moi), av2 = photo(cible);
  const moralAvant = cible.res.morale;
  G._aiWarCommitted = 1;
  const r = sb.resolveWarCombat(8);
  const ap1 = photo(moi), ap2 = photo(cible);
  const prise = moi.colonies.find(c => c.nodeId === cibleNode);
  if (prise) ok('la colonie a changé de camp');
  else ko('la colonie n\'a pas changé de camp malgré la victoire (' + r.pPow + ' vs ' + r.aPow + ')');
  if (prise && prise.level === 2) ok('capturée au niveau 2 (elle était Nv.3 : −1 niveau à la prise)');
  else if (prise) ko('capturée au niveau ' + prise.level + ' au lieu de 2');
  if (!cible.colonies.some(c => c.nodeId === cibleNode)) ok('elle a bien disparu de chez l\'ancien propriétaire');
  else ko('la colonie appartient encore aux DEUX nations');
  const dMoral = moralAvant - cible.res.morale;
  if (dMoral === 2) ok('moral du perdant −2 (défaite −1, abandon forcé −1)');
  else ko('moral du perdant −' + dMoral + ' au lieu de −2');
  grandLivre('attaquant', av1, ap1, 8, true, prixDu(moi, 8, sb));
  grandLivre('défenseur (garnison détruite)', av2, ap2, 1, false, prixDu(cible, 1, sb), { garnisonDetruite: true });
}

/* ── 6. La capitale se défend à 10 ────────────────────────────────────────── */
titre('6. La capitale ennemie : défense automatique de 10 jetons');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  vm.runInContext('_warAttackColonyTarget=' + JSON.stringify(cible.civ.home) + ';', sb);
  G._aiWarCommitted = 0;
  const r = sb.resolveWarCombat(5);
  if (r.aPow === 10) ok('capitale sans défenseur : puissance 10 (garnison de capitale)');
  else ko('capitale : puissance défensive ' + r.aPow + ' au lieu de 10');
  if (r.cls === 'loss') ok('5 jetons ne prennent pas une capitale');
  else ko('la capitale est tombée face à 5 jetons (' + r.pPow + ' vs ' + r.aPow + ')');
}

/* ── 7. Retour de récupération : tour +2, et +1 avec Stratégie Guerrière ──── */
titre('7. Retour des jetons après récupération');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  G._aiWarCommitted = 2;
  sb.resolveWarCombat(6);
  const cd = (moi.forceCooldown || [])[0];
  if (cd && cd.returnTurn === G.turn + 2) ok('récupération normale : retour au tour ' + cd.returnTurn + ' (tour actuel ' + G.turn + ')');
  else ko('retour prévu au tour ' + (cd && cd.returnTurn) + ', attendu ' + (G.turn + 2));

  const enAttente = enCd(moi), poolAvant = moi.forceTokens;
  G.turn += 2;
  const rec = (moi.forceCooldown || []).filter(f => f.returnTurn <= G.turn).reduce((s, f) => s + f.count, 0);
  moi.forceTokens += rec;
  moi.forceCooldown = (moi.forceCooldown || []).filter(f => f.returnTurn > G.turn);
  if (rec === enAttente && moi.forceTokens === poolAvant + enAttente && enCd(moi) === 0)
    ok('au tour ' + G.turn + ', les ' + rec + ' jeton(s) reviennent au pool et la file est vide');
  else ko('retour incomplet : ' + rec + ' revenus sur ' + enAttente + ' attendus');

  // Stratégie Guerrière (investissement Niv.2) : récupération en 1 tour.
  const b = partie3Humains();
  const m2 = b.G.player, c2 = nation(b.G, 'martiens');
  m2.investBonus2 = { fastCooldown: true, turnsLeft: 3 };
  b.sb.declareWar('essai', 'player', c2.civ.id); b.G.warWith = c2.civ.id;
  b.G._aiWarCommitted = 2;
  b.sb.resolveWarCombat(6);
  const cd2 = (m2.forceCooldown || [])[0];
  if (cd2 && cd2.returnTurn === b.G.turn + 1) ok('Stratégie Guerrière : retour au tour ' + cd2.returnTurn + ' (un tour au lieu de deux)');
  else ko('Stratégie Guerrière : retour au tour ' + (cd2 && cd2.returnTurn) + ', attendu ' + (b.G.turn + 1));
}

/* ── 8. On ne peut engager que ce qu'on peut payer ────────────────────────── */
titre('8. Engagement plafonné par les ressources');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  moi.forceTokens = 12; moi.res.materials = 3; moi.res.energy = 3;   // de quoi payer 3 jetons
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  const av = photo(moi);
  G._aiWarCommitted = 0;
  const r = sb.resolveWarCombat(12);                                  // on en demande 12
  const ap = photo(moi);
  if (r.pPow === 3) ok('engagement ramené à 3 jetons — le maximum payable');
  else ko('puissance ' + r.pPow + ' : ' + (r.pPow > 3 ? 'des jetons ont été engagés SANS être payés' : 'plafond trop sévère'));
  if (ap.materials >= 0 && ap.energy >= 0) ok('aucune ressource négative');
  else ko('ressources négatives après combat');
  const dM = av.materials - ap.materials, dE = av.energy - ap.energy;
  if (dM === 3 && dE === 3) ok('facture exacte : −3🪨 −3⚡ pour 3 jetons');
  else ko('facture −' + dM + '🪨 −' + dE + '⚡ pour ' + r.pPow + ' jeton(s) — le compte ne tombe pas juste');
}

/* ── 9. Les messages de résultat disent-ils la vérité ? ───────────────────── */
titre('9. Les comptes rendus du journal correspondent aux prélèvements');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  donner(moi, sb, 'nav2_war', 'empath_routes');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  const av = photo(moi);
  G._aiWarCommitted = 3;
  const nLog = (G.log || []).length;
  sb.resolveWarCombat(7);
  const ap = photo(moi);
  const lignes = (G.log || []).slice(0, (G.log || []).length - nLog).map(e => String(e.msg).replace(/<[^>]*>/g, ''));
  const annonce = lignes.find(l => /Coût combat — /.test(l));   // plus de « (toi) » au journal (22/09)
  if (!annonce) { ko('aucune annonce de coût dans le journal'); }
  else {
    const m = annonce.match(/−(\d+)\s*(?:🪨)?\s*−(\d+)/);
    const dM = av.materials - ap.materials, dE = av.energy - ap.energy;
    const aM = m ? parseInt(m[1], 10) : -1, aE = m ? parseInt(m[2], 10) : -1;
    if (aM === dM && aE === dE) ok('le journal annonce −' + aM + '🪨 −' + aE + '⚡ et c\'est exactement ce qui est prélevé');
    else ko('le journal annonce −' + aM + '🪨 −' + aE + '⚡ mais −' + dM + '🪨 −' + dE + '⚡ sont prélevés');
    note('« ' + annonce.trim() + ' »');
  }
  const bilan = lignes.find(l => /jeton\(s\) engagé\(s\).*puissance/.test(l));
  if (bilan) { ok('compte rendu de combat présent'); note('« ' + bilan.trim() + ' »'); }
  else ko('aucun compte rendu de combat (jetons, coût, puissance, techs) dans le journal');
}

/* ═══════════════ PARTIE 2 ═══════════════ */
console.log('\n\n########## PARTIE 2 — guerres simultanées, usure, techs Nv.3 ##########');

/* ── 10. Deux guerres en même temps, comptabilité séparée ─────────────────── */
titre('10. Trois humains, deux guerres simultanées');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, a = nation(G, 'martiens'), b = nation(G, 'ceinturiens');
  donner(moi, sb, 'iadef3');                       // tech Nv.3 : +4 jetons à l'achat, ici juste possédée
  sb.declareWar('guerre A', 'player', a.civ.id);
  sb.declareWar('guerre B', 'player', b.civ.id);
  if ((G.wars || []).length === 2) ok('deux guerres coexistent');
  else ko((G.wars || []).length + ' guerre(s) au lieu de 2');

  const avB = photo(b);
  G.warWith = a.civ.id; G._aiWarCommitted = 3;
  sb.resolveWarCombat(5);                       // combat contre A seulement
  const apB = photo(b);
  if (apB.pool === avB.pool && apB.materials === avB.materials && apB.energy === avB.energy)
    ok('la nation NON engagée (Ceinturiens) n\'a rien payé ni perdu');
  else ko('la nation non engagée a bougé : pool ' + avB.pool + '→' + apB.pool
    + ', 🪨 ' + avB.materials + '→' + apB.materials + ', ⚡ ' + avB.energy + '→' + apB.energy);

  if ((G.wars || []).length === 2) ok('les deux guerres courent toujours après le combat');
  else ko('un combat contre A a fait disparaître la guerre contre B');
}

/* ── 11. Guerre d'usure : cinq combats d'affilée, le compte tient-il ? ────── */
titre('11. Cinq combats d\'affilée — le grand livre tient-il sur la durée ?');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  moi.forceTokens = 30; cible.forceTokens = 30;
  moi.res = { energy: 200, materials: 200, science: 60, morale: 8 };
  cible.res = { energy: 200, materials: 200, science: 60, morale: 8 };
  sb.declareWar('usure', 'player', cible.civ.id); G.warWith = cible.civ.id;

  /* Le total « pool + récupération + perdus » ne peut que DÉCROÎTRE, et exactement du
     nombre de jetons que les règles disent perdus. On suit ce total pas à pas. */
  let perdusCumules = 0, souci = null;
  const total = p => (p.forceTokens || 0) + enCd(p);
  let tMoi = total(moi), tCible = total(cible);
  for (let i = 0; i < 5; i++) {
    const av1 = total(moi), av2 = total(cible);
    const e1 = 4, e2 = 2;
    G._aiWarCommitted = e2;
    const r = sb.resolveWarCombat(e1);
    const perdu1 = (r.cls === 'loss') ? Math.floor(e1 / 2) : 0;
    const perdu2 = (r.cls === 'win') ? Math.floor(e2 / 2) : 0;
    perdusCumules += perdu1 + perdu2;
    if (total(moi) !== av1 - perdu1) { souci = 'combat ' + (i + 1) + ' : attaquant ' + av1 + ' → ' + total(moi) + ', attendu ' + (av1 - perdu1); break; }
    if (total(cible) !== av2 - perdu2) { souci = 'combat ' + (i + 1) + ' : défenseur ' + av2 + ' → ' + total(cible) + ', attendu ' + (av2 - perdu2); break; }
    G.warTurnsLeft = 99; const w = (G.wars || [])[0]; if (w) w.turnsLeft = 99;
  }
  if (!souci) ok('cinq combats enchaînés : aucun jeton créé ni évaporé (' + perdusCumules + ' perdu(s) au total, conformes aux règles)');
  else ko(souci);
  if ((moi.res.materials >= 0) && (moi.res.energy >= 0) && (cible.res.materials >= 0) && (cible.res.energy >= 0)) ok('aucune ressource négative après cinq combats');
  else ko('ressources négatives après cinq combats');
  void tMoi; void tCible;
}

/* ── 12. Investissements militaires : ce qu'ils changent vraiment ─────────── */
titre('12. Investissements militaires');
{
  const { sb, G } = partie3Humains();
  const moi = G.player;
  const carte = vm.runInContext('INVESTMENT_CARDS_2.find(c=>c.id==="inv2_war")', sb);
  const av = { m: moi.res.materials, e: moi.res.energy };
  sb.investAppliquer(carte, moi);
  if (moi.investBonus2 && moi.investBonus2.fastCooldown) ok('Stratégie Guerrière : récupération accélérée activée');
  else ko('Stratégie Guerrière sans effet');
  const dM = av.m - moi.res.materials, dE = av.e - moi.res.energy;
  if (dM === 4 && dE === 2) ok('coût prélevé : −4🪨 −2⚡, conforme à la carte');
  else ko('coût prélevé −' + dM + '🪨 −' + dE + '⚡ au lieu de −4🪨 −2⚡');

  // Carte militaire « Investissements militaires » : +jetons à l'achat.
  const mil = vm.runInContext('CARDS_POOL.find(c=>c.id==="mil_invest")', sb);
  if (mil) note('carte militaire « ' + mil.name + ' » présente dans le pool');
}

/* ── 13. Cartes militaires : jetons permanents et jetons temporaires ──────── */
titre('13. Cartes militaires — jetons gagnés à l\'achat, et jetons dissous');
{
  const { sb, G } = partie3Humains();
  const moi = G.player;
  const carte = id => vm.runInContext('CARDS_POOL.find(c=>c.id===' + JSON.stringify(id) + ')', sb);

  // Renforts TEMPORAIRES : +4 à l'achat, la moitié dissoute au tour suivant.
  const av = moi.forceTokens;
  const flottes = carte('mil2');                 // +4 jetons, 2 perdus au tour suivant
  sb.applyCard(flottes, moi);
  if (moi.forceTokens === av + 4) ok('Flottes de Chasseurs : +4 jetons immédiats (' + av + ' → ' + moi.forceTokens + ')');
  else ko('Flottes de Chasseurs : ' + av + ' → ' + moi.forceTokens + ', attendu ' + (av + 4));
  if (moi.milLoseNext === 2) ok('2 jetons marqués comme temporaires (dissous au tour suivant)');
  else ko('milLoseNext = ' + moi.milLoseNext + ' au lieu de 2');
  // Dissolution, telle que la joue le début de tour.
  const avantDissolution = moi.forceTokens;
  moi.forceTokens = Math.max(0, moi.forceTokens - moi.milLoseNext); moi.milLoseNext = 0;
  if (moi.forceTokens === avantDissolution - 2) ok('au tour suivant : −2 jetons, les renforts se dissolvent');
  else ko('dissolution : ' + avantDissolution + ' → ' + moi.forceTokens);

  // Jetons PERMANENTS d'une technologie Nv.2/Nv.3.
  const b = partie3Humains();
  const m2 = b.G.player;
  for (const [id, gain] of [['nav2', 2], ['hyper3', 3], ['iadef3', 4]]) {
    const c = carte(id);
    if (!c) { note('carte ' + id + ' introuvable — sautée'); continue; }
    const avant = m2.forceTokens;
    b.sb.applyCard(c, m2);
    if (m2.forceTokens === avant + gain) ok(c.name + ' : +' + gain + ' jetons permanents (' + avant + ' → ' + m2.forceTokens + ')');
    else ko(c.name + ' : ' + avant + ' → ' + m2.forceTokens + ', attendu +' + gain);
    if (!m2.milLoseNext) ok(c.name + ' : ces jetons ne sont PAS temporaires');
    else ko(c.name + ' : ses jetons sont marqués temporaires (milLoseNext=' + m2.milLoseNext + ')');
    m2.milLoseNext = 0;
  }
}

/* ── 14. Le Supercroiseur en DÉFENSE ──────────────────────────────────────── */
titre('14. Le Supercroiseur du défenseur');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  cible.hasCruiser = true; cible.cruiserPower = 5;
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  const av = photo(cible);
  G._aiWarCommitted = 2;
  const r = sb.resolveWarCombat(3);
  const ap = photo(cible);
  if (r.aPow === 8) ok('défense : 2 jetons + 5 croiseur + 1 garnison = 8');
  else ko('défense : puissance ' + r.aPow + ' au lieu de 8');
  const dM = av.materials - ap.materials, dE = av.energy - ap.energy;
  if (dM === 7 && dE === 7) ok('le défenseur paie bien ses 2 jetons ET son croiseur (−7🪨 −7⚡)');
  else ko('le défenseur paie −' + dM + '🪨 −' + dE + '⚡, attendu −7🪨 −7⚡ (2 jetons + 5/5 croiseur)');
  if (r.cls === 'loss') ok('l\'attaquant à 3 jetons est repoussé');
  else ko('résultat ' + r.cls + ' alors que 3 < 8');
}

/* ── 15. Attaque de route ─────────────────────────────────────────────────── */
titre('15. Attaque de route : destruction, jeton, protection');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  const noeuds = vm.runInContext('Object.keys(NODES)', sb);
  cible.routes = [{ from: noeuds[0], to: noeuds[1], tokens: 0 }];
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  const r1 = sb.resolveRouteAttack(moi, cible, cible.routes[0], 2);
  if (r1 && r1.destroyed && cible.routes.length === 0) ok('route sans jeton : détruite');
  else ko('route sans jeton non détruite (' + JSON.stringify(r1) + ')');

  // Une route protégée par une TECHNOLOGIE ne tombe pas.
  const b = partie3Humains();
  const m2 = b.G.player, c2 = nation(b.G, 'martiens');
  donner(c2, b.sb, 'empath_routes');
  c2.routes = [{ from: noeuds[0], to: noeuds[1], tokens: 0 }];
  b.sb.declareWar('essai', 'player', c2.civ.id); b.G.warWith = c2.civ.id;
  const r2 = b.sb.resolveRouteAttack(m2, c2, c2.routes[0], 5);
  if (r2 && r2.held && c2.routes.length === 1) ok('route protégée par Lien Empathe : tient, même contre 5 jetons');
  else ko('une route protégée par technologie a été détruite');

  // Un jeton posé tient contre 1 jeton, tombe contre plus.
  const c = partie3Humains();
  const m3 = c.G.player, c3 = nation(c.G, 'martiens');
  c3.routes = [{ from: noeuds[0], to: noeuds[1], tokens: 1 }];
  c.sb.declareWar('essai', 'player', c3.civ.id); c.G.warWith = c3.civ.id;
  const r3 = c.sb.resolveRouteAttack(m3, c3, c3.routes[0], 1);
  if (r3 && r3.held) ok('route défendue par 1 jeton : tient contre 1 jeton');
  else ko('route à 1 jeton tombée contre 1 seul jeton');
}

/* ── 16. Fin de guerre : ce qui est rendu, ce qui ne l'est pas ────────────── */
titre('16. Fin de guerre');
{
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  G._aiWarCommitted = 2; sb.resolveWarCombat(6);
  const cdAvant = enCd(moi), poolAvant = moi.forceTokens, moralAvant = moi.res.morale;
  const w = (G.wars || [])[0]; if (w) { w.wins = { player: 2, ai: 0 }; G.warWins = { player: 2, ai: 0 }; }
  sb.endWar(cible.civ.id);
  if (enCd(moi) === cdAvant) ok('la fin de guerre ne rend PAS les jetons encore en récupération (' + cdAvant + ' toujours en file)');
  else ko('les jetons en récupération ont été rendus par la fin de guerre : ' + cdAvant + ' → ' + enCd(moi));
  if (moi.forceTokens === poolAvant) ok('le pool n\'est pas modifié par la fin de guerre');
  else ko('pool ' + poolAvant + ' → ' + moi.forceTokens + ' à la fin de la guerre');
  if (moi.res.morale === Math.min(8, moralAvant + 1)) ok('vainqueur : +1 moral');
  else ko('moral du vainqueur ' + moralAvant + ' → ' + moi.res.morale);
  if (!(G.wars || []).length) ok('la guerre a bien disparu de la liste');
  else ko('la guerre est encore dans la liste après endWar');
}

/* ── 17. Un champ déclaré qui ne sert à rien est un piège ─────────────────── */
titre('17. Le bonus de combat est lu SUR LA CARTE — mesuré, pas déduit');
{
  /* HISTOIRE DE CE CONTRÔLE, parce qu'elle vaut plus que le contrôle lui-même.
     Les cartes Lien Empathe et Télépathie déclarent `combatBonus:2`. Pendant longtemps ce champ
     était recopié dans `p.combatBonus`… que personne ne lisait et que le début de tour remettait
     à zéro. Le +2 marchait quand même, par ONZE copies de `hasSpec(p,'empath_routes')?2:0` écrites
     à la main. Un chiffre à onze endroits, et un champ de carte qui ne servait à rien : une carte
     future portant `combatBonus` n'aurait rien fait, en silence.
     Mes DEUX premières versions de ce contrôle lisaient le code et se donnaient raison toutes
     seules — elles trouvaient `p.combatBonus` dans la ligne qui l'ÉCRIT. On MESURE désormais. */
  const { sb, G } = partie3Humains();
  const moi = G.player, cible = nation(G, 'martiens');
  sb.declareWar('essai', 'player', cible.civ.id); G.warWith = cible.civ.id;
  // Une carte inventée, avec un bonus énorme : si le champ compte, la puissance doit exploser.
  moi.cards.push({ id: 'essai', name: 'Carte d\'essai', combatBonus: 100 });
  G._aiWarCommitted = 0;
  const r = sb.resolveWarCombat(3);
  if (r.pPow === 103) ok('une carte déclarant combatBonus:100 donne bien +100 (puissance ' + r.pPow + ')');
  else ko('puissance ' + r.pPow + ' au lieu de 103 : le champ `combatBonus` des cartes n\'est pas lu');

  // Et les deux vraies cartes donnent bien +2 chacune.
  const b = partie3Humains();
  const m2 = b.G.player, c2 = nation(b.G, 'martiens');
  donner(m2, b.sb, 'empath_routes', 'empath_tele');
  b.sb.declareWar('essai', 'player', c2.civ.id); b.G.warWith = c2.civ.id;
  b.G._aiWarCommitted = 0;
  const r2 = b.sb.resolveWarCombat(3);
  if (r2.pPow === 7) ok('Lien Empathe +2 et Télépathie +2 : 3 jetons → puissance 7');
  else ko('3 jetons + les deux cartes empathes donnent ' + r2.pPow + ' au lieu de 7');
}

/* ── 18. Télépathie : le malus de moral vise la nation EN GUERRE, pas les autres ── */
titre('18. Télépathie — −2 moral par tour, mais seulement pour qui est en guerre');
{
  /* Marc, 2026-08-09 : « profite pour corriger aussi télépathie qui perd du moral en cas de
     guerre, si ça se trouve le problème est le même ». Il l'était : la condition lisait
     `G.warState`, un drapeau GLOBAL qui vaut « en guerre » dès que la nation ACTIVE se bat.
     À trois joueurs, une nation télépathe EN PAIX perdait donc 2 moral parce qu'une autre
     se battait. */
  const { sb, G } = partie3Humains();
  const enPaix = nation(G, 'ceinturiens'), belliqueux = G.player, adversaire = nation(G, 'martiens');
  donner(enPaix, sb, 'empath_tele');            // télépathe, mais en paix
  sb.declareWar('essai', 'player', adversaire.civ.id);   // la guerre ne concerne PAS les Ceinturiens

  const av = enPaix.res.morale;
  sb.doRevenues();
  const perdu = av - enPaix.res.morale;
  if (perdu <= 0) ok('la nation télépathe EN PAIX ne perd pas de moral (' + av + ' → ' + enPaix.res.morale + ')');
  else ko('la nation télépathe en paix a perdu ' + perdu + ' moral à cause de la guerre des AUTRES');

  // Et le malus s'applique bien à celle qui se bat vraiment.
  const b = partie3Humains();
  const guerrier = b.G.player, cible = nation(b.G, 'martiens');
  donner(guerrier, b.sb, 'empath_tele');
  b.sb.declareWar('essai', 'player', cible.civ.id);
  const av2 = guerrier.res.morale;
  b.sb.doRevenues();
  const d2 = av2 - guerrier.res.morale;
  if (d2 >= 2) ok('la nation télépathe EN GUERRE subit bien son malus de moral');
  else ko('la nation télépathe en guerre n\'a pas subi le malus (moral ' + av2 + ' → ' + guerrier.res.morale + ')');
}

console.log('\n' + '═'.repeat(78));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Guerre : jetons conservés, coûts exacts, captures et récupérations conformes.');
console.log('═'.repeat(78));
