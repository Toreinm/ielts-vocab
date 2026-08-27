/* Service worker for ielts-vocab PWA
   - cache name = versioned (bump VERSION on every deploy to invalidate)
   - HTML / JS: stale-while-revalidate (serve cache immediately, refresh in bg)
   - audio/* + icons: cache-first (audio doesn't change after deploy)
   - on new SW install: skipWaiting + clients.claim so updated SW takes over immediately
   - v5.0.0: App Shell + ESM code-split
       * main.js (ESM entry) — handles all UI + IntersectionObserver
       * chapters/chN.js + chapters/chN-data.js — lazy ESM modules for ch3..ch22
       * chapters/shared.js — shared mountChapter + oaldUrl helpers
*/
const VERSION = 'v5.0.0';
const CACHE = `ielts-vocab-${VERSION}`;

// Small assets precached at install (icons, manifest, search index, dicts).
// Chapters / main.js are runtime-cached on first fetch (stale-while-revalidate).
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
  // Per-chapter dict JSONs (for popup def lookup, lazy fetched on first miss)
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
  e.waitUntil(self.skipWaiting());
  // Fire-and-forget precache of CORE — only the small ones.
  (async () => {
    try {
      const c = await caches.open(CACHE);
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

  // HTML / JS / data: stale-while-revalidate
  // First visit: serve from network, cache the response.
  // Repeat visits: serve from cache instantly, refresh cache in background.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(e.request);
    const networkFetch = fetch(e.request).then(fresh => {
      if (fresh.ok) c.put(e.request, fresh.clone());
      return fresh;
    }).catch(err => cached || Promise.reject(err));
    return cached || networkFetch;
  })());
});
