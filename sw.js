const CACHE_NAME = 'khedmaty-cache-v10';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/app-icon.png',
  '/favicon.png',
  '/src/app.js',
  '/src/dailyContent.js',
  '/src/offlineSync.js',
  '/src/config.js',
  '/src/state.js',
  '/src/ui.js',
  '/src/firebase.js',
  '/src/attendance.js',
  '/src/dashboard.js',
  '/src/servants.js',
  '/src/auth.js',
  '/src/ai.js',
  '/src/reports.js',
  '/src/calendar.js',
  '/src/announcements.js',
  '/src/users.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
         console.warn("Service Worker pre-cache failed (ignoring for now)", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Network-first strategy: try network, fallback to cache for offline
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the fresh response for offline use
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
