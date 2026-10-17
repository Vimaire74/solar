/* ============================================================================
   TEST — CELUI QUI PERD UNE COLONIE DOIT L'APPRENDRE, ET DANS SES MOTS
   ----------------------------------------------------------------------------
   POURQUOI. Partie 96F6 (15/09, Marc et Laurent). Au tour 10, Marc — Ceinturiens — prend Cérès aux
   Terriens de Laurent en combat de guerre. Marc : « Laurent a pas eu de message au tour 10 en perdant
   Cérès dans mon attaque, il a pas su qu'il avait perdu la colonie. »

   LA CAUSE. `resolveWarCombat` écrit la capture au journal et rend un `txt` — mais ce texte est celui
   de L'ASSAILLANT (« Tu CAPTURES Cérès — elle est à toi ! »). Aucun `notifyNationHit` vers le
   dépossédé. Le seul canal qui l'atteignait était la notice collective `war_result`, que le serveur
   envoie aux deux camps en la préfixant « 👁️ Vu par ☠️ Ceinturiens — ». Laurent a donc lu, mot pour
   mot, que Ceinturiens capturait Cérès « — elle est à toi ! ». Rien ne lui disait qu'il la perdait.

   ⚠️ LE CHEMIN DE L'ORDINATEUR, LUI, ÉTAIT CORRECT depuis longtemps : `doAIAssault` appelle
   `notifyNationHit(p, 'X prend Y', 'Ta colonie tombe…')`. C'est le chemin HUMAIN CONTRE HUMAIN qui
   n'a jamais eu sa notification — celui qui ne sert qu'en partie en ligne, donc le moins souvent joué
   et le moins souvent regardé.

   CE QUI EST VÉRIFIÉ :
     §1 le dépossédé reçoit une notification, à la DEUXIÈME personne, qui nomme la colonie et le
        vainqueur, et ne prétend pas qu'il vient de gagner quelque chose ;
     §2 l'assaillant, lui, garde son texte de victoire (on n'a pas échangé les deux) ;
     §3 une victoire SANS capture (pas de colonie visée) ne réveille personne ;
     §4 contre-épreuve : un dépossédé tenu par l'ORDINATEUR n'est pas notifié (rien à afficher).
   Usage : node test_perte_colonie_prevenue.js
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
const nu = s => String(s || '').replace(/<[^>]+>/g, '');

/* `moi` assaille `cible` sur Titan. `cibleHumaine` dit si le dépossédé est tenu par un joueur.
   On remplace `notifyNationHit` par un mouchard : c'est la porte unique des messages personnels,
   et la seule chose qui nous intéresse ici est QUI reçoit QUOI. */
function montage(cibleHumaine) {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  const moi = G.player;
  const cible = G.ais.find(a => a.civ.id === 'ceinturiens');
  const tiers = G.ais.find(a => a.civ.id === 'jupiteriens');
  moi._isAI = false; cible._isAI = !cibleHumaine; tiers._isAI = true;
  G.turn = 9; G.phase = 'actions';
  moi.acLeft = 5; moi.forceTokens = 12; moi.res.materials = 15; moi.res.energy = 15;
  cible.forceTokens = 1; cible.res.materials = 4; cible.res.energy = 4;
  if (!cible.colonies.some(c => c.nodeId === 'titan')) cible.colonies.push({ nodeId: 'titan', level: 2, connected: true });
  const recus = [];
  vm.runInContext('__recus=[]; notifyNationHit=function(v,t,b){ __recus.push({civ:(v&&v.civ&&v.civ.id)||null, ia:!!(v&&v._isAI), titre:String(t||""), corps:String(b||"")}); };', sb);
  sb.declarerGuerre(moi, cible, 'banc', 'player');
  G.warWith = cible.civ.id;
  return { sb, G, moi, cible, tiers, recus: () => vm.runInContext('__recus', sb) };
}

console.log('§1 Le dépossédé humain est prévenu, dans ses mots');
{
  const m = montage(true);
  vm.runInContext('_warAttackColonyTarget="titan"', m.sb);
  const res = m.sb.resolveWarCombat(8, m.moi);
  note('combat : ' + res.pPow + ' contre ' + res.aPow + (res.pPow > res.aPow ? ' — Titan change de main' : ' — PAS DE CAPTURE, montage à revoir'));
  const perdue = !m.cible.colonies.some(c => c.nodeId === 'titan');
  if (perdue) ok('Titan a bien changé de propriétaire'); else ko('Titan n\'a pas changé de main — le banc ne prouve rien');
  const pour = m.recus().filter(r => r.civ === 'ceinturiens');
  note('messages reçus par le dépossédé : ' + (pour.length ? pour.map(r => '« ' + nu(r.titre) + ' / ' + nu(r.corps) + ' »').join(' · ') : 'AUCUN'));
  if (pour.length) ok('il reçoit un message');
  else ko('il ne reçoit RIEN — c\'est le défaut de la 96F6');
  const txt = pour.map(r => nu(r.titre) + ' ' + nu(r.corps)).join(' ');
  if (/Titan/.test(txt)) ok('le message nomme la colonie perdue'); else ko('la colonie n\'est pas nommée : « ' + txt + ' »');
  if (/Martiens/.test(txt)) ok('il nomme celui qui la prend'); else ko('le vainqueur n\'est pas nommé : « ' + txt + ' »');
  if (/\bTu\b|\bTa\b|\btu\b|\bta\b/.test(txt)) ok('il est écrit à la deuxième personne, pour lui');
  else ko('pas écrit pour lui : « ' + txt + ' »');
  if (!/CAPTURES|elle est à toi|Victoire/i.test(txt)) ok('il ne lui annonce pas une victoire qui n\'est pas la sienne');
  else ko('on lui sert le texte de l\'assaillant : « ' + txt + ' »');
}

console.log('§2 L\'assaillant garde son texte de victoire');
{
  const m = montage(true);
  vm.runInContext('_warAttackColonyTarget="titan"', m.sb);
  const res = m.sb.resolveWarCombat(8, m.moi);
  if (/CAPTURES/i.test(nu(res.txt))) ok('l\'assaillant lit « Tu CAPTURES Titan… » : ' + nu(res.txt).slice(0, 60) + '…');
  else ko('le texte de l\'assaillant a changé : « ' + nu(res.txt) + ' »');
  const versMoi = m.recus().filter(r => r.civ === 'martiens');
  if (!versMoi.length) ok('et il ne reçoit pas en plus une notification de perte');
  else ko('l\'assaillant reçoit un message de perte : ' + JSON.stringify(versMoi));
}

console.log('§3 Une victoire sans capture ne réveille personne');
{
  const m = montage(true);
  vm.runInContext('_warAttackColonyTarget=null', m.sb);
  m.sb.resolveWarCombat(8, m.moi);
  const n = m.recus().filter(r => r.civ === 'ceinturiens').length;
  if (n === 0) ok('aucune notification de perte quand rien n\'est pris');
  else ko(n + ' notification(s) alors qu\'aucune colonie ne change de main');
}

console.log('§4 Contre-épreuve : un dépossédé tenu par l\'ordinateur n\'est pas notifié');
{
  const m = montage(false);
  vm.runInContext('_warAttackColonyTarget="titan"', m.sb);
  m.sb.resolveWarCombat(8, m.moi);
  const perdue = !m.cible.colonies.some(c => c.nodeId === 'titan');
  const pour = m.recus().filter(r => r.civ === 'ceinturiens');
  if (!perdue) ko('Titan n\'a pas changé de main dans la contre-épreuve');
  else if (pour.every(r => r.ia)) ok('la colonie tombe, et la nation-ordinateur n\'est pas notifiée (rien à afficher)');
  else ko('une notification part vers une nation-ordinateur : ' + JSON.stringify(pour));
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_perte_colonie_prevenue : le dépossédé apprend qu\'il perd sa colonie, dans ses mots.');
