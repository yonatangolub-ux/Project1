// שומר את כל האפליקציה בטלפון, כדי שתעבוד בלי רשת.
// בכל שינוי בקבצים: להעלות את מספר הגרסה, ולהוסיף לכאן כל קובץ חדש שהאפליקציה טוענת.
const CACHE = 'tik-v5';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './core.js',
  './db.js',
  './pdf-to-images.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
      // קבצי גופנים של pdf.js נשמרים בפעם הראשונה שצריך אותם
      if (res.ok && req.url.includes('/vendor/pdfjs/')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
