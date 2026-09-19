/* ============================================================================
   i18n.js — LANGUE DU JOUEUR : CHOIX, CHARGEMENT, TEXTES STATIQUES (18/09/2026)
   ----------------------------------------------------------------------------
   PRINCIPE (Marc, 18/09) : « les traductions séparées des fichiers de jeu, mais appelées en fonction
   de la langue de l'utilisateur ; il faut qu'on puisse ensuite traduire en allemand, espagnol et
   probablement chinois ».

   COMMENT ÇA MARCHE
   · Le FRANÇAIS reste écrit dans le code, à sa place : `t('cle', 'Texte français', {params})`.
     Sans dictionnaire (ou clé absente), c'est ce texte-là qui s'affiche — le jeu en français ne
     dépend d'AUCUN fichier de langue, et une traduction manquante se voit (elle reste en français)
     au lieu de casser quelque chose.
   · Une autre langue = UN fichier `lang/<code>.js` qui pose `window.SOLAR_LANG_DICT = { cle: 'texte' }`.
     Ajouter l'allemand, c'est écrire `lang/de.js` et ajouter 'de' à SUPPORTED ci-dessous. Rien d'autre.
   · Le choix : localStorage `sc_lang` (le sélecteur de l'accueil), sinon la langue du navigateur,
     sinon le français. Changer de langue recharge la page : tout est rendu depuis le début.
   · Le HTML statique d'index.html porte `data-i18n="cle"` : le texte français reste dans la balise,
     `i18nAppliquerDom()` le remplace au chargement si le dictionnaire connaît la clé.
     `data-i18n-ph` fait de même pour un placeholder, `data-i18n-title` pour un title.
   · `t()` LUI-MÊME vit dans moteur.js, pas ici : le serveur charge moteur.js seul (game-core.js)
     et doit pouvoir rendre les textes. Ici : le choix de langue et le chargement du dictionnaire,
     qui doivent avoir lieu AVANT moteur.js (d'où `document.write`, synchrone, dans l'ordre des
     <script> — un fetch asynchrone arriverait après le premier rendu).
   · `scripts/i18n_extract.js` liste toutes les clés (code + HTML) avec leur français dans
     `lang/_source.fr.json` : c'est ce fichier qu'on donne à traduire, et il dit quelles clés
     manquent encore dans chaque `lang/<code>.js`.
   ========================================================================== */
(function(){
  var SUPPORTED = ['fr','en'];           // + 'de','es','zh' quand lang/<code>.js existe
  var NOMS = {fr:'Français', en:'English', de:'Deutsch', es:'Español', zh:'中文'};
  var lang = null;
  /* `?lang=xx` dans l'adresse l'emporte sur tout (bancs, tutoriel sous jsdom, un lien à envoyer) —
     sans rien mémoriser : la préférence du joueur reste celle du sélecteur. */
  try{ var _m = /[?&]lang=([a-z]{2})\b/.exec(location.search || ''); if(_m && SUPPORTED.indexOf(_m[1]) >= 0) lang = _m[1]; }catch(e){}
  if(!lang){ try{ lang = localStorage.getItem('sc_lang'); }catch(e){} }
  if(!lang || SUPPORTED.indexOf(lang) < 0){
    var nav = String((typeof navigator!=='undefined' && (navigator.language || (navigator.languages||[])[0])) || 'fr').slice(0,2).toLowerCase();
    lang = SUPPORTED.indexOf(nav) >= 0 ? nav : 'fr';
  }
  window.SOLAR_LANG = lang;
  window.SOLAR_LANGS = SUPPORTED.slice();
  window.SOLAR_LANG_NOMS = NOMS;
  try{ document.documentElement.lang = lang; }catch(e){}
  /* Le dictionnaire, AVANT moteur.js. Le français n'en a pas : ses textes sont dans le code. */
  if(lang !== 'fr'){
    document.write('<script src="lang/' + lang + '.js"><\/script>');
  }
})();
/* Change la langue et recharge : tout se rend depuis le début dans la nouvelle langue. */
function i18nChoisir(code){
  try{ localStorage.setItem('sc_lang', code); }catch(e){}
  try{ location.reload(); }catch(e){}
}
/* Le sélecteur : « FR · EN · … », la langue courante en clair. À poser où l'on veut (accueil, connexion). */
function i18nSelecteurHTML(){
  var cur = window.SOLAR_LANG || 'fr', L = window.SOLAR_LANGS || ['fr'];
  return '<span class="i18n-sel" role="group" aria-label="Langue">' + L.map(function(c){
    return '<button type="button" class="i18n-btn' + (c===cur?' on':'') + '" onclick="i18nChoisir(\'' + c + '\')" ' + (c===cur?'aria-current="true" ':'') + 'title="' + (window.SOLAR_LANG_NOMS[c]||c) + '">' + c.toUpperCase() + '</button>';
  }).join('<span class="i18n-dot">·</span>') + '</span>';
}
/* Les textes statiques du HTML : `data-i18n`, `data-i18n-ph` (placeholder), `data-i18n-title`. */
function i18nAppliquerDom(racine){
  if(typeof t !== 'function') return;
  var D = (typeof SOLAR_LANG_DICT !== 'undefined' && SOLAR_LANG_DICT) || null;
  if(!D) return;                          // français : rien à faire, le texte est déjà dans la page
  var R = racine || document;
  R.querySelectorAll('[data-i18n]').forEach(function(el){ var k=el.getAttribute('data-i18n'); if(D[k]!==undefined) el.innerHTML = D[k]; });
  R.querySelectorAll('[data-i18n-ph]').forEach(function(el){ var k=el.getAttribute('data-i18n-ph'); if(D[k]!==undefined) el.setAttribute('placeholder', D[k]); });
  R.querySelectorAll('[data-i18n-title]').forEach(function(el){ var k=el.getAttribute('data-i18n-title'); if(D[k]!==undefined){ el.setAttribute('title', D[k]); if(el.hasAttribute('aria-label')) el.setAttribute('aria-label', D[k]); } });
  R.querySelectorAll('a[href]').forEach(function(a){ var h=a.getAttribute('href'), h2=i18nPage(h); if(h2!==h) a.setAttribute('href', h2); });
}
/* LES PAGES TRADUITES À PART (règles, confidentialité) : une page par langue, `regles.en.html` à côté
   de `regles.html`. `i18nPage('regles.html')` rend le nom à ouvrir dans la langue courante — le
   français si la page n'existe pas dans cette langue. Le tutoriel, lui, est UNE page (tutorial.html)
   qui se traduit par le dictionnaire : rien à faire pour lui. */
var I18N_PAGES = { 'regles.html': ['en'], 'confidentialite.html': ['en'] };
function i18nPage(href){
  var lang = window.SOLAR_LANG || 'fr'; if(lang === 'fr' || !href) return href;
  var m = /^([a-z]+)\.html(.*)$/.exec(href); if(!m) return href;
  var L = I18N_PAGES[m[1] + '.html']; if(!L || L.indexOf(lang) < 0) return href;
  return m[1] + '.' + lang + '.html' + m[2];
}
if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ i18nAppliquerDom(); });
  else i18nAppliquerDom();
  /* Les liens fabriqués APRÈS le chargement (écran de connexion, lobby — online.js les écrit en
     innerHTML) : on corrige l'adresse au moment du clic, en phase de capture, avant que le navigateur
     ne suive le lien. Couvre aussi target=_blank. */
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if(!a) return;
    var h = a.getAttribute('href'), h2 = i18nPage(h); if(h2 !== h) a.setAttribute('href', h2);
  }, true);
}
