// Service Worker for "Làm chủ mọi thứ" PWA
const PREFIX='qlct-pages:'+self.registration.scope+':';
const CACHE_NAME=PREFIX+'61';
const STATIC_ASSETS=["./", "./js/wishlist.js", "./js/boot.js", "./js/config.js", "./js/navigation.js", "./js/ghi-chu.js", "./js/danh-sach.js", "./js/co-ay.js", "./js/thuchi-chart.js", "./js/utils.js", "./js/home.js", "./js/suc-khoe.js", "./js/cong-viec.js", "./js/ho-tro.js", "./js/so-tay.js", "./js/bao-tri.js", "./js/api.js", "./js/tietkiem.js", "./js/trich-dan.js", "./js/thuchi.js", "./pages/cong-viec.html", "./pages/tietkiem.html", "./pages/ho-tro.html", "./pages/so-tay.html", "./pages/co-ay.html", "./pages/wishlist.html", "./pages/suc-khoe.html", "./pages/trich-dan.html", "./pages/ghi-chu.html", "./pages/danh-sach.html", "./pages/thuchi.html", "./pages/bao-tri.html", "./css/thuchi.css", "./css/thuchi-modern.css", "./css/shell.css", "./css/suc-khoe.css", "./css/suc-khoe-modern.css", "./css/cong-viec.css", "./css/cong-viec-modern.css", "./css/tietkiem.css", "./css/tietkiem-modern.css", "./css/global.css", "./css/ghi-chu.css", "./css/ghi-chu-modern.css", "./css/support-pages-modern.css", "./css/so-tay-modern.css", "./css/bao-tri.css", "./css/bao-tri-modern.css", "./css/home.css", "./css/home-modern.css", "./components/page-header.html", "./assets/logo.png", "./assets/icon-192.png", "./assets/pwa-icon-512.png", "./assets/web-avatar.png", "./assets/logo-chu-dong.svg", "./index.html", "./manifest.json", "./apple-touch-icon.png", "./favicon.png"];

// Install: Cache static shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.all(STATIC_ASSETS.map(async (asset) => {
                try { await cache.add(asset); }
                catch (error) { console.warn('Không thể lưu tài nguyên vào cache:', asset, error); }
            }));
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up obsolete caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key.startsWith(PREFIX) && key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for dynamic & API calls, Stale-while-revalidate for static files
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Bypass cache completely for Supabase & external API / POST / PUT requests
    // Bảo đảm 100% dữ liệu backend không bị cache sai hoặc ảnh hưởng
    if (
        request.method !== 'GET' ||
        url.hostname.includes('supabase.co') ||
        url.pathname.includes('/rest/v1/') ||
        url.pathname.includes('/auth/v1/')
    ) {
        return; // Let browser perform direct network fetch
    }

    // HTML navigation & same-origin JS/CSS: Network-first with cache fallback
    const isSameOriginCode = url.origin === self.location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html') || isSameOriginCode) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.open(CACHE_NAME).then(c => c.match(request)).then((cachedResponse) => {
                        if (cachedResponse) return cachedResponse;
                        return (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html'))
                            ? caches.open(CACHE_NAME).then(c => c.match('./index.html'))
                            : Response.error();
                    });
                })
        );
        return;
    }

    // Static assets (CSS, JS, Fonts, Images): Cache-first with background revalidation
    event.respondWith(
        caches.open(CACHE_NAME).then(c => c.match(request)).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse || Response.error());

            return cachedResponse || fetchPromise;
        })
    );
});
