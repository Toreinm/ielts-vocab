/* Service worker for ielts-vocab PWA
   - cache name = versioned (bump VERSION on every deploy to invalidate)
   - HTML / JS: network-first (always get latest), fall back to cache if offline
   - audio/* + icons: cache-first (audio doesn't change after deploy)
   - on new SW install: skipWaiting + clients.claim so updated SW takes over immediately
*/
const VERSION = 'v3.2.0';
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
];

self.addEventListener('install', e => {
  // Activate the new SW immediately, but don't block install on
  // precaching the 1.8MB of audio. The HTML <link rel="preload">
  // already starts the fetch in parallel with HTML parse.
  e.waitUntil(self.skipWaiting());
  // Fire-and-forget precache of core + audio (no await, no install delay)
  (async () => {
    try {
      const c = await caches.open(CACHE);
      await c.addAll(CORE);
      // Pre-cache the 10 ch1 audio files in parallel
      const audioUrls = [
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
      await Promise.all(audioUrls.map(async url => {
        try {
          const fresh = await fetch(url, { cache: 'no-cache' });
          if (fresh.ok) await c.put(url, fresh.clone());
        } catch (e) {}
      }));
    } catch (e) { /* precache failure is non-fatal */ }
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
