/* Solar Conquest — Service Worker (PWA)
   Stratégie NETWORK-FIRST : on essaie toujours le réseau d'abord (donc tes mises à
   jour s'affichent immédiatement quand tu es en ligne), avec repli sur le cache hors
   ligne. Le shell + les ressources sont mis en cache au fil de l'eau pour le hors-ligne. */
const CACHE = 'solar-conquest-v1';
// On ne met PAS le document dans addAll (chemin d'index variable selon le serveur) :
// il est mis en cache au runtime par le fetch network-first. On précache juste les fichiers sûrs.
const CORE = [
  './assets/pwa/manifest.webmanifest',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => {}))   // tolère un fichier manquant sans bloquer l'install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                  // ne touche pas aux POST etc.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // laisse passer le cross-origin (CDN, etc.)

  e.respondWith(
    fetch(req)
      .then((resp) => {
        // met à jour le cache avec la dernière version reçue
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      })
      .catch(() =>
        // hors ligne : on sert la version en cache (document, image, etc.),
        // avec repli sur la racine pour une navigation.
        caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./') : undefined))
      )
  );
});
