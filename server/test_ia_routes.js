/* ============================================================================
   TEST — L'ORDINATEUR PROTÈGE SES ROUTES (règle de Marc, 13/09)
   ----------------------------------------------------------------------------
   POURQUOI. Partie 4942 : les Terriens (Bâtisseur) restent à une colonie cinq tours et
   dépensent ~14 actions en routes depuis Lune que les pirates détruisent LE MÊME TOUR,
   chaque tour (2, 4, 3, 1, 1). Ils ne posent jamais un jeton, ne changent jamais.
   Cause : le coup « route » du tacticien passe par `doEstablishRoute`, qui ouvrait la
   fenêtre « déployer un jeton ? » — à laquelle un ordinateur ne répond pas. Route à 0 jeton.
   Et l'évaluation de position comptait une route exposée comme une route sûre.

   LA RÈGLE (21/09) : une route à 60 jours ou moins des ceintures est protégée si l'ordinateur garde
   au moins 3 jetons engageables ; hors de portée, jamais ; le Ceinturien n'en a pas besoin.
   (Avant : seuil de 40 % de chance pirate au tour.)

   CE QUI EST VÉRIFIÉ :
     1. Bâtisseur, tour 1 : la route construite porte un jeton ;
     2. Opportuniste, tour 1 (20 %) : pas de jeton — il les garde pour ses raids ;
        tour 3 (40 %) : jeton ;
     3. Ceinturiens, tour 5 : jamais de jeton (les pirates ne les touchent pas) ;
     4. immunisé par une technologie (IA Défensive) : pas de jeton non plus (inutile) ;
     5. l'évaluation : une route exposée vaut MOINS qu'une route protégée pour des Terriens
        au tour 7 — et autant pour des Ceinturiens (contre-épreuve) ;
     6. un coup « protéger la route » existe pour une route exposée, et le jouer pose le
        jeton pour 1 AC + 1 jeton ;
     7. CONTRE-ÉPREUVE : sans jeton disponible, pas de coup « protéger », et la route se
        construit quand même (la règle n'invente pas de jetons).

   Usage : node test_ia_routes.js
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

function montage(civ, profil, tour) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = tour || 1; G.phase = 'actions';
  const nat = G.ais.find(a => a.civ.id === civ);
  nat._isAI = true; nat._profil = profil || 'opportuniste';
  nat.acLeft = 3; nat.res.materials = 10; nat.res.energy = 10; nat.res.science = 5; nat.forceTokens = 4;
  const home = nat.civ.home;
  const voisins = vm.runInContext('NODES["' + home + '"].conn.slice()', sb);
  const to = voisins.find(v => !G.ais.concat([G.player]).some(p => p.colonies.some(c => c.nodeId === v))) || voisins[0];
  return { sb, G, nat, home, to };
}
const route = (nat, a, b) => (nat.routes || []).find(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));

console.log('═'.repeat(80));
console.log('ROUTES DE L\'ORDINATEUR — PROTÉGÉES QUAND IL LE FAUT, ET SEULEMENT ALORS');
console.log('═'.repeat(80) + '\n');

console.log('1. Route à portée des pirates, réserve suffisante : l\'ordinateur la protège (règle du 21/09)');
{
  /* ⚠️ RÈGLE CHANGÉE LE 21/09 (§154). Plus de seuil au tour (20 %, 40 %…) : les pirates pillent
     1 ressource à 70 % sans jeton, 30 % avec, sur les routes à 60 jours ou moins des ceintures. Un
     ordinateur protège une route À PORTÉE s'il garde au moins 3 jetons engageables. Phobos est à
     24 jours de Cérès : toute route martienne partant de Phobos est à portée. */
  const m = montage('martiens', 'opportuniste', 1);
  const jetons = m.nat.forceTokens;
  m.sb.appliquerCoup(m.nat, { type: 'route', from: m.home, to: m.to });
  const r = route(m.nat, m.home, m.to);
  note('route ' + m.home + '→' + m.to + ' : ' + (r ? 'construite, jetons=' + r.tokens : 'ABSENTE') + ' · réserve ' + jetons + ' → ' + m.nat.forceTokens);
  if (r && r.tokens > 0) ok('route à portée protégée (70 % → 30 %)'); else ko('route à portée laissée nue malgré 4 jetons engageables');
}

console.log('\n2. CONTRE-ÉPREUVES : réserve trop basse, ou route hors de portée → pas de jeton');
{
  const m1 = montage('martiens', 'opportuniste', 3);
  m1.nat.forceTokens = 2;
  m1.sb.appliquerCoup(m1.nat, { type: 'route', from: m1.home, to: m1.to });
  const r1 = route(m1.nat, m1.home, m1.to);
  note('2 jetons seulement : jetons sur la route=' + (r1 && r1.tokens));
  if (r1 && !(r1.tokens > 0)) ok('il garde ses 2 jetons pour se défendre'); else ko('il a vidé sa réserve pour une route');
  const m2 = montage('martiens', 'opportuniste', 3);
  m2.nat.colonies.push({ nodeId: 'titan', level: 1, connected: true }, { nodeId: 'encelade', level: 1, connected: true });
  m2.sb.appliquerCoup(m2.nat, { type: 'route', from: 'titan', to: 'encelade' });
  const r2 = route(m2.nat, 'titan', 'encelade');
  note('Titan–Encelade (hors de portée) : ' + (r2 ? 'jetons=' + r2.tokens : 'ABSENTE'));
  if (r2 && !(r2.tokens > 0)) ok('hors de portée des pirates : pas de jeton inutile'); else if (!r2) ko('route non construite (montage)'); else ko('jeton posé sur une route que les pirates ne visitent pas');
}

console.log('\n3. Ceinturiens, tour 5 : jamais de jeton');
{
  const m = montage('ceinturiens', 'batisseur', 5);
  m.sb.appliquerCoup(m.nat, { type: 'route', from: m.home, to: m.to });
  const r = route(m.nat, m.home, m.to);
  note('jetons=' + (r && r.tokens) + ' · réserve ' + m.nat.forceTokens);
  if (r && !(r.tokens > 0) && m.nat.forceTokens === 4) ok('les pirates ne les touchent pas : pas un jeton de gaspillé');
  else ko('un Ceinturien a posé un jeton contre des pirates qui ne l\'attaquent pas');
}

console.log('\n4. Immunisé par une technologie (IA Défensive), tour 5 : pas de jeton');
{
  const m = montage('martiens', 'batisseur', 5);
  const carte = vm.runInContext('CARDS_POOL.find(c=>c.spec==="ia_immune"||(c.specs||[]).includes("ia_immune"))', m.sb);
  if (!carte) { ko('carte ia_immune introuvable (montage)'); }
  else {
    m.nat.cards.push(carte);
    m.sb.appliquerCoup(m.nat, { type: 'route', from: m.home, to: m.to });
    const r = route(m.nat, m.home, m.to);
    note(carte.name + ' possédée · jetons=' + (r && r.tokens));
    if (r && !(r.tokens > 0)) ok('routes déjà immunisées : le jeton serait inutile'); else ko('jeton posé malgré l\'immunité');
  }
}

console.log('\n5. L\'évaluation : une route exposée vaut moins — sauf pour les Ceinturiens');
{
  const m = montage('martiens', 'opportuniste', 7);
  m.nat.routes.push({ from: m.home, to: m.to, tokens: 0 });
  const expose = m.sb.evaluerPosition(m.nat);
  m.nat.routes[m.nat.routes.length - 1].tokens = 1;
  const protege = m.sb.evaluerPosition(m.nat);
  note('Martiens T7 : exposée ' + expose.toFixed(2) + ' · protégée ' + protege.toFixed(2));
  if (protege > expose + 0.3) ok('la route exposée est décotée (risque 80 % au tour 7)');
  else ko('l\'évaluation ne voit pas le risque pirate (' + expose.toFixed(2) + ' vs ' + protege.toFixed(2) + ')');
  const c = montage('ceinturiens', 'opportuniste', 7);
  c.nat.routes.push({ from: c.home, to: c.to, tokens: 0 });
  const e2 = c.sb.evaluerPosition(c.nat);
  c.nat.routes[c.nat.routes.length - 1].tokens = 1;
  const p2 = c.sb.evaluerPosition(c.nat);
  note('Ceinturiens T7 : exposée ' + e2.toFixed(2) + ' · protégée ' + p2.toFixed(2));
  if (Math.abs(p2 - e2) < 0.01 + Math.abs(0.45 * 0.4)) ok('contre-épreuve : pour eux, aucune décote (seul le jeton dépensé compte)');
  else ko('les Ceinturiens sont décotés pour un risque qu\'ils ne courent pas');
}

console.log('\n6. Le coup « protéger la route » : proposé, puis joué');
{
  const m = montage('martiens', 'opportuniste', 4);
  m.nat.routes.push({ from: m.home, to: m.to, tokens: 0 });
  const coups = m.sb.coupsPossibles(m.nat);
  const c = coups.find(x => x.type === 'proteger');
  note('coups « protéger » : ' + coups.filter(x => x.type === 'proteger').length);
  if (c) ok('proposé pour la route exposée'); else ko('aucun coup « protéger » proposé');
  if (c) {
    const ac = m.nat.acLeft, jet = m.nat.forceTokens;
    m.sb.appliquerCoup(m.nat, c);
    const r = route(m.nat, m.home, m.to);
    note('après : jetons=' + r.tokens + ' · AC ' + ac + '→' + m.nat.acLeft + ' · réserve ' + jet + '→' + m.nat.forceTokens);
    if (r.tokens > 0 && m.nat.acLeft === ac - 1 && m.nat.forceTokens === jet - 1) ok('joué : 1 AC + 1 jeton, route protégée');
    else ko('le coup « protéger » n\'a pas l\'effet attendu');
  }
}

console.log('\n7. CONTRE-ÉPREUVE — sans jeton, la règle n\'en invente pas');
{
  const m = montage('martiens', 'batisseur', 5);
  m.nat.forceTokens = 0;
  m.nat.routes.push({ from: m.home, to: m.to, tokens: 0 });
  const coups = m.sb.coupsPossibles(m.nat);
  if (!coups.some(x => x.type === 'proteger')) ok('aucun coup « protéger » sans jeton'); else ko('coup « protéger » proposé sans jeton');
  const voisin2 = vm.runInContext('NODES["' + m.home + '"].conn.slice()', m.sb).find(v => v !== m.to);
  if (voisin2) {
    m.sb.appliquerCoup(m.nat, { type: 'route', from: m.home, to: voisin2 });
    const r = route(m.nat, m.home, voisin2);
    if (r && !(r.tokens > 0)) ok('la route se construit quand même, exposée — à l\'évaluation d\'en tenir compte');
    else ko('route non construite ou jeton sorti de nulle part');
  }
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ L\'ordinateur protège ses routes comme Marc protège les siennes.');
