/* TEST — ROULEAU « BLOQUÉ » ET MODE COMPACT DES TECHNOLOGIES (Marc, 22/09, maquette validée)
   1. une technologie à prérequis manquant porte le mot, une lettre par ligne (`data-bloque`) ;
   2. CONTRE-ÉPREUVE : une technologie achetable n'en porte pas ;
   3. le bouton du mode compact est sous les rivières, et son libellé suit le mode ;
   4. le CSS : le rouleau lit `attr(data-bloque)`, la carte s'atténue sans son rouleau, et le mode
      compact a ses dispositions (une colonne sur téléphone, deux filières sur ordinateur).
   Usage : node test_tech_rouleau_compact.js */
'use strict';
const fs = require('fs'); const path = require('path');
const { loadLogic } = require('./game-core.js');
const ecarts = []; const ok = s => console.log('   ✔ ' + s); const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const sb = loadLogic(path.join(__dirname, '..', 'play.html'));
sb.initGame('terriens', ['martiens']); sb.__G.phase = 'actions';
let html = '';
try { sb.renderTechTree(); html = String((sb.document.getElementById('tech-body') || {}).innerHTML || ''); } catch (e) { ko('renderTechTree : ' + e.message); }
const carte = id => { const k = html.indexOf("showTechDetail('" + id + "')"); return k < 0 ? '' : html.slice(html.lastIndexOf('<div class="tcard', k), k); };
console.log('1. Le mot dans le rouleau');
(/data-bloque="B&#10;L&#10;O&#10;Q&#10;U&#10;É"/.test(carte('bio2')) ? ok : ko)('Biosphère Avancée (prérequis manquant) : « BLOQUÉ », une lettre par ligne');
console.log('2. CONTRE-ÉPREUVE');
(!/data-bloque/.test(carte('bio1')) ? ok : ko)('Biosphère Autonome (achetable) : pas de rouleau');
console.log('3. Le bouton');
(/class="tech-bascule"[^>]*onclick="basculerTechCompact\(\)"/.test(html) && /Mode compact/.test(html) ? ok : ko)('« Mode compact » sous les rivières');
console.log('4. Le CSS');
const css = fs.readFileSync(path.join(__dirname, '..', 'play.html'), 'utf8');
(/\.tcard\.tc-corne::after,\.gcard\.gc-corne::after\{content:attr\(data-bloque\)/.test(css) ? ok : ko)('le rouleau lit data-bloque');
(/\.tcard\.tc-corne>\*,\.gcard\.gc-corne>\*\{opacity:\.72\}/.test(css) ? ok : ko)('la carte s\'atténue, pas son rouleau');
/* 22/09, troisième passe : en compact, les filières prennent l'habillage des ACTIONS (lignes
   `.act-l`, un bloc titré par filière). Une colonne sur téléphone, deux sur ordinateur. */
(/#tech-body\.tech-compact #riv-tech\{display:block\}/.test(css) && /@media \(min-width:600px\)\{\s*#tech-body\.tech-compact #riv-tech\{display:grid;grid-template-columns:1fr 1fr/.test(css) ? ok : ko)('compact : une colonne sur téléphone, deux filières sur ordinateur')
console.log('\n' + (ecarts.length ? '❌ ' + ecarts.length + ' écart(s)' : '✅ tout est vert')); process.exit(ecarts.length ? 1 : 0);
