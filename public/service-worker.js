const CACHE_NAME = 'oficinaos-v0.9.1-rc1-pwa-5';
const APP_ROOT = new URL('./', self.registration.scope).href;
const STATIC_ASSETS = ['./manifest.json', './icons/icon-192.png', './icons/icon-512.png', ...['bebas-neue-400','cinzel-700','cinzel-900','dm-mono-400','dm-mono-500','lato-400','lato-700'].map(name => `./fonts/${name}.ttf`)];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootResponse = await fetch(APP_ROOT, { cache: 'no-store' });
  if (!rootResponse.ok) throw new Error(`Falha ao pré-cachear app shell: HTTP ${rootResponse.status}`);

  await cache.put(APP_ROOT, rootResponse.clone());
  const html = await rootResponse.text();
  const discovered = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value && !value.startsWith('data:') && !value.startsWith('blob:'));

  const urls = [...new Set([...STATIC_ASSETS, ...discovered])]
    .map((value) => new URL(value, self.registration.scope).href)
    .filter((url) => new URL(url).origin === self.location.origin);

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
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy)));
          }
          return response;
        })
        .catch(() => caches.match(APP_ROOT, { ignoreVary: true }))
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;

    const normalized = await caches.match(request.url, { ignoreVary: true });
    if (normalized) return normalized;

    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request.url, copy)));
    }
    return response;
  })());
});
