/* ============================================================================
   TEST — PROTECTION DES ROUTES : UNE SEULE RÈGLE, PARTOUT
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 2026-08-09 : « le lien empathe gère toujours pas les attaques de
   pirates !! Ça considère les routes pas défendues. »

   « Toujours pas » : le 2026-08-08 le même défaut avait été corrigé pour l'ÉVÉNEMENT
   « Prolifération des pirates », et la fonction partagée `routeProtegee` créée pour
   ça. Mais `advancePirates` — l'attaque pirate de CHAQUE fin de tour, qui n'est pas
   l'événement — avait gardé sa propre liste : `ia_immune || intel_2`, sans Lien
   Empathe. Or Lien Empathe RETIRE les jetons des routes (c'est son intérêt : les
   récupérer pour le combat). La technologie fabriquait donc elle-même les routes sans
   jeton que les pirates détruisaient ensuite. Exactement le piège que la correction de
   la veille devait supprimer, à l'endroit oublié.

   Quatre endroits décidaient de la protection des routes, avec quatre listes :
     · l'événement « Prolifération des pirates »   (corrigé le 08)
     · `advancePirates`, fin de chaque tour        ← le défaut signalé
     · l'attaque de route en guerre                (oubliait `intel_2`)
     · le raid d'une IA sur une route              (oubliait `intel_2`)

   CE TEST vérifie que les TROIS technologies protègent, aux QUATRE endroits. Il est
   écrit pour échouer si quelqu'un réintroduit une liste locale.

   Usage : node test_routes_protegees.js
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

const TECHS = [
  { spec: 'ia_immune', nom: 'IA Défensive' },
  { spec: 'empath_routes', nom: 'Lien Empathe' },
  { spec: 'intel_2', nom: 'Réseau Orbital' }
];

/* Une partie où le joueur a des routes SANS jeton — la situation exacte que crée Lien Empathe. */
function partie(spec) {
  const sb = loadLogic(INDEX);
  sb.initGame('terriens', ['martiens']);
  const G = sb.__G, p = G.player;
  /* 21/09 : les pirates PILLENT (1 ressource par route) au lieu de détruire, et seulement à 60 jours
     ou moins des ceintures — trois routes à portée, et un tirage forcé à 0 : chaque jet réussit. */
  p.routes = [{ from: 'phobos', to: 'ceres', tokens: 0 },
              { from: 'ceres', to: 'vesta', tokens: 0 },
              { from: 'phobos', to: 'deimos', tokens: 0 }];
  p.cards = spec ? [{ id: spec + '_x', spec }] : [];
  p.res.energy = 20; p.res.materials = 20; p.res.science = 20;
  G.turn = 9;
  vm.runInContext('Math.random=function(){return 0;}', sb);
  return { sb, G, p };
}
const stock = p => (p.res.energy || 0) + (p.res.materials || 0) + (p.res.science || 0);

console.log('═'.repeat(74));
console.log('PROTECTION DES ROUTES — UNE SEULE RÈGLE, PARTOUT');
console.log('═'.repeat(74) + '\n');

/* ── 0. Le test voit-il vraiment quelque chose ? ──────────────────────────── */
console.log('0. Contrôle du test lui-même');
{
  const { sb, p } = partie(null);   // AUCUNE technologie
  const avant = stock(p);
  sb.advancePirates();
  if (avant - stock(p) === 3) ok('sans technologie, les 3 routes sont bien pillées (−3 ressources — le test mord)');
  else ko('sans technologie, ' + (avant - stock(p)) + ' ressource(s) prise(s) au lieu de 3 : le test ne prouverait rien');
  if (p.routes.length === 3) ok('et aucune route ne tombe (règle du 21/09)'); else ko(3 - p.routes.length + ' route(s) détruites : l\'ancienne règle revient');
}

/* ── 1. Les pirates de FIN DE TOUR — le défaut signalé ────────────────────── */
console.log('\n1. Pirates de fin de tour (advancePirates)');
for (const t of TECHS) {
  const { sb, p } = partie(t.spec);
  const avant = stock(p);
  sb.advancePirates();
  if (stock(p) === avant) ok(t.nom + ' : les routes sans jeton ne sont pas pillées');
  else ko(t.nom + ' : ' + (avant - stock(p)) + ' ressource(s) PILLÉE(S) malgré la technologie');
}

/* ── 2. L'ÉVÉNEMENT « Prolifération des pirates » ─────────────────────────── */
console.log('\n2. Événement « Prolifération des pirates »');
for (const t of TECHS) {
  const { sb, G, p } = partie(t.spec);
  const avant = p.routes.length;
  const ev = vm.runInContext('EVENTS.find(e=>/pirate/i.test(e.name||""))', sb);
  if (!ev) { console.log('   … événement pirate introuvable — étape sautée'); break; }
  try { vm.runInContext('EVENTS.find(e=>/pirate/i.test(e.name||"")).resolve(G)', sb); } catch (e) {}
  if (p.routes.length === avant) ok(t.nom + ' : les routes survivent à l\'événement');
  else ko(t.nom + ' : ' + (avant - p.routes.length) + ' route(s) détruites par l\'événement');
}

/* ── 3 & 4. Les deux listes qui oubliaient Réseau Orbital ─────────────────── */
console.log('\n3. Attaque de route en guerre, et raid d\'une IA');
{
  const src = fs.readFileSync(MOTEUR, 'utf8');
  // Plus aucune liste locale : on cherche les motifs fautifs, pas les bons.
  const listesLocales = [
    /hasSpec\([^)]*,'empath_routes'\)\s*\|\|\s*hasSpec\([^)]*,'ia_immune'\)/,
    /hasSpec\([^)]*,'ia_immune'\)\s*\|\|\s*hasSpec\([^)]*,'intel_2'\)/,
    /hasSpec\([^)]*,'ia_immune'\)\s*\|\|\s*hasSpec\([^)]*,'empath_routes'\)(?!\|\|hasSpec\([^)]*,'intel_2'\))/
  ];
  const trouvees = listesLocales.filter(re => re.test(src.replace(/\s/g, '')) || re.test(src));
  // La définition partagée contient elle-même une de ces formes : on l'exclut.
  const horsDef = src.split('function routesProtegeesParTech').map((bout, i) => i === 0 ? bout : bout.slice(bout.indexOf('}')));
  const dehors = listesLocales.filter(re => horsDef.some(b => re.test(b)));
  if (!dehors.length) ok('aucune liste locale de technologies ne subsiste hors de la définition partagée');
  else ko(dehors.length + ' liste(s) locale(s) subsistent : elles divergeront de nouveau');
  void trouvees;

  const nb = (src.match(/routesProtegeesParTech\(/g) || []).length;
  if (nb >= 4) ok('la règle partagée est appelée à ' + nb + ' endroits');
  else ko('la règle partagée n\'est appelée qu\'à ' + nb + ' endroit(s) : certains décident encore seuls');
}

/* ── 5. Un jeton protège toujours, sans aucune technologie ────────────────── */
console.log('\n4. Le jeton posé réduit le risque (30 % au lieu de 70 %)');
{
  const { sb, p } = partie(null);
  for (const r of p.routes) r.tokens = 1;
  /* 21/09 : un jeton ne rend plus immunisé, il fait passer le risque de 70 % à 30 %. Tirage à 0,5 :
     entre les deux — une route nue serait pillée, une route avec jeton ne l'est pas. */
  vm.runInContext('Math.random=function(){return 0.5;}', sb);
  const avant = stock(p);
  sb.advancePirates();
  if (stock(p) === avant) ok('routes avec jeton : épargnées à un tirage de 0,5 (30 % < 0,5 < 70 %)');
  else ko('des routes défendues par un jeton ont été pillées à un tirage de 0,5');
}

console.log('\n' + '═'.repeat(74));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exitCode = 1; }
else console.log('✅ Routes : les trois technologies protègent, aux quatre endroits.');
console.log('═'.repeat(74));
