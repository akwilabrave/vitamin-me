// App-shell cache. Strava API, map tiles and CDN requests are not intercepted.
// Bump VERSION whenever files change so the phone picks them up.
const VERSION = 'doppel-2';
const SHELL = ['./', 'index.html', 'app.js', 'scoring.js', 'leagues.js', 'territory.js', 'ghost.js', 'records.js', 'art.js', 'awards.js', 'race.js', 'league-ui.js', 'manifest.json', 'strava-powered-white.png', 'strava-powered-black.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // pass through
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok){ const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
