// App-shell cache for the landing page and the app (app/). Strava API, the token Worker,
// map tiles and CDN requests are not intercepted. Bump VERSION whenever files change.
const VERSION = 'doppel-4';
const SHELL = ['./', 'index.html', 'privacy.html', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'app/', 'app/index.html', 'app/config.js', 'app/app.js', 'app/scoring.js', 'app/leagues.js', 'app/territory.js', 'app/ghost.js',
  'app/records.js', 'app/art.js', 'app/awards.js', 'app/race.js', 'app/league-ui.js',
  'app/strava-powered-white.png', 'app/btn-strava-connect.png', 'app/strava-powered-black.png'];
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
