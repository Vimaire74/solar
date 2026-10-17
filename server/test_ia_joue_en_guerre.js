/* ============================================================================
   TEST — UNE IA EN GUERRE CONTINUE DE JOUER
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 04/09 : « trouve les erreurs dans le code qui rendent les IA moins performantes ».
   Mesuré sur une partie tout-IA (graine 1000), en comptant par nation et par tour les actions
   accordées, les actions jouées, et les consultations du cerveau `tacticien` :

       terriens#6   AC accordés 5 · actions jouées 0 · appels cerveau 0
       terriens#7   AC accordés 5 · actions jouées 0 · appels cerveau 0
       terriens#9   AC accordés 5 · actions jouées 0 · appels cerveau 0
       martiens#6   AC accordés 2 · actions jouées 0 · appels cerveau 0   (et #7, #9)
       ceinturiens#7  AC accordés 2 · actions jouées 0 · appels cerveau 0

   Et le journal : guerre Martiens ↔ Terriens déclarée au T5, paix au T7 ; redéclarée au T8, paix
   au T9 ; Ceinturiens ↔ Terriens au T6. **Chaque nation en guerre cessait ENTIÈREMENT de jouer,
   tant que la guerre durait — cerveau jamais consulté.**

   LA CAUSE. TROIS garde-fous de l'ANCIENNE IA, placés DEVANT le cerveau dans `_doAITurnInterne` :
     · la RÉSERVE À L'ENTRÉE DU TOUR — en guerre, si min(🪨,⚡) ≤ max(2, min(6, jetons)) + 3, on
       BRÛLE un AC et on rend la main. Avec 8 jetons il faut donc ≥10🪨 ET ≥10⚡ pour avoir le
       droit d'agir : presque personne en guerre. C'est le pire des trois — je ne l'ai vu qu'au
       banc, quand le §1 a montré 1 AC dépensé sans consultation du cerveau.
     · `_belowReserve()` dans `chooseAndAct` — même seuil sans la marge, on rend la main sans rien
       faire. Une nation saine à 8 jetons et 6🪨 6⚡ est gelée.
     · `_warConserve` — en guerre « jouable », on ne tente QUE des assauts de reprise, puis
       `acLeft = 0`. Le cerveau n'est pas appelé.
   Ces trois règles doublonnent ce que le tacticien fait déjà mieux : `perilRessources` (falaise à
   ≤2 jetons payables) et l'évaluation des assauts comme des coups parmi d'autres. Elles étaient
   justes pour un cerveau qui ne savait pas compter ; elles bâillonnent celui qui sait.

   C'est la sixième occurrence du motif §64 — et la première qui n'enlève pas une règle mais LE
   CERVEAU ENTIER, pendant les tours qui décident de la partie. Elle explique la paralysie des
   Martiens et Jupitériens dans C04C (cinq tours à 0⚡, 0🙂, notes à −40) et le « pas assez
   intelligentes » de Marc : elles ne réfléchissaient pas, elles étaient éteintes.

   Usage : node test_ia_joue_en_guerre.js
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

function montage(cerveau) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  if (cerveau) G._cerveauIA = cerveau;
  const moi = G.player, ia = G.ais[0];
  moi._isAI = true; ia._isAI = true;
  /* Une nation SAINE : 5 actions, 8 jetons, 6🪨 6⚡ — c'est exactement le profil gelé par
     `_belowReserve` (réserve = min(6, 8) = 6, payables = 6 ≤ 6). */
  ia.acLeft = 5; ia.acMax = 5; ia.forceTokens = 8;
  ia.res.materials = 6; ia.res.energy = 6; ia.res.science = 8; ia.res.morale = 8;
  ia.colonies.push({ nodeId: 'encelade', level: 1, connected: true });
  moi.forceTokens = 4; moi.res.materials = 10; moi.res.energy = 10;
  G.wars = [{ a: ia.civ.id, b: moi.civ.id, winsBy: {}, turnsLeft: 99, justDeclared: false,
              reason: 'test', declaredBy: 'other', agresseurCiv: moi.civ.id, live: true, aiRecaptureTarget: null }];
  /* On compte les consultations du cerveau. */
  vm.runInContext(
    "(function(){ globalThis.__cerveau=0; for (var k in CERVEAUX_IA){ (function(k){ var f=CERVEAUX_IA[k];" +
    "  CERVEAUX_IA[k]=function(ctx){ globalThis.__cerveau++; return f(ctx); }; })(k); } })();", sb);
  return { sb, G, moi, ia };
}
function tourComplet(m) {
  /* Mode entrelacé, comme en partie réelle : une action par appel, tant qu'il reste des AC. */
  let n = 0;
  for (let i = 0; i < 12 && (m.ia.acLeft || 0) > 0; i++) {
    let r = false;
    try { r = m.sb.doAITurn(m.ia, {}); } catch (e) { break; }
    if (!r) break;
    n++;
  }
  return { tours: n, cerveau: vm.runInContext('globalThis.__cerveau', m.sb), acRestants: m.ia.acLeft || 0 };
}

console.log('═'.repeat(84));
console.log('UNE IA EN GUERRE JOUE ENCORE');
console.log('═'.repeat(84) + '\n');

/* ── 1. En guerre, avec des moyens, le tacticien est consulté et joue ──────── */
console.log('1. En guerre, une nation saine joue ses actions (tacticien)');
{
  const m = montage('tacticien');
  const r = tourComplet(m);
  note('AC de départ 5 · consultations du cerveau : ' + r.cerveau + ' · AC restants : ' + r.acRestants);
  if (r.cerveau >= 1) ok('le cerveau a été consulté — la nation réfléchit pendant la guerre');
  else ko('cerveau jamais consulté : la nation est gelée par un garde-fou de l\'ancienne IA');
  if (r.acRestants < 5) ok('elle a dépensé au moins une action');
  else ko('5 AC accordés, 0 dépensé — un tour entier perdu');
}

/* ── 2. CONTRE-ÉPREUVE — le témoin `historique` garde son ancien comportement ── */
console.log('\n2. CONTRE-ÉPREUVE — le témoin `historique` n\'est pas modifié');
{
  /* Le témoin sert à mesurer le tacticien : il doit rester byte-identique. On vérifie que SON
     garde-fou tient toujours — s'il se mettait à jouer, ce serait qu'on a retiré la règle pour
     tout le monde au lieu de la réserver à l'ancien cerveau. */
  const m = montage('historique');
  const r = tourComplet(m);
  /* ⚠️ Le comportement de référence du témoin, MESURÉ avant correction : il brûle exactement UN AC
     par appel dans le verrou d'entrée (`acLeft-1; return false`), puis rend la main — 4 AC restent.
     Ma première version exigeait 5 : je décrivais le témoin de mémoire au lieu de le mesurer. */
  note('historique — consultations : ' + r.cerveau + ' · AC restants : ' + r.acRestants);
  if (r.cerveau === 0 && r.acRestants === 4) ok('le témoin fait exactement ce qu\'il faisait — il n\'a pas bougé');
  else ko('le témoin a changé (cerveau ' + r.cerveau + ', AC restants ' + r.acRestants + ') : la mesure de référence est faussée');
}

/* ── 3. Vraiment à sec, le tacticien sait encore s'abstenir ───────────────── */
console.log('\n3. Sans garde-fou, une nation vraiment à sec ne se ruine pas pour autant');
{
  /* ⚠️ SANS CE POINT, ON REMPLACERAIT UNE PATHOLOGIE PAR UNE AUTRE : une IA qui dépense son dernier
     ⚡ en guerre ne peut plus engager un seul jeton (1🪨 +1⚡ chacun). C'est `perilRessources`
     (falaise à ≤2 payables) qui doit l'en dissuader — pas un garde-fou qui l'éteint. On vérifie
     qu'à 2🪨 2⚡ elle ne descend pas à zéro. */
  const m = montage('tacticien');
  m.ia.res.materials = 2; m.ia.res.energy = 2; m.ia.res.science = 0;
  tourComplet(m);
  const payables = Math.min(m.ia.res.materials || 0, m.ia.res.energy || 0);
  note('après son tour : ' + m.ia.res.materials + '🪨 ' + m.ia.res.energy + '⚡ → ' + payables + ' jeton(s) payable(s)');
  if (payables >= 1) ok('elle garde de quoi engager au moins un jeton');
  else ko('elle s\'est mise à zéro : plus aucun jeton engageable, ni en attaque ni en défense');
}

/* ── 4. En guerre « jouable », le cerveau est consulté aussi ───────────────── */
console.log('\n4. Quand la guerre est jugée jouable, le cerveau décide quand même');
{
  /* `_warConserve` court-circuitait tout au profit du seul assaut de reprise, puis mettait les AC
     à zéro. Le tacticien évalue l'assaut comme un coup parmi d'autres : il doit être consulté. */
  const m = montage('tacticien');
  m.ia._warConserve = true; m.ia._warRecapture = null;
  const r = tourComplet(m);
  note('_warConserve posé · consultations du cerveau : ' + r.cerveau + ' · AC restants : ' + r.acRestants);
  if (r.cerveau >= 1) ok('le cerveau garde la main même en guerre jouable');
  else ko('court-circuité : la nation ne fait que des assauts de reprise, ou rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le tacticien joue pendant la guerre, s\'abstient de lui-même quand il est à sec,');
console.log('   et le témoin historique n\'a pas bougé.');
console.log('═'.repeat(84));
