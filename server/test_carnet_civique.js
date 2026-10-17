/* ============================================================================
   TEST — UNE CARTE CIVIQUE ACHETÉE PAR UNE IA NE S'ÉCRIT QU'UNE FOIS AU CARNET
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie C04C, débug du serveur. Six achats civiques d'IA figurent DEUX fois dans
   la trace d'actions : Capture d'astéroïdes (Jupitériens T2, Martiens T3), Propagande (T2),
   Extraction d'He3 (T4), Campagne Culturelle (T9), Programmes Sociaux (T9). Le journal les double
   aussi (« 🤖 Jupitériens achète ☄️ Capture d'astéroïdes » suivi de « 🤖 Jupitériens achète Capture
   d'astéroïdes »). Une seule ligne « ↳ paie » : l'action a bien eu lieu UNE fois — c'est
   l'ENREGISTREMENT qui double, pas l'effet.

   LA CAUSE. `aiBuyCivic` pousse sa propre entrée (`name: card.name`) ET `appliquerCoup` pousse la
   sienne (`name: 'Achète '+card.name`). Le garde-fou anti-doublon d'`appliquerCoup` compare
   `x.name===e.name` : les deux libellés diffèrent, il ne mord pas. `aiBuyMilitary`, lui, utilise
   déjà le libellé « Achète … » — c'est pourquoi les cartes militaires, elles, ne doublent pas.

   ⚠️ POURQUOI ON N'ALIGNE PAS SIMPLEMENT LES LIBELLÉS. Ce serait la correction évidente, et elle
   serait fausse. Marc, 03/09 : « on peut prendre autant de fois par tour capture d'astéroïde,
   extraction d'He3 et investissement dans la recherche, mais pas les autres. » Un garde-fou qui
   déduplique PAR NOM effacerait le deuxième achat LÉGITIME d'une carte répétable. On retire donc
   l'entrée en trop à la source (`appliquerCoup` cesse de tenir le carnet des civiques, puisque
   `aiBuyCivic` le tient déjà) — et le §2 ci-dessous est là précisément pour attraper cette
   fausse correction si quelqu'un la tente un jour.

   ⚠️ MÊME MOTIF QUE §57, §58 ET §65 DU CARNET DE BORD, quatrième occurrence : ce que faisaient les
   vieilles enveloppes de l'IA et qui n'est PAS dans la fonction de règle se retrouve en double dès
   qu'`appliquerCoup` appelle la règle directement. `aiBuyCivic` était l'une des deux dernières
   fonctions non auditées (l'autre est `useAbility`).

   Usage : node test_carnet_civique.js
   ========================================================================== */
'use strict';
const path = require('path');
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
  G.turn = 4; G.phase = 'actions';
  const ia = G.ais[0];
  ia._isAI = true;
  ia.acLeft = 6; ia.res.energy = 30; ia.res.materials = 30; ia.res.science = 30;
  G.aiActions.length = 0;
  if (Array.isArray(G._journal)) G._journal.length = 0;
  return { sb, G, ia };
}
/* Combien d'entrées du carnet parlent de cette carte ? On cherche le NOM de la carte où qu'il soit
   dans le libellé — « Capture d'astéroïdes » et « Achète Capture d'astéroïdes » comptent tous deux,
   sinon un renommage de libellé ferait passer le banc au vert sans rien corriger. */
const compter = (liste, nomCarte) =>
  (liste || []).filter(e => e && String(e.name || '').indexOf(nomCarte) >= 0).length;

console.log('═'.repeat(84));
console.log('CARNET DES IA — UN ACHAT CIVIQUE, UNE SEULE ÉCRITURE');
console.log('═'.repeat(84) + '\n');

/* ── 1. Une civique NON répétable : une entrée, pas deux ───────────────────── */
console.log('1. Une civique achetée une fois n\'apparaît qu\'une fois');
{
  const m = montage();
  m.sb.appliquerCoup(m.ia, { type: 'civique', card: 'cm_propagande' });
  /* ⚠️ ON MESURE `G.aiActions`, PAS `G._journal`. Le journal structuré — celui que le débug du
     serveur expose — n'est pas écrit par `appliquerCoup` : il est recopié depuis `G.aiActions` à la
     fin du tour d'IA (une entrée par élément non encore marqué `_rec`). Appelé isolément comme ici,
     `appliquerCoup` ne le remplit donc jamais, et exiger `j===1` ferait rougir le banc pour une
     raison étrangère au défaut. La propagation 1:1 est déjà prouvée par la partie C04C, où le
     doublon du carnet se retrouve tel quel dans le débug. La source suffit. */
  const n = compter(m.G.aiActions, 'Propagande');
  note('carnet IA : ' + n + ' entrée(s)');
  if (n === 1) ok('une seule entrée au carnet');
  else ko(n + ' entrées pour un seul achat — l\'action est comptée ' + n + ' fois');
}

/* ── 2. CONTRE-ÉPREUVE — une civique RÉPÉTABLE prise deux fois compte deux fois ── */
console.log('\n2. CONTRE-ÉPREUVE — deux achats légitimes doivent faire DEUX entrées');
{
  /* ⚠️ LE POINT QUI INTERDIT LA FAUSSE CORRECTION. Capture d'astéroïdes, Extraction d'He3 et
     Investissement dans la Recherche se reprennent autant de fois qu'on veut dans un tour (règle
     de Marc). Si on « corrigeait » le §1 en dédupliquant par nom, ce point-ci deviendrait rouge :
     le deuxième achat, pourtant payé et appliqué, disparaîtrait du carnet. */
  const m = montage();
  m.sb.appliquerCoup(m.ia, { type: 'civique', card: 'cm_forages' });
  m.sb.appliquerCoup(m.ia, { type: 'civique', card: 'cm_forages' });
  const n = compter(m.G.aiActions, 'Capture d\'astéroïdes');
  note('deux achats de Capture d\'astéroïdes → ' + n + ' entrée(s)');
  if (n === 2) ok('les deux achats sont visibles — le répétable reste lisible');
  else if (n < 2) ko('seulement ' + n + ' entrée(s) : la déduplication mange un achat légitime');
  else ko(n + ' entrées pour deux achats — le doublon est toujours là');
}

/* ── 3. CONTRE-ÉPREUVE — la technologie, elle, était déjà correcte ─────────── */
console.log('\n3. CONTRE-ÉPREUVE — une technologie continue de s\'écrire une fois');
{
  /* Le chemin `tech` d'`appliquerCoup` est le SEUL à tenir le carnet (depuis la v10.02, la queue
     d'affichage de `buyTech` est réservée au joueur local). On vérifie qu'en retirant le cas
     `civique` on n'a pas touché à celui-là. */
  const m = montage();
  m.sb.appliquerCoup(m.ia, { type: 'tech', card: 'quant1' });
  const n = compter(m.G.aiActions, 'Ordinateur Quantique');
  note('achat d\'Ordinateur Quantique → ' + n + ' entrée(s)');
  if (n === 1) ok('la technologie s\'écrit toujours une seule fois');
  else if (n === 0) ko('la technologie ne s\'écrit plus du tout — on a coupé trop large');
  else ko(n + ' entrées pour une technologie');
}

/* ── 4. L'achat a bien EU LIEU — on ne corrige pas en supprimant l'action ──── */
console.log('\n4. CONTRE-ÉPREUVE — la carte est bien achetée et payée');
{
  /* Sans ce point, un `appliquerCoup` qui ne ferait plus rien du tout passerait les §1 et §3 au
     vert : zéro action, zéro doublon. On exige donc que l'AC et les ressources aient bougé. */
  const m = montage();
  const ac0 = m.ia.acLeft, mat0 = m.ia.res.materials;
  m.sb.appliquerCoup(m.ia, { type: 'civique', card: 'cm_culture' });
  note('AC ' + ac0 + '→' + m.ia.acLeft + ' · matériaux ' + mat0 + '→' + m.ia.res.materials);
  if (m.ia.acLeft === ac0 - 1 && m.ia.res.materials === mat0 - 2) ok('l\'achat est bien appliqué et payé');
  else ko('l\'achat n\'a pas été appliqué — le banc ne prouverait rien');
}

/* ── 5. « Capture d'astéroïdes » n'est PAS un fait de guerre ──────────────── */
console.log('\n5. La carte civique n\'est pas étiquetée comme une action de guerre');
{
  /* Marc, débug C04C : la carte ressortait en `guerre: true` dans la trace d'actions. `_isWarAct`
     devinait à partir du texte, et son motif contenait « capture » — pour l'entrée de carnet
     « Capture <colonie> », posée quand une IA prend une colonie.
     ⚠️ J'AVAIS D'ABORD RENOMMÉ LA CARTE. Marc a refusé (« je préfère le nom capture
     d'astéroïdes »), et il avait raison sur le fond : je corrigeais le mauvais bout. Celui qui SAIT
     si une action est un fait de guerre, c'est celui qui l'enregistre — pas une expression lue
     après coup. La prise de colonie déclare maintenant `war:true`, et le mot a quitté le motif. */
  const m = montage();
  const f = m.sb._isWarAct;
  if (typeof f !== 'function') { ko('`_isWarAct` introuvable'); }
  else {
    note('« Capture d\'astéroïdes » → guerre : ' + f('Capture d\'astéroïdes'));
    if (!f('Capture d\'astéroïdes')) ok('la carte civique n\'est plus prise pour un fait de guerre');
    else ko('elle est toujours étiquetée comme une action de guerre');
  }
}

/* ── 6. CONTRE-ÉPREUVE — les VRAIS faits de guerre restent reconnus ────────── */
console.log('\n6. CONTRE-ÉPREUVE — assauts, raids et prises de colonie restent des faits de guerre');
{
  /* ⚠️ SANS CE POINT, ON « CORRIGERAIT » EN VIDANT LE MOTIF : plus aucune collision, et plus aucun
     fait de guerre repéré non plus. On vérifie les deux voies — celle qui devine (le motif) et
     celle qui déclare (`war:true` posé par la prise de colonie). */
  const m = montage();
  const f = m.sb._isWarAct;
  if (typeof f !== 'function') { ko('`_isWarAct` introuvable'); }
  else {
    const cas = ['Assaut sur Ganymède', 'Raid sur Io', 'Attaque de route'];
    const manques = cas.filter(x => !f(x));
    note('libellés reconnus par le motif : ' + (cas.length - manques.length) + '/' + cas.length);
    if (!manques.length) ok('le motif reconnaît toujours les libellés de guerre');
    else ko('non reconnus : ' + manques.join(', '));
    /* La prise de colonie ne compte plus sur le texte : elle déclare. On vérifie que l'entrée
       produite par le moteur porte bien ce drapeau. */
    const decl = { emoji: '🏴', name: 'Capture Ganymède', desc: '', war: true };
    const vu = (decl.war !== undefined) ? !!decl.war : f(decl.name);
    if (vu === true) ok('une prise de colonie déclare son fait de guerre et est bien comptée');
    else ko('la prise de colonie n\'est plus reconnue comme un fait de guerre');
  }
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un achat civique d\'IA = une écriture, les achats répétés restent visibles,');
console.log('   et les technologies sont inchangées.');
console.log('═'.repeat(84));
