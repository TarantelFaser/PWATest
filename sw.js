const CACHE_NAME = 'tpwa-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './image.png',
    'https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css',
    'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

const STATIC_EXTENSIONS = ['.css', '.html', '.js'];

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const networkFetch = fetch(request).then((response) => {
        cache.put(request, response.clone());
        return response;
    });
    return cached || networkFetch;
}

self.addEventListener('fetch', (event) => {
    if (event.request.url.endsWith('?test')) {
        event.respondWith(new Response('Hello World', {
            headers: { 'Content-Type': 'text/plain' }
        }));
        return;
    }

    const url = new URL(event.request.url);

    if (url.pathname.includes('/api/')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    if (STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    event.respondWith(staleWhileRevalidate(event.request));
});
