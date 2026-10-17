/* ============================================================================
   TEST — JOURNAL, COSMÉTIQUE (§120.13, v10.62)
   ----------------------------------------------------------------------------
   §1 « GUERRE DÉCLARÉE » s'écrit AVANT les lignes « usure de guerre » (ordre des causes).
   §2 confirmRouteToken(false) sans route en attente du choix n'écrit PAS « Route non protégée »
      (FE37 T7 : la ligne suivait « Route protégée gratuitement (IA de Navigation) » pour la même route).
   §3 Le rendu du journal (_journalHTML) : dernière action en haut, séparateur « TOUR n », et les lignes
      « ↳ paie » rangées SOUS leur action malgré l'ordre inverse.
   Usage : node test_journal_cosmetique.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
/* Les nouvelles lignes depuis `av`, dans l'ORDRE CHRONOLOGIQUE (G.log est du plus récent au plus ancien). */
const nouvelles = (G, av) => G.log.slice(0, G.log.length - av).map(e => String((e && e.msg) || e)).reverse();

console.log('§1 La déclaration de guerre précède l\'avertissement d\'usure dans le journal');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G; G.turn = 3; G.phase = 'actions';
  const ter = G.player, mar = G.ais[0];
  ter.res.morale = 6; mar.res.morale = 6;
  const av = G.log.length;
  const w = sb.declarerGuerre(mar, ter, 'test', mar);
  const l = nouvelles(G, av);
  const iDecl = l.findIndex(x => /GUERRE DÉCLARÉE/.test(x));
  /* 16/09 (§134) : plus de prélèvement d'usure à la déclaration — c'est l'AVERTISSEMENT qui doit
     suivre l'annonce, et pour la même raison qu'avant : un journal se lit dans l'ordre des causes. */
  const iUsure = l.findIndex(x => /dès le début du tour prochain/.test(x));
  if (w && iDecl >= 0) ok('guerre déclarée, ligne écrite'); else ko('pas de guerre ou pas de ligne : ' + JSON.stringify(l));
  if (iUsure >= 0) ok('l\'usure à venir est annoncée (' + l[iUsure].replace(/<[^>]+>/g, '').slice(0, 60) + '…)'); else ko('rien n\'annonce l\'usure : ' + JSON.stringify(l));
  if (iDecl >= 0 && iUsure >= 0 && iDecl < iUsure) ok('ordre : déclaration (' + iDecl + ') puis avertissement (' + iUsure + ')');
  else ko('ordre inversé : déclaration à ' + iDecl + ', avertissement à ' + iUsure + ' — ' + JSON.stringify(l));
}

console.log('§2 Refus de jeton sans route en attente : rien n\'est écrit');
{
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['martiens']);
  const G = sb.__G; G.turn = 2; G.phase = 'actions';
  const av = G.log.length;
  sb.confirmRouteToken(false);   // ce que le serveur faisait après chaque route, IA de Navigation comprise
  const l = nouvelles(G, av);
  if (!l.some(x => /Route non protégée/.test(x))) ok('aucune ligne « Route non protégée » sans route en attente'); else ko('ligne écrite à tort : ' + JSON.stringify(l));
}

console.log('§2 bis Refus de jeton AVEC route en attente : la ligne reste');
{
  const sb = loadLogic(HTML);
  sb.initGame('ceinturiens', ['martiens']);
  const G = sb.__G; G.turn = 2; G.phase = 'actions';
  const cei = G.player; cei.forceTokens = 3; cei.res.materials = 9; cei.acLeft = 2;
  /* on simule la fenêtre : _pendingRouteObj posé par doEstablishRoute (branche « popup ») */
  try { sb.__sbEval = null; } catch (e) {}
  const vm = require('vm');
  vm.runInContext('_pendingRouteObj={from:"eris",to:"pluto",tokens:0};', sb);
  const av = G.log.length;
  sb.confirmRouteToken(false);
  const l = nouvelles(G, av);
  if (l.some(x => /Route non protégée/.test(x))) ok('« Route non protégée » écrite quand le joueur refuse vraiment'); else ko('ligne absente : ' + JSON.stringify(l));
}

console.log('§3 Rendu : dernière action en haut, « TOUR n », « ↳ paie » sous son action');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G;
  G.log = [
    { msg: '   ↳ 🔴 Martiens paie : 1 AC −1🪨', cls: 'dim', civ: 'martiens', turn: 2 },
    { msg: '🤖 Martiens colonise Vesta', cls: '', civ: 'martiens', turn: 2 },
    { msg: '💰 Revenus nets : +1⚡', cls: '', civ: 'terriens', turn: 1 },
    { msg: '   ↳ 🟠 Jupitériens paie : 0 AC (aucune ressource)', cls: 'dim', civ: 'jupiteriens', turn: 1 },
    { msg: '🤖 Jupitériens achète Propagande', cls: '', civ: 'jupiteriens', turn: 1 },
    { msg: '🚀 Partie !', cls: 'gold', civ: null, turn: 1 },
  ];
  const html = sb._journalHTML(G.log);
  const texte = html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  const pos = s => texte.indexOf(s);
  if (pos('Tour 2') >= 0 && pos('Tour 1') > pos('Tour 2')) ok('séparateurs TOUR 2 puis TOUR 1 (récent en haut)'); else ko('séparateurs : ' + texte.slice(0, 200));
  if (pos('colonise Vesta') >= 0 && pos('paie : 1 AC −1🪨') > pos('colonise Vesta')) ok('« ↳ paie » des Martiens SOUS « colonise Vesta »'); else ko('paie martien mal rangée : ' + texte);
  if (pos('achète Propagande') >= 0 && pos('Jupitériens paie') > pos('achète Propagande') && pos('Jupitériens paie') < pos('Partie !')) ok('« ↳ paie » des Jupitériens sous son action, avant « Partie ! »'); else ko('paie jupitérien mal rangée : ' + texte);
  if (/log-sous/.test(html) && !/T1 |T2 /.test(texte)) ok('sous-lignes marquées, plus de préfixe « T1 Nation »'); else ko('classes ou préfixe : ' + texte.slice(0, 200));
}

console.log('§4 L\'avertissement « déjà au maximum de 5 AC » vient APRÈS l\'annonce de la carte');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G; G.turn = 10; G.phase = 'actions';
  const p = G.player; p.acMax = 5; p.acLeft = 5;      // déjà au plafond : le bonus ne peut rien donner
  const carte = require('vm').runInContext('STRATEGY_CARDS.find(c=>c.acBonus>0)', sb);
  if (!carte) { ko('aucune carte Stratégie à bonus d\'AC dans le jeu'); }
  else {
    const av = G.log.length;
    sb.applyStrategy(carte.id);
    const l = nouvelles(G, av);
    const iCarte = l.findIndex(x => /🎯 Stratégie/.test(x));
    const iAvert = l.findIndex(x => /maximum de 5 AC/.test(x));
    if (iCarte >= 0) ok('la carte est annoncée (« ' + l[iCarte].replace(/<[^>]+>/g, '').slice(0, 55) + '… »)');
    else ko('la carte n\'est pas annoncée : ' + JSON.stringify(l));
    if (iAvert >= 0) ok('l\'avertissement est écrit'); else ko('avertissement absent : ' + JSON.stringify(l));
    if (iCarte >= 0 && iAvert >= 0 && iCarte < iAvert) ok('ordre : annonce (' + iCarte + ') puis avertissement (' + iAvert + ')');
    else ko('ordre inversé : annonce à ' + iCarte + ', avertissement à ' + iAvert + ' — ' + JSON.stringify(l));
  }
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_journal_cosmetique : déclaration avant usure, pas de faux « non protégée », rendu groupé par tour, avertissement AC apres l annonce.');
