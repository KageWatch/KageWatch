const CACHE_NAME = 'kagewatch-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/robots.txt',
  '/favicon.png'
];

const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap',
  'https://fonts.gstatic.com/',
  'https://cdn.plyr.io/3.7.8/plyr.css',
  'https://cdn.jsdelivr.net/npm/hls.js@latest',
  'https://cdn.plyr.io/3.7.8/plyr.polyfilled.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
];

// Install: Cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => console.warn('Cache addAll failed:', err));
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events: Caching strategies
self.addEventListener('fetch', event => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // ⚠️ CRITICAL: Bypass caching for video streaming, subtitles, proxies, and range requests
  if (
    requestUrl.pathname.endsWith('.m3u8') ||
    requestUrl.pathname.endsWith('.ts') ||
    requestUrl.pathname.endsWith('.mp4') ||
    requestUrl.pathname.endsWith('.vtt') ||
    requestUrl.pathname.endsWith('.srt') ||
    event.request.headers.has('range') ||
    requestUrl.host.includes('proxy') ||
    requestUrl.host.includes('anivexa-api')
  ) {
    return; // Pass through to browser natively
  }

  // 1. Dynamic API requests - Network First, fallback to cache
  if (requestUrl.host === 'graphql.anilist.co' || requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // 2. CDNs and Fonts - Cache First, fallback to network with background update
  if (
    CDN_ASSETS.some(cdn => event.request.url.startsWith(cdn)) || 
    requestUrl.host.includes('gstatic.com') || 
    requestUrl.host.includes('plyr.io')
  ) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Main site pages and local static files - Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(err => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        throw err;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
