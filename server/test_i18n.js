/* ============================================================================
   TEST — t() : le français par défaut, le dictionnaire quand il existe, les paramètres, et l'extracteur
   Usage : node test_i18n.js
   ========================================================================== */
'use strict';
const path = require('path'); const vm = require('vm'); const { execFileSync } = require('child_process');
const { loadLogic } = require('./game-core.js');
const HTML = path.join(__dirname, '..', 'index.html');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };

console.log('§1 Sans dictionnaire (serveur) : le français du code, paramètres remplacés');
{
  const sb = loadLogic(HTML);
  const r = vm.runInContext("[t('x.a','Bonjour {n}',{n:3}), t('x.b','Sans param'), t('x.c'), t('x.d','{a} et {a}',{a:'z'})]", sb);
  if (r[0] === 'Bonjour 3') ok('« Bonjour 3 »'); else ko(r[0]);
  if (r[1] === 'Sans param') ok('sans paramètre'); else ko(r[1]);
  if (r[2] === 'x.c') ok('sans français : la clé (visible, donc corrigeable)'); else ko(r[2]);
  if (r[3] === 'z et z') ok('un paramètre répété est remplacé partout'); else ko(r[3]);
}
console.log('§2 Avec un dictionnaire : la traduction, sinon le français');
{
  const sb = loadLogic(HTML);
  vm.runInContext("globalThis.SOLAR_LANG_DICT={'x.a':'Hello {n}'}", sb);
  const r = vm.runInContext("[t('x.a','Bonjour {n}',{n:3}), t('x.zz','Inconnue')]", sb);
  if (r[0] === 'Hello 3') ok('« Hello 3 »'); else ko(r[0]);
  if (r[1] === 'Inconnue') ok('clé absente du dictionnaire → français'); else ko(r[1]);
}
console.log('§3 L\'extracteur : aucune clé manquante dans les langues livrées, paramètres cohérents');
{
  try { const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'i18n_extract.js')], { encoding: 'utf8' }); ok(out.trim().split('\n').slice(-1)[0]); }
  catch (e) { ko('i18n_extract signale un manque :\n' + String(e.stdout || e.message).split('\n').slice(0, 12).join('\n')); }
}
console.log('');
if (ecarts.length) { console.log('❌ ' + ecarts.length + ' écart(s)'); process.exit(1); }
console.log('✅ test_i18n : t() et l\'extracteur tiennent.');
