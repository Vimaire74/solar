/* ============================================================================
   TEST — DEUX DÉFAUTS DE LA PARTIE 4680 : LA TECHNO VOLÉE PUIS RACHETÉE, ET LA DYSON MUETTE
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 29/08, rapport de bug de la partie 4680 : « ça joue pas bien et y a des erreurs.
   Sphère de Dyson par exemple, résultat d'espionnage. »

   1. LA TECHNO COMPTÉE DEUX FOIS. `resoudreEspionnage` range la carte volée sous `<id>_esp` — pour
      qu'une copie ne prenne pas l'exclusivité d'un achat. Mais le garde-fou de `buyTech` comparait
      `<id>` : on pouvait RACHETER une technologie déjà volée. Dans son décompte final, Extracteurs
      Solaires figure deux fois (+3 puis +3), et `applyCard` s'était appliqué deux fois — donc le
      bonus par tour était doublé lui aussi. L'espionnage devenait une machine à dupliquer.

   2. LA SPHÈRE DE DYSON QUI NE DEMANDE RIEN. La règle : le bâtisseur monopolise l'énergie, les
      autres acceptent (+3⚡) ou c'est la guerre. Le drapeau qui pose cette question était dans
      l'ANCIENNE enveloppe `tryTech` de l'IA ; le cerveau `tacticien` appelle `buyTech` directement.
      Au tour 9 de sa partie, l'IA a construit la Sphère et **personne n'a été consulté**.

   ⚠️ LE MOTIF EST LE MÊME DANS LES DEUX CAS, ET C'EST LA TROISIÈME FOIS (carnet de bord §58, assaut
   §57, ici) : tout ce que faisaient les vieilles enveloppes de l'IA et qui n'est pas DANS la
   fonction de règle disparaît dès qu'on appelle la règle directement. Ce banc surveille les deux.

   Usage : node test_espionnage_dyson.js
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

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['ceinturiens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const moi = G.player, ia = G.ais[0];
  moi._isAI = false; ia._isAI = true;
  for (const p of [moi, ia]) { p.acLeft = 6; p.res.energy = 40; p.res.materials = 40; p.res.science = 40; }
  return { sb, G, moi, ia };
}
const carte = (sb, id) => vm.runInContext("CARDS_POOL.find(c=>c.id==='" + id + "')", sb);

console.log('═'.repeat(84));
console.log('ESPIONNAGE ET SPHÈRE DE DYSON — les deux défauts de la partie 4680');
console.log('═'.repeat(84) + '\n');

/* ── 1. On ne rachète pas une technologie qu'on a volée ────────────────────── */
console.log('1. Une technologie volée ne peut pas être rachetée');
{
  const m = montage();
  /* La victime possède la carte ; on l'ouvre à la vente en débloquant la branche. */
  const c = carte(m.sb, 'extract2');
  m.ia.cards.push(c);
  m.moi.cards.push(carte(m.sb, 'exploit1'));            // le T1 de la branche, prérequis de vente
  m.G.branchTiers[c.branch] = Math.max(m.G.branchTiers[c.branch] || 0, 2);
  /* Le vol, par le chemin réel du moteur. */
  m.sb.espPiller(m.moi, { nation: m.ia.civ.id, ids: ['extract2'] });
  const apresVol = m.moi.cards.filter(x => String(x.id).indexOf('extract2') === 0).length;
  note('après le vol, ' + apresVol + ' exemplaire(s) chez l\'espion');
  if (apresVol !== 1) { ko('le vol n\'a pas produit exactement un exemplaire — scénario invalide'); }
  else {
    m.sb.buyTech('extract2', m.moi);
    const apresAchat = m.moi.cards.filter(x => String(x.id).indexOf('extract2') === 0).length;
    note('après tentative de rachat, ' + apresAchat + ' exemplaire(s)');
    if (apresAchat === 1) ok('le rachat est refusé — la carte ne compte qu\'une fois');
    else ko('la carte est en ' + apresAchat + ' exemplaires : VP et bonus par tour comptés double');
  }
}

/* ── 2. CONTRE-ÉPREUVE — une technologie NON volée reste achetable ─────────── */
console.log('\n2. CONTRE-ÉPREUVE — ce qu\'on n\'a pas volé s\'achète normalement');
{
  /* Sans ce point, on « corrigerait » en interdisant tous les achats et le §1 passerait au vert. */
  const m = montage();
  m.moi.cards.push(carte(m.sb, 'exploit1'));
  m.G.branchTiers['mines_energie'] = 2;
  const avant = m.moi.cards.length;
  m.sb.buyTech('extract2', m.moi);
  if (m.moi.cards.length === avant + 1) ok('l\'achat normal fonctionne toujours');
  else ko('l\'achat normal est cassé — le garde-fou est trop large');
}

/* ── 3. Une IA qui construit la Sphère de Dyson doit prévenir les autres ───── */
console.log('\n3. La Sphère de Dyson construite par une IA ouvre la question aux autres');
{
  const m = montage();
  m.ia.cards.push(carte(m.sb, 'extract2'));             // le T2 personnel, prérequis d'une T3
  m.G.branchTiers['mines_energie'] = 3;
  /* ⚠️ CE POINT MESURAIT UN MÉCANISME QUI N'EXISTE PLUS. Il vérifiait le drapeau `G._aiDysonBuilt`,
     qui REPORTAIT la question à la fin du tour. Marc l'a fait supprimer le 04/09 (« pourquoi quand
     l'IA fait la Sphère ça ne demande pas TOUT DE SUITE au joueur, c'est ça qui fausse tout ») :
     la question part désormais à l'instant de l'achat. Le banc était donc rouge depuis ce jour-là,
     sans rien accuser d'autre que lui-même. On mesure la règle actuelle : une QUESTION posée.
     ⚠️ Il faut router les décisions (`setDecisionSink`), sinon la question prend le chemin solo,
     écrit dans `document.body` — absent du bac à sable — et le banc meurt au lieu de mesurer. */
  m.G._aiDysonBuilt = null;
  m.G._pendings = [];
  m.sb.setDecisionSink(function () {});
  m.sb.buyTech('dyson3', m.ia);
  const aLaCarte = m.ia.cards.some(c => c.id === 'dyson3');
  const q = (m.G._pendings || []).filter(p => p.kind === 'ai_dyson');
  note('l\'IA a la Sphère : ' + aLaCarte + ' · questions posées : ' + JSON.stringify(q.map(p => p.kind + '@' + p.nation))
    + ' · ancien drapeau de report : ' + (m.G._aiDysonBuilt || 'AUCUN'));
  if (!aLaCarte) ko('l\'IA n\'a pas pu acheter la Sphère — scénario invalide');
  else if (q.length === 1 && q[0].nation === m.moi.civ.id) ok('le joueur est consulté sur-le-champ (accepter ou guerre)');
  else ko('aucune question immédiate : l\'IA monopolise l\'énergie en silence');
  if (!m.G._aiDysonBuilt) ok('et le report de fin de tour n\'existe plus — la question ne sera pas reposée');
  else ko('le drapeau de report est encore posé : la question reviendra une seconde fois');
}

/* ── 4. CONTRE-ÉPREUVE — le joueur local ne se consulte pas lui-même ───────── */
console.log('\n4. CONTRE-ÉPREUVE — quand c\'est TOI qui la construis, pas de drapeau');
{
  /* Le joueur a déjà sa propre fenêtre avant l'achat. Poser le drapeau lui redemanderait son avis
     à lui-même — et c'est exactement le genre de fenêtre parasite qu'on passe la journée à traquer. */
  const m = montage();
  m.moi.cards.push(carte(m.sb, 'extract2'));
  m.G.branchTiers['mines_energie'] = 3;
  m.G._aiDysonBuilt = null;
  m.sb.buyTech('dyson3', m.moi);
  if (!m.G._aiDysonBuilt) ok('aucun drapeau pour le joueur local — il a déjà sa fenêtre');
  else ko('le joueur se verrait poser la question à lui-même');
}

/* ── 5. LA FENÊTRE DU BÂTISSEUR NE DOIT PAS S'OUVRIR CHEZ LE JOUEUR ───────── */
console.log('\n5. Un achat d\'IA n\'ouvre AUCUNE fenêtre chez le joueur');
{
  /* ⚠️ LE DÉFAUT EXACT SIGNALÉ PAR MARC : « j'ai eu la fenêtre de Dyson pour choisir si je renonce
     alors que c'est l'IA qui l'a créée, et je l'ai refusée. » `showDysonModal` est la fenêtre du
     BÂTISSEUR ; ouverte chez lui, elle lui faisait annuler l'achat d'une autre nation.
     On compte les ouvertures de fenêtre pendant un achat d'IA : il doit y en avoir ZÉRO. */
  const m = montage();
  let fenetres = 0;
  for (const nom of ['showDysonModal', 'showExtraSolarChoice', 'showEmpathCopyModal', 'scArmConfirm']) {
    try { vm.runInContext(nom + ' = function(){ globalThis.__fenetres=(globalThis.__fenetres||0)+1; };', m.sb); } catch (e) {}
  }
  try { vm.runInContext('globalThis.__fenetres=0;', m.sb); } catch (e) {}
  m.ia.cards.push(carte(m.sb, 'extract2'));
  m.G.branchTiers['mines_energie'] = 3;
  m.sb.buyTech('dyson3', m.ia);
  try { fenetres = vm.runInContext('globalThis.__fenetres||0', m.sb); } catch (e) {}
  note(fenetres + ' fenêtre(s) ouverte(s) pendant l\'achat de l\'IA');
  if (fenetres === 0) ok('aucune fenêtre parasite — le joueur n\'annule plus l\'achat d\'un autre');
  else ko(fenetres + ' fenêtre(s) ouverte(s) chez le joueur pour un achat qui n\'est pas le sien');
}

/* ── 6. CONTRE-ÉPREUVE — le joueur, lui, garde ses fenêtres ───────────────── */
console.log('\n6. CONTRE-ÉPREUVE — quand TU achètes, la fenêtre s\'ouvre bien');
{
  const m = montage();
  for (const nom of ['showDysonModal', 'showExtraSolarChoice', 'showEmpathCopyModal', 'scArmConfirm']) {
    try { vm.runInContext(nom + ' = function(){ globalThis.__fenetres=(globalThis.__fenetres||0)+1; };', m.sb); } catch (e) {}
  }
  try { vm.runInContext('globalThis.__fenetres=0;', m.sb); } catch (e) {}
  m.moi.cards.push(carte(m.sb, 'extract2'));
  m.G.branchTiers['mines_energie'] = 3;
  m.sb.buyTech('dyson3', m.moi);
  let f = 0; try { f = vm.runInContext('globalThis.__fenetres||0', m.sb); } catch (e) {}
  note(f + ' fenêtre(s) pour son propre achat');
  if (f > 0) ok('le joueur garde sa fenêtre — le garde-fou n\'est pas trop large');
  else ko('plus aucune fenêtre même pour son propre achat : on a cassé le jeu du joueur');
}

/* ── 7. L'ÉCRAN DOIT LA MONTRER COMME PRISE, PAS COMME ACHETABLE ──────────── */
console.log('\n7. Une techno volée est affichée comme POSSÉDÉE, et n\'est plus proposée');
{
  /* ⚠️ LE SECOND SIGNALEMENT DE MARC : « la tech elle-même n'est pas écrite comme prise comme c'est
     le cas si tu l'achètes toi, elle est toujours disponible comme achetable dans la rivière de
     cartes et dans le détail de la tech. » Bloquer l'achat ne suffit pas : tant que l'écran la
     présente comme disponible, le joueur clique et se fait refuser sans comprendre.
     On vérifie donc la SOURCE que la rivière et le détail consultent (`possedeCarte`), et qu'aucune
     IA ne se la propose non plus comme coup jouable. */
  const m = montage();
  m.ia.cards.push(carte(m.sb, 'extract2'));
  m.moi.cards.push(carte(m.sb, 'exploit1'));
  m.G.branchTiers['mines_energie'] = 2;
  m.sb.espPiller(m.moi, { nation: m.ia.civ.id, ids: ['extract2'] });
  const vue = m.sb.possedeCarte(m.moi, 'extract2');
  note('l\'écran considère la carte comme possédée : ' + vue);
  if (vue) ok('la rivière et le détail la montreront comme prise, pas comme achetable');
  else ko('l\'écran la croit encore disponible — le joueur cliquera pour rien');

  /* Et une IA dans la même situation ne doit pas la proposer parmi ses coups. */
  const m2 = montage();
  m2.moi.cards.push(carte(m2.sb, 'extract2'));
  m2.ia.cards.push(carte(m2.sb, 'exploit1'));
  m2.G.branchTiers['mines_energie'] = 2;
  m2.sb.espPiller(m2.ia, { nation: m2.moi.civ.id, ids: ['extract2'] });
  const coups = m2.sb.coupsPossibles(m2.ia) || [];
  const proposee = coups.some(c => c.type === 'tech' && c.card === 'extract2');
  note((coups.length) + ' coups énumérés · « acheter Extracteurs Solaires » proposé : ' + proposee);
  if (!proposee) ok('l\'IA ne perd plus une simulation sur une carte qu\'elle a déjà volée');
  else ko('l\'IA se propose encore d\'acheter ce qu\'elle possède');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Une technologie volée ne se rachète pas, un achat normal reste possible, et une');
console.log('   Sphère de Dyson bâtie par une IA ouvre bien la question aux autres nations.');
console.log('═'.repeat(84));
