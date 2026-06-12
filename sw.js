const CACHE_NAME = 'tpwa-v1';
const SHARED_FILES_CACHE = 'tpwa-shared-files';
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

const KEEP_CACHES = [CACHE_NAME, SHARED_FILES_CACHE];

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => !KEEP_CACHES.includes(key)).map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Web Share Target: receive shared text and files via a POST, stash the files
// in a dedicated cache, then redirect to the page with the text fields as query
// params plus a file count so the page can pick the files back up.
async function handleShareTarget(request) {
    const formData = await request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const link = formData.get('url') || '';
    const files = formData.getAll('files');

    const cache = await caches.open(SHARED_FILES_CACHE);
    for (const key of await cache.keys()) {
        await cache.delete(key);
    }

    let fileCount = 0;
    for (const file of files) {
        if (!(file instanceof File) || file.size === 0) continue;
        const headers = new Headers({
            'Content-Type': file.type || 'application/octet-stream',
            'X-Shared-File-Name': encodeURIComponent(file.name)
        });
        await cache.put(`./shared-file-${fileCount}`, new Response(file, { headers }));
        fileCount++;
    }

    const params = new URLSearchParams();
    if (title) params.set('title', title);
    if (text) params.set('text', text);
    if (link) params.set('url', link);
    if (fileCount > 0) params.set('files', String(fileCount));

    const redirectUrl = new URL('./index.html', request.url);
    redirectUrl.search = params.toString();
    return Response.redirect(redirectUrl.toString(), 303);
}

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
    const requestUrl = new URL(event.request.url);
    if (event.request.method === 'POST' && requestUrl.pathname.endsWith('/share-target')) {
        event.respondWith(handleShareTarget(event.request));
        return;
    }

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
