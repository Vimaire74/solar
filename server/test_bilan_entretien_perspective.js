/* ============================================================================
   TEST — LE BILAN D'ENTRETIEN EST CELUI DE MA NATION, PAS DE LA DERNIÈRE DE LA LISTE
   ----------------------------------------------------------------------------
   Partie 997D (06/09), Laurent (Terriens, 1 route) lit dans son bilan de fin de tour :
   « 🛤️ Routes (1) : −5⚡ +5🪨 » — et le Jupitérien, lui, a 5 routes.

   CAUSE. `doMaintenance()` boucle sur toutes les nations et PRÉLÈVE juste chez chacune, mais elle
   renvoie un seul objet `result`, réécrit à chaque passage : l'appelant reçoit l'entretien de la
   DERNIÈRE nation de la liste. Ce `result` alimente deux affichages : la section « Entretien » du
   bilan de la nation qui porte la perspective (`G.player` — sur le serveur, le premier siège) et la
   ligne « 💰 Revenus nets » du journal. Les autres nations lisent `_lastMaint`, rempli par nation,
   et sont justes. La caisse est juste ; c'est le tableau qui ment.

   RÈGLES VERROUILLÉES ICI :
     1. `doMaintenance()` rend l'entretien de `G.player` (comme `doRevenues`) : 1 route → 1, pas 5 ;
     2. la ligne « Revenus nets » du journal est calculée avec CET entretien ;
     3. en mode routé, le corps du bilan de `G.player` (`payload.bodies`) dit « Routes (1) … −1⚡ » ;
     4. CONTRE-ÉPREUVE — chaque nation a bien PAYÉ le sien : 1⚡ chez l'humain, 5⚡ chez l'IA aux
        cinq routes (le prélèvement n'a jamais été en cause, il doit le rester).

   Usage : node test_bilan_entretien_perspective.js
   ========================================================================== */
'use strict';
const path = require('path');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'play.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

/* Terriens (humain, perspective serveur) · Ceinturiens (IA) · Jupitériens (IA, DERNIER de la liste,
   5 routes) — l'ordre de 997D. */
function montage() {
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['ceinturiens', 'jupiteriens']);
  const G = sb.__G;
  G.turn = 4; G.phase = 'actions';
  const hum = G.player, cei = G.ais[0], jup = G.ais[1];
  hum._isAI = false; cei._isAI = true; jup._isAI = true;
  for (const n of [hum, cei, jup]) { n.res.energy = 10; n.res.materials = 10; n.res.science = 5; n.res.morale = 6; }
  /* Même nation d'origine, même capitale : les routes restent gratuites à l'entretien colonies. */
  hum.colonies.push({ nodeId: 'ceres', level: 1, connected: true });
  hum.routes = [{ from: 'lune', to: 'ceres', tokens: 0 }];
  jup.routes = ['ceres', 'europe', 'ganymede', 'vesta', 'lune'].map(t => ({ from: 'io', to: t, tokens: 0 }));
  cei.routes = [];
  return { sb, G, hum, cei, jup };
}

console.log('═'.repeat(84));
console.log('BILAN D\'ENTRETIEN — CELUI DE MA NATION, PAS CELUI DE LA DERNIÈRE DE LA LISTE');
console.log('═'.repeat(84) + '\n');

/* ── 1 & 4. Ce que rend doMaintenance, et ce que chacun a payé ─────────────── */
console.log('1. `doMaintenance()` rend l\'entretien du joueur (1 route), et chacun a payé le sien');
{
  const m = montage();
  const eH = m.hum.res.energy, eJ = m.jup.res.energy;
  const r = m.sb.doMaintenance();
  note('routes : humain ' + m.hum.routes.length + ' · Jupitériens ' + m.jup.routes.length + ' · rendu : routeEnergyCost=' + r.routeEnergyCost + ' routeMatGain=' + r.routeMatGain);
  if (r.routeEnergyCost === 1 && r.routeMatGain === 1) ok('le bilan rendu est celui du joueur : 1 route → −1⚡ +1🪨');
  else ko('le bilan rendu dit −' + r.routeEnergyCost + '⚡ +' + r.routeMatGain + '🪨 pour 1 route (c\'est celui de la dernière nation)');
  /* L'humain paie aussi 1⚡ pour Cérès (colonie Nv1 hors capitale, sans Biosphère Autonome). */
  const colH = (m.hum._lastMaint && m.hum._lastMaint.energyCost) || 0;
  note('énergie payée : humain ' + (eH - m.hum.res.energy) + ' (dont ' + colH + ' de colonies) · Jupitériens ' + (eJ - m.jup.res.energy));
  if ((eH - m.hum.res.energy) === colH + 1 && (eJ - m.jup.res.energy) === 5) ok('CONTRE-ÉPREUVE : la caisse est juste — 1⚡ de route chez l\'humain, 5⚡ chez l\'IA');
  else ko('prélèvement faux (humain ' + (eH - m.hum.res.energy) + ', IA ' + (eJ - m.jup.res.energy) + ')');
  if (m.hum._lastMaint && m.hum._lastMaint.routeEnergyCost === 1 && m.jup._lastMaint && m.jup._lastMaint.routeEnergyCost === 5) ok('`_lastMaint` par nation reste exact');
  else ko('`_lastMaint` par nation faux');
}

/* ── 2. La ligne du journal ────────────────────────────────────────────────── */
console.log('\n2. La ligne « Revenus nets » du journal est calculée avec MON entretien');
{
  const m = montage();
  /* Revenus bruts du joueur, puis entretien, puis la ligne — l'enchaînement de `stFinDeTour`. */
  const av = (m.G.log || []).length;
  const revs = m.sb.doRevenues();
  const brutE = revs.energy || 0;
  const maint = m.sb.doMaintenance();
  m.sb._emitNetRevenueLog(maint);
  const j = (m.G.log || []).slice(0, (m.G.log || []).length - av)
    .map(l => String(l.msg).replace(/<i class=ri-energy><\/i>/g, '⚡').replace(/<i class=ri-materials><\/i>/g, '🪨').replace(/<[^>]+>/g, ''));
  const ligne = j.find(t => /Revenus nets/.test(t)) || '';
  /* Référence : MON entretien (`_lastMaint`, exact par nation), pas ce que `doMaintenance` a rendu.
     Un net de 0 n'est pas écrit dans la ligne : absent vaut 0. */
  const mien = m.hum._lastMaint || {};
  const attendu = brutE - (mien.energyCost || 0) - (mien.routeEnergyCost || 0);
  const lu = Number((ligne.match(/([+-]?\d+)⚡/) || [, '0'])[1]);
  note(ligne.slice(0, 90) || '— (pas de ligne)');
  note('brut ⚡ ' + brutE + ' · mon entretien colonies ' + (mien.energyCost || 0) + ' + routes ' + (mien.routeEnergyCost || 0) + ' · attendu net ⚡ ' + attendu + ' · lu ' + lu);
  if (ligne && lu === attendu) ok('le net du journal retire MON entretien (1⚡ de route, pas 5)');
  else ko('le journal dit ' + lu + '⚡ au lieu de ' + attendu);
}

/* ── 3. Le corps du bilan en mode routé ────────────────────────────────────── */
console.log('\n3. En mode routé, le bilan de la nation-perspective dit « Routes (1) … −1⚡ »');
{
  const m = montage();
  m.sb.setDecisionSink(function () {});
  m.G._pendings = [];
  const revs = m.sb.doRevenues();
  const maint = m.sb.doMaintenance();
  m.sb.showEOTModal(maint, revs, null, null);
  const q = (m.G._pendings || []).find(p => p.kind === 'eot');
  const corps = (q && q.payload && q.payload.bodies && q.payload.bodies[m.hum.civ.id]) || '';
  const txt = corps.replace(/<i class=ri-energy><\/i>/g, '⚡').replace(/<i class=ri-materials><\/i>/g, '🪨').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const routes = (txt.match(/Routes \((\d+)\)\s*−(\d+)⚡\s*\+(\d+)🪨/) || []);
  note('bilan du joueur : ' + (routes[0] || '— (pas de ligne Routes)'));
  if (routes[1] === '1' && routes[2] === '1' && routes[3] === '1') ok('« Routes (1) −1⚡ +1🪨 » — ce que Laurent aurait dû lire');
  else ko('le bilan dit « ' + (routes[0] || txt.slice(0, 120)) + ' »');
  const corpsJ = (q && q.payload && q.payload.bodies && q.payload.bodies[m.jup.civ.id]) || '';
  const tJ = corpsJ.replace(/<i class=ri-energy><\/i>/g, '⚡').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (/Routes \(5\)\s*−5⚡/.test(tJ)) ok('et celui des Jupitériens dit bien « Routes (5) −5⚡ »');
  else ko('le bilan des Jupitériens ne dit pas −5⚡ pour 5 routes');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Le bilan d\'entretien est celui de ma nation : ce qui est annoncé est ce que J\'AI payé.');
console.log('═'.repeat(84));
