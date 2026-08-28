/* Solar — Service Worker (PWA installée sur téléphone) — v2 durcie.
   Objectifs (demande de Marc) : l'app installée doit être AUSSI efficace que le navigateur.
   - RENDU TOUJOURS À JOUR : le HTML et le JS (index.html, online.js) sont servis NETWORK-FIRST
     → dès que tu es en ligne, tu as la dernière version déployée (jamais coincé sur du vieux cache).
     C'est ce qui garantit que le multijoueur (online.js) et les visuels restent identiques au web.
   - FLUIDITÉ : les images/gros assets sont servis CACHE-FIRST (instantané) puis rafraîchis en fond
     (stale-while-revalidate) → l'app s'ouvre vite, sans re-télécharger les cartes à chaque fois.
   - MULTIJOUEUR : les connexions WebSocket (wss://live.solar-game.com) sont cross-origin → non
     interceptées, elles passent directement. Rien n'est mis en cache du serveur de jeu.
   - HORS-LIGNE : le solo reste jouable ; en navigation hors-ligne on sert index.html depuis le cache.
   Le numéro de version ci-dessous purge les anciens caches à chaque mise à jour du SW. */
const VERSION = 'v115-2026-08-28';
const HTML_CACHE = 'sc-html-' + VERSION;     // documents + scripts (network-first)
const ASSET_CACHE = 'sc-assets-' + VERSION;  // images, icônes, PDF (cache-first)

// Fichiers du « shell » précachés à l'installation → ouverture instantanée + hors-ligne immédiat.
const SHELL = [
  /* ⚠️ `moteur.js` porte TOUTES les règles du jeu (479 Ko). Sans lui dans ce pré-cache, le solo
     hors ligne ne démarrerait pas : index.html ne serait plus qu'une coquille. Il était auparavant
     collé dans index.html, donc mis en cache « gratuitement » — l'extraction en fichier séparé rend
     cette ligne INDISPENSABLE. */
  './', './index.html', './moteur.js', './online.js', './regles.html',
  './assets/pwa/manifest.webmanifest',
  './assets/pwa/icon-192.png', './assets/pwa/icon-512.png', './assets/pwa/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(HTML_CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))  // tolère un fichier manquant sans bloquer
      .then(() => self.skipWaiting())                 // la nouvelle version s'active tout de suite
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== HTML_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())               // prend le contrôle des onglets ouverts
  );
});

// Un asset « lourd » (image/police/PDF) : on sert vite depuis le cache, on rafraîchit en fond.
function isAsset(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|woff2?|ttf|pdf|mp3|ogg)$/i.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                   // POST/WS etc. : non interceptés
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;    // cross-origin (serveur de jeu wss, CDN) : passe

  // Assets lourds → cache-first + revalidation en fond (rapide et économe).
  if (isAsset(url)) {
    e.respondWith(
      caches.open(ASSET_CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((resp) => { if (resp && resp.ok) c.put(req, resp.clone()); return resp; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // HTML + JS + reste → network-first (toujours frais si en ligne), repli cache hors-ligne.
  e.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(HTML_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      })
      .catch(() =>
        caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});

// Permet à la page de forcer l'activation d'une nouvelle version (utilisé par l'invite « mise à jour »).
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
