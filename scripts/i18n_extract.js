/* ============================================================================
   scripts/i18n_extract.js — LA LISTE DE TOUT CE QUI SE TRADUIT (18/09/2026)
   ----------------------------------------------------------------------------
   Parcourt index.html, moteur.js, online.js, tutorial.js et relève :
     · t('cle', 'Texte français'…)  et  t("cle", "Texte")     → dans le code
     · data-i18n="cle">Texte<        data-i18n-ph="cle" placeholder="…"   data-i18n-title="cle" title="…"
   Écrit `lang/_source.fr.json` : { cle: "Texte français" } — c'est CE fichier qu'on donne à traduire.
   Puis compare à chaque `lang/<code>.js` : clés manquantes (à traduire) et clés en trop (obsolètes).
   Usage : node scripts/i18n_extract.js            (code de sortie 1 s'il manque des clés dans une langue)
           node scripts/i18n_extract.js --strict   (échoue aussi sur une clé déclarée deux fois avec deux français)
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = path.join(__dirname, '..');
const FICHIERS = ['index.html', 'moteur.js', 'online.js', 'tutorial.js', 'server/server.js', 'server/driver.js'];   // server.js : K(...) et tL(lang, ...) — voir moteur.js `J` et server.js `tL`
const strict = process.argv.includes('--strict');

const cles = {};          // cle → français
const doublons = [];      // même clé, deux français différents
function poser(k, fr, ou) {
  if (cles[k] === undefined) cles[k] = fr;
  else if (cles[k] !== fr) doublons.push(k + '  (' + ou + ')\n      « ' + cles[k] + ' »\n      « ' + fr + ' »');
}
/* Une chaîne JS entre quotes simples ou doubles, avec échappements. */
const STR = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
const reT = new RegExp(`\\b(?:[tJKT]\\(|tL\\(\\s*[^,]+,)\\s*${STR}\\s*,\\s*${STR}`, 'g');   // t('cle','fr') et J('cle','fr') (journal, voir moteur.js)
const deJs = s => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
for (const f of FICHIERS) {
  const p = path.join(RACINE, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  let m;
  while ((m = reT.exec(src))) {
    const k = m[1] !== undefined ? m[1] : m[2];
    const fr = m[3] !== undefined ? m[3] : m[4];
    poser(k, deJs(fr), f);
  }
  /* Le contenu complet de la balise (innerHTML), jusqu'à SA fermeture — pas jusqu'au premier « </ »,
     sinon « 🟢 Facile<br><small>1 adv.</small> » perdait son </small>. */
  const reDom = /<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  while ((m = reDom.exec(src))) poser(m[2], m[3].trim(), f);
  const rePh = /data-i18n-ph="([^"]+)"/g;
  while ((m = rePh.exec(src))) {
    const debut = src.lastIndexOf('<', m.index);
    const balise = src.slice(debut, src.indexOf('>', m.index));
    const ph = /placeholder="([^"]*)"/.exec(balise);
    if (ph) poser(m[1], ph[1], f);
  }
  const reTi = /data-i18n-title="([^"]+)"/g;
  while ((m = reTi.exec(src))) {
    const debut = src.lastIndexOf('<', m.index);
    const balise = src.slice(debut, src.indexOf('>', m.index));
    const ti = /title="([^"]*)"/.exec(balise);
    if (ti) poser(m[1], ti[1], f);
  }
}
/* LES DONNÉES DU JEU (noms de cartes, nations, nœuds…) : elles ne passent pas par t(), elles sont
   traduites dans les tables au chargement (`i18nTraduireDonnees`, moteur.js). Leur liste vient du
   moteur lui-même, chargé dans un bac à sable — une seule description des tables, pas deux. */
try {
  const { loadLogic } = require(path.join(RACINE, 'server', 'game-core.js'));
  const sb = loadLogic(path.join(RACINE, 'index.html'));
  const liste = vm.runInContext('i18nDonneesListe()', sb);
  let nd = 0; for (const e of liste) { if (cles[e.k] === undefined) nd++; poser(e.k, e.fr, 'données du moteur'); }
  console.log('données du moteur : ' + liste.length + ' texte(s) (' + nd + ' clé(s) propres)');
} catch (e) { console.log('⚠️ données du moteur non listées : ' + e.message.split('\n')[0]); }
const tri = Object.keys(cles).sort();
const source = {}; for (const k of tri) source[k] = cles[k];
fs.mkdirSync(path.join(RACINE, 'lang'), { recursive: true });
fs.writeFileSync(path.join(RACINE, 'lang', '_source.fr.json'), JSON.stringify(source, null, 2) + '\n');
console.log('lang/_source.fr.json : ' + tri.length + ' clé(s)');
if (doublons.length) { console.log('\n⚠️ ' + doublons.length + ' clé(s) déclarée(s) avec deux textes français :'); doublons.forEach(d => console.log('   ' + d)); if (strict) process.exit(1); }

/* Chaque langue : charger lang/<code>.js dans un bac à sable et comparer. */
let echec = false;
for (const f of fs.readdirSync(path.join(RACINE, 'lang'))) {
  if (!/^[a-z]{2}\.js$/.test(f)) continue;
  const code = f.slice(0, 2);
  const sb = { window: {} }; sb.globalThis = sb;
  try { vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'lang', f), 'utf8'), sb); } catch (e) { console.log('\n❌ lang/' + f + ' : ' + e.message); echec = true; continue; }
  const D = sb.window.SOLAR_LANG_DICT || sb.SOLAR_LANG_DICT || {};
  const manque = tri.filter(k => D[k] === undefined);
  const trop = Object.keys(D).filter(k => cles[k] === undefined).sort();
  console.log('\n── lang/' + f + ' — ' + Object.keys(D).length + ' traduction(s), ' + manque.length + ' manquante(s), ' + trop.length + ' obsolète(s)');
  if (manque.length) { console.log('   À traduire :'); manque.forEach(k => console.log('   · ' + k + '  ← « ' + cles[k].replace(/\n/g, ' ').slice(0, 90) + ' »')); echec = true; }
  if (trop.length) { console.log('   Obsolètes (plus dans le code) :'); trop.forEach(k => console.log('   · ' + k)); }
  /* Les {params} doivent être les mêmes dans les deux langues : un {n} oublié affiche « {n} » à l'écran. */
  const params = s => (String(s).match(/\{[a-zA-Z_]+\}/g) || []).sort().join(' ');
  const pMauvais = tri.filter(k => D[k] !== undefined && params(D[k]) !== params(cles[k]));
  if (pMauvais.length) { console.log('   ⚠️ Paramètres différents du français :'); pMauvais.forEach(k => console.log('   · ' + k + ' : fr « ' + params(cles[k]) + ' » / ' + code + ' « ' + params(D[k]) + ' »')); echec = true; }
}
process.exit(echec ? 1 : 0);
