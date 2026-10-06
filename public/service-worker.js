const CACHE_NAME = 'oficinaos-v0.9.1-rc1-pwa-2';
const STATIC_ASSETS = ['./manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootResponse = await fetch('./', { cache: 'no-store' });
  if (!rootResponse.ok) throw new Error(`Falha ao pré-cachear app shell: HTTP ${rootResponse.status}`);

  await cache.put('./', rootResponse.clone());
  const html = await rootResponse.text();
  const discovered = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value && !value.startsWith('data:') && !value.startsWith('blob:'));

  const urls = [...new Set([...STATIC_ASSETS, ...discovered])]
    .map((value) => new URL(value, self.registration.scope))
    .filter((url) => url.origin === self.location.origin);

  await Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) await cache.put(url, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('./', copy)));
          }
          return response;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});
