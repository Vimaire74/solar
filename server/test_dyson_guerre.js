/* ============================================================================
   TEST — SPHÈRE DE DYSON : QUI EST L'AGRESSEUR ?
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09, après la partie CC36 : « dans sphère de Dyson seul le
   joueur qui a fait la Tech Dyson peut faire la guerre et décider d'attaquer des
   colonies, ça devrait être l'inverse, on était en guerre les deux contre lui. »

   LA CAUSE. La guerre portait une ÉTIQUETTE, `declaredBy`, et le jeu décidait qui
   pouvait assaillir avec `declaredBy === 'player' || declaredBy === 'dyson'`.
   · `'player'` signifie « moi » — donc dépend de qui lit ;
   · `'dyson'` était donc lu comme « moi » PAR TOUT LE MONDE.
   C'est la maladie décrite dans docs/ARCHITECTURE_AVENIR.md §2 : la perspective est
   une variable globale. Résultat en partie : le bâtisseur de la Sphère assaillait, et
   les deux nations qui lui avaient déclaré la guerre ne pouvaient que « tenir leur
   position ».

   LA RÈGLE VOULUE. Celui qui bâtit la Sphère s'arroge un monopole ; ceux qui REFUSENT
   lui déclarent la guerre. Les refusants sont les AGRESSEURS, le bâtisseur se défend.

   CE QUE CE TEST VÉRIFIE :
     1. la guerre nomme son agresseur par IDENTIFIANT (`agresseurCiv`), pas par étiquette ;
     2. pour une guerre de Dyson, l'agresseur est la nation REFUSANTE, pas le bâtisseur ;
     3. la réponse à « suis-je l'agresseur ? » change selon la nation qui regarde —
        c'est précisément ce que l'ancien test ne savait pas faire ;
     4. une déclaration de guerre ordinaire garde son agresseur habituel.

   Usage : node test_dyson_guerre.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const INDEX = path.join(__dirname, '..', 'play.html');
const MOTEUR = path.join(__dirname, '..', 'moteur.js');

const ecarts = [];
function ok(s) { console.log('   ✔ ' + s); }
function ko(s) { ecarts.push(s); console.log('   ❌ ' + s); }

function partie() {
  const sb = loadLogic(INDEX);
  sb.initGame('ceinturiens', ['terriens', 'martiens']);   // Ceinturiens bâtissent la Sphère
  return { sb, G: sb.__G };
}

console.log('═'.repeat(74));
console.log('SPHÈRE DE DYSON — QUI PEUT ASSAILLIR ?');
console.log('═'.repeat(74) + '\n');

/* ── 1. La guerre de Dyson nomme le bon agresseur ─────────────────────────── */
console.log('1. La guerre de Dyson');
{
  const { sb, G } = partie();
  const batisseur = G.player.civ.id;                       // ceinturiens
  const refusants = G.ais.map(a => a.civ.id);              // terriens, martiens
  G._dysonWarTargets = refusants.slice();
  sb.applyDysonClose();

  const wars = G.wars || [];
  if (wars.length === 2) ok('deux guerres créées, une par nation refusante');
  else ko(wars.length + ' guerre(s) créée(s) au lieu de 2');

  for (const w of wars) {
    const autre = (w.a === batisseur) ? w.b : w.a;
    if (!w.agresseurCiv) { ko('la guerre ' + w.a + '/' + w.b + ' ne nomme aucun agresseur'); continue; }
    if (w.agresseurCiv === autre) ok('guerre contre ' + autre + ' : l\'agresseur est ' + autre + ' (la refusante)');
    else ko('guerre contre ' + autre + ' : l\'agresseur est ' + w.agresseurCiv
      + ' — c\'est le bâtisseur, exactement le défaut signalé');
  }
  if (!wars.some(w => w.agresseurCiv === batisseur)) ok('le bâtisseur n\'est agresseur d\'aucune des deux guerres');
  else ko('le bâtisseur est encore agresseur : il assaillerait, les autres subiraient');
}

/* ── 2. La réponse dépend de QUI regarde ──────────────────────────────────── */
console.log('\n2. « Suis-je l\'agresseur ? » se lit depuis chaque nation');
{
  const { sb, G } = partie();
  const batisseur = G.player.civ.id;
  const refusant = G.ais[0].civ.id;
  G._dysonWarTargets = [refusant];
  sb.applyDysonClose();
  const w = (G.wars || [])[0];
  if (!w) { ko('aucune guerre créée'); }
  else {
    /* On pose la question telle que le jeu la pose, mais successivement du point de vue de
       chaque nation. Avec l'ancienne étiquette, les deux réponses étaient « oui ». */
    const vu = civId => w.agresseurCiv === civId;
    if (!vu(batisseur)) ok('vu du bâtisseur (' + batisseur + ') : je ne suis PAS l\'agresseur → il se défend');
    else ko('vu du bâtisseur : il se croit agresseur');
    if (vu(refusant)) ok('vu de la refusante (' + refusant + ') : je SUIS l\'agresseur → elle peut assaillir');
    else ko('vu de la refusante : elle ne peut pas assaillir — le défaut est intact');
  }
}

/* ── 3. Une guerre ordinaire n'a pas changé ───────────────────────────────── */
console.log('\n3. Une déclaration de guerre ordinaire');
{
  const { sb, G } = partie();
  const moi = G.player.civ.id, cible = G.ais[0].civ.id;
  sb.declareWar('essai', 'player', cible);
  const w = (G.wars || [])[0];
  if (w && w.agresseurCiv === moi) ok('guerre déclarée par moi : je suis l\'agresseur');
  else ko('guerre déclarée par moi : agresseur = ' + (w && w.agresseurCiv));

  const p2 = partie();
  p2.sb.declareWar('essai', 'other', p2.G.ais[0].civ.id);
  const w2 = (p2.G.wars || [])[0];
  if (w2 && w2.agresseurCiv === p2.G.ais[0].civ.id) ok('guerre subie : l\'agresseur est l\'autre nation');
  else ko('guerre subie : agresseur = ' + (w2 && w2.agresseurCiv));
}

/* ── 4. Plus d'étiquette « dyson » dans les tests de perspective ──────────── */
console.log('\n4. L\'étiquette relative a bien disparu du code');
{
  /* On retire les commentaires AVANT de chercher : le bandeau qui explique le défaut cite
     forcément l'ancien test, et le trouver dans une explication ne prouve rien. Premier jet de
     ce test : il échouait sur son propre commentaire. */
  const src = fs.readFileSync(MOTEUR, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  if (!/declaredBy===['"]dyson['"]/.test(src))
    ok('plus aucun test « declaredBy === \'dyson\' » : l\'étiquette ne décide plus de rien');
  else ko('un test sur l\'étiquette « dyson » subsiste : il rendra de nouveau tout le monde agresseur');
  const n = (src.match(/agresseurCiv/g) || []).length;
  if (n >= 4) ok('l\'agresseur nommé est utilisé à ' + n + ' endroits');
  else ko('l\'agresseur nommé n\'est utilisé qu\'à ' + n + ' endroit(s)');
}

/* ── 5. LE PARTAGE ÉNERGÉTIQUE : qui touche le +3 ? ───────────────────────── */
console.log('\n5. Le +3⚡ des nations qui acceptent');
{
  /* Marc, 2026-08-12 : « tu es sûr maintenant que si l'IA ou un autre joueur accepte que tu la
     construises il gagne le bonus de +3 en énergie ? » On MESURE, dans les deux sens : quand c'est
     toi qui bâtis, et quand c'est une autre nation. */
  const neuve = () => {
    const sb = loadLogic(INDEX);
    sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
    const G = sb.__G;
    for (const p of [G.player].concat(G.ais)) {
      p.rpt = {}; p.res = { energy: 50, materials: 50, science: 50, morale: 6 };
      p.colonies = [{ nodeId: p.civ.home, level: 1, connected: true }]; p.routes = [];
    }
    return { sb, G };
  };
  const rpt = G => { const o = {}; for (const p of [G.player].concat(G.ais)) o[p.civ.id] = (p.rpt.energy || 0); return o; };

  // (a) TOI qui bâtis, tout le monde accepte.
  {
    const { sb, G } = neuve();
    G._dysonWarTargets = [];
    sb.applyDysonClose();
    const r = rpt(G);
    const autres = G.ais.map(a => r[a.civ.id]);
    if (autres.every(v => v === 3)) ok('tu bâtis, les trois autres acceptent → +3⚡/tour chacune');
    else ko('tu bâtis : les autres reçoivent ' + JSON.stringify(autres) + ' au lieu de 3 chacune');
  }
  // (b) TOI qui bâtis, une nation refuse : elle n'a rien, les autres si.
  {
    const { sb, G } = neuve();
    G._dysonWarTargets = ['martiens'];
    sb.applyDysonClose();
    const r = rpt(G);
    if (r.martiens === 0) ok('la nation qui REFUSE ne touche rien');
    else ko('la refusante a touché ' + r.martiens + '⚡');
    if (r.jupiteriens === 3 && r.ceinturiens === 3) ok('les deux autres touchent bien leur +3⚡');
    else ko('les acceptantes reçoivent ' + r.jupiteriens + ' et ' + r.ceinturiens);
  }
  // (c) UNE AUTRE NATION bâtit, tu acceptes. Et les autres ?
  {
    const { sb, G } = neuve();
    const bat = G.ais[0];                       // martiens bâtit
    G._aiDysonId = bat.civ.id; G._aiDysonCb = null;
    sb.aiDysonDecide(false);                    // tu acceptes
    const r = rpt(G);
    if (r[G.player.civ.id] === 3) ok('une autre nation bâtit, tu acceptes → tu touches ton +3⚡');
    else ko('tu acceptes mais tu touches ' + r[G.player.civ.id] + '⚡');
    const tiers = G.ais.filter(a => a.civ.id !== bat.civ.id);
    const recus = tiers.map(a => r[a.civ.id]);
    if (recus.every(v => v === 3)) ok('les DEUX autres nations sont traitées aussi : +3⚡ chacune');
    else ko('les autres nations reçoivent ' + JSON.stringify(recus)
      + ' — elles sont ignorées quand ce n\'est pas toi qui bâtis (le défaut signalé)');
    if (r[bat.civ.id] === 0) ok('le bâtisseur ne touche pas le partage (il a son +5 par la carte)');
    else ko('le bâtisseur a touché le partage en plus de son bonus de carte');
  }
  // (d) Une autre nation bâtit, une TIERCE refuse → elle ne touche rien et la tension monte.
  {
    const { sb, G } = neuve();
    const bat = G.ais[0], tiers = G.ais[1];
    vm.runInContext('setTens(' + JSON.stringify(tiers.civ.id) + ',' + JSON.stringify(bat.civ.id) + ',9);', sb);
    G._aiDysonId = bat.civ.id; G._aiDysonCb = null;
    sb.aiDysonDecide(false);
    const r = rpt(G);
    if (r[tiers.civ.id] === 0) ok('une nation tierce très tendue REFUSE : elle ne touche rien');
    else ko('la nation tierce tendue a quand même touché ' + r[tiers.civ.id] + '⚡');
    const t = vm.runInContext('getTens(' + JSON.stringify(tiers.civ.id) + ',' + JSON.stringify(bat.civ.id) + ')', sb);
    if (t > 9) ok('et sa tension envers le bâtisseur monte (' + t + '/10)');
    else ko('son refus n\'a aucune conséquence : tension ' + t);
  }
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Sphère de Dyson : les refusants sont les agresseurs, le bâtisseur se défend.');
console.log('═'.repeat(74));
