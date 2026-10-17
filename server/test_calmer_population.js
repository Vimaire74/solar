/* ============================================================================
   TEST — « CALMER LA POPULATION » (carte civique cm_calm) EN LIGNE
   ----------------------------------------------------------------------------
   POURQUOI. Partie D538 (14/09, tour 10) : Marc, moral à 0, achète « Calmer la Population » ;
   rien ne se passe. Le client envoyait `buyMarket('cm_calm')` au serveur, qui appelait
   `showCalmPopup` → `document.body.insertAdjacentHTML` — inexistant dans le faux `document` du
   serveur → TypeError. L'action était refusée sans un mot utile. La carte n'a JAMAIS marché en
   ligne (même code dans lot15, lot16, témoin v9.69).

   RÈGLE. Le choix de la nation se fait sur l'ÉCRAN du joueur (online.js laisse passer `buyMarket`
   pour cette carte) ; c'est `applyCalmTension(cible,'civic',3)` qui part au serveur, qui REVALIDE
   tout (phase, cible, AC, ressources) AVANT de toucher à la tension. Sans écran, `buyMarket`
   refuse proprement avec un mot de la liste du pilote, pour que le joueur garde la main.

   Usage : node test_calmer_population.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const dernier = (G, av) => G.log.slice(0, G.log.length - av).map(e => String((e && e.msg) || e));
const REJET = /pas assez|impossible|déjà|non adjacent|invalide|refuse|besoin|insuffisant/i; // regex du pilote (driver.act)

function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens']);
  const G = sb.__G;
  G.turn = 5; G.phase = 'actions';
  const hum = G.player, mar = G.ais[0];
  hum._isAI = false; G.ais.forEach(a => a._isAI = true);
  hum.acLeft = 2; hum.res.materials = 4; hum.res.energy = 4; hum.res.morale = 0;
  sb.setTens('player', 'martiens', 7);
  return { sb, G, hum, mar };
}

console.log('§1 Sans écran (serveur), buyMarket(cm_calm) ne plante plus, ne débite rien et rend la main');
{
  const { sb, G, hum } = montage();
  const av = G.log.length;
  let err = null;
  try { sb.buyMarket('cm_calm'); } catch (e) { err = e; }
  if (err) ko('buyMarket a levé : ' + err.message.split('\n')[0]); else ok('aucune exception');
  const lignes = dernier(G, av);
  if (lignes.some(l => REJET.test(l))) ok('refus dit au joueur avec un mot que le pilote reconnaît → il garde la main : « ' + lignes[0] + ' »');
  else ko('aucune ligne de refus reconnue par le pilote : ' + JSON.stringify(lignes));
  if (hum.acLeft === 2 && hum.res.materials === 4 && hum.res.energy === 4 && sb.getTens('player', 'martiens') === 7) ok('rien dépensé, tension intacte');
  else ko('quelque chose a bougé : AC ' + hum.acLeft + ' 🪨' + hum.res.materials + ' ⚡' + hum.res.energy + ' tension ' + sb.getTens('player', 'martiens'));
}

console.log('§2 applyCalmTension(cible, civic) : −1 AC, −1🪨 −1⚡, +1🙂, tension −3, journal et trace d\'actions');
{
  const { sb, G, hum } = montage();
  const av = G.log.length, na = (G._journal || []).length;
  sb.applyCalmTension('martiens', 'civic', 3);
  if (hum.acLeft === 1) ok('AC 2 → 1'); else ko('AC ' + hum.acLeft);
  if (hum.res.materials === 3 && hum.res.energy === 3) ok('−1🪨 −1⚡'); else ko('ressources 🪨' + hum.res.materials + ' ⚡' + hum.res.energy);
  if (hum.res.morale === 1) ok('moral 0 → 1'); else ko('moral ' + hum.res.morale);
  if (sb.getTens('player', 'martiens') === 4) ok('tension 7 → 4'); else ko('tension ' + sb.getTens('player', 'martiens'));
  const lignes = dernier(G, av);
  /* 17/09 : la ligne dit maintenant le SENS (« ta tension envers elle ») — même exigence : les deux
     nations NOMMÉES, pas l'identifiant « martiens » en minuscule. */
  if (lignes.some(l => /🕊️ 🌍 Terriens.*calme sa population vis-à-vis de 🔴 Martiens.*sa tension envers elle/.test(l))) ok('journal nomme les deux nations et dit le sens (plus d\'identifiant « martiens » en minuscule)');
  else ko('journal : ' + JSON.stringify(lignes));
  if ((G._journal || []).length === na + 1 && /Calmer/.test(G._journal[G._journal.length - 1].name)) ok('trace d\'actions : « Calmer la Population » pour Terriens');
  else ko('trace d\'actions non écrite');
}

console.log('§3 Le serveur revalide : rien ne bouge (même pas la tension) si AC, ressources ou cible manquent');
{
  const cas = [
    ['AC 0', m => { m.hum.acLeft = 0; }],
    ['0 matériaux', m => { m.hum.res.materials = 0; }],
    ['0 énergie', m => { m.hum.res.energy = 0; }],
    ['hors phase actions', m => { m.G.phase = 'strategy'; }],
  ];
  for (const [nom, prep] of cas) {
    const m = montage(); prep(m);
    const av = m.G.log.length, ac = m.hum.acLeft, mo = m.hum.res.morale;
    m.sb.applyCalmTension('martiens', 'civic', 3);
    const lignes = dernier(m.G, av);
    if (m.sb.getTens('player', 'martiens') === 7 && m.hum.acLeft === ac && m.hum.res.morale === mo && lignes.some(l => REJET.test(l))) ok(nom + ' → refusé, tension intacte : « ' + lignes[0] + ' »');
    else ko(nom + ' → tension ' + m.sb.getTens('player', 'martiens') + ', AC ' + m.hum.acLeft + ', moral ' + m.hum.res.morale + ', lignes ' + JSON.stringify(lignes));
  }
  const m = montage(); const av = m.G.log.length;
  m.sb.applyCalmTension('terriens', 'civic', 3);   // sa propre nation : pas une cible
  if (m.hum.acLeft === 2 && dernier(m.G, av).some(l => REJET.test(l))) ok('cible = soi-même → refusé'); else ko('cible = soi-même acceptée');
  const m2 = montage();
  m2.sb.applyCalmTension('martiens', 'civic', 10);  // client trafiqué : montant ignoré
  if (m2.sb.getTens('player', 'martiens') === 4) ok('montant reçu (10) ignoré : c\'est celui de la carte (3)'); else ko('montant du client appliqué : tension ' + m2.sb.getTens('player', 'martiens'));
}

console.log('§4 En ligne (courtier actif), applyCalmTension n\'accepte que le mode civique');
{
  const { sb, G, hum } = montage();
  sb.setDecisionSink(() => {});
  const av = G.log.length;
  sb.applyCalmTension('martiens', 'strategy', 2);
  if (sb.getTens('player', 'martiens') === 7 && dernier(G, av).some(l => REJET.test(l))) ok('mode « strategy » par appel direct → refusé (la Stratégie passe par la question strategy_calm)');
  else ko('mode strategy accepté en ligne : tension ' + sb.getTens('player', 'martiens'));
  void hum;
}

console.log('§5 Pilote : un ancien client qui envoie encore buyMarket(cm_calm) garde la main, sans exception');
{
  const d = new GameDriver(HTML);
  d.boot([{ civId: 'terriens', isAI: false }, { civId: 'martiens', isAI: true }, { civId: 'jupiteriens', isAI: true }], () => {});
  const reponse = p => { const pay = (p && p.payload) || {}; for (const k of Object.keys(pay)) { const v = pay[k]; if (Array.isArray(v) && v.length) { const o = v[0]; const id = (o && o.id !== undefined) ? o.id : 0; return { choice: id, index: 0, [k.replace(/s$/, '')]: id }; } } return {}; };
  let r = d.pump(), n = 0;
  while (r && r.kind !== 'over' && n++ < 500) {
    if (r.kind === 'decision') r = d.answer(r.pending.id, reponse(r.pending));
    else if (r.kind === 'confirm') r = d.commit(r.civId);
    else if (r.kind === 'action') break;
    else break;
  }
  if (!r || r.kind !== 'action' || r.civId !== 'terriens') ko('pas de tour d\'action humain (' + (r && r.kind) + ')');
  else {
    const nat = d.nation('terriens'); nat.res.materials = 4; nat.res.energy = 4; const ac0 = nat.acLeft;
    let err = null, rr = null;
    try { rr = d.act('terriens', { type: 'call', fn: 'buyMarket', args: ['cm_calm'] }); } catch (e) { err = e; }
    if (err) ko('driver.act a levé : ' + err.message.split('\n')[0]);
    else if (rr && rr.kind === 'action' && rr.civId === 'terriens' && nat.acLeft === ac0) ok('refus propre : c\'est encore son tour, AC intact (' + ac0 + ')');
    else ko('résultat ' + JSON.stringify(rr) + ', AC ' + nat.acLeft + ' (avant ' + ac0 + ')');
    // Et le vrai chemin : la cible choisie sur l'écran arrive par applyCalmTension
    const mo = nat.res.morale;
    let rr2 = null; try { rr2 = d.act('terriens', { type: 'call', fn: 'applyCalmTension', args: ['martiens', 'civic', 3] }); } catch (e) { err = e; }
    if (err) ko('applyCalmTension via le pilote a levé : ' + err.message.split('\n')[0]);
    else if (nat.acLeft === ac0 - 1 && nat.res.morale === Math.min(10, mo + 1)) ok('applyCalmTension via le pilote : −1 AC, +1🙂 (' + mo + ' → ' + nat.res.morale + '), résultat ' + (rr2 && rr2.kind));
    else ko('applyCalmTension via le pilote : AC ' + nat.acLeft + ' (avant ' + ac0 + '), moral ' + nat.res.morale + ' (avant ' + mo + ')');
  }
}


/* ⚠️ AJOUTÉ LE 17/09 (Marc : « corrige … la tension de l'IA qui ne bouge pas »). Une seule règle,
   `calmerPopulation`, pour le joueur ET l'ordinateur ; même garde-fou que la Mission diplomatique. */
console.log('§6 L\'ordinateur qui achète la carte calme SA tension — avant, il payait pour rien');
{
  const { sb, G } = montage();
  const ia = G.ais.find(a => a.civ.id === 'martiens'); ia._isAI = true;
  ia.acLeft = 3; ia.res.materials = 5; ia.res.energy = 5; ia.res.morale = 5;
  sb.setTens('martiens', 'terriens', 8); sb.setTens('martiens', 'jupiteriens', 4);
  const c = vm.runInContext('CIVIC_MARKET.find(x=>x.id==="cm_calm")', sb);
  vm.runInContext('aiBuyCivic(G.ais.find(a=>a.civ.id==="martiens"), CIVIC_MARKET.find(x=>x.id==="cm_calm"))', sb);
  if (sb.getTens('martiens', 'terriens') === 5) ok('elle calme la nation qu\'elle déteste le plus : Terriens 8 → 5'); else ko('Martiens → Terriens : ' + sb.getTens('martiens', 'terriens'));
  if (sb.getTens('martiens', 'jupiteriens') === 4) ok('et pas l\'autre'); else ko('Martiens → Jupitériens touchée : ' + sb.getTens('martiens', 'jupiteriens'));
  if (ia.acLeft === 2 && ia.res.materials === 4 && ia.res.energy === 4 && ia.res.morale === 6) ok('même prix et même moral qu\'un joueur : 1 AC, 1🪨 1⚡, +1🙂');
  else ko('prix IA : AC ' + ia.acLeft + ' 🪨' + ia.res.materials + ' ⚡' + ia.res.energy + ' 🙂' + ia.res.morale);
  void c;
}

console.log('§7 GARDE-FOU — une fois par nation et par tour, comme la Mission diplomatique');
{
  const { sb, G, hum } = montage();
  hum.acLeft = 5; hum.res.materials = 6; hum.res.energy = 6;
  sb.setTens('player', 'martiens', 9); sb.setTens('player', 'jupiteriens', 6);
  sb.applyCalmTension('martiens', 'civic', 3);
  const t1 = sb.getTens('player', 'martiens'), ac1 = hum.acLeft;
  sb.applyCalmTension('martiens', 'civic', 3);
  if (sb.getTens('player', 'martiens') === t1 && hum.acLeft === ac1) ok('la même nation deux fois dans le tour : refusé, rien dépensé (' + t1 + ')');
  else ko('calmée deux fois : ' + t1 + ' → ' + sb.getTens('player', 'martiens'));
  sb.applyCalmTension('jupiteriens', 'civic', 3);
  if (sb.getTens('player', 'jupiteriens') === 3) ok('une autre nation dans le même tour : accepté (6 → 3)'); else ko('Jupitériens : ' + sb.getTens('player', 'jupiteriens'));
  G.turn += 1;
  sb.applyCalmTension('martiens', 'civic', 3);
  if (sb.getTens('player', 'martiens') === t1 - 3) ok('le tour suivant, Martiens de nouveau : ' + t1 + ' → ' + (t1 - 3)); else ko('bloquée au tour suivant : ' + sb.getTens('player', 'martiens'));
}

console.log('§8 La carte DIT quelle tension elle calme');
{
  const { sb } = montage();
  const c = vm.runInContext('CIVIC_MARKET.find(x=>x.id==="cm_calm")', sb);
  const txt = String(c && c.effect || '').replace(/<[^>]+>/g, '');
  if (/TA tension envers/i.test(txt)) ok('« ' + txt + ' »'); else ko('le texte ne dit pas le sens : « ' + txt + ' »');
  const d = vm.runInContext('CIVIC_MARKET.find(x=>x.id==="cm_diplomatie")', sb);
  const txt2 = String(d && d.effect || '').replace(/<[^>]+>/g, '');
  if (/SA tension envers toi/i.test(txt2)) ok('et la Mission dit l\'inverse : « ' + txt2 + ' »'); else ko('la Mission ne dit pas le sens : « ' + txt2 + ' »');
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_calmer_population : tout est vert.');
