// Service worker: zorgt dat Fitchecker ook zonder internet opent.
// - App-bestanden: eerst het netwerk (dan heb je altijd de nieuwste versie), zonder internet uit de opslag.
// - Het uitknip-model (jsdelivr): vaste versie, dus na de eerste download uit de opslag. Zo werkt uitknippen ook offline.
// - Weer en steden (Open-Meteo): niet opslaan; zonder internet kies je het weer zelf.

const CACHE = 'fitchecker-app';
const MODEL_CACHE = 'fitchecker-model';

const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'version.json',
  'css/fonts.css', 'css/app.css',
  'fonts/Caveat.woff2', 'fonts/DMSerifDisplay.woff2', 'fonts/Inter.woff2',
  'img/kurk.jpg', 'img/fototip.jpg', 'img/fototip-fout.jpg', 'img/hout-boven.jpg', 'img/hout-onder.jpg', 'img/hout-links.jpg', 'img/hout-rechts.jpg',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'moodboard/index.json',
  'js/data.js', 'js/db.js', 'js/photo.js', 'js/app.js', 'js/kast.js', 'js/item-form.js', 'js/categories.js',
  'js/figure.js', 'js/personage.js', 'js/weather.js', 'js/trends.js', 'js/style.js', 'js/cutout.js', 'js/cutout-worker.js',
  'js/outfit.js', 'js/planner.js', 'js/onboarding.js', 'js/moodboard.js', 'js/kastcheck.js',
  'js/wrapped.js', 'js/pwa.js', 'js/tips.js',
];

self.addEventListener('install', e => {
  // Alles alvast binnenhalen, zodat de app de eerste keer offline ook al compleet is.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@imgly/background-removal')) {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // 'no-cache': bij de server navragen of er iets nieuws is, ook als de browser nog een kopie heeft.
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(stripQuery(req), res.clone());
    return res;
  } catch {
    const hit = await cache.match(stripQuery(req)) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    throw new Error('offline');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(MODEL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// "version.json?123" en "version.json" zijn hetzelfde bestand.
function stripQuery(req) {
  const url = new URL(req.url);
  if (!url.search) return req;
  url.search = '';
  return new Request(url.href);
}
