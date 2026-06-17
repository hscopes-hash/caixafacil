const CACHE_NAME = 'caixafacil-v11';

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

// ============================================
// IndexedDB para fotos recebidas via WhatsApp (Web Share Target)
// ============================================
const WHATSAPP_DB_NAME = 'caixafacil-whatsapp';
const WHATSAPP_DB_VERSION = 1;
const WHATSAPP_STORE = 'photos';

function openWhatsappDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WHATSAPP_DB_NAME, WHATSAPP_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(WHATSAPP_STORE)) {
        const store = db.createObjectStore(WHATSAPP_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Manipular fotos compartilhadas via Web Share Target (WhatsApp, etc.)
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('images');

    if (!files || files.length === 0) {
      return Response.redirect('/', 303);
    }

    const db = await openWhatsappDB();

    for (const file of files) {
      if (file instanceof File && file.type.startsWith('image/')) {
        const id = 'wap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await new Promise((resolve, reject) => {
          const tx = db.transaction(WHATSAPP_STORE, 'readwrite');
          const store = tx.objectStore(WHATSAPP_STORE);
          store.add({
            id: id,
            blob: file,
            nome: file.name || ('foto_whatsapp_' + Date.now() + '.jpg'),
            tipo: file.type,
            timestamp: Date.now(),
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
    }

    // Notificar todos os clientes abertos sobre novas fotos
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => {
      client.postMessage({ type: 'WHATSAPP_PHOTOS_UPDATED', count: files.length });
    });

    return Response.redirect('/?whatsapp=received', 303);
  } catch (error) {
    console.error('Erro ao processar compartilhamento:', error);
    return Response.redirect('/?whatsapp=error', 303);
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

// Fetch: handle Web Share Target POSTs + network-first cache for GETs
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // ============================================
  // Web Share Target: interceptar POST para /share
  // ============================================
  if (request.method === 'POST') {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/share') {
        event.respondWith(handleShareTarget(request));
        return;
      }
    } catch (e) {
      // Invalid URL, ignore
    }
    return; // Não interceptar outros POSTs
  }

  // Skip non-GET (already handled POST above) and chrome-extension requests
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
