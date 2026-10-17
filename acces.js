/* acces.js — PORTE D'ENTRÉE DE play.html SUR LE SITE (13/10/2026, demande de Marc)
   La racine de solar-game.com est la page de présentation publique ; le jeu (play.html) n'est
   ouvert qu'aux testeurs qui connaissent le mot de passe. Le mot de passe est vérifié par le
   serveur (POST /api/acces), qui rend un jeton gardé dans le navigateur (localStorage
   « solar-acces ») ; online.js l'envoie à la connexion WebSocket. Marc le change dans /stats.
   - APPLI ANDROID (Capacitor) et fichier local / localhost : AUCUNE porte.
   - Jeton déjà présent : on entre tout de suite, puis on le vérifie ; s'il est périmé (mot de
     passe changé), la porte revient. Serveur injoignable avec un jeton : on laisse jouer (solo hors ligne).
   Chargé dans le <head> de play.html, AVANT le reste : la page reste masquée tant que la porte est fermée. */
(function () {
  var cap = window.Capacitor;
  var natif = !!(cap && ((typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) || (cap.platform && cap.platform !== 'web')))
    || location.protocol === 'capacitor:' || location.protocol === 'ionic:';
  var local = location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(location.hostname || '');
  if (natif || local) return;

  var API = 'https://live.solar-game.com/api/acces';
  var CLE = 'solar-acces';
  var fr = String(window.SOLAR_LANG || (function(){ try { return localStorage.getItem('sc_lang'); } catch (e) { return ''; } })() || navigator.language || 'fr').toLowerCase().indexOf('fr') === 0;
  var T = fr
    ? { txt: 'Accès réservé aux testeurs du jeu en ligne.', ph: 'Mot de passe', ok: 'Entrer', ret: "Retour à l'accueil",
        faux: 'Mot de passe incorrect.', trop: 'Trop d’essais. Réessaie dans dix minutes.', nc: "L'accès n'est pas encore ouvert.",
        res: 'Serveur injoignable pour le moment. Réessaie dans quelques secondes.' }
    : { txt: 'Access reserved for online game testers.', ph: 'Password', ok: 'Enter', ret: 'Back to home',
        faux: 'Wrong password.', trop: 'Too many attempts. Try again in ten minutes.', nc: 'Access is not open yet.',
        res: 'Server unreachable right now. Try again in a few seconds.' };
  function lire() { try { return localStorage.getItem(CLE) || ''; } catch (e) { return ''; } }
  function ecrire(j) { try { if (j) localStorage.setItem(CLE, j); else localStorage.removeItem(CLE); } catch (e) {} }

  var css = document.createElement('style');
  css.textContent =
    'html.acces-ferme body>*:not(#acces-porte){visibility:hidden!important}'
    + '#acces-porte{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:#070718 url(assets/fond_accueil_desk.jpg) center/cover no-repeat;font-family:"Exo 2",system-ui,sans-serif;color:#e6ebf7}'
    + '@media (max-aspect-ratio:1/1){#acces-porte{background-image:url(assets/fond_accueil_phone.jpg);background-position:center 30%}}'
    + '#acces-porte::before{content:"";position:absolute;inset:0;background:rgba(7,7,24,.6)}'
    + '#acces-porte form{position:relative;width:min(380px,100%);background:rgba(10,14,36,.82);border:1px solid rgba(110,150,230,.28);border-radius:18px;padding:30px 26px;text-align:center;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}'
    + '#acces-porte h2{margin:0 0 8px;font:400 26px "Michroma",sans-serif;letter-spacing:.25em;padding-left:.25em}'
    + '#acces-porte p{margin:0 0 20px;color:#a3afcc;font-size:15px}'
    + '#acces-porte input{width:100%;box-sizing:border-box;font:16px "Exo 2",system-ui,sans-serif;color:#e6ebf7;background:rgba(0,0,0,.35);border:1px solid rgba(110,150,230,.28);border-radius:10px;padding:13px 14px;margin-bottom:12px}'
    + '#acces-porte .ok{width:100%;font:13px "Michroma",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#fff;padding:16px;border-radius:12px;border:1px solid rgba(143,180,242,.55);background:linear-gradient(180deg,#4a89ea,#2c5fb8);cursor:pointer}'
    + '#acces-porte .ok:disabled{opacity:.6}'
    + '#acces-porte .err{min-height:22px;margin:10px 0 0;color:#ff9b8a;font-size:14px}'
    + '#acces-porte a{display:inline-block;margin-top:14px;color:#a3afcc;font-size:14px}';
  document.head.appendChild(css);

  var porte = null;
  function fermer() { document.documentElement.classList.add('acces-ferme'); }
  function ouvrir() { document.documentElement.classList.remove('acces-ferme'); if (porte) porte.style.display = 'none'; }
  function montrer() {
    fermer();
    var go = function () {
      if (!porte) {
        porte = document.createElement('div');
        porte.id = 'acces-porte';
        porte.innerHTML = '<form autocomplete="on"><h2>SOLAR</h2><p></p>'
          + '<input id="acces-mdp" type="password" autocomplete="current-password">'
          + '<button class="ok" type="submit"></button><div class="err" aria-live="polite"></div>'
          + '<a href="/"></a></form>';
        porte.querySelector('p').textContent = T.txt;
        porte.querySelector('input').placeholder = T.ph;
        porte.querySelector('.ok').textContent = T.ok;
        porte.querySelector('a').textContent = T.ret;
        porte.querySelector('form').onsubmit = envoyer;
        document.body.appendChild(porte);
      }
      porte.style.display = '';
      var i = porte.querySelector('input'); i.value = ''; try { i.focus(); } catch (e) {}
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  function envoyer(e) {
    e.preventDefault();
    var b = porte.querySelector('.ok'), err = porte.querySelector('.err');
    var mdp = porte.querySelector('input').value;
    if (!mdp) return;
    b.disabled = true; err.textContent = '';
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mdp: mdp }) })
      .then(function (r) { return r.json(); })
      .then(function (o) {
        b.disabled = false;
        if (o && o.ok && o.jeton) { ecrire(o.jeton); location.reload(); return; }
        err.textContent = (o && o.raison === 'trop_essais') ? T.trop : (o && o.raison === 'non_configure') ? T.nc : T.faux;
      })
      .catch(function () { b.disabled = false; err.textContent = T.res; });
  }
  window.solarAccesPorte = function () { ecrire(''); montrer(); };

  var j = lire();
  if (!j) { montrer(); return; }
  // Jeton présent : on entre, puis on vérifie en fond.
  fetch(API + '?jeton=' + encodeURIComponent(j), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (o) { if (!o || !o.ok) { ecrire(''); montrer(); } })
    .catch(function () { /* hors ligne : on laisse jouer */ });
})();
