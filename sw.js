// Service worker: keeps a copy of every app file so Cyber Logbook opens and works with no internet.
// When you change ANY app file, bump VERSION so phones and PCs pick up the new copy.

const VERSION = '1.1.0'; // 1.1.0: screenshots
const CACHE = `cyber-logbook-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/theme-boot.js',
  'js/app.js',
  'js/backup.js',
  'js/browser.js',
  'js/db.js',
  'js/derive.js',
  'js/github.js',
  'js/images.js',
  'js/imagesync.js',
  'js/markdown.js',
  'js/model.js',
  'js/pwa.js',
  'js/reset.js',
  'js/shots.js',
  'js/stats.js',
  'js/store.js',
  'js/sync.js',
  'js/theme.js',
  'js/ui.js',
  'js/views/cheats.js',
  'js/views/entry.js',
  'js/views/install.js',
  'js/views/journal.js',
  'js/views/log.js',
  'js/views/questions.js',
  'js/views/review.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'vendor/jszip.min.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('cyber-logbook-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only this site's own files. GitHub API calls for sync always go straight to the network.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('index.html', { cacheName: CACHE });
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        return new Response('Cyber Logbook is offline and has not been cached yet. Open it once while online.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
