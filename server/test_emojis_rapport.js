/* ============================================================================
   TEST — LES ÉMOJIS DU RAPPORT DE PARTIE NE SONT PLUS COUPÉS EN DEUX (01/10/2026)
   ----------------------------------------------------------------------------
   POURQUOI. Rapport de la partie téléphone de Marc (30/09) : « Suprématie Militaire — � Jupitériens
   & � Martiens », « 2⚔ vs 1� ». `_riToText` retirait les émojis de ressources avec une classe de
   caractères SANS le drapeau `u` : en JavaScript, chaque émoji hors plan de base y compte pour deux
   moitiés, et la classe retirait la moitié haute commune à 🪨 et à 🔴, 🌍, 🛡️…
   §1 les émojis de nation et de guerre survivent, sans aucun `�` ni moitié isolée.
   §2 contre-épreuve : les émojis de ressources sont toujours retirés.
   §3 le rapport complet (`buildJournalReport`) ne contient aucune moitié isolée.
   Usage : node test_emojis_rapport.js
   ========================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const moitie = s => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s) || s.includes('�');

const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
sb.initGame('jupiteriens', ['terriens', 'martiens']);
const T = s => vm.runInContext('_riToText(' + JSON.stringify(s) + ')', sb);

console.log('§1 émojis de nation et de guerre');
for (const s of ['Suprématie Militaire — 🔴 Martiens & 🌍 Terriens → +6 VP', '2⚔ vs 1🛡️', '🟠 Jupitériens : 🛡️ épargnée', '⚔️ assaut 🏴 💥 🕊️']) {
  const r = T(s);
  if (moitie(r)) ko('moitié d\'émoji dans « ' + r + ' »');
  else if (/🔴|🌍|🛡/.test(s) && !/🔴|🌍|🛡/.test(r)) ko('émoji perdu : « ' + r + ' »');
  else ok('« ' + r + ' »');
}
console.log('\n§2 contre-épreuve : ressources retirées');
{
  const r = T('+1🪨 +2⚡ +3🔬 🏗️ ⬆️ 🙂');
  if (/🪨|⚡|🔬|🏗|⬆|🙂/.test(r) || moitie(r)) ko('reste : « ' + r + ' »'); else ok('« ' + r + ' »');
  const r2 = T('⚔️ guerre');
  if (r2.includes('⚔️')) ok('⚔️ garde son sélecteur de variante'); else ko('⚔️ abîmé : « ' + r2 + ' »');
}
console.log('\n§3 rapport complet');
{
  vm.runInContext(`G.turn=2; _journalAuto(G.player.civ.name,'Événement : Suprématie Militaire','Suprématie Militaire — 🟠 Jupitériens & 🔴 Martiens → +6 VP');
    _journalAuto('Terriens','Capture Europe','sur Martiens — 2⚔ vs 1🛡️',true);`, sb);
  const rap = vm.runInContext('buildJournalReport()', sb);
  const txt = typeof rap === 'string' ? rap : JSON.stringify(rap);
  if (!txt.includes('Suprématie Militaire')) ko('ligne d\'événement absente du rapport (montage)');
  else if (moitie(txt)) ko('moitié d\'émoji dans le rapport');
  else ok('aucune moitié d\'émoji, 🔴 présent : ' + txt.includes('🔴'));
}
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ émojis du rapport : tout est vert');
process.exit(ecarts.length ? 1 : 0);
