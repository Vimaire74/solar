/* TEST — JOURNAL SANS ÉMOJIS (03/10/2026, Marc : « seul ☠️ pour les pirates et les pastilles des nations »)
   §1 les émojis décoratifs disparaissent du rendu du journal (`_journalHTML`).
   §2 contre-épreuve : ☠️ et les émojis de nation (🌍 🔴 🟠 🟣) restent, sans moitié d'émoji.
   Usage : node test_journal_sans_emoji.js */
'use strict';
const path = require('path'), vm = require('vm');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'index.html'));
sb.initGame('ceinturiens', ['terriens', 'martiens', 'jupiteriens']);
const HTML = lignes => vm.runInContext('_journalHTML(' + JSON.stringify(lignes.map(m => ({ msg: m, turn: 2, civ: null }))) + ')', sb);
const H = lignes => vm.runInContext('_journalHTML(' + JSON.stringify(lignes.map(m => ({ msg: m, turn: 2, civ: null }))) + ')', sb).replace(/<[^>]+>/g, '|');
const r = H(['🏗️ 🌍 Terriens colonise Lune (📈 +1⚡)', '☠️ Pirates — 🛤️ route pillée', '🟣 Ceinturiens 💫 Commerce avec les pirates 🎲', '⚔️ 🔴 Martiens attaque 🟠 Jupitériens 💥 🛡️', '🕵️‍♂️ espionnage 👍🏽 🇫🇷']);
console.log('§1 décoratifs retirés'); console.log('   ' + r);
for (const e of ['🏗', '📈', '🛤', '💫', '🎲', '⚔', '💥', '🛡', '🕵', '👍', '🇫']) (r.includes(e) ? ko : ok)((r.includes(e) ? 'reste ' : 'retiré ') + e);
(HTML(['+1⚡']).includes('ri-energy') ? ok : ko)('⚡ devient l\'icône de ressource');
console.log('§2 gardés');
for (const e of ['☠', '🌍', '🔴', '🟠', '🟣']) (r.includes(e) ? ok : ko)((r.includes(e) ? 'gardé ' : 'PERDU ') + e);
if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|‍|️(?![\s\S]*☠)/.test(r.replace(/☠️/g,''))) ko('reste de séquence (moitié, ZWJ ou sélecteur)'); else ok('aucun reste de séquence');
console.log(ecarts.length ? '\n❌ ' + ecarts.length + ' écart(s)' : '\n✅ test_journal_sans_emoji'); process.exit(ecarts.length ? 1 : 0);
