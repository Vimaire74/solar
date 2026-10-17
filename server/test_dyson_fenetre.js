/* ============================================================================
   TEST — QUAND TOUT LE MONDE ACCEPTE LA SPHÈRE, ON TE LE DIT
   ----------------------------------------------------------------------------
   Marc, partie 083E : « j'ai pas eu de fenêtre qui me dit, dans cette partie, que les autres nations
   ont accepté que je construise la Sphère de Dyson, il faudrait que cette fenêtre existe, sinon on
   est dans le doute. J'imagine du moins que tout le monde a accepté puisque je n'ai pas eu de
   guerre ? »
   Il avait raison sur les deux points : tout le monde avait accepté, et il ne pouvait pas le savoir
   autrement qu'en déduisant l'absence de guerre.

   LE DÉFAUT — NEUVIÈME OCCURRENCE D'UN MOTIF CONNU. Le moteur émettait bien la notice
   (`_emitNotice('dyson_build', …, {refusing:[]})`) et `online.js` avait la fenêtre depuis toujours ;
   mais `dyson_build` ne figurait pas dans `_isBlockingNotice` de `driver.js`, si bien que le PILOTE
   l'acquittait lui-même : la réponse partait du serveur, l'écran du joueur ne recevait rien.
   Exactement ce qui était arrivé à `accord_result` et `raid_result` le 23/08.

   RÈGLES VERROUILLÉES ICI :
     1. Sphère construite et acceptée par tous → une fenêtre EST posée, adressée au bâtisseur, et le
        pilote ne la mange pas ;
     2. elle dit qui a accepté (et que personne n'a refusé) ;
     3. CONTRE-ÉPREUVE — avec un refus, c'est une vraie décision (forcer / renoncer), inchangée ;
     4. CONTRE-ÉPREUVE — la fenêtre n'apparaît pas chez une nation d'ordinateur qui bâtit : elle
        n'a pas d'écran, et le pilote répond pour elle ;
     5. le +3⚡ des acceptants est appliqué, une fois et une seule.

   Usage : node test_dyson_fenetre.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { GameDriver } = require('./driver.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

function montage(sieges) {
  const d = new GameDriver(HTML);
  d.boot(sieges, () => {});
  const sb = d.sb, G = sb.__G;
  let r = d.pump(), g = 0;
  while (r && r.kind === 'decision' && g++ < 12) r = d.answer(r.pending.id, {});
  G.phase = 'actions';
  const bat = d.nation('ceinturiens');
  bat.acLeft = 3; bat.res.science = 30; bat.res.materials = 30; bat.res.energy = 30;
  G.branchTiers.mines_energie = 3;
  vm.runInContext("allPlayers().find(n=>n.civ.id==='ceinturiens').cards.push(CARDS_POOL.find(c=>c.id==='extract2'))", sb);
  return { d, sb, G, bat };
}
/* Ce que le PILOTE rend après l'achat : c'est le seul juge — ce qu'il rend part au joueur, ce qu'il
   avale n'existe pas pour lui. */
function apresAchat(m) {
  m.sb.buyTech('dyson3', m.bat);
  const r = m.d.pump();
  return r;
}

console.log('═'.repeat(84));
console.log('SPHÈRE DE DYSON — LE BÂTISSEUR APPREND QUE TOUT LE MONDE A ACCEPTÉ');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 2. Tous acceptent : la fenêtre part quand même ────────────────────── */
console.log('1. Trois ordinateurs acceptent : une fenêtre est posée chez le bâtisseur humain');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true },
                     { civId: 'martiens', isAI: true }, { civId: 'jupiteriens', isAI: true }]);
  const r = apresAchat(m);
  const q = (r && r.pendings || []).find(p => p.kind === 'dyson_build');
  note('le pilote rend : ' + (r && r.kind) + ' · fenêtres : ' + ((r && r.pendings) || []).map(p => p.kind + '@' + p.nation).join(', '));
  if (q) ok('la fenêtre `dyson_build` sort du pilote — elle atteindra l\'écran');
  else ko('aucune fenêtre : le pilote l\'a acquittée lui-même (le défaut de 083E)');
  if (q && q.nation === 'ceinturiens') ok('adressée au bâtisseur');
  else if (q) ko('adressée à ' + q.nation + ' au lieu du bâtisseur');
  if (q && (q.payload.refusing || []).length === 0) ok('elle dit que personne n\'a refusé');
  else if (q) ko('refusing = ' + JSON.stringify(q.payload.refusing));
  if (q && (q.payload.accepting || []).length === 3) ok('et nomme les trois nations qui ont accepté');
  else if (q) ko('accepting = ' + JSON.stringify(q.payload.accepting));
}

/* ── 3. Le partage énergétique est appliqué, une seule fois ────────────────── */
console.log('\n2. Après fermeture, chaque acceptant a bien +3⚡/tour — une fois, pas deux');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true }]);
  const t = m.d.nation('terriens');
  const avant = t.rpt.energy || 0;
  const r = apresAchat(m);
  const q = (r && r.pendings || []).find(p => p.kind === 'dyson_build');
  const pendant = t.rpt.energy || 0;
  if (q) m.d.answer(q.id, {});
  const apres = t.rpt.energy || 0;
  note('revenu ⚡ des Terriens : ' + avant + ' → ' + pendant + ' (fenêtre ouverte) → ' + apres + ' (fermée)');
  if (apres - avant === 3) ok('+3⚡/tour appliqués');
  else ko('écart de ' + (apres - avant) + '⚡ au lieu de 3');
}

/* ── 4. CONTRE-ÉPREUVE — un refus : c'est une DÉCISION, pas une simple info ── */
console.log('\n3. CONTRE-ÉPREUVE — si une nation refuse, le bâtisseur doit choisir (forcer / renoncer)');
{
  const m = montage([{ civId: 'ceinturiens', isAI: false }, { civId: 'terriens', isAI: true }]);
  /* On force le refus : tension au maximum entre la nation d'ordinateur et le bâtisseur. */
  m.sb.setTens('terriens', 'ceinturiens', 10);
  vm.runInContext("dysonReponseNation=function(){return {guerre:true};};", m.sb);
  const r = apresAchat(m);
  const q = (r && r.pendings || []).find(p => p.kind === 'dyson_build');
  note('fenêtre : ' + (q ? ('refusing=' + JSON.stringify(q.payload.refusing) + ' · notice=' + !!q.notice) : 'aucune'));
  if (q && (q.payload.refusing || []).length > 0) ok('la fenêtre annonce le refus');
  else ko('un refus ne produit pas de fenêtre de choix');
  if (q && !q.notice) ok('et c\'est bien une décision (forcer ou renoncer), pas une simple information');
  else if (q) ko('le refus est traité comme une simple information : le bâtisseur ne peut pas renoncer');
}

/* ── 5. CONTRE-ÉPREUVE — un ordinateur bâtisseur ne réclame aucune fenêtre ─── */
console.log('\n4. CONTRE-ÉPREUVE — quand c\'est un ordinateur qui bâtit, aucune fenêtre ne bloque la table');
{
  const m = montage([{ civId: 'ceinturiens', isAI: true }, { civId: 'terriens', isAI: false },
                     { civId: 'martiens', isAI: true }]);
  const r = apresAchat(m);
  const restes = ((r && r.pendings) || []).filter(p => p.kind === 'dyson_build' && p.nation === 'ceinturiens');
  note('fenêtres `dyson_build` adressées à l\'ordinateur bâtisseur : ' + restes.length);
  if (!restes.length) ok('aucune — le pilote répond pour elle, la partie ne se fige pas');
  else ko('une fenêtre attend une nation sans écran : la table entière est bloquée');
  /* L'humain, lui, doit être interrogé sur le monopole ADVERSE (`ai_dyson`) — c'est l'autre chemin,
     vérifié par `test_dyson_immediat`. On contrôle juste qu'il n'a pas été oublié. */
  const pourHumain = ((r && r.pendings) || []).filter(p => p.nation === 'terriens');
  if (pourHumain.length) ok('et l\'humain est bien interrogé de son côté (' + pourHumain.map(p => p.kind).join(', ') + ')');
  else ko('l\'humain n\'a rien reçu alors qu\'un ordinateur s\'arroge le monopole');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le bâtisseur sait ce que les autres ont répondu — il ne le déduit plus de l\'absence de guerre.');
console.log('═'.repeat(84));
