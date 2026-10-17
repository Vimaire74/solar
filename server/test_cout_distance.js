/* ============================================================================
   TEST — UNE CONQUÊTE LOINTAINE COÛTE PLUS D'ACTIONS
   ----------------------------------------------------------------------------
   RÈGLE (proposée par Laurent, calibrée avec Marc le 16/09). Conquérir coûtait UNE action, que la
   cible soit la lune d'à côté ou l'autre bout du système. Le coût suit maintenant le TEMPS DE
   VOYAGE, qui était déjà sur la carte mais ne servait qu'à l'affichage :
        moins de 60 jours → 1 action · de 60 à 150 → 2 · plus de 150 → 3 (plafond volontaire).
   Le voyage part de la colonie CONNECTÉE la plus proche — une colonie isolée ne ravitaille rien, et
   les routes ne servent pas de point de départ. L'Hyperpropulsion retire 1 action (minimum 1).

   POURQUOI CE PLAFOND À 3. En prolongeant les paliers de 60, Lune↔Triton (346 j à l’époque, 306 depuis v10.70) coûterait
   6 actions alors que le maximum du jeu est 5 : l'attaque deviendrait impossible au lieu d'être
   chère. À 3, elle reste jouable pour qui a développé son gouvernement, et hors de portée au
   niveau 1 (2 AC) — ce qui protège les débuts de partie sans règle supplémentaire.

   CE QUI EST VÉRIFIÉ : le barème sur des trajets réels de la carte, le point de départ (connectée
   seulement), l'effet d'une colonie avancée, le rabais d'Hyperpropulsion, le PRÉLÈVEMENT réel des
   actions, et le refus quand on n'a pas de quoi payer.
   Usage : node test_cout_distance.js
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
  sb.initGame('terriens', ['jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = 6; G.phase = 'actions';
  G.player._isAI = false; G.ais.forEach(a => a._isAI = true);
  G.player.acLeft = 5; G.player.acMax = 5;
  G.player.forceTokens = 10; G.player.res = { energy: 15, materials: 15, science: 8, morale: 9 };
  return { sb, G, moi: G.player };
}
const cout = (m, n) => vm.runInContext('coutAssautAC(G.player,"' + n + '")', m.sb);
const jours = (m, n) => vm.runInContext('joursVersCible(G.player,"' + n + '")', m.sb);

console.log('§1 Le barème sur des trajets réels, depuis la Lune seule');
{
  const m = montage();
  // v10.70 : Ganymède–Triton (190 j) existe — Lune→Triton passe de 346 j (par Titan) à 307 j ; Titan
  // passe de 196 à 197 j (Cérès mène à Europe et non plus à Ganymède). Les coûts en actions ne bougent pas.
  const cas = [['phobos', 54, 1], ['deimos', 52, 1], ['ceres', 58, 1], ['vesta', 70, 2], ['io', 113, 2], ['titan', 197, 3], ['triton', 307, 3]];
  for (const [n, j, ac] of cas) {
    const jr = jours(m, n), c = cout(m, n);
    if (jr === j && c === ac) ok(n.padEnd(8) + String(jr).padStart(3) + ' j → ' + c + ' action(s)');
    else ko(n + ' : ' + jr + ' j → ' + c + ' action(s) (attendu ' + j + ' j → ' + ac + ')');
  }
}

console.log('§2 Les seuils exacts : 59 j = 1, 60 j = 2, 150 j = 2, 151 j = 3');
{
  const m = montage();
  const r = vm.runInContext(`(function(){
    const p=G.player; const vrai=joursVersCible;
    const essai=[]; for(const j of [0,59,60,150,151,400]){
      joursVersCible=function(){return j;}; essai.push([j,coutAssautAC(p,'titan')]);
    }
    joursVersCible=vrai; return essai;
  })()`, m.sb);
  const attendu = { 0: 1, 59: 1, 60: 2, 150: 2, 151: 3, 400: 3 };
  for (const [j, c] of r) {
    if (c === attendu[j]) ok(String(j).padStart(3) + ' j → ' + c + ' action(s)');
    else ko(j + ' j → ' + c + ' au lieu de ' + attendu[j]);
  }
}

console.log('§3 On part d\'une colonie CONNECTÉE, jamais d\'une colonie isolée');
{
  const m = montage();
  const avant = cout(m, 'io');
  vm.runInContext('G.player.colonies.push({nodeId:"vesta",level:1,connected:false})', m.sb);
  const isolee = cout(m, 'io');
  vm.runInContext('G.player.colonies=G.player.colonies.map(c=>c.nodeId==="vesta"?{nodeId:"vesta",level:1,connected:true}:c)', m.sb);
  const reliee = cout(m, 'io');
  note('Io : depuis la Lune ' + avant + ' · Vesta isolée ' + isolee + ' · Vesta reliée ' + reliee);
  if (isolee === avant) ok('une colonie isolée ne raccourcit rien (' + avant + ' action(s))');
  else ko('la colonie isolée a changé le coût : ' + avant + ' → ' + isolee);
  if (reliee < avant) ok('une colonie reliée rapproche la cible (' + avant + ' → ' + reliee + ')');
  else ko('la colonie reliée ne change rien : ' + reliee);
}

console.log('§4 L\'Hyperpropulsion retire une action, sans jamais descendre sous 1');
{
  const m = montage();
  const avantLoin = cout(m, 'titan'), avantPres = cout(m, 'phobos');
  vm.runInContext('G.player.cards.push({id:"hyper3",name:"Hyperpropulsion"})', m.sb);
  const apresLoin = cout(m, 'titan'), apresPres = cout(m, 'phobos');
  if (apresLoin === avantLoin - 1) ok('Titan : ' + avantLoin + ' → ' + apresLoin + ' action(s)');
  else ko('Titan : ' + avantLoin + ' → ' + apresLoin + ' (attendu ' + (avantLoin - 1) + ')');
  if (apresPres === 1) ok('Phobos reste à 1 action (plancher respecté)');
  else ko('Phobos : ' + apresPres + ' au lieu de 1');
}

console.log('§5 Le prélèvement RÉEL correspond au coût annoncé');
{
  const m = montage();
  const cible = G0 => null;
  /* une colonie ennemie lointaine et une proche, chez la même nation, pour comparer */
  vm.runInContext('G.ais[0].colonies.push({nodeId:"titan",level:1,connected:true},{nodeId:"ceres",level:1,connected:true}); updateConnections(G.ais[0]);', m.sb);
  for (const [n, attendu] of [['ceres', 1], ['titan', 3]]) {
    const m2 = montage();
    vm.runInContext('G.ais[0].colonies.push({nodeId:"' + n + '",level:1,connected:true}); updateConnections(G.ais[0]);', m2.sb);
    const c = cout(m2, n);
    const av = m2.moi.acLeft;
    m2.sb.attackColony(n, m2.moi);
    const paye = av - m2.moi.acLeft;
    if (c === attendu && paye === attendu) ok(n.padEnd(6) + ' annoncé ' + c + ', prélevé ' + paye);
    else ko(n + ' : annoncé ' + c + ', prélevé ' + paye + ' (attendu ' + attendu + ')');
  }
}

console.log('§6 Sans assez d\'actions, l\'assaut lointain est refusé et rien n\'est dépensé');
{
  const m = montage();
  vm.runInContext('G.ais[0].colonies.push({nodeId:"titan",level:1,connected:true}); updateConnections(G.ais[0]);', m.sb);
  m.moi.acLeft = 2;                                  // Titan coûte 3
  const av = m.moi.acLeft, avL = m.G.log.length;
  m.sb.attackColony('titan', m.moi);
  const lignes = m.G.log.slice(0, m.G.log.length - avL).map(e => String((e && e.msg) || e));
  const refus = lignes.find(x => /besoin de 3 AC/.test(x));
  if (refus) ok('refus explicite : « ' + refus.replace(/<[^>]+>/g, '') + ' »');
  else ko('aucun refus lisible : ' + JSON.stringify(lignes.slice(0, 3)));
  if (m.moi.acLeft === av) ok('aucune action dépensée'); else ko('actions dépensées malgré le refus : ' + av + ' → ' + m.moi.acLeft);
}

console.log('§7 Le cerveau IA ne propose pas un assaut qu\'il ne peut pas payer');
{
  const m = montage();
  vm.runInContext('G.ais[0].colonies.push({nodeId:"titan",level:1,connected:true}); updateConnections(G.ais[0]);', m.sb);
  const r = vm.runInContext(`(function(){
    const ia=G.ais[1]; ia._isAI=true; ia.res={energy:12,materials:12,science:6,morale:8}; ia.forceTokens=8;
    ia.acLeft=1; const a=coupsPossibles(ia).filter(c=>c.type==='assaut').map(c=>c.coutAC||1);
    ia.acLeft=5; const b=coupsPossibles(ia).filter(c=>c.type==='assaut').map(c=>c.coutAC||1);
    return {a:a, b:b};
  })()`, m.sb);
  note('à 1 action : ' + JSON.stringify(r.a) + ' · à 5 actions : ' + JSON.stringify(r.b));
  if (r.a.every(x => x <= 1)) ok('à 1 action, seuls les assauts à 1 action sont proposés');
  else ko('assauts trop chers proposés à 1 action : ' + JSON.stringify(r.a));
  if (r.b.length >= r.a.length) ok('à 5 actions, au moins autant de cibles');
  else ko('moins de cibles avec plus d\'actions : ' + JSON.stringify(r.b));
}

console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   - ' + e)); process.exit(1); }
console.log('✅ test_cout_distance : conquérir loin coûte plus d\'actions, et le prix annoncé est celui qui est payé.');
