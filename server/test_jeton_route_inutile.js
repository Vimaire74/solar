/* ============================================================================
   TEST — PAS DE JETON SUR UNE ROUTE QUE LA TECHNOLOGIE PROTÈGE DÉJÀ
   ----------------------------------------------------------------------------
   POURQUOI. Marc, partie 1E11 (26/09) : « J'ai IA défensive depuis un moment, et depuis
   que je l'ai, quand je construis des routes, le jeu ne me donne plus le choix de mettre
   ou pas un jeton. Ça met un jeton automatiquement et clairement, dans les jetons, on voit
   que deux sont alloués à des routes et ça devrait pas. »

   IL A RAISON SUR LE FAIT, PAS SUR LA CAUSE. Deux technologies se télescopent :
     · 🌀 Hyperpropulsion (`hyper3`, spec `route_force_free`) pose le jeton D'OFFICE et
       gratuitement, et supprime la fenêtre de choix. C'est elle, pas l'IA Défensive.
     · 🛡️ IA Défensive (`iadef3`, spec `ia_immune`) rend toutes les routes protégées SANS
       jeton — sa carte le dit : « Rappelle tes jetons des routes ».
   Les deux ensemble : le jeu pose d'office un jeton qui ne sert plus à rien.
   `chancePillagePirates` rend 0, `attackEnemyRoute` refuse la cible, `updateConnections`
   connecte avec ou sans jeton. Le jeton n'a AUCUN effet — et il occupe une place visible
   dans le bandeau de force (points gris « déployé sur une route ») et dans `armadaCompte`.

   OÙ LA RÈGLE MANQUAIT. `routesProtegeesParTech(p)` existe depuis le 09/08 et sert déjà à
   quatre endroits (événement pirate, pirates de fin de tour, attaque de route en guerre,
   raid sur route). Les portes qui POSENT un jeton ne la consultaient pas :
     · `deployerJetonSurRoute` — la porte commune, aucun test ;
     · `doEstablishRoute`, branche humaine — pose le jeton gratuit d'office ;
     · `doEstablishRoute`, branche ordinateur — pose le jeton gratuit AVANT d'appeler
       `protegerRouteIA`, ce qui court-circuite `ordinateurProtegeSesRoutes`, laquelle teste
       pourtant correctement la protection par technologie ;
     · `routeManageDeploy` — le bouton « ⚔️ Déployer » reste proposé sur la carte.
   Le rappel écrit dans `applyCard` (`ia_immune` / `empath_routes`) n'agit qu'UNE fois, à
   l'achat : rien n'empêchait les jetons de revenir ensuite.

   ⚠️ CE QUI NE DOIT PAS CHANGER. Sans IA Défensive, le jeton gratuit d'Hyperpropulsion
   SERT (pillage 70 % → 30 %) et doit rester posé. C'est la correction du 07/08 (partie
   DB55) : cette branche écrivait « gratuite en jeton » sans rien poser, et l'ami de Marc a
   perdu deux routes ainsi dans une partie jouée 103 à 100. Les points 3 et 4 la gardent.

   Usage : node test_jeton_route_inutile.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Une nation martienne : Phobos est à 24 jours de Cérès, donc TOUTE route partant de sa
   capitale est à portée des pirates. Sans cela un « pas de jeton » ne prouverait rien —
   il pourrait venir de la distance, pas de la technologie. */
function montage(opts) {
  opts = opts || {};
  const sb = loadLogic(HTML);
  sb.initGame('martiens', ['terriens']);
  const G = sb.__G;
  G.turn = 6; G.phase = 'actions';
  const nat = opts.ia ? G.ais[0] : G.player;
  if (opts.ia) { nat._isAI = true; nat._profil = 'batisseur'; } else { nat._isAI = false; }
  nat.acLeft = 4; nat.res.materials = 10; nat.res.energy = 10; nat.res.science = 8;
  nat.forceTokens = 5;
  (opts.specs || []).forEach(function (s) {
    const c = vm.runInContext('CARDS_POOL.find(c=>c.spec==="' + s + '"||c.spec2==="' + s + '")', sb);
    if (c) nat.cards.push(c); else ko('carte de spec ' + s + ' introuvable (montage)');
  });
  const home = nat.civ.home;
  const voisins = vm.runInContext('NODES["' + home + '"].conn.slice()', sb);
  const to = voisins.find(v => !G.ais.concat([G.player]).some(p => p.colonies.some(c => c.nodeId === v))) || voisins[0];
  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  return { sb, G, nat, home, to };
}

const route = (nat, a, b) => (nat.routes || []).find(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));
const construire = m => {
  if (m.nat._isAI) m.sb.appliquerCoup(m.nat, { type: 'route', from: m.home, to: m.to });
  else { try { m.sb.doEstablishRoute(m.home, m.to, m.nat); } catch (e) { note('(dessin interrompu : ' + e.message + ')'); } }
  return route(m.nat, m.home, m.to);
};
const journal = m => (m.G.log || []).map(e => String(e.msg || '')).join(' | ');
const portee = m => vm.runInContext('routeAPorteeDesPirates({from:"' + m.home + '",to:"' + m.to + '"})', m.sb);

console.log('═'.repeat(84));
console.log('JETON DE ROUTE — INUTILE QUAND LA TECHNOLOGIE PROTÈGE DÉJÀ');
console.log('═'.repeat(84) + '\n');

console.log('0. Le montage place bien la route à portée des pirates');
{
  const m = montage({});
  if (portee(m)) ok('route ' + m.home + '→' + m.to + ' à portée : un « pas de jeton » voudra dire quelque chose');
  else ko('route hors de portée — tous les points suivants seraient vrais pour la mauvaise raison');
}

console.log('\n1. Humain, Hyperpropulsion + IA Défensive : aucun jeton posé');
{
  const m = montage({ specs: ['route_force_free', 'ia_immune'] });
  const avant = m.nat.forceTokens;
  const r = construire(m);
  note('jetons sur la route : ' + (r ? r.tokens : 'route ABSENTE') + ' · réserve ' + avant + ' → ' + m.nat.forceTokens);
  if (!r) ko('route non construite — le point ne mesure rien');
  else if ((r.tokens || 0) > 0) ko('un jeton est posé sur une route déjà immunisée — c\'est le défaut de la partie 1E11');
  else ok('la route reste à 0 jeton : rien d\'immobilisé pour rien');
}

console.log('\n2. Le bandeau de force ne montre plus de jeton « sur route »');
{
  /* C'est ce que Marc VOIT : les points gris du bandeau comptent `r.tokens`, et
     `armadaCompte` les additionne aussi — un jeton gratuit gonflait le compte de l'agenda
     ⚔️ Armada Solaire à partir de rien. */
  const m = montage({ specs: ['route_force_free', 'ia_immune'] });
  const armadaAvant = m.sb.armadaCompte(m.nat);
  construire(m);
  const surRoutes = (m.nat.routes || []).filter(r => (r.tokens || 0) > 0).length;
  const armadaApres = m.sb.armadaCompte(m.nat);
  note('routes portant un jeton : ' + surRoutes + ' · armadaCompte ' + armadaAvant + ' → ' + armadaApres);
  if (surRoutes > 0) ko(surRoutes + ' route(s) affichent un jeton déployé dans le bandeau');
  else if (armadaApres !== armadaAvant) ko('le compte Armada Solaire a bougé sans qu\'aucun jeton soit payé');
  else ok('aucun point gris, et le compte Armada ne gonfle pas');
}

console.log('\n2b. Ordinateur, Hyperpropulsion + IA Défensive : aucun jeton non plus');
{
  /* `ordinateurProtegeSesRoutes` refuse DÉJÀ correctement quand une technologie protège —
     mais la branche `route_force_free` de `doEstablishRoute` posait le jeton AVANT de
     l'appeler. Le garde-fou existait et était contourné. */
  const m = montage({ ia: true, specs: ['route_force_free', 'ia_immune'] });
  const avant = m.nat.forceTokens;
  const r = construire(m);
  note('jetons sur la route : ' + (r ? r.tokens : 'route ABSENTE') + ' · réserve ' + avant + ' → ' + m.nat.forceTokens);
  if (!r) ko('route non construite par l\'ordinateur — le point ne mesure rien');
  else if ((r.tokens || 0) > 0) ko('l\'ordinateur pose un jeton inutile — son propre garde-fou est court-circuité');
  else ok('l\'ordinateur laisse la route nue : elle est déjà immunisée');
}

console.log('\n3. CONTRE-ÉPREUVE — Hyperpropulsion SEULE : le jeton gratuit reste posé');
{
  /* Sans ce point, on « corrigerait » en supprimant le jeton gratuit pour tout le monde, et
     on rejouerait le défaut du 07/08 : route annoncée protégée, pillée par les pirates. */
  const m = montage({ specs: ['route_force_free'] });
  const avant = m.nat.forceTokens;
  const r = construire(m);
  note('jetons sur la route : ' + (r ? r.tokens : 'route ABSENTE') + ' · réserve ' + avant + ' → ' + m.nat.forceTokens);
  if (!r) ko('route non construite — le point ne mesure rien');
  else if (!((r.tokens || 0) > 0)) ko('le jeton gratuit d\'Hyperpropulsion a disparu — la route est pillable');
  else if (m.nat.forceTokens !== avant) ko('le jeton gratuit a été prélevé sur la réserve — il n\'est plus gratuit');
  else ok('jeton posé, réserve intacte : « gratuit en jetons » tient toujours');
}

console.log('\n4. CONTRE-ÉPREUVE — sans aucune de ces technologies, le choix est rendu au joueur');
{
  const m = montage({});
  const r = construire(m);
  const modale = m.sb.document.getElementById('route-token-modal');
  const ouverte = !!modale && !String(modale.className || '').includes('hidden');
  note('jetons sur la route : ' + (r ? r.tokens : 'ABSENTE') + ' · fenêtre de choix ' + (ouverte ? 'ouverte' : 'FERMÉE'));
  if (!r) ko('route non construite — le point ne mesure rien');
  else if ((r.tokens || 0) > 0) ko('un jeton a été posé sans que le joueur ait choisi');
  else if (!ouverte) ko('la fenêtre « déployer un jeton ? » ne s\'ouvre plus — le choix a disparu');
  else ok('la fenêtre s\'ouvre, la route attend la réponse');
}

console.log('\n5. Sur une route déjà construite, « Déployer » est refusé quand c\'est inutile');
{
  const m = montage({ specs: ['ia_immune'] });
  m.nat.routes.push({ from: m.home, to: m.to, tokens: 0 });
  m.sb.__setRouteManageIdx ? m.sb.__setRouteManageIdx(m.nat.routes.length - 1) : vm.runInContext('_routeManageIdx=' + (m.nat.routes.length - 1) + ';', m.sb);
  const avantAC = m.nat.acLeft, avantJ = m.nat.forceTokens;
  try { m.sb.routeManageDeploy(); } catch (e) { note('(dessin interrompu : ' + e.message + ')'); }
  const r = route(m.nat, m.home, m.to);
  note('jetons ' + (r && r.tokens) + ' · AC ' + avantAC + ' → ' + m.nat.acLeft + ' · réserve ' + avantJ + ' → ' + m.nat.forceTokens);
  if (r && (r.tokens || 0) > 0) ko('un jeton a été déployé à la main sur une route immunisée');
  else if (m.nat.acLeft !== avantAC) ko('l\'action a coûté 1 AC pour ne rien faire');
  else ok('refusé sans rien prélever');
}

console.log('\n6. Le journal nomme la bonne technologie');
{
  /* `route_force_free` appartient à 🌀 Hyperpropulsion. « IA de Navigation » est `nav2`
     (spec `nav2_war`, coût de guerre ÷2) : deux cartes différentes. */
  const m = montage({ specs: ['route_force_free'] });
  construire(m);
  const j = journal(m);
  if (/IA de Navigation/i.test(j)) ko('le journal attribue le jeton gratuit à « IA de Navigation » — c\'est Hyperpropulsion');
  else if (/Hyperpropulsion/i.test(j)) ok('le journal dit Hyperpropulsion');
  else ko('aucune technologie nommée dans la ligne du jeton gratuit — journal : ' + j.slice(0, 200));
}

console.log('\n7. CONTRE-ÉPREUVE — le banc sait voir un jeton');
{
  const faux = { routes: [{ from: 'a', to: 'b', tokens: 1 }] };
  const vu = faux.routes.filter(r => (r.tokens || 0) > 0).length;
  if (vu === 1) ok('un jeton posé est bien lu comme tel');
  else ko('la lecture des jetons ne fonctionne pas — les points ci-dessus ne prouvent rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Un jeton n\'est posé sur une route que lorsqu\'il y sert à quelque chose.');
console.log('═'.repeat(84));
