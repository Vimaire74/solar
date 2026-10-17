/* PACTE DE NON-AGRESSION : +4 VP CHACUN À LA SIGNATURE (Marc, 21/09).
   Et les titres d'actions voyagent avec leur clé (résumé des actions des autres nations en anglais).
   Usage : node test_pacte_vp.js */
'use strict';
const path = require('path'), vm = require('vm');
const { loadLogic } = require('./game-core.js');
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('terriens', ['martiens']);
const G = sb.__G, a = G.player, b = G.ais[0];
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const va = a.tempVP || 0, vb = b.tempVP || 0;
vm.runInContext('poserPacte', sb)(a, b, 4);
if ((a.tempVP || 0) - va === 4 && (b.tempVP || 0) - vb === 4) ok('+4 VP pour chacun'); else ko('VP : ' + ((a.tempVP||0)-va) + ' / ' + ((b.tempVP||0)-vb));
const det = (a._vpDetail || []).slice(-1)[0];
if (det && /Pacte/.test(det.raison)) ok('motif : ' + det.raison); else ko('motif absent');
/* Titre d'action : la clé est gardée à côté du français */
G.turnActions = [];
const c = vm.runInContext('CARDS_POOL', sb)[0];
sb.addAction(c.emoji, vm.runInContext('J', sb)('commun.ref', '{v}', { v: sb._i18nRef(c, 'name') }), 1, {}, '');
const e = G.turnActions.slice(-1)[0];
if (e && e.name_i18n && /^@/.test(e.name_i18n.p.v)) ok('titre de carte rangé avec sa référence : ' + e.name_i18n.p.v); else ko('titre sans clé : ' + JSON.stringify(e));
if (/^@/.test(sb._i18nRef(c, 'effect'))) ok('effet de carte référencé : ' + sb._i18nRef(c, 'effect')); else ko('effet de carte non référencé');
if (ecarts.length) { console.log('❌ ' + ecarts.join(' · ')); process.exit(1); }
console.log('✅ Pacte +4 VP chacun ; titres d\'actions traduisibles.');
