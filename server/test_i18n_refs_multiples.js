/* TEST — une liste de références qui COMMENCE par « @ » se rend entière (partie test pirates, 21/09).
   Journal vu : « 🛡️ Routes de 🌍 Terriens immunisées contre les pirates (carte.iadef3.nom,
   @carte.reseau2.nom) ». `_i18nParam` prenait toute la chaîne pour UNE référence dès qu'elle
   commençait par « @ » ; la même faute existait dans `tL` (server.js). C'est la famille du « (reseau2) »
   vu dans BCE3. Usage : node test_i18n_refs_multiples.js */
'use strict';
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
const m = vm.runInContext('_i18nParam("@carte.iadef3.nom, @carte.reseau2.nom")', sb);
if (!/carte\.|@/.test(m) && /IA Défensive/.test(m) && /Réseau Orbital/.test(m)) ok('moteur : ' + m); else ko('moteur : ' + m);
const u = vm.runInContext('_i18nParam("@carte.iadef3.nom")', sb);
if (u === 'IA Défensive') ok('CONTRE-ÉPREUVE, une seule référence : ' + u); else ko('une seule référence : ' + u);
const mail = vm.runInContext('_i18nParam("marc@guerir.ch")', sb);
if (mail === 'marc@guerir.ch') ok('CONTRE-ÉPREUVE, une adresse email reste intacte'); else ko('email abîmé : ' + mail);
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const bloc = src.slice(src.indexOf('function tL('), src.indexOf('function aplatirK('));
const tL = new Function('DICTS', bloc + '\nreturn tL;')({ en: { 'carte.iadef3.nom': 'Defensive AI', 'carte.reseau2.nom': 'Orbital Network' } });
const s = tL('en', 'x', '({v})', { v: '@carte.iadef3.nom, @carte.reseau2.nom' });
if (s === '(Defensive AI, Orbital Network)') ok('serveur : ' + s); else ko('serveur : ' + s);
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
