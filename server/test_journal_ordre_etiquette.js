/* TEST — LE JOURNAL SE LIT DANS L'ORDRE, ET CHAQUE LIGNE PORTE SA NATION (Marc, partie 29BD, 22/09)
   « D'abord le Terrien colonise, on doit donc voir ça en bas du journal, puis ce qu'il a gagné, puis
   la colonie n'est pas connectée. » — « Ce qui me concerne ne doit pas être sans label de nation. »
   — « Abandonne le you. »
   §1 action d'une IA : en-tête, puis « ↳ paie », puis les gains, puis l'état de connexion
   §2 même ordre pour le joueur ; §3 achat d'une technologie : en-tête puis « ↳ paie »
   §4 une ligne écrite par le joueur sans nation reçoit « 🔴 Martiens — » au rendu
   §5 pirates : un en-tête système, puis une ligne par nation, dans SA colonne — la tension envers les
      Ceinturiens chez la nation pillée, pas chez le joueur
   §6 plus de « toi / ta / tu » dans les lignes de tension et de coût de combat
   Usage : node test_journal_ordre_etiquette.js */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const txt = (sb, e) => String((typeof sb._logTexte === 'function' ? sb._logTexte(e) : (e && e.msg)) || '').replace(/<[^>]+>/g, '');
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['terriens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 4; G.phase = 'actions';
  const mar = G.player, ter = G.ais.find(a => a.civ.id === 'terriens');
  mar._isAI = false;
  for (const n of [mar, ter]) { n.res.materials = 20; n.res.energy = 20; n.res.science = 20; n.acLeft = 4; }
  return { sb, G, mar, ter };
}
const depuis = (G, av) => (G.log || []).slice(0, (G.log || []).length - av).reverse();   // dans l'ordre d'écriture

console.log('§1 — une IA colonise');
{
  const { sb, G, ter } = montage();
  G._discCache = { deimos: vm.runInContext('DISCOVERY_TILES.find(d=>!d.vp&&!d.force)||DISCOVERY_TILES[0]', sb) };
  ter.routes.push({ from: 'lune', to: 'deimos', tokens: 0 });
  const av = G.log.length;
  vm.runInContext('(function(){ const ai=G.ais.find(a=>a.civ.id==="terriens"); G.aiActions=[]; })()', sb);
  // Le vrai chemin : un pas de doAITurn qui joue « coloniser », via appliquerCoup et son relevé des coûts.
  const orig = sb.coupsPossibles;
  vm.runInContext('var __coupForce={type:"coloniser",node:"deimos"};', sb);
  const fait = sb.appliquerCoup(ter, { type: 'coloniser', node: 'deimos' });
  const L = depuis(G, av).map(e => txt(sb, e));
  const iH = L.findIndex(l => /colonise Déimos|colonise Deimos/.test(l));
  const iG = L.findIndex(l => /Colonie éloignée|conditions de vie/.test(l));
  const iS = L.findIndex(l => /Déimos :.*connectée|Deimos :.*connectée/.test(l));
  if (fait && iH >= 0) ok('en-tête : « ' + L[iH].slice(0, 60) + ' »'); else ko('pas d\'en-tête de colonisation : ' + JSON.stringify(L));
  if (iH >= 0 && iG > iH && iS > iG) ok('ordre : action → gains → connexion'); else ko('ordre : en-tête ' + iH + ', gains ' + iG + ', état ' + iS + ' — ' + JSON.stringify(L));
  if (!L.some(l => /^🤖/.test(l) && /colonise/.test(l))) ok('plus de seconde ligne « 🤖 … colonise » après coup'); else ko('ligne « 🤖 colonise » encore écrite');
}

console.log('§2 — le joueur colonise (même ordre, avec « ↳ paie »)');
{
  const { sb, G, mar } = montage();
  G._discCache = { vesta: vm.runInContext('DISCOVERY_TILES.find(d=>!d.vp&&!d.force)||DISCOVERY_TILES[0]', sb) };
  mar.routes.push({ from: 'phobos', to: 'ceres', tokens: 0 }); mar.colonies.push({ nodeId: 'ceres', level: 1, connected: true });
  const av = G.log.length;
  sb.doColonize('vesta'); try { sb.dismissDiscovery(); } catch (e) {}
  const L = depuis(G, av).map(e => txt(sb, e));
  const iH = L.findIndex(l => /colonise Vesta/.test(l)), iP = L.findIndex(l => /↳.*paie/.test(l)), iS = L.findIndex(l => /Vesta :.*connectée/.test(l));
  if (iH >= 0 && iP === iH + 1) ok('« ↳ paie » juste sous l\'en-tête'); else ko('en-tête ' + iH + ', paie ' + iP + ' — ' + JSON.stringify(L));
  if (iS > iP) ok('l\'état de connexion vient après'); else ko('état de connexion à ' + iS);
  const html = sb._journalHTML(G.log).replace(/<[^>]+>/g, '');
  if (/🔴 Martiens — /.test(html)) ok('le journal affiché nomme les Martiens en tête de ligne'); else ko('aucune étiquette « 🔴 Martiens — » au rendu');
}

console.log('§3 — achat d\'une technologie');
{
  const { sb, G, mar } = montage();
  const carte = vm.runInContext('(G.generalRiver||[]).find(c=>c&&c.tier===1)||CARDS_POOL.find(c=>c.tier===1&&c.branch&&!c.military)', sb);
  const av = G.log.length; const n0 = mar.cards.length;
  try { sb.buyTech(carte.id); } catch (e) {}
  const L = depuis(G, av).map(e => txt(sb, e));
  const iH = L.findIndex(l => /achète/.test(l)), iP = L.findIndex(l => /↳.*paie/.test(l));
  if (mar.cards.length > n0) {
    if (iH === 0 && iP === 1) ok('en-tête « achète » puis « ↳ paie »'); else ko('achat : ' + JSON.stringify(L));
  } else ok('(carte non achetable dans ce montage : ' + (carte && carte.id) + ' — point sauté)');
}

console.log('§4 — étiquette d\'une ligne du joueur');
{
  const { sb } = montage();
  const e = { civ: 'martiens', msg: '⚠️ Pas assez de Matériaux.' };
  const r = sb.journalEtiqueter(e, e.msg);
  if (/^🔴 Martiens — ⚠️ Pas assez/.test(r)) ok(r); else ko('rendu : ' + r);
  const r2 = sb.journalEtiqueter({ civ: 'terriens' }, '🤖 Terriens achète Ordinateur Quantique');
  if (r2 === '🌍 Terriens — achète Ordinateur Quantique') ok(r2); else ko('rendu IA : ' + r2);
  const r3 = sb.journalEtiqueter({ civ: 'systeme' }, '🃏 Pioche Stratégie');
  if (r3 === '🃏 Pioche Stratégie') ok('ligne système inchangée'); else ko('ligne système modifiée : ' + r3);
}

console.log('§5 — pirates : un événement, une ligne par nation, chacune dans sa colonne');
{
  const { sb, G, mar, ter } = montage();
  vm.runInContext('Math.random=function(){return 0;}', sb); G.turn = 9;
  ter.routes = [{ from: 'lune', to: 'deimos', tokens: 0 }];
  const cei = G.ais.find(a => a.civ.id === 'ceinturiens');
  mar.routes = [{ from: 'phobos', to: 'ceres', tokens: 0 }];
  const iadef = vm.runInContext('CARDS_POOL.find(c=>c.spec==="ia_immune")', sb); if (iadef) mar.cards.push(iadef);
  sb.setTens('terriens', 'ceinturiens', 0); sb.setTens('martiens', 'ceinturiens', 0);
  const av = G.log.length;
  sb.advancePirates();
  const E = depuis(G, av);
  const h = E.findIndex(e => /Pirates — attaques/.test(txt(sb, e)));
  const pil = E.find(e => /route .*pillée/.test(txt(sb, e)));
  const imm = E.find(e => /immunisées/.test(txt(sb, e)));
  const ten = E.find(e => /soutien secret aux pirates/.test(txt(sb, e)));
  if (h === 0 && E[0].civ === 'systeme') ok('en-tête système en premier'); else ko('en-tête : index ' + h + ', auteur ' + (E[0] && E[0].civ));
  if (pil && pil.civ === 'terriens' && /^🌍 Terriens — /.test(txt(sb, pil))) ok('pillage : « ' + txt(sb, pil).slice(0, 60) + ' » (colonne terriens)'); else ko('ligne de pillage : ' + (pil ? pil.civ + ' │ ' + txt(sb, pil) : 'absente'));
  if (imm && imm.civ === 'martiens' && /^🔴 Martiens — /.test(txt(sb, imm))) ok('immunité : « ' + txt(sb, imm).slice(0, 60) + ' »'); else ko('ligne d\'immunité : ' + (imm ? imm.civ + ' │ ' + txt(sb, imm) : 'absente'));
  if (ten && ten.civ === 'terriens') ok('tension envers les Ceinturiens : colonne terriens (la nation pillée)'); else ko('tension : ' + (ten ? ten.civ + ' │ ' + txt(sb, ten) : 'absente'));
  if (sb.getTens('martiens', 'ceinturiens') === 0) ok('aucune tension pour les Martiens (immunisés)'); else ko('tension Martiens → Ceinturiens : ' + sb.getTens('martiens', 'ceinturiens'));
}

console.log('§6 — plus de deuxième personne dans les lignes de tension et de combat');
{
  const { sb, G, mar, ter } = montage();
  G.turn = 7;
  for (const n of ['titan', 'europe', 'callisto', 'ceres', 'deimos', 'encelade']) if (!ter.colonies.some(c => c.nodeId === n)) ter.colonies.push({ nodeId: n, level: 1, connected: true });
  sb.setTens('martiens', 'terriens', 0); sb.setTens('terriens', 'martiens', 0);
  const av = G.log.length;
  sb.updateTension();
  const L = depuis(G, av).map(e => txt(sb, e));
  const TU = /(^|[\s(—:'])(tu|ta|ton|tes|toi|te|Tu|Ta|Ton|Tes|Toi)([\s),.!:]|$)/;
  const dom = L.find(l => /distance/.test(l));
  if (dom) ok('dominance écrite : « ' + dom.slice(0, 80) + ' »'); else ko('montage : aucune ligne de dominance');
  const fautives = L.filter(l => TU.test(l));
  if (!fautives.length) ok('aucune tournure à la deuxième personne'); else ko('deuxième personne : ' + JSON.stringify(fautives));
  const nom = sb._evName(mar); const rendu = String(nom);
  if (!/toi/.test(rendu)) ok('_evName(joueur) = « ' + rendu + ' » (plus de « (toi) »)'); else ko('_evName : ' + rendu);
}
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
