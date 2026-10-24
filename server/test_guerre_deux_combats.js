/* ============================================================================
   TEST — DEUX COMBATS PAR TOUR, ET QUI DÉCIDE DE L'ORDRE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 17/08 : « si une nation te déclare la guerre, c'est elle qui doit attaquer en
   premier à la fin du 1er tour, pas moi. […] Et à la fin du deuxième tour on devrait pouvoir faire
   deux combats, un en défense et un en attaque. »

   CE QU'ON A TROUVÉ EN CHERCHANT. `guerrePaixRepondue` renvoyait le NON-agresseur directement à
   l'assaut ennemi, à chaque tour, sans jamais lui ouvrir de fenêtre d'attaque — alors que le
   message du premier tour lui promet « Tu pourras riposter à TON tour ». L'agresseur, lui, avait
   déjà deux combats par tour. L'asymétrie était l'inverse exact de celle qu'on croyait.

   PUIS LA RÈGLE S'EST PRÉCISÉE (Marc, 23/08). L'initiative n'est pas « qui frappe en premier »,
   c'est « qui DÉCIDE lequel frappe en premier ». Six critères, dans cet ordre :
     1. Hyperpropulsion (priorité absolue ; s'annule si les deux l'ont)
     2. celui qui a le MOINS assailli l'autre pendant le tour (rétrocession)
     3. le plus de technologies de rang 2 ou 3
     4. le plus de jetons Force
     5. le plus de ressources engageables
     6. l'agresseur, en tout dernier recours

   ⚠️ ON TESTE DEUX CHOSES DISTINCTES, ET IL NE FAUT PAS LES CONFONDRE : à QUI la question est
   posée (la cascade), et ce que la réponse PRODUIT (l'ordre réel des combats). Un banc qui ne
   regarderait que l'ordre final ne saurait pas dire si c'est la cascade qui s'est trompée ou
   l'application de la réponse — et c'est justement là qu'une inversion se cache, puisque le
   « j'attaque en premier » de l'adversaire signifie que MOI je frappe en second.

   Usage : node test_guerre_deux_combats.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const TEMOIN = path.join(__dirname, 'temoin_v9.69', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

const HYPER = { id: 'hyper3', branch: 'navigation', tier: 3, name: 'Hyperpropulsion', emoji: '🌀',
                spec: 'route_force_free', spec2: 'guerre_initiative' };

/* Une guerre EN COURS déclarée par l'adversaire, avec deux camps capables de se battre. */
function montage(html, o) {
  o = o || {};
  const sb = loadLogic(html);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G;
  const moi = G.player, adv = G.ais[0];
  G.turn = 7; G.phase = 'actions';
  moi._isAI = false;
  for (const n of [moi, adv]) { n.forceTokens = 8; n.res.materials = 10; n.res.energy = 10; n.res.morale = 6; }
  /* Chacun doit avoir une colonie connectée hors base, sinon il n'y a rien à assaillir et le banc
     mesurerait l'absence de cible au lieu de l'ordre des combats. */
  const libres = vm.runInContext('Object.keys(NODES).filter(id=>!NODES[id].decorative)', sb);
  const pris = new Set(); for (const n of [G.player].concat(G.ais)) for (const c of (n.colonies || [])) pris.add(c.nodeId);
  const dispo = libres.filter(id => !pris.has(id));
  moi.colonies.push({ nodeId: dispo[0], level: 1, connected: true });
  adv.colonies.push({ nodeId: dispo[1], level: 1, connected: true });

  sb.declarerGuerre(adv, moi, 'guerre déclarée par elle', 'ai');
  const war = (G.wars || [])[0];
  if (war) {
    war.live = true; war.justDeclared = false; war.turnsLeft = 2;
    war.agresseurCiv = adv.civ.id; war._aiAssaultedThisTurn = false;
    if (o.assauts) { war._assautsTour = G.turn; war._assautsPar = {};
      if (o.assauts.moi) war._assautsPar[moi.civ.id] = o.assauts.moi;
      if (o.assauts.lui) war._assautsPar[adv.civ.id] = o.assauts.lui; }
  }
  G.warWith = adv.civ.id;
  if (o.hyperMoi) moi.cards.push(Object.assign({}, HYPER));
  if (o.hyperLui) adv.cards.push(Object.assign({}, HYPER));
  /* Technologies de rang 2-3 : on en ajoute de VRAIES, prises dans le jeu, pour que le compteur
     mesure la même chose que le moteur. */
  const t23 = vm.runInContext('CARDS_POOL.filter(c=>c.branch&&c.tier>=2).slice(0,12)', sb);
  for (let i = 0; i < (o.techMoi || 0); i++) moi.cards.push(Object.assign({}, t23[i]));
  for (let i = 0; i < (o.techLui || 0); i++) adv.cards.push(Object.assign({}, t23[i + 6]));
  if (o.jetonsMoi !== undefined) moi.forceTokens = o.jetonsMoi;
  if (o.jetonsLui !== undefined) adv.forceTokens = o.jetonsLui;
  if (o.resMoi !== undefined) { moi.res.materials = o.resMoi; moi.res.energy = o.resMoi; }
  if (o.resLui !== undefined) { adv.res.materials = o.resLui; adv.res.energy = o.resLui; }
  return { sb, G, moi, adv, war };
}

/* Déroule la fin de tour de guerre. Rend la suite des fenêtres ET à qui l'initiative a été posée. */
function derouler(m, reponses) {
  reponses = reponses || {};
  const suite = [];
  let initiativeA = null;
  m.sb.setDecisionSink(() => {});
  try { m.sb.stGuerres(); } catch (e) { return { suite, erreur: e.message }; }
  let garde = 0;
  while (garde++ < 60) {
    const liste = (typeof m.sb.fluxQuestionsEnAttente === 'function') ? m.sb.fluxQuestionsEnAttente() : [];
    if (!liste.length) break;
    const p = liste[0];
    suite.push(p.kind);
    let rep = {};
    if (p.kind === 'peace_offer') rep = { accept: false };
    else if (p.kind === 'war_combat') rep = { action: 'hold' };
    else if (p.kind === 'defense') rep = { defTokens: 1 };
    else if (p.kind === 'war_initiative') { initiativeA = p.nation; rep = { id: reponses.initiative || 'attaque' }; }
    else if (p.kind === 'peace_answer') rep = { accept: false };
    try { m.sb.resolveDecision(p.id, rep); } catch (e) { suite.push('ERREUR:' + e.message); break; }
  }
  return { suite, initiativeA };
}
const combat = s => s.filter(k => k === 'war_combat' || k === 'defense');
/* Qui détient l'initiative, en une ligne. */
function detenteur(o) {
  const m = montage(HTML, o);
  const r = derouler(m);
  return { qui: r.initiativeA, moi: m.moi.civ.id, lui: m.adv.civ.id, suite: r.suite };
}

console.log('═'.repeat(80));
console.log('GUERRE — DEUX COMBATS PAR TOUR, ET QUI DÉCIDE DE L\'ORDRE');
console.log('═'.repeat(80) + '\n');

/* ── 1. Le défenseur obtient enfin sa fenêtre d'assaut ────────────────────── */
console.log('1. JE N\'AI PAS DÉCLARÉ LA GUERRE — puis-je quand même attaquer ?');
{
  const r = derouler(montage(HTML));
  note('fenêtres : ' + r.suite.join(' → '));
  if (r.suite.includes('war_combat')) ok('le défenseur a bien sa fenêtre d\'assaut');
  else ko('aucune fenêtre d\'assaut : le défenseur ne peut toujours pas riposter');
  if (r.suite.includes('defense')) ok('et il subit aussi l\'assaut ennemi — les deux combats ont lieu');
  else ko('l\'assaut ennemi n\'a pas eu lieu : il n\'y a qu\'un seul combat');
}

/* ── 2. CONTRE-ÉPREUVE — le moteur d'avant ne donnait rien au défenseur ───── */
console.log('\n2. CONTRE-ÉPREUVE — la même guerre sur le témoin figé v9.69');
{
  if (!fs.existsSync(TEMOIN)) ko('témoin introuvable : contre-épreuve impossible');
  else {
    const r = derouler(montage(TEMOIN));
    note('fenêtres sur le témoin : ' + r.suite.join(' → '));
    if (!r.suite.includes('war_combat')) ok('l\'ancien moteur n\'ouvrait AUCUNE fenêtre d\'assaut au défenseur — défaut reproduit');
    else ko('le témoin donnait déjà sa fenêtre au défenseur : ce banc ne mesure pas le bon défaut');
  }
}

/* ── 3. La cascade, critère par critère ───────────────────────────────────── */
console.log('\n3. LA CASCADE — six critères, du plus fort au plus faible');
{
  const cas = [
    ['🌀 Hyperpropulsion pour moi seul',        { hyperMoi: true, assauts: { moi: 3, lui: 0 } }, 'moi',
     'elle prime même sur la rétrocession, qui me désignerait pourtant comme ayant trop frappé'],
    ['🌀 Hyperpropulsion pour lui seul',        { hyperLui: true, assauts: { moi: 0, lui: 3 } }, 'lui', 'symétrique'],
    ['🌀 les DEUX l\'ont (copie/espionnage)',   { hyperMoi: true, hyperLui: true, assauts: { moi: 2, lui: 0 } }, 'lui',
     'les pouvoirs s\'annulent, la rétrocession reprend la main'],
    ['Rétrocession — j\'ai plus assailli',      { assauts: { moi: 2, lui: 1 } }, 'lui', ''],
    ['Rétrocession — il a plus assailli',       { assauts: { moi: 1, lui: 2 } }, 'moi', ''],
    ['Égalité d\'assauts → technologies T2/T3', { assauts: { moi: 1, lui: 1 }, techMoi: 3, techLui: 1 }, 'moi', ''],
    ['Égalité techs → jetons Force',            { assauts: { moi: 1, lui: 1 }, techMoi: 2, techLui: 2, jetonsMoi: 9, jetonsLui: 4 }, 'moi', ''],
    ['Égalité jetons → ressources engageables', { assauts: { moi: 1, lui: 1 }, techMoi: 2, techLui: 2, jetonsMoi: 5, jetonsLui: 5, resMoi: 3, resLui: 9 }, 'lui', ''],
    ['Égalité parfaite → l\'agresseur tranche', { assauts: { moi: 1, lui: 1 } }, 'lui', 'c\'est lui qui a déclaré la guerre'],
  ];
  for (const [nom, opts, attendu, pourquoi] of cas) {
    const d = detenteur(opts);
    const qui = (d.qui === d.moi) ? 'moi' : (d.qui === d.lui ? 'lui' : '(personne)');
    if (qui === attendu) ok(nom + ' → ' + qui + (pourquoi ? '   (' + pourquoi + ')' : ''));
    else ko(nom + ' → ' + qui + ' au lieu de ' + attendu);
  }
  /* CONTRE-ÉPREUVE GLOBALE : la question doit TOUJOURS trouver un destinataire. Une cascade de
     départage qui s'achève sans désigner personne fige la partie — c'est sa seule faute impardonnable. */
  const orphelin = detenteur({ assauts: { moi: 1, lui: 1 } });
  if (orphelin.qui) ok('contre-épreuve : même à égalité parfaite, quelqu\'un est désigné');
  else ko('contre-épreuve ÉCHOUÉE : personne ne décide, la partie attendrait indéfiniment');
}

/* ── 4. La réponse est appliquée du point de vue de CELUI QUI DÉCIDE ──────── */
console.log('\n4. LA RÉPONSE — appliquée du bon côté de la table');
{
  /* Moi je décide : « attaquer en premier » doit me faire frapper d'abord. */
  const a = derouler(montage(HTML, { hyperMoi: true }), { initiative: 'attaque' });
  note('je décide « attaquer » → ' + combat(a.suite).join(' → '));
  if (combat(a.suite)[0] === 'war_combat') ok('je frappe en premier');
  else ko('mon choix « attaquer » ne me fait pas frapper en premier');

  const b = derouler(montage(HTML, { hyperMoi: true }), { initiative: 'defense' });
  note('je décide « défendre » → ' + combat(b.suite).join(' → '));
  if (combat(b.suite)[0] === 'defense') ok('j\'encaisse en premier');
  else ko('mon choix « défendre » n\'est pas respecté');

  /* ⚠️ LE CAS QUI CACHE UNE INVERSION. C'est LUI qui décide : son « attaquer en premier » signifie
     que c'est LUI qui frappe, donc que MOI je subis d'abord. Si le moteur appliquait la réponse du
     point de vue de la nation active, l'ordre serait exactement inversé — et l'écran annoncerait
     le contraire de ce qui se passe. */
  const c = derouler(montage(HTML, { hyperLui: true }), { initiative: 'attaque' });
  note('IL décide « attaquer » → ' + combat(c.suite).join(' → '));
  if (combat(c.suite)[0] === 'defense') ok('son assaut passe en premier : la réponse n\'est pas lue à l\'envers');
  else ko('inversion : son « j\'attaque » me fait frapper en premier');

  const d = derouler(montage(HTML, { hyperLui: true }), { initiative: 'defense' });
  note('IL décide « défendre » → ' + combat(d.suite).join(' → '));
  if (combat(d.suite)[0] === 'war_combat') ok('contre-épreuve : son « je défends » me fait frapper en premier');
  else ko('contre-épreuve ÉCHOUÉE : ' + combat(d.suite).join(' → '));
}

/* ── 5. Deux combats ne consomment qu'un tour de guerre ───────────────────── */
console.log('\n5. DURÉE — deux combats dans le même tour ne valent qu\'UN tour de guerre');
{
  const m = montage(HTML);
  const avant = m.war ? m.war.turnsLeft : null;
  m.sb.setDecisionSink(() => {});
  try { m.sb.resolveWarCombat(1); m.sb.resolveWarCombat(1); } catch (e) { note('exception : ' + e.message); }
  const apres = m.war ? m.war.turnsLeft : null;
  note('turnsLeft : ' + avant + ' → ' + apres + ' (deux combats, même tour)');
  if (avant - apres === 1) ok('un seul tour de guerre consommé');
  else ko('la guerre a perdu ' + (avant - apres) + ' tour(s) pour deux combats du même soir');
  m.G.turn++;
  try { m.sb.resolveWarCombat(1); } catch (e) {}
  if (m.war.turnsLeft === apres - 1) ok('contre-épreuve : le tour suivant décompte bien, la guerre n\'est pas éternelle');
  else ko('contre-épreuve ÉCHOUÉE : turnsLeft=' + m.war.turnsLeft + ' au tour suivant (attendu ' + (apres - 1) + ')');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); for (const e of ecarts) console.log('   · ' + e); process.exit(1); }
console.log('✔ Les deux camps se battent, la cascade désigne toujours un décideur, sa réponse est');
console.log('  appliquée du bon côté, et une soirée de guerre ne coûte qu\'un tour de guerre.');
