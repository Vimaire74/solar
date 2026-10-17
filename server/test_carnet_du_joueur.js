/* ============================================================================
   TEST — LE CARNET DE BORD DU JOUEUR NE CONTIENT QUE SES PROPRES ACTIONS
   ----------------------------------------------------------------------------
   POURQUOI CE BANC EXISTE. Marc, 28/08, en jouant : « il me semble maintenant que l'IA joue toutes
   ses actions d'un coup avant ou après moi ». Le déroulé du jeu, lui, était intact — chaque tour
   d'IA ne consomme qu'un AC et la main tourne correctement. Ce qui avait changé, c'est le CARNET :

   `appliquerCoup` (cerveau `tacticien`, 27/08) appelle les fonctions DU JOUEUR — `doColonize`,
   `doUpgrade`, `buyTech`… C'est voulu : c'est ce qui garantit qu'une IA et un humain obéissent aux
   mêmes règles, écrites une seule fois. Mais toutes se terminent par `addAction`, qui code la nation
   active en dur. Chaque coup d'IA était donc inscrit dans les actions de Marc, la ligne de journal
   signée de SON nom, un toast affiché sur SON écran — et en solo `_ilMaybePass` PASSAIT SA MAIN.
   Les deux carnets mélangés, seules les lignes `🤖` restaient identifiables : de quoi lire le
   journal comme si l'IA jouait en bloc.

   ⚠️ POURQUOI AUCUN BANC NE L'A VU. Ils vérifiaient tous que l'IA AGIT (elle agissait), que la
   partie se termine (elle se terminait), que les états sont neutres (ils l'étaient). AUCUN ne
   vérifiait À QUI une action est imputée. C'est exactement le motif du §49 : une dérive qui
   n'empêche rien de tourner ne rougit nulle part.

   ⚠️ CE BANC DOIT ÊTRE VU ROUGIR. Contre-épreuve incluse : on rejoue la même scène en neutralisant
   le garde-fou, et on EXIGE que le compteur s'affole. Sans elle, un vert ne prouverait rien — il
   pourrait signifier « cette scène ne produit aucune action ».

   Usage : node test_carnet_du_joueur.js
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

/* Un plateau où l'IA a de quoi jouer plusieurs coups, et où l'humain est la nation ACTIVE —
   c'est la seule configuration où le défaut se manifeste. */
function montage(cerveau) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['ceinturiens']);
  const G = sb.__G;
  G.turn = 3; G.phase = 'actions'; G._cerveauIA = cerveau;
  const humain = G.player, ia = G.ais[0];
  humain._isAI = false; ia._isAI = true; ia._aiSetupDone = true;
  ia.acLeft = 4; ia.res.energy = 30; ia.res.materials = 30; ia.res.science = 20;
  humain._turnActions = []; G.turnActions = [];
  return { sb, G, humain, ia };
}

/* Ce que l'IA a laissé dans le carnet du joueur, après N tours d'IA. */
function traces(cerveau, tours) {
  const m = montage(cerveau);
  m.sb.setDecisionSink(() => {});
  const j0 = (m.G._journal || []).length;
  for (let i = 0; i < (tours || 4); i++) { try { m.sb.doAITurn(m.ia, true); } catch (e) { break; } }
  const journal = (m.G._journal || []).slice(j0);
  return {
    m,
    chezLHumain: (m.humain._turnActions || []).length + (m.G.turnActions || []).length,
    signeesHumain: journal.filter(e => e.nat === m.humain.civ.civName || e.nat === (m.humain.civ && m.humain.civ.name) || e.nat === 'Toi').length,
    journal: journal.map(e => e.nat + ' · ' + e.name)
  };
}

console.log('═'.repeat(84));
console.log('CARNET DE BORD — LES ACTIONS D\'UNE IA NE SONT PAS CELLES DU JOUEUR');
console.log('═'.repeat(84) + '\n');

/* ── 1. Le cerveau par défaut ne pollue pas le carnet du joueur ────────────── */
console.log('1. Quatre tours d\'IA sous `tacticien` : rien ne doit atterrir chez le joueur');
{
  const r = traces('tacticien', 4);
  note(r.journal.length + ' ligne(s) de journal produites par l\'IA');
  for (const l of r.journal.slice(0, 6)) note('  ' + l);
  if (r.chezLHumain === 0) ok('aucune action d\'IA inscrite dans le carnet du joueur');
  else ko(r.chezLHumain + ' action(s) d\'IA inscrite(s) chez le joueur — son bilan est faux');
  if (r.signeesHumain === 0) ok('aucune ligne de journal signée du nom du joueur');
  else ko(r.signeesHumain + ' ligne(s) de journal attribuée(s) au joueur : ex. « ' + r.journal.find(l => /Terriens|Toi/.test(l)) + ' »');
  if (r.journal.length) ok('et l\'IA a bel et bien agi — la scène produit des actions');
  else ko('aucune action d\'IA : la scène ne prouve rien');
}

/* ── 2. Le témoin `historique` se comporte pareil ──────────────────────────── */
console.log('\n2. TÉMOIN — l\'ancien cerveau donnait déjà ce résultat, on ne l\'a pas déplacé');
{
  const r = traces('historique', 4);
  if (r.chezLHumain === 0 && r.signeesHumain === 0) ok('`historique` : carnet du joueur intact, comme avant');
  else ko('`historique` pollue aussi le carnet (' + r.chezLHumain + ' action(s)) — la cause est ailleurs');
}

/* ── 3. LE JOUEUR, LUI, EST TOUJOURS ENREGISTRÉ (non-régression) ───────────── */
console.log('\n3. NON-RÉGRESSION — une action du JOUEUR doit toujours être inscrite');
{
  /* ⚠️ Sans ce point, on pourrait « réparer » le défaut en cassant l'enregistrement pour tout le
     monde, et les deux premiers points resteraient verts. C'est le contrôle qui empêche la
     correction paresseuse. */
  const m = montage('tacticien');
  m.sb.setDecisionSink(() => {});
  const avant = (m.humain._turnActions || []).length;
  const libre = Object.keys(vm.runInContext('NODES', m.sb))
    .find(id => { const n = vm.runInContext('NODES', m.sb)[id];
      return n && !n.decorative && !n.noColonize
        && ![m.humain].concat(m.G.ais).some(p => (p.colonies || []).some(c => c.nodeId === id)); });
  m.humain.acLeft = 4; m.humain.res.energy = 30; m.humain.res.materials = 30;
  try { m.sb.doColonize(libre, m.humain); } catch (e) { note('exception : ' + e.message); }
  const apres = (m.humain._turnActions || []).length;
  if (apres > avant) ok('l\'action du joueur est enregistrée dans SON carnet (' + avant + ' → ' + apres + ')');
  else ko('le joueur n\'est plus enregistré non plus — le garde-fou est trop large');
}

/* ── 4. CONTRE-ÉPREUVE — sans le garde-fou, le banc DOIT rougir ────────────── */
console.log('\n4. CONTRE-ÉPREUVE — on retire le garde-fou, la pollution doit revenir');
{
  /* On neutralise `_acteurCourant` pour qu'il rende toujours le joueur local : c'est exactement le
     comportement d'avant la correction du 28/08. Si le compteur reste à zéro, c'est que la scène ne
     reproduit pas le défaut, et alors les points 1 et 2 ne prouvent rien. */
  const m = montage('tacticien');
  m.sb.setDecisionSink(() => {});
  vm.runInContext('_acteurCourant = function(){ return G.player; };', m.sb);
  for (let i = 0; i < 4; i++) { try { m.sb.doAITurn(m.ia, true); } catch (e) { break; } }
  const pollution = (m.humain._turnActions || []).length + (m.G.turnActions || []).length;
  note('actions d\'IA retombées chez le joueur sans le garde-fou : ' + pollution);
  if (pollution > 0) ok('le défaut revient dès qu\'on retire la protection — le banc mord vraiment');
  else ko('même sans garde-fou rien ne se produit : ce banc ne prouve rien, il est à réécrire');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le carnet du joueur ne contient que ses actions, le journal nomme la bonne nation,');
console.log('   le joueur reste enregistré, et le défaut réapparaît si l\'on retire la protection.');
console.log('═'.repeat(84));
