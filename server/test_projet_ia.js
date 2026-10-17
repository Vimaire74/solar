/* ============================================================================
   TEST — LE PROJET EN CHAÎNE (l'IA prépare un coup sur plusieurs tours)
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 04/09 : « Empathe au tour 7 → Télépathie → copie de sa tech → croiseur → assaut au
   dernier tour ». Trois tours sans un point, puis la victoire. Le tacticien, qui juge coup par coup,
   ne pouvait pas le faire. Le bloc « projet en chaîne » (`projetsCandidats`, `evaluerProjet`,
   `reviserProjet`, `valeurProjet` dans moteur.js) lui donne cette profondeur.

   CE QUE CE BANC VÉRIFIE — la MÉCANIQUE, pas le gain de jeu (ça, c'est `mesure_projet.js`) :
     1. une nation adopte un projet à plusieurs étapes, et il est rangé DANS la nation (sérialisé) ;
     2. la prime va aux coups du projet, et à eux seuls (contre-épreuve) ;
     3. l'assaut qui termine une chaîne n'est primé qu'aux deux derniers tours ET une fois les
        préparatifs faits — sans quoi l'IA fonçait sans l'IA Défensive qui faisait tout le plan ;
     4. un rang 3 pris par un rival tue le projet (abandon) ;
     5. le témoin `historique` n'a jamais de projet ;
     6. Télépathie achetée par un ordinateur COPIE une carte (avant le 04/09 : rien, jamais).

   ⚠️ Le bloc est neuf : ce banc n'a pas de « rouge d'avant » à montrer, sauf le §6 (mesuré : une
   IA payait 6 savoir et 2 AC pour une Télépathie sans effet).

   Usage : node test_projet_ia.js
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

function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = opts.turn || 3; G.phase = 'actions';
  if (opts.cerveau) G._cerveauIA = opts.cerveau;
  const moi = G.player, ia = G.ais[0];
  moi._isAI = true; ia._isAI = true;
  for (const p of [moi, ia]) { p.acLeft = 4; p.acMax = 4; p.res.materials = 12; p.res.energy = 12; p.res.science = 12; p.res.morale = 8; }
  return { sb, G, moi, ia };
}
const carte = (sb, id) => vm.runInContext("CARDS_POOL.find(c=>c.id==='" + id + "')", sb);

console.log('═'.repeat(84));
console.log('LE PROJET EN CHAÎNE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Une nation adopte un projet à plusieurs étapes, rangé dans la nation ── */
console.log('1. La révision adopte un projet à plusieurs étapes, et il voyage avec la nation');
{
  const m = montage();
  m.sb.reviserProjet(m.ia);
  const p = m.ia._projet;
  note('projet : ' + (p ? p.libelle + ' — ' + p.etapes.length + ' étape(s), gain ' + p.gain.toFixed(1) : 'aucun'));
  if (p && p.etapes.length >= 2) ok('un projet à ' + p.etapes.length + ' étapes est adopté');
  else ko('aucun projet à plusieurs étapes adopté sur une position ouverte');
  /* Sérialisation : le projet doit survivre à un aller-retour (sauvegarde, réseau). */
  const s = m.sb.scSerialize();
  const G2 = m.sb.scDeserialize(s);
  const p2 = (G2.ais[0] || {})._projet;
  if (p && p2 && p2.id === p.id && p2.etapes.length === p.etapes.length) ok('il survit à la sérialisation, étapes comprises');
  else ko('le projet ne survit pas à la sérialisation');
}

/* ── 2. La prime va aux coups du projet, et à eux seuls ────────────────────── */
console.log('\n2. La prime ne va qu\'aux coups qui font avancer le projet (contre-épreuve incluse)');
{
  const m = montage();
  m.ia._projet = { id: 't3:mines_energie', libelle: 'rang 3 de mines_energie', gain: 9, cible: { type: 'tech', branche: 'mines_energie' },
                   etapes: [{ type: 'tech', card: 'exploit1' }, { type: 'tech', card: 'extract2' }, { type: 'tech', card: 'dyson3' }] };
  const dedans = m.sb.valeurProjet({ type: 'tech', card: 'exploit1' }, m.ia);
  const dehors = m.sb.valeurProjet({ type: 'tech', card: 'vegetal1' }, m.ia);
  const colon = m.sb.valeurProjet({ type: 'coloniser', node: 'vesta' }, m.ia);
  note('prime sur une étape : ' + dedans.toFixed(2) + ' · sur une tech hors projet : ' + dehors + ' · sur une colonisation : ' + colon);
  if (dedans > 0) ok('une étape du projet est primée (' + dedans.toFixed(2) + ' = 9 / 3 étapes)');
  else ko('aucune prime sur une étape du projet');
  if (dehors === 0 && colon === 0) ok('rien pour les coups étrangers au projet');
  else ko('un coup étranger au projet reçoit une prime');
  /* Et sur le coup, jamais sur l'état : la position n'a pas bougé du fait du projet. */
  const avec = m.sb.evaluerPosition(m.ia);
  m.ia._projet = null;
  const sans = m.sb.evaluerPosition(m.ia);
  if (Math.abs(avec - sans) < 0.001) ok('l\'évaluation de position ignore le projet — la prime vit sur le coup');
  else ko('la position change avec le projet : la prime est dans l\'état (le piège de §63)');
}

/* ── 3. L'assaut attend la fin, et les préparatifs ─────────────────────────── */
console.log('\n3. L\'assaut final n\'est primé qu\'aux deux derniers tours, préparatifs faits');
{
  const m = montage({ turn: 5 });
  const projet = { id: 'conq:titan:cru', libelle: 'prendre Titan via Supercroiseur', gain: 12, cible: { type: 'colonie', node: 'titan', civ: 'terriens' },
                   etapes: [{ type: 'tech', card: 'mil3' }, { type: 'assaut', node: 'titan' }] };
  m.ia._projet = projet;
  const assaut = { type: 'assaut', node: 'titan' };
  const tot = m.sb.valeurProjet(assaut, m.ia);
  m.G.turn = 9;
  const tardMaisPasPret = m.sb.valeurProjet(assaut, m.ia);
  projet.etapes = [{ type: 'assaut', node: 'titan' }];
  const tardEtPret = m.sb.valeurProjet(assaut, m.ia);
  note('tour 5 : ' + tot + ' · tour 9 croiseur non acheté : ' + tardMaisPasPret + ' · tour 9 croiseur acheté : ' + tardEtPret.toFixed(1));
  if (tot === 0) ok('au tour 5, l\'assaut n\'est pas primé — on frappe à la fin');
  else ko('l\'assaut est primé trop tôt (' + tot + ')');
  if (tardMaisPasPret === 0) ok('au tour 9 sans le croiseur, toujours rien — pas d\'assaut sans les préparatifs');
  else ko('assaut primé alors que le préparatif manque (' + tardMaisPasPret + ')');
  if (tardEtPret > 0) ok('au tour 9 avec le croiseur, l\'assaut est primé de ' + tardEtPret.toFixed(1));
  else ko('l\'assaut n\'est jamais primé : le plan ne se termine pas');
}

/* ── 4. Un rang 3 pris par un rival tue le projet ──────────────────────────── */
console.log('\n4. Le rang 3 visé est pris par un rival → le projet est abandonné');
{
  const m = montage();
  m.sb.reviserProjet(m.ia);
  let p = m.ia._projet;
  /* On force un projet de branche connu, pour rendre le point pilotable quel que soit le choix initial. */
  m.ia._projet = { id: 't3:mines_energie', libelle: 'rang 3 de mines_energie', gain: 9, cible: { type: 'tech', branche: 'mines_energie' },
                   etapes: [{ type: 'tech', card: 'exploit1' }, { type: 'tech', card: 'extract2' }, { type: 'tech', card: 'dyson3' }] };
  m.G.techTaken.add('dyson3');
  m.sb.reviserProjet(m.ia);
  p = m.ia._projet;
  const trace = (m.G._traceProjet || []).filter(t => t.nat === m.ia.civ.id);
  const dernier = trace[trace.length - 1] || {};
  note('après techTaken(dyson3) : acte « ' + (dernier.acte || '?') + ' », projet courant : ' + (p ? p.libelle : 'aucun'));
  const abandonne = trace.some(t => t.acte === 'abandon' && /mines_energie/.test(t.projet || ''));
  if (abandonne && (!p || p.id !== 't3:mines_energie')) ok('projet abandonné — le maillon est devenu impossible');
  else ko('le projet survit alors que sa cible n\'existe plus');
}

/* ── 5. Le témoin historique n'a jamais de projet ──────────────────────────── */
console.log('\n5. CONTRE-ÉPREUVE — le témoin `historique` ne révise aucun projet');
{
  const m = montage({ cerveau: 'historique' });
  m.ia.colonies.push({ nodeId: 'encelade', level: 1, connected: true });
  try { m.sb.doAITurn(m.ia, false); } catch (e) {}
  if (!m.ia._projet && !(m.G._traceProjet || []).length) ok('aucun projet, aucune trace — le témoin n\'a pas bougé');
  else ko('le témoin historique s\'est mis à faire des projets : la mesure de référence est faussée');
}

/* ── 6. Télépathie achetée par un ordinateur copie une carte ───────────────── */
console.log('\n6. Un ordinateur qui achète Télépathie copie bien une carte adverse');
{
  const m = montage({ turn: 6 });
  m.G.empathesFounder = { civIds: new Set([m.ia.civ.id]), openAtTurn: 9 };
  m.G.branchTiers.empathes = 3;
  m.ia.cards.push(carte(m.sb, 'liens1'), carte(m.sb, 'comm2'));
  m.moi.cards.push(carte(m.sb, 'iadef3'));          // le rival a l'IA Défensive : c'est ce qu'on veut copier
  m.ia.res.science = 20;
  const avant = m.ia.cards.length;
  m.sb.buyTech('tele3', m.ia);
  const copie = m.ia.cards.find(c => c && c._empathCopy);
  note('cartes : ' + avant + ' → ' + m.ia.cards.length + (copie ? ' · copie : ' + copie.name : ' · aucune copie'));
  if (m.ia.cards.some(c => c.id === 'tele3')) ok('Télépathie achetée');
  else ko('l\'achat de Télépathie a échoué — le point ne mesure rien');
  if (copie) ok('une carte adverse est copiée (' + copie.name + ')');
  else ko('aucune copie : l\'ordinateur paie Télépathie pour rien (le défaut d\'avant le 04/09)');
  if (copie && m.sb.hasSpec(m.ia, 'ia_immune')) ok('et ses effets passifs sont actifs (immunité aux raids)');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le projet s\'adopte, se prime sur le coup, attend la fin pour frapper, s\'abandonne');
console.log('   quand sa cible disparaît, laisse le témoin tranquille, et Télépathie copie vraiment.');
console.log('═'.repeat(84));
