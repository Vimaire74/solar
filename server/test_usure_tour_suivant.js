/* ============================================================================
   TEST — L'USURE DE GUERRE NE TOMBE QU'AU TOUR SUIVANT, ET LE MORAL NE SE CUMULE PAS
   ----------------------------------------------------------------------------
   RÈGLE (Marc, 16/09, après la partie 96F6) : « le malus moral ne s'applique qu'au début du tour
   suivant et on a le temps de compenser ». Raison de fond : perdre la défense d'une colonie coûte
   déjà du moral ; ajouter −4 dans le même tour « fait beaucoup d'un coup ». En étalant, les joueurs
   et les IA temporisent — « ça fait réfléchir sur l'éventualité d'une guerre, comme dans la vraie vie ».

   AVANT : `declarerGuerre` prélevait −4 aux DEUX camps sur-le-champ, en pleine phase d'actions.
   Dans la partie 96F6, Laurent a ainsi payé 8 de moral aux tours 7 et 9 pour deux guerres que
   l'ordinateur a ouvertes puis abandonnées dans le même tour.
   APRÈS : l'usure est prélevée UNIQUEMENT à l'ouverture d'un tour (`usureDesGuerres`), pour les
   guerres encore ouvertes. Une guerre déclarée et réglée dans le même tour ne coûte aucun moral.

   ⚠️ CE QUI NE CHANGE PAS, et qui est vérifié ici pour ne pas dériver :
     · le garde-fou `moralSuffisantPourAssaillir` — une nation qui ne survivrait pas à l'usure
       n'ouvre pas de guerre ; il ANTICIPE, sa formule vaut donc toujours (banc test_assaut_sans_moyens) ;
     · le moral d'un combat perdu ne se CUMULE pas avec celui d'une colonie perdue : 2 au total,
       jamais 3 (Marc, 16/09 : « si on perd le combat et la colonie on se limite à −2 »).
   Usage : node test_usure_tour_suivant.js
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
const USURE = 4;

/* Deux nations humaines, moral plein, au tour 5. Rien d'autre : on isole le moral. */
function montage(moral) {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player, cible = G.ais.find(a => a.civ.id === 'ceinturiens');
  moi._isAI = false; cible._isAI = false;
  G.ais.find(a => a.civ.id === 'jupiteriens')._isAI = true;
  G.turn = 5; G.phase = 'actions';
  for (const n of [moi, cible]) { n.res.morale = (moral === undefined ? 9 : moral); n.res.materials = 12; n.res.energy = 12; }
  return { sb, G, moi, cible };
}

console.log('§1 Déclarer une guerre ne coûte AUCUN moral dans le tour même');
{
  const m = montage();
  const a0 = m.moi.res.morale, b0 = m.cible.res.morale;
  m.sb.declarerGuerre(m.moi, m.cible, 'banc', 'player');
  note('agresseur ' + a0 + ' → ' + m.moi.res.morale + ' · défenseur ' + b0 + ' → ' + m.cible.res.morale);
  if (m.moi.res.morale === a0 && m.cible.res.morale === b0) ok('les deux camps gardent leur moral au tour de la déclaration');
  else ko('usure prélevée à la déclaration : agresseur −' + (a0 - m.moi.res.morale) + ', défenseur −' + (b0 - m.cible.res.morale));
  /* On distingue le PRÉLÈVEMENT (« usure de guerre : −4 … (guerre en cours) », écrit par
     `_usureDeGuerre`) de l'AVERTISSEMENT, qui lui DOIT être là : le joueur doit savoir ce qui
     l'attend demain matin au moment où il décide. */
  const lignes = m.G.log.slice(0, 6).map(e => String((e && e.msg) || e).replace(/<[^>]+>/g, ''));
  const preleve = lignes.find(x => /usure de guerre *: *−\d/.test(x));
  const avertit = lignes.find(x => /dès le début du tour prochain/i.test(x));
  if (!preleve) ok('aucun prélèvement au journal à cet instant');
  else ko('le journal prélève déjà : « ' + preleve + ' »');
  if (avertit) ok('le joueur est prévenu : « ' + avertit.slice(0, 70) + '… »');
  else ko('rien n\'annonce l\'usure à venir : ' + JSON.stringify(lignes));
}

console.log('§2 Elle tombe à l\'ouverture du tour suivant, aux deux camps');
{
  const m = montage();
  m.sb.declarerGuerre(m.moi, m.cible, 'banc', 'player');
  const a0 = m.moi.res.morale, b0 = m.cible.res.morale;
  m.G.turn = 6; m.sb.startTurn();
  note('après startTurn du tour 6 : agresseur ' + a0 + ' → ' + m.moi.res.morale + ' · défenseur ' + b0 + ' → ' + m.cible.res.morale);
  if (a0 - m.moi.res.morale === USURE) ok('agresseur : −' + USURE); else ko('agresseur : −' + (a0 - m.moi.res.morale) + ' au lieu de −' + USURE);
  if (b0 - m.cible.res.morale === USURE) ok('défenseur : −' + USURE); else ko('défenseur : −' + (b0 - m.cible.res.morale) + ' au lieu de −' + USURE);
}

console.log('§3 Paix faite dans le tour de la déclaration : personne ne paie jamais');
{
  const m = montage();
  const a0 = m.moi.res.morale, b0 = m.cible.res.morale;
  m.sb.declarerGuerre(m.moi, m.cible, 'banc', 'player');
  /* la paix retire la guerre de G.wars — c'est ce que fait `endWar` */
  try { m.sb.endWar(m.cible.civ.id); } catch (e) { vm.runInContext('G.wars=[]', m.sb); }
  m.G.turn = 6; m.sb.startTurn();
  const pa = a0 - m.moi.res.morale, pb = b0 - m.cible.res.morale;
  note('après paix puis tour 6 : agresseur ' + a0 + ' → ' + m.moi.res.morale + ' · défenseur ' + b0 + ' → ' + m.cible.res.morale);
  /* On teste l'absence d'USURE (−4), pas l'absence de tout mouvement : la fin d'une guerre a ses
     propres effets (−1 au demandeur), qui ne sont pas l'objet de ce banc. */
  if (pa < USURE && pb < USURE) ok('aucune usure — la guerre n\'a pas passé la nuit (mouvements : −' + pa + ' / −' + pb + ')');
  else ko('usure prélevée malgré la paix : agresseur −' + pa + ', défenseur −' + pb);
}

console.log('§4 Guerre maintenue deux tours : −4 puis encore −4, une seule fois par tour');
{
  const m = montage(12);
  m.sb.declarerGuerre(m.moi, m.cible, 'banc', 'player');
  const a0 = m.moi.res.morale;
  m.G.turn = 6; m.sb.startTurn();
  const apres1 = m.moi.res.morale;
  m.sb.startTurn();                       // rappelé dans le MÊME tour : ne doit rien reprélever
  const apres1bis = m.moi.res.morale;
  m.G.turn = 7; m.sb.startTurn();
  const apres2 = m.moi.res.morale;
  note('moral ' + a0 + ' → T6 ' + apres1 + ' → (T6 bis) ' + apres1bis + ' → T7 ' + apres2);
  if (a0 - apres1 === USURE) ok('tour 6 : −' + USURE); else ko('tour 6 : −' + (a0 - apres1));
  if (apres1bis === apres1) ok('deux appels dans le même tour ne prélèvent qu\'une fois');
  else ko('prélevé deux fois dans le même tour (' + apres1 + ' → ' + apres1bis + ')');
  if (apres1 - apres2 === USURE) ok('tour 7 : encore −' + USURE); else ko('tour 7 : −' + (apres1 - apres2));
}

console.log('§5 VERROU — combat perdu + colonie prise = 2 de moral, jamais 3');
{
  function combat(avecCapture) {
    const m = montage();
    if (!m.cible.colonies.some(c => c.nodeId === 'titan')) m.cible.colonies.push({ nodeId: 'titan', level: 2, connected: true });
    m.moi.acLeft = 5; m.moi.forceTokens = 12; m.cible.forceTokens = 1;
    m.sb.declarerGuerre(m.moi, m.cible, 'banc', 'player');
    m.G.warWith = m.cible.civ.id;
    m.cible.res.morale = 9;                       // après la déclaration : on isole le combat
    vm.runInContext('_warAttackColonyTarget=' + (avecCapture ? '"titan"' : 'null'), m.sb);
    m.sb.resolveWarCombat(8, m.moi);
    return { perte: 9 - m.cible.res.morale, prise: !m.cible.colonies.some(c => c.nodeId === 'titan') };
  }
  const a = combat(true), b = combat(false);
  note('combat perdu + colonie prise : −' + a.perte + ' (colonie prise = ' + a.prise + ') · combat perdu seul : −' + b.perte);
  if (a.prise && a.perte === 2) ok('combat perdu AVEC capture : −2 au total');
  else ko('combat perdu avec capture : −' + a.perte + ' (attendu −2), capture=' + a.prise);
  if (b.perte === 1) ok('combat perdu SEUL : −1'); else ko('combat perdu seul : −' + b.perte + ' (attendu −1)');
}

console.log('§6 Le garde-fou tient : une nation qui ne survivrait pas à l\'usure n\'ouvre pas de guerre');
{
  const m = montage();
  m.moi.res.morale = 4;                            // 4 − 4 = 0 : elle ne survivrait pas
  const peut = vm.runInContext('moralSuffisantPourAssaillir(G.player, G.ais.find(a=>a.civ.id==="ceinturiens"))', m.sb);
  if (peut === false) ok('moral 4 : assaut refusé (l\'usure du tour suivant la mettrait à 0)');
  else ko('moral 4 : assaut autorisé alors que l\'usure la tuerait');
  m.moi.res.morale = 5;
  const peut2 = vm.runInContext('moralSuffisantPourAssaillir(G.player, G.ais.find(a=>a.civ.id==="ceinturiens"))', m.sb);
  if (peut2 === true) ok('moral 5 : assaut autorisé (il lui restera 1)');
  else ko('moral 5 : assaut refusé à tort');
}

console.log('§7 La fenêtre de guerre populaire ÉNONCE le prix, chiffré pour celui qui décide');
{
  const m = montage();
  m.moi.res.morale = 9; m.moi.acMax = 5;
  const html = vm.runInContext('prixDeLaGuerreHTML(G.player)', m.sb);
  const txt = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  note(txt.trim().slice(0, 150) + '…');
  const attendu = [
    ['le −4 du tour prochain', /−4.*début du tour prochain/i],
    ['la répétition à chaque tour', /à chaque tour tant qu/i],
    ['le moral actuel du joueur', /Tu as 9/],
    ['la projection sur deux tours', /passerait à 5 .*1 le tour/i],
    ['la règle du moral 1', /Moral 1.*revenus divisés par deux/i],
    ['la règle du moral 0', /Moral 0.*aucun revenu/i],
    ['le nombre d\'actions réel', /actions tombent de 5 à 3/i],
    ['la porte de sortie', /paix avant la fin du tour ne coûte aucun moral/i]
  ];
  for (const [quoi, re] of attendu) {
    if (re.test(txt)) ok('la fenêtre dit ' + quoi); else ko('la fenêtre ne dit pas ' + quoi + ' — « ' + txt.trim() + ' »');
  }
  /* Et le texte doit suivre le joueur : un moral de 3 ne se lit pas comme un moral de 9. */
  m.moi.res.morale = 3;
  const bas = String(vm.runInContext('prixDeLaGuerreHTML(G.player)', m.sb)).replace(/<[^>]+>/g, ' ');
  if (/tomberait à 0 dès demain/i.test(bas)) ok('à 3 de moral, elle avertit que la guerre le met à 0 dès demain');
  else ko('à 3 de moral, l\'avertissement ne change pas : « ' + bas.replace(/\s+/g, ' ').trim().slice(0, 120) + ' »');
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_usure_tour_suivant : l\'usure attend le tour suivant, le moral ne se cumule pas.');
