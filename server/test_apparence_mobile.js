/* ============================================================================
   TEST — LES TROIS DERNIERS ÉLÉMENTS BRUTS DE LA MAQUETTE DU 23/09
   ----------------------------------------------------------------------------
   POURQUOI. Marc a relevé quatre défauts d'apparence sur son Flip 6 et validé une maquette le
   23/09 (« SOLAR — Fenêtres et cartes mobiles »). Le bloc 2, les fenêtres de confirmation, est
   livré en v10.99 (voir `test_fenetre_confirmation.js`). Les trois autres tenaient tous à la
   même cause : des éléments HTML BRUTS, jamais habillés, que le navigateur dessine à sa façon —
   un `<select>`, des `<input type="checkbox">`, et une règle de largeur en pourcentage qui casse
   sous 360 px.

   CE QUE LA MAQUETTE A FIXÉ, et que ce banc verrouille :
     1. CARTES DE NATION — sous 360 px la carte prend TOUTE la largeur et passe à l'horizontale.
        Cause mesurée : `width:46%` + `min-width:140px` + 10 px d'écart. À 320 px le conteneur fait
        264 px et deux cartes en réclament 290 : elles passent à la ligne en gardant 140 px, au
        milieu d'un écran à moitié vide.
     2. CHOIX DU SIÈGE — plus de `<select>` : une liste de boutons de 44 px, pleine largeur,
        chacun avec sa description. L'ancien style plafonnait à `32vw` et ROGNAIT le libellé.
     3. PACTES — plus de case native de 13 px : la ligne entière est la cible, 44 px, case dorée ;
        et les deux boutons sont ceux du jeu (`.fen-btn`), le principal comptant les pactes choisis.

   ⚠️ POURQUOI DES LECTURES DE SOURCE ICI. `online.js` n'est pas chargé par `game-core.js`, et le
   `document` des bancs ne sait pas analyser du HTML : la liste des sièges et les règles CSS ne sont
   donc pas atteignables par le DOM. On les lit dans les fichiers. Le §0 vérifie que ce lecteur
   n'est pas aveugle, en le pointant sur les copies PRÉ-CORRECTION encore présentes dans le lot de
   livraison — s'il n'y retrouve pas les éléments bruts, aucun autre point ne prouve rien.

   Usage : node test_apparence_mobile.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadLogic } = require('./game-core.js');
const RACINE = path.join(__dirname, '..');
const HTML = path.join(RACINE, 'index.html');

const ecarts = [];
const ok = s => console.log('   ✔ ' + s);
const ko = s => { ecarts.push(s); console.log('   ❌ ' + s); };
const note = s => console.log('     ' + s);
const lire = f => { try { return fs.readFileSync(path.join(RACINE, f), 'utf8'); } catch (e) { return null; } };

const INDEX = lire('index.html');
const MOTEUR = lire('moteur.js');
const ONLINE = lire('online.js');

/* La zone de `screenCreate` — c'est là que vivait le menu déroulant. */
function blocSieges(src) {
  if (!src) return '';
  const i = src.indexOf('function screenCreate()');
  return i < 0 ? '' : src.slice(i, i + 3000);
}

console.log('═'.repeat(84));
console.log("APPARENCE MOBILE — PLUS D'ÉLÉMENTS BRUTS DU NAVIGATEUR");
console.log('═'.repeat(84) + '\n');

console.log('0. CONTRE-ÉPREUVE PRÉALABLE — le lecteur retrouve bien les éléments bruts d\'avant');
{
  /* Les copies du lot portent encore l'état pré-correction jusqu'à la prochaine synchronisation :
     c'est notre témoin. Si le lot a déjà été resynchronisé, ce point le dit au lieu de mentir. */
  const av = (() => { try { return fs.readFileSync(path.join(RACINE, 'Pour uploader', 'lot17_maj', 'online.js'), 'utf8'); } catch (e) { return null; } })();
  if (!av) { note('(copie de référence introuvable — point ignoré)'); }
  else if (blocSieges(av).indexOf('<select') !== -1) ok('le lecteur retrouve le <select> dans la copie pré-correction');
  else note('(la copie du lot est déjà à jour : ce témoin a servi, il ne peut plus servir)');
}

console.log('\n1. Cartes de nation : une règle sous 360 px, et le corps de carte qui la rend possible');
{
  if (!MOTEUR || !INDEX) { ko('fichiers illisibles'); }
  else {
    if (/class="civ-corps"/.test(MOTEUR)) ok('la carte a un corps (`.civ-corps`)');
    else ko('pas de `.civ-corps` : la carte ne peut pas se ranger en deux colonnes');

    if (/\.civ-corps\{display:contents\}/.test(INDEX)) ok('au-dessus de 360 px il est transparent — rien ne change');
    else ko('`.civ-corps` n\'est pas en `display:contents` : il modifierait l\'affichage actuel');

    const m = INDEX.match(/@media \(max-width:359px\)\{([\s\S]*?)\n\}/);
    if (!m) { ko('aucune règle `@media (max-width:359px)` — les cartes débordent encore sous 360 px'); }
    else {
      const bloc = m[1];
      note('règle trouvée, ' + bloc.split('\n').length + ' lignes');
      const attendu = [
        ['pleine largeur', /\.civ-card\{[^}]*width:100%/],
        ['deux colonnes', /\.civ-card\{[^}]*display:grid/],
        ['plus de min-width', /\.civ-card\{[^}]*min-width:0/],
        ['corps redevenu bloc', /\.civ-corps\{display:block/],
        ['chiffres sur une ligne', /\.civ-stat\{display:inline-flex/]
      ];
      const manquants = attendu.filter(([, re]) => !re.test(bloc)).map(([nom]) => nom);
      if (manquants.length) ko('la règle est incomplète — manque : ' + manquants.join(', '));
      else ok('pleine largeur, deux colonnes, chiffres sur une ligne');
    }
  }
}

console.log('\n2. Choix du siège : plus de menu déroulant, des lignes de 44 px qui s\'expliquent');
{
  const bloc = blocSieges(ONLINE);
  if (!bloc) { ko('`screenCreate` introuvable dans online.js'); }
  else {
    if (bloc.indexOf('<select') !== -1) ko('le <select> est toujours là');
    else ok('plus de <select> dans l\'écran des sièges');

    /* ⚠️ ON COMPTE LES VALEURS DANS LE TABLEAU, PAS LES ATTRIBUTS. Premier jet : chercher
       `data-v="ai"` dans la source — introuvable, parce que l'attribut est écrit `data-v="${v}"`
       dans un gabarit. Le banc rendait 0 et accusait le code d'avoir perdu les quatre choix. */
    const opts = ['ai', 'host', 'open', 'none'].filter(v => bloc.indexOf("['" + v + "',") !== -1).length;
    note('options trouvées : ' + opts);
    if (opts === 4) ok('les quatre choix sont là (IA, Moi, Humain, Absente)');
    else ko(opts + ' choix au lieu de 4 — un siège ne peut plus être réglé');

    const desc = ['creer.desc_ia', 'creer.desc_moi', 'creer.desc_humain', 'creer.desc_absente'].filter(k => bloc.indexOf(k) !== -1);
    if (desc.length === 4) ok('chaque choix porte sa description');
    else ko('descriptions manquantes : ' + (4 - desc.length));

    if (/\.sc-opt\{[^}]*min-height:44px/.test(ONLINE)) ok('44 px de haut : la cible au doigt');
    else ko('les lignes ne font pas 44 px');

    if (/max-width:32vw/.test(ONLINE)) ko('l\'ancien plafond `32vw` est encore là — il rognait le libellé');
    else ok('le plafond de largeur qui rognait le texte a disparu');
  }
}

console.log('\n3. Pactes : la ligne entière est la cible, et les boutons sont ceux du jeu');
{
  const sb = loadLogic(HTML);
  sb.initGame('terriens', ['martiens', 'jupiteriens', 'ceinturiens']);
  vm.runInContext('_aUnEcran = function(){ return true; };', sb);
  let html = '';
  try { sb.showDiploEventModal(null); } catch (e) { note('(le dessin s\'interrompt : ' + e.message + ')'); }
  const el = sb.document.getElementById('event-choice-modal');
  html = String((el && el.innerHTML) || '');
  if (!html.length) { ko('la fenêtre des pactes n\'a rien écrit — rien n\'est mesuré'); }
  else {
    if (/<input[^>]*type="checkbox"/.test(html)) ko('des cases natives subsistent — 13 px, invisables au doigt');
    else ok('plus une seule case native');

    /* Le nombre d'adversaires est LU sur la partie, pas écrit en dur : un montage à deux IA et un
       banc qui en attend trois se trompe de diagnostic (c'était le cas au premier jet). */
    const adverses = (sb.__G.ais || []).length;
    const lignes = (html.match(/class="pacte-l"/g) || []).length;
    note('lignes de pacte : ' + lignes + ' · nations adverses : ' + adverses);
    if (lignes === adverses) ok('une ligne cliquable par nation adverse');
    else ko(lignes + ' ligne(s) pour ' + adverses + ' adversaire(s)');

    if (/class="fen-btn ok"/.test(html) && /class="fen-btn ghost"/.test(html)) ok('les deux boutons sont ceux du jeu (vert + neutre)');
    else ko('les boutons ne sont pas ceux du jeu');

    if (/style="[^"]*background:#2a2f45/.test(html)) ko('un habillage à la main subsiste sur un bouton');
    else ok('aucune couleur posée à la main sur les boutons');
  }

  /* Le compteur : il doit dire combien de pactes sont choisis, et se taire à zéro. */
  const bouton = sb.document.getElementById('ev-pactes-go');
  if (!bouton) { ko('le bouton de validation est introuvable'); }
  else {
    try { sb._evPacteMajBouton(); } catch (e) { }
    const a0 = String(bouton.textContent || ''); const d0 = !!bouton.disabled;
    vm.runInContext('_evDiploSel={martiens:true};', sb);
    try { sb._evPacteMajBouton(); } catch (e) { }
    const a1 = String(bouton.textContent || ''); const d1 = !!bouton.disabled;
    vm.runInContext('_evDiploSel={martiens:true,jupiteriens:true};', sb);
    try { sb._evPacteMajBouton(); } catch (e) { }
    const a2 = String(bouton.textContent || '');
    note('0 choisi : « ' + a0 + ' » (désactivé ' + d0 + ') · 1 : « ' + a1 + ' » · 2 : « ' + a2 + ' »');
    if (d0 && !d1) ok('désactivé à zéro, actif dès un pacte');
    else ko('le bouton ne suit pas le nombre de pactes (désactivé ' + d0 + ' puis ' + d1 + ')');
    if (/\b1\b/.test(a1) && /\b2\b/.test(a2) && a1 !== a2) ok('il annonce le nombre exact');
    else ko('il n\'annonce pas le nombre : « ' + a1 + ' » puis « ' + a2 + ' »');
  }
}

console.log('\n4. CONTRE-ÉPREUVE — le banc sait voir une case native et un select');
{
  const faux = '<label><input type="checkbox"> x</label><select data-civ="a"><option>y</option></select>';
  const vuCase = /<input[^>]*type="checkbox"/.test(faux);
  const vuSel = faux.indexOf('<select') !== -1;
  if (vuCase && vuSel) ok('les deux éléments bruts sont bien détectés dans un faux');
  else ko('la détection ne fonctionne pas — les points ci-dessus ne prouvent rien');
}

console.log('\n' + '═'.repeat(84));
if (ecarts.length) {
  console.log('❌ ' + ecarts.length + ' écart(s) :');
  for (const e of ecarts) console.log('   · ' + e);
  process.exit(1);
}
console.log('✅ Plus un seul élément brut du navigateur dans les trois écrans de la maquette.');
console.log('═'.repeat(84));
