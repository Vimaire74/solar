/* ============================================================================
   TEST — LES TROIS ESTAMPILLES DE VERSION SONT IDENTIQUES
   ----------------------------------------------------------------------------
   POURQUOI. Marc, 03/09, après une partie : « Versions incohérentes — page : 2026-08-29 · v10.02 ·
   en ligne : 2026-08-29 · v10.02 · moteur : 2026-09-03 · v10.07 — recharge ou renvoie les fichiers
   manquants ». Le jeu lui-même allait bien : `moteur.js` est un fichier séparé chargé par
   `<script src>`, donc il jouait bien la v10.07. C'est l'ÉTIQUETTE de la page et d'`online.js` que
   j'avais laissée derrière — cinq versions de suite (v10.03 → v10.07), en ne bougeant que
   `moteur.js` à chaque livraison.

   ⚠️ ET L'AVERTISSEMENT EXISTAIT DÉJÀ. `online.js` portait, en toutes lettres à côté de la
   constante : « À BOUGER EN MÊME TEMPS QUE index.html : resté à v8.1 pendant huit versions ».
   Le même oubli, déjà commis, déjà commenté — et recommis. **Un commentaire n'est pas un garde-fou.**
   C'est exactement la leçon de `FONCTIONS_MOTEUR_REQUISES` (§64) : écrire l'avertissement ne suffit
   pas à le lire. Ce banc est la version qui mord.

   CE QU'IL VÉRIFIE. Les trois estampilles que l'écran de connexion compare :
     · `window.SOLAR_BUILD_HTML` — index.html
     · `SOLAR_BUILD_JS`          — online.js
     · `SOLAR_BUILD_MOTEUR`      — moteur.js
   Plus la version du cache `sw.js`, qui doit être montée elle aussi, faute de quoi les téléphones
   resservent l'ancien jeu depuis leur cache — le défaut le plus pénible à diagnostiquer à distance.

   Usage : node test_versions.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
/* 03/10 (Marc) : chaque envoi = un dossier neuf (lot18, lot18-1, lot18-2…) — on vérifie le plus récent. */
/* Le dossier d'envoi a été renommé « A uploader » (03/10) ; l'ancien nom reste accepté. */
const _DOSSIER_ENVOI = ['A uploader', 'Pour uploader'].find(n => { try { return fs.statSync(path.join(RACINE, n)).isDirectory(); } catch (e) { return false; } }) || 'A uploader';
const LOT = (() => { try { const d = fs.readdirSync(path.join(RACINE, _DOSSIER_ENVOI)).filter(n => /^lot18(-\d+)?$/.test(n));
  d.sort((x, y) => (+(x.split('-')[1] || 0)) - (+(y.split('-')[1] || 0))); return d.pop() || 'lot18'; } catch (e) { return 'lot18'; } })();

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);

const lire = f => { try { return fs.readFileSync(path.join(RACINE, f), 'utf8'); } catch (e) { return null; } };
/* On lit le TEXTE des fichiers, pas des valeurs déjà chargées : c'est ce que le navigateur
   téléchargera, et c'est là que l'oubli se produit. */
function estampille(contenu, motif) {
  if (!contenu) return null;
  const m = contenu.match(motif);
  return m ? m[1] : null;
}

console.log('═'.repeat(84));
console.log('VERSIONS — LES TROIS ESTAMPILLES DOIVENT DIRE LA MÊME CHOSE');
console.log('═'.repeat(84) + '\n');

const html = estampille(lire('index.html'), /window\.SOLAR_BUILD_HTML\s*=\s*'([^']+)'/);
const js   = estampille(lire('online.js'),  /const\s+SOLAR_BUILD_JS\s*=\s*'([^']+)'/);
const mot  = estampille(lire('moteur.js'),  /const\s+SOLAR_BUILD_MOTEUR\s*=\s*'([^']+)'/);
const sw   = estampille(lire('sw.js'),      /const\s+VERSION\s*=\s*'([^']+)'/);

/* ── 1. Les trois estampilles du jeu ───────────────────────────────────────── */
console.log('1. index.html, online.js et moteur.js annoncent la même version');
{
  note('page   : ' + (html || 'INTROUVABLE'));
  note('en ligne : ' + (js || 'INTROUVABLE'));
  note('moteur : ' + (mot || 'INTROUVABLE'));
  if (!html || !js || !mot) ko('une estampille est introuvable — le format a changé, ce banc doit suivre');
  else if (html === js && js === mot) ok('les trois concordent — l\'écran de connexion restera silencieux');
  else {
    const d = [];
    if (html !== mot) d.push('page ≠ moteur');
    if (js !== mot) d.push('en ligne ≠ moteur');
    if (html !== js) d.push('page ≠ en ligne');
    ko('divergence : ' + d.join(', ') + ' — Marc verra « Versions incohérentes »');
  }
}

/* ── 2. Le cache du service worker suit, sinon les téléphones gardent l'ancien jeu ── */
console.log('\n2. sw.js porte une version de cache accordée à la livraison');
{
  note('cache : ' + (sw || 'INTROUVABLE'));
  if (!sw) { ko('version de cache introuvable dans sw.js'); }
  else {
    /* On ne compare pas les deux chaînes — elles n'ont pas le même format (`v128-2026-09-03` contre
       `2026-09-03 · v10.07`). On exige seulement que la DATE soit la même : c'est ce qui prouve
       qu'on a bien touché les deux au même moment. */
    const dSw = (sw.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const dMot = (mot && (mot.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]) || null;
    note('date du cache : ' + dSw + ' · date du moteur : ' + dMot);
    if (dSw && dMot && dSw === dMot) ok('le cache a été monté en même temps que le moteur');
    else ko('le cache date du ' + dSw + ' et le moteur du ' + dMot + ' — les téléphones resserviront l\'ancien jeu');
  }
}

/* ── 3. CONTRE-ÉPREUVE — ce banc sait-il seulement rougir ? ────────────────── */
console.log('\n3. CONTRE-ÉPREUVE — le banc détecte bien une divergence');
{
  /* ⚠️ SANS CE POINT, UN BANC QUI NE TROUVE RIEN (motif cassé, fichier renommé) passerait au vert
     éternellement — et c'est précisément le genre de garde-fou muet qui a laissé passer le défaut
     qu'il est censé attraper. On lui donne une divergence fabriquée et on exige qu'il la voie. */
  const faux = "window.SOLAR_BUILD_HTML='2026-01-01 · v1.00';";
  const lu = estampille(faux, /window\.SOLAR_BUILD_HTML\s*=\s*'([^']+)'/);
  if (lu === '2026-01-01 · v1.00') ok('la lecture d\'estampille fonctionne sur un cas connu');
  else ko('le motif de lecture ne reconnaît plus le format — ce banc serait aveugle');
  if (lu !== mot) ok('et une version différente est bien vue comme différente');
  else ko('deux versions distinctes sont jugées identiques');
}

/* ── 4. La livraison contient les fichiers estampillés ─────────────────────── */
console.log('\n4. Le lot de livraison porte les mêmes estampilles que les sources');
{
  /* Le message d'erreur de Marc dit « renvoie les fichiers manquants » : le cas où l'on met à jour
     les sources mais où le lot uploadé garde les anciens fichiers est exactement celui-ci. */
  const lot = f => { try { return fs.readFileSync(path.join(RACINE, _DOSSIER_ENVOI, LOT, f), 'utf8'); } catch (e) { return null; } };
  const lHtml = estampille(lot('index.html'), /window\.SOLAR_BUILD_HTML\s*=\s*'([^']+)'/);
  const lJs   = estampille(lot('online.js'),  /const\s+SOLAR_BUILD_JS\s*=\s*'([^']+)'/);
  const lMot  = estampille(lot('moteur.js'),  /const\s+SOLAR_BUILD_MOTEUR\s*=\s*'([^']+)'/);
  if (lHtml === null && lJs === null && lMot === null) {
    note('pas de lot18 dans cette copie — point ignoré');
    ok('rien à vérifier ici');
  } else {
    note('lot : page ' + lHtml + ' · en ligne ' + lJs + ' · moteur ' + lMot);
    if (lHtml === html && lJs === js && lMot === mot) ok('le lot est bien synchronisé avec les sources');
    else ko('le lot porte d\'autres estampilles que les sources — livraison incomplète');
  }
}

console.log('\n5. Les notices des lots annoncent la même version que le code');
{
  /* ⚠️ MARC, 26/09 : « C'est la version 10.95 en ligne, c'est pas la dernière ? » Le README du lot
     annonçait v10.83 alors que le lot était en v11.00 — périmé de huit versions. C'est le fichier
     qu'on lit pour savoir ce qu'on a envoyé : périmé, il fait croire à une mise en ligne qui n'a
     pas eu lieu. Il est donc vérifié ici, comme les trois estampilles du code.
     ⚠️ ON NE PREND PAS « LA PREMIÈRE VERSION TROUVÉE » : le README parle de la v10.95 dans son
     commentaire d'en-tête, et son historique cite toutes les versions passées. On exige une LIGNE
     DE DÉCLARATION nommée (« CE LOT EST EN » ou « À UPLOADER »), et on lit la version dedans. */
  const NOTICES = [
    /* Lot 18 depuis le 30/09 : lot17 et lot17_maj sont des archives figées en v11.06, non vérifiées. */
    path.join(_DOSSIER_ENVOI, LOT, 'README.md')
  ];
  const attenduV = (mot || '').split('·').pop().trim();
  const attenduSw = (sw || '').split('-')[0];
  note('code : ' + attenduV + ' · cache ' + attenduSw);
  let vues = 0;
  for (const rel of NOTICES) {
    const txt = lire(rel);
    if (txt === null) { note(rel + ' : absent — ignoré'); continue; }
    vues++;
    const ligne = txt.split('\n').find(l => /CE LOT EST EN|À UPLOADER/.test(l));
    if (!ligne) { ko(rel + " n'a pas de ligne de déclaration de version — on ne peut pas savoir ce qui a été envoyé"); continue; }
    const mv = ligne.match(/\bv(\d+\.\d+)\b/);
    const ms = ligne.match(/sw[^v]{0,14}(v\d+)/i);
    const v = mv ? 'v' + mv[1] : null;
    note(rel + ' : ' + (v || 'AUCUNE VERSION') + ' · cache ' + (ms ? ms[1] : '?'));
    if (v !== attenduV) ko(rel + ' annonce ' + v + ' alors que le code est en ' + attenduV);
    else if (!ms || ms[1] !== attenduSw) ko(rel + ' annonce le cache ' + (ms ? ms[1] : '?') + ' au lieu de ' + attenduSw);
  }
  if (!vues) { note('aucune notice de lot dans cette copie'); ok('rien à vérifier ici'); }
  else if (!ecarts.length) ok('les ' + vues + ' notices disent ' + attenduV + ' et le cache ' + attenduSw);
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  console.log('\n   Les trois estampilles se montent ENSEMBLE : index.html ligne 9, online.js ligne 4,');
  console.log('   moteur.js ligne 7 — plus la version de cache de sw.js.');
  process.exit(1);
}
console.log('✅ Les trois estampilles concordent, le cache suit, et le lot livré porte les mêmes.');
console.log('═'.repeat(84));
