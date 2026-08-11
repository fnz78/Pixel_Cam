const CACHE_NAME = 'pixelcam-cache-v2';
const ASSETS = [
  './index.html',
  './share.html',
  './css/style.css',
  './js/app.js',
  './js/camera.js',
  './js/palettes.js',
  './js/renderer.js',
  './js/state.js',
  './js/ui.js',
  './js/render-worker.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        const isUrlToCache = e.request.url.startsWith(self.location.origin) ||
                             e.request.url.includes('fonts.googleapis.com') ||
                             e.request.url.includes('fonts.gstatic.com') ||
                             e.request.url.includes('cdnjs.cloudflare.com');
        if (networkResponse && networkResponse.status === 200 && isUrlToCache) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback
      });
    })
  );
});
