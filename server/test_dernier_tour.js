/* ============================================================================
   TEST — RIEN NE NAÎT AU DERNIER TOUR (partie F04B, 06/09)
   ----------------------------------------------------------------------------
   Tour 10 de F04B : la tension Ceinturiens → Jupitériens atteint 10 PENDANT la fin du tour.
   Guerre populaire déclarée, −6 de moral pour Claude, fenêtre « Combat de guerre » posée… et
   deux lignes plus loin « la guerre s'éteint sans vainqueur ». Même tour, 📅 Initiative planifiée
   tirée par le Jupitérien pour un tour 11 qui n'existe pas.

   RÈGLES VERROUILLÉES ICI :
     1. au dernier tour, la tension à 10 ne déclare PAS de guerre populaire (une ligne le dit),
        ni entre deux autres nations ni avec la nation active — et le reste du tour continue
        (les manifestations sont toujours calculées) ;
     2. CONTRE-ÉPREUVE — à l'avant-dernier tour, la même tension déclare bien la guerre ;
     3. 📅 Initiative planifiée n'est pas dans la pioche Stratégie du dernier tour, et y est encore
        à l'avant-dernier ;
     4. un humain PEUT toujours déclarer une guerre lui-même au dernier tour.

   Usage : node test_dernier_tour.js
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

function partie(tour) {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  const G = sb.__G; G.turn = tour; G.phase = 'actions';
  return { sb, G, moi: G.player };
}
const par = (G, id) => [G.player].concat(G.ais).find(p => p.civ.id === id);
/* ⚠️ ADAPTÉ LE 17/09. Ce grief était « deux technologies de rang 3 = +4 par tour » : cette règle
   n'existe plus (l'avance technologique se juge en relatif, tous les deux tours, après l'événement —
   `griefTechnologique`). Pour qu'une tension posée à 10 TIENNE à travers `updateTension` (qui
   retire 1 sans grief nouveau), on prend le grief stable qui reste : une route de `y` touchant la
   capitale de `x`, +1 par tour. Même effet, même but — le seuil est atteint pour une raison que le
   jeu prévoit. `grief(x, y)` : x en veut à y. */
function grief(sb, x, y) { y.routes.push({ from: x.civ.home, to: y.civ.home, tokens: 0 }); }
const guerre = (G, a, b) => (G.wars || []).some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));

console.log('═'.repeat(80));
console.log('DERNIER TOUR — PAS DE GUERRE POPULAIRE, PAS D\'INITIATIVE PLANIFIÉE');
console.log('═'.repeat(80) + '\n');

console.log('1. Tour 10, tension 10/10 entre deux autres nations → aucune guerre, le tour continue');
{
  const { sb, G, moi } = partie(10);
  const x = par(G, 'martiens'), y = par(G, 'jupiteriens');
  grief(sb, x, y); sb.setTens(x.civ.id, y.civ.id, 10);
  /* Pour vérifier que le tour continue : une troisième tension à 6 doit produire sa manifestation. */
  const z = par(G, 'ceinturiens'); grief(sb, z, x); sb.setTens(z.civ.id, x.civ.id, 6);
  const mz = z.res.morale;
  const av = (G.log || []).length;
  sb.updateTension();
  const lignes = (G.log || []).slice(0, (G.log || []).length - av).map(l => String(l.msg).replace(/<[^>]+>/g, ''));
  note('guerres : ' + ((G.wars || []).map(w => w.a + '↔' + w.b).join(', ') || 'aucune'));
  if (!guerre(G, 'martiens', 'jupiteriens')) ok('pas de guerre populaire au tour 10'); else ko('guerre populaire déclarée au dernier tour');
  const dit = lignes.find(t => /dernier tour/.test(t));
  note('journal : ' + (dit || '—').slice(0, 100));
  if (dit) ok('… et le journal dit pourquoi'); else ko('aucune ligne n\'explique l\'absence de guerre');
  if (z.res.morale < mz) ok('le reste du tour continue : la manifestation des Ceinturiens (6/10) est bien facturée');
  else ko('le tour s\'est arrêté à la guerre refusée : pas de manifestation (' + mz + ' → ' + z.res.morale + ')');
}

console.log('\n2. Tour 10, tension 10/10 AVEC la nation active → aucune guerre non plus');
{
  const { sb, G, moi } = partie(10);
  const y = par(G, 'jupiteriens'); grief(sb, moi, y); sb.setTens(moi.civ.id, y.civ.id, 10);
  const m = moi.res.morale;
  sb.updateTension();
  if (!guerre(G, 'terriens', 'jupiteriens')) ok('pas de guerre populaire du joueur au tour 10'); else ko('guerre populaire du joueur au dernier tour');
  if (moi.res.morale >= m - 1) ok('pas de −2 de guerre populaire (moral ' + m + ' → ' + moi.res.morale + ')'); else ko('le moral a payé une guerre qui n\'a pas eu lieu');
}

console.log('\n3. CONTRE-ÉPREUVE — tour 9 : la même tension déclare la guerre');
{
  const { sb, G } = partie(9);
  const x = par(G, 'martiens'), y = par(G, 'jupiteriens');
  grief(sb, x, y); sb.setTens(x.civ.id, y.civ.id, 10);
  sb.updateTension();
  if (guerre(G, 'martiens', 'jupiteriens')) ok('au tour 9, la guerre populaire éclate comme avant'); else ko('la guerre populaire ne se déclenche plus du tout');
}

console.log('\n4. La pioche Stratégie : 📅 absente au tour 10, présente au tour 9');
{
  const compte = (tour, essais) => {
    let vus = 0;
    for (let i = 0; i < essais; i++) {
      const { sb, G } = partie(tour);
      sb.setDecisionSink(function () {}); G._pendings = [];
      try { sb._runStrategyDraftAfterAnnounce(); } catch (e) { note('draft T' + tour + ' : ' + e.message); }
      if ((G._stratPool || []).some(c => c.id === 'st11')) vus++;
    }
    return vus;
  };
  const v10 = compte(10, 30), v9 = compte(9, 30);
  note('📅 dans la pioche — tour 10 : ' + v10 + '/30 · tour 9 : ' + v9 + '/30');
  if (v10 === 0) ok('jamais au tour 10'); else ko('📅 Initiative planifiée encore proposée au tour 10 (' + v10 + '/30)');
  if (v9 > 0) ok('encore proposée au tour 9'); else ko('📅 a disparu de la pioche même avant le dernier tour');
}

console.log('\n5. Un humain peut encore déclarer la guerre lui-même au tour 10');
{
  const { sb, G, moi } = partie(10);
  const y = par(G, 'jupiteriens');
  const w = sb.declarerGuerre(moi, y, 'test', 'player');
  if (w && guerre(G, 'terriens', 'jupiteriens')) ok('`declarerGuerre` reste ouverte au dernier tour'); else ko('la garde a débordé sur les guerres volontaires');
}

console.log('\n' + '═'.repeat(80));
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s) :'); ecarts.forEach(e => console.log('   · ' + e)); process.exit(1); }
console.log('✅ Au dernier tour, ni guerre populaire ni Initiative planifiée ; avant, tout est inchangé.');
console.log('═'.repeat(80));
