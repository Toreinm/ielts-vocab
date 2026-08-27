/* Service worker for ielts-vocab PWA
   - cache name = versioned (bump VERSION on every deploy to invalidate)
   - HTML / JS: network-first (always get latest), fall back to cache if offline
   - audio/* + icons: cache-first (audio doesn't change after deploy)
   - on new SW install: skipWaiting + clients.claim so updated SW takes over immediately
*/
const VERSION = 'v4.0.4';
const CACHE = `ielts-vocab-${VERSION}`;
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.ico',
  './ch_data/search-index.json',
  './ch_data/dict/ch1.json',
  './ch_data/dict/ch2.json',
  // Pre-list 20 lazy chapter chunks (no .html ext to avoid CF Pages auto-strip 308)
  ...Array.from({length: 20}, (_, i) => `./ch_data/ch${i + 3}`),
  // Per-chapter dict JSONs
  ...Array.from({length: 20}, (_, i) => `./ch_data/dict/ch${i + 3}.json`),
  // 10 ch1 audio recordings
  './audio/ch1-atmosphere.mp3',
  './audio/ch1-hydrosphere.mp3',
  './audio/ch1-lithosphere.mp3',
  './audio/ch1-oxygen.mp3',
  './audio/ch1-oxide.mp3',
  './audio/ch1-carbon-dioxide.mp3',
  './audio/ch1-hydrogen.mp3',
  './audio/ch1-core.mp3',
  './audio/ch1-crust.mp3',
  './audio/ch1-mantle.mp3',
];

self.addEventListener('install', e => {
  // Activate immediately, no install delay
  e.waitUntil(self.skipWaiting());
  // Fire-and-forget precache of CORE — only the small ones (icons, manifest,
  // search-index, dict/ch1+ch2). Chapter chunks and audio are pulled
  // on-demand via the cache-first fetch handler below.
  (async () => {
    try {
      const c = await caches.open(CACHE);
      // Pre-cache the truly-tiny assets in parallel
      const tiny = [
        './', './index.html', './manifest.json',
        './icon-192.png', './icon-512.png', './icon-maskable-512.png',
        './apple-touch-icon.png', './favicon.ico',
        './ch_data/search-index.json',
        './ch_data/dict/ch1.json',
        './ch_data/dict/ch2.json',
      ];
      await Promise.all(tiny.map(async url => {
        try {
          const fresh = await fetch(url, { cache: 'no-cache' });
          if (fresh.ok) await c.put(url, fresh.clone());
        } catch (e) {}
      }));
    } catch (e) {}
  })();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Delete any old caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Audio + icons: cache-first
  if (url.pathname.startsWith('/audio/') ||
      url.pathname.startsWith('/icon-') ||
      url.pathname === '/apple-touch-icon.png' ||
      url.pathname === '/favicon.ico') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match(e.request);
      if (cached) return cached;
      const fresh = await fetch(e.request);
      if (fresh.ok) c.put(e.request, fresh.clone());
      return fresh;
    })());
    return;
  }

  // HTML / JS: network-first
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const fresh = await fetch(e.request);
      if (fresh.ok) c.put(e.request, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await c.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
