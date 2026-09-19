/* ============================================================================
   TEST — LA FENÊTRE DE COMBAT DOIT TOUJOURS AVOIR UNE SORTIE
   ----------------------------------------------------------------------------
   POURQUOI. Deux amis de Marc, 17/08, à 2 humains + 1 IA. L'un attaque l'IA au tour 6 ; l'IA lui
   déclare la guerre en retour. Au tour suivant il refuse la paix, choisit d'attaquer — et découvre
   qu'il n'a plus les ressources. La fenêtre de choix de colonie n'a alors AUCUN bouton actif, et
   la partie s'arrête là pour toute la table.

   TROIS CONDITIONS SE RENCONTRAIENT, et il fallait les trois :
     · il avait DÉCLARÉ la guerre  → `canHold` valait `false`, donc pas de « Tenir position » ;
     · il ne pouvait plus payer un seul jeton → tous les boutons de colonie désactivés ;
     · l'ennemi ne menaçait rien ce tour-là  → pas de bouton « Défendre ».

   CE QU'ON VÉRIFIE, ET DANS QUEL ORDRE.
     1. la fenêtre offre TOUJOURS une sortie, y compris à l'agresseur sans ressources ;
     2. contre-épreuve sur le témoin figé v9.69 : la sortie devait y être ABSENTE, sinon le banc ne
        reproduit pas la situation vécue et son vert ne vaut rien ;
     3. l'avertissement avant de refuser la paix connaît le vrai nombre de jetons payables ;
     4. l'attaque de route, envoyée par le serveur mais jamais affichée en ligne, fonctionne
        maintenant de bout en bout ;
     5. le client affiche bien ces deux choses — une correction de moteur qu'aucun écran ne montre
        ne corrige rien.

   Usage : node test_impasse_guerre.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const TEMOIN = path.join(__dirname, 'temoin_v9.69', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* La situation exacte : j'ai déclaré la guerre, je n'ai plus rien, l'ennemi ne menace rien. */
function impasse(html) {
  const sb = loadLogic(html);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  const moi = G.player, ennemi = G.ais[0];
  G.turn = 7; G.phase = 'actions';
  moi._isAI = false;
  sb.declarerGuerre(moi, ennemi, 'assaut du tour 6', 'player');
  G.warWith = ennemi.civ.id;
  G._warDeclaredBy = 'player';               // ← c'est LUI l'agresseur : la condition décisive
  moi.res.materials = 0; moi.res.energy = 0; // plus de quoi engager le moindre jeton
  moi.forceTokens = 3;                       // il a des vaisseaux, mais pas de quoi les armer
  G._warKeepStance = true; G._aiWarStance = 'hold'; G._aiWarTarget = null;  // l'ennemi ne menace rien
  const vus = [];
  sb.setDecisionSink(p => vus.push(p));
  try { sb.showWarCombatModal(); } catch (e) { return { erreur: e.message }; }
  const q = vus.find(p => p.kind === 'war_combat');
  return { sb, G, moi, ennemi, q };
}

/* Compte les sorties réellement actionnables dans une charge utile de combat. */
function sorties(o) {
  if (!o) return { total: 0, detail: 'aucune fenêtre' };
  const peutAttaquer = (o.maxEngage || 0) >= 1 && (o.cols || []).length > 0;
  const peutRoute = (o.routes || []).some(r => (o.myForce || 0) >= r.cost);
  const peutDefendre = !!o.aiThreat;
  const peutSeRetirer = !!o.canHold;
  const d = [];
  if (peutAttaquer) d.push('attaquer une colonie');
  if (peutRoute) d.push('attaquer une route');
  if (peutDefendre) d.push('défendre');
  if (peutSeRetirer) d.push('se retirer');
  return { total: d.length, detail: d.join(' · ') || 'AUCUNE', peutSeRetirer };
}

console.log('═'.repeat(80));
console.log('IMPASSE DE GUERRE — UNE FENÊTRE SANS ISSUE NE DOIT PAS EXISTER');
console.log('═'.repeat(80) + '\n');

/* ── 1. La situation vécue, sur le moteur corrigé ─────────────────────────── */
console.log('1. AGRESSEUR SANS RESSOURCES, ENNEMI QUI NE MENACE RIEN');
const cas = impasse(HTML);
if (cas.erreur) ko('montage impossible : ' + cas.erreur);
else {
  const o = cas.q && cas.q.payload;
  const s = sorties(o);
  note('jetons payables : ' + ((o && o.maxEngage) || 0) + ' · colonies à portée : ' + ((o && o.cols || []).length)
    + ' · menace ennemie : ' + ((o && o.aiThreat) ? 'oui' : 'non'));
  note('sorties possibles : ' + s.detail);
  if (s.total > 0) ok('la fenêtre a au moins une sortie');
  else ko('AUCUNE sortie : la partie se fige, exactement comme chez les amis de Marc');
  if (s.peutSeRetirer) ok('le retrait est proposé même à celui qui a déclaré la guerre');
  else ko('pas de retrait possible pour l\'agresseur — le défaut est intact');
  if (o && o.estAgresseur) ok('le client sait qu\'il est l\'agresseur (il dira « renoncer », pas « tenir position »)');
  else ko('`estAgresseur` absent : le bouton portera le mauvais mot');
}

/* ── 2. CONTRE-ÉPREUVE — le témoin figé doit montrer l'impasse ────────────── */
console.log('\n2. CONTRE-ÉPREUVE — la même situation sur le moteur d\'avant (témoin v9.69)');
{
  /* Sans ce cas, la section 1 serait verte même si l'impasse n'avait jamais existé dans ce
     montage : on prouverait alors seulement que le banc sait fabriquer une fenêtre confortable. */
  if (!fs.existsSync(TEMOIN)) ko('témoin introuvable : la contre-épreuve ne peut pas être faite');
  else {
    const av = impasse(TEMOIN);
    const s = sorties(av.q && av.q.payload);
    note('sorties sur le témoin : ' + s.detail);
    if (s.total === 0) ok('l\'ancien moteur ne laissait AUCUNE sortie — la situation vécue est bien reproduite');
    else ko('le témoin offrait déjà ' + s.total + ' sortie(s) (' + s.detail + ') : ce banc ne reproduit pas le blocage');
  }
}

/* ── 3. L'avertissement avant de refuser la paix ──────────────────────────── */
console.log('\n3. AVANT DE REFUSER LA PAIX — le joueur doit savoir ce qu\'il pourra engager');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G, moi = G.player;
  G.turn = 7; G.phase = 'actions'; moi._isAI = false;
  sb.declarerGuerre(moi, G.ais[0], 'banc', 'player');
  G.warWith = G.ais[0].civ.id;
  moi.res.materials = 1; moi.res.energy = 0; moi.forceTokens = 4;
  const vus = []; sb.setDecisionSink(p => vus.push(p));
  try { sb.showPeaceOfferModal(false, null); } catch (e) { note('exception : ' + e.message); }
  const q = vus.find(p => p.kind === 'peace_offer');
  if (!q) ko('aucune fenêtre de paix émise : le cas ne peut pas être joué');
  else {
    const o = q.payload;
    note('maxEngage annoncé : ' + o.maxEngage + ' · stocks : ' + (o.stocks && o.stocks.materials) + '🪨 ' + (o.stocks && o.stocks.energy) + '⚡');
    if (o.maxEngage === undefined) ko('`maxEngage` absent de la fenêtre de paix : le client ne peut pas avertir');
    else if (o.maxEngage !== 0) ko('maxEngage = ' + o.maxEngage + ' alors qu\'il manque l\'énergie : le chiffre est faux');
    else ok('la fenêtre de paix annonce 0 jeton engageable — de quoi avertir avant le refus');
  }
}

/* ── 4. Attaquer une route, en ligne ──────────────────────────────────────── */
console.log('\n4. ATTAQUE DE ROUTE — l\'action existait côté serveur, pas côté verbe');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G, moi = G.player, ennemi = G.ais[0];
  G.turn = 7; G.phase = 'actions'; moi._isAI = false;
  sb.declarerGuerre(moi, ennemi, 'banc', 'player');
  G.warWith = ennemi.civ.id; G._warDeclaredBy = 'player';
  moi.forceTokens = 4; moi.res.materials = 6; moi.res.energy = 6;
  ennemi.routes = [{ from: ennemi.civ.home, to: 'ceres', tokens: 0 }];   // route non protégée : 1 jeton
  const avant = ennemi.routes.length;
  const vus = []; sb.setDecisionSink(p => vus.push(p));
  sb.fluxDonnees().suiteCombat = 'guerreCombatLiveChoisi';
  try { sb.adChoixDeCombat({ action: 'route', route: 0 }); } catch (e) { note('exception : ' + e.message); }
  const capture = vus.find(p => p.kind === 'route_capture');
  const partie = (G.log || []).some(l => /route/i.test(String((l && l.msg) || l)));
  if (capture) ok('l\'attaque de route ouvre bien la question « récupérer ou détruire »');
  else if (ennemi.routes.length < avant) ok('la route ennemie a été prise');
  else ko('l\'action `route` n\'a rien produit (' + (partie ? 'journal touché' : 'aucune trace') + ')');

  /* CONTRE-ÉPREUVE : une route qu'on n'a pas les moyens d'attaquer ne doit ni passer, ni FIGER. */
  const sb2 = loadLogic(HTML);
  sb2.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G2 = sb2.__G, moi2 = G2.player, en2 = G2.ais[0];
  G2.turn = 7; G2.phase = 'actions'; moi2._isAI = false;
  sb2.declarerGuerre(moi2, en2, 'banc', 'player');
  G2.warWith = en2.civ.id; G2._warDeclaredBy = 'player';
  moi2.forceTokens = 0;                                     // rien à engager
  en2.routes = [{ from: en2.civ.home, to: 'ceres', tokens: 1 }];   // protégée : 2 jetons requis
  sb2.setDecisionSink(() => {});
  let suiteAppelee = false;
  sb2.fluxDonnees().suiteCombat = 'guerreCombatLiveChoisi';
  try { sb2.adChoixDeCombat({ action: 'route', route: 0 }); suiteAppelee = true; } catch (e) { note('exception : ' + e.message); }
  const abandon = (G2.log || []).some(l => /inattaquable|abandonné/i.test(String((l && l.msg) || l)));
  if (en2.routes.length === 1 && suiteAppelee && abandon)
    ok('contre-épreuve : sans jetons, la route est refusée ET le tour se poursuit (pas de blocage)');
  else ko('contre-épreuve ÉCHOUÉE : route=' + en2.routes.length + ' suite=' + suiteAppelee + ' message=' + abandon);
}

/* ── 5. Le client montre-t-il ces sorties ? ───────────────────────────────── */
console.log('\n5. CÔTÉ ÉCRAN — une sortie que personne n\'affiche n\'est pas une sortie');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'online.js'), 'utf8');
  const bloc = src.slice(src.indexOf("if(k==='war_combat')"), src.indexOf("if(k==='peace_offer')"));
  const tests = [
    ["le bouton de retrait n'est plus conditionnel", /b\+=(t\('web\.ligne_2',)?'<button class="opt" id="sc-wc-hold"/.test(bloc)],   // v10.78 : le libellé passe par t()
    ["les routes ennemies sont affichées", /data-rt=/.test(bloc)],
    ["le clic sur une route envoie l'action", /action:\s*'route'/.test(bloc)],
    ["l'écran explique pourquoi tout est gris", /maxF<1/.test(bloc)],
  ];
  for (const [quoi, vrai] of tests) vrai ? ok(quoi) : ko(quoi + ' — absent d\'online.js');
  if (/_confirmerGuerreSansMoyens/.test(src)) ok('le refus de la paix demande confirmation quand les moyens manquent');
  else ko('aucune confirmation avant de refuser la paix sans ressources');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ La fenêtre de combat a toujours une issue, les routes sont attaquables, et on prévient');
console.log('  avant de refuser une paix qu\'on n\'a pas les moyens de refuser.');
