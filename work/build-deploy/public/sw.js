const CACHE_NAME = 'caixafacil-v12';

// Domains that should NEVER be intercepted by the service worker
const SKIP_DOMAINS = [
  'mercadopago.com',
  'mercadolibre.com',
  'mercadolibre.com.ar',
  'mlstatic.com',
  'mpsdk.com',
];

function shouldSkip(url) {
  try {
    const hostname = new URL(url).hostname;
    return SKIP_DOMAINS.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

// Install: only cache essential assets, don't cache HTML pages
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: delete ALL old caches to force fresh content
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first cache for GETs (no Web Share Target — removed WhatsApp Business integration)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Não interceptar POSTs (Web Share Target foi removido — integração WhatsApp Business inativa)
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // IMPORTANT: Never intercept MercadoPago or payment provider resources
  if (shouldSkip(request.url)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for offline fallback
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback: serve from cache
        return caches.match(request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});
