/**
 * BenchD Service Worker
 *
 * Purpose: GitHub Pages cannot set custom HTTP headers.
 * We inject Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
 * on every response so the page becomes "cross-origin isolated".
 * This is required to enable SharedArrayBuffer (needed for WASM threads
 * and true multi-core benchmarking).
 *
 * Debug: all lifecycle events and every header injection are logged.
 * Open DevTools → Application → Service Workers to confirm active state.
 * Open DevTools → Console to see per-request injection logs.
 */

const SW_VERSION = '1.1.0-debug';

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log(`[SW ${SW_VERSION}] install event fired — calling skipWaiting()`);
    // skipWaiting forces this SW to become active immediately,
    // even if a previous SW is still running.
    self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log(`[SW ${SW_VERSION}] activate event fired — calling clients.claim()`);
    // clients.claim() makes this SW take control of all open pages right now.
    // Without this, pages opened BEFORE the SW registered won't be controlled
    // and won't get the injected headers until a full reload.
    event.waitUntil(
        self.clients.claim().then(() => {
            console.log(`[SW ${SW_VERSION}] clients.claim() done — controlling all open clients`);
        })
    );
});

// ── Fetch (COOP/COEP header injection) ────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Only intercept same-origin requests.
    // Cross-origin responses (e.g. Google Fonts) are opaque — we can't add headers to them.
    if (!url.startsWith(self.location.origin)) {
        // Uncomment the line below if you want to see ALL skipped requests:
        // console.log(`[SW] SKIP (cross-origin): ${url}`);
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const newHeaders = new Headers(response.headers);

                // These two headers together make the page "cross-origin isolated"
                // which re-enables SharedArrayBuffer in modern browsers.
                newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
                newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

                const short = url.replace(self.location.origin, '') || '/';
                console.log(
                    `[SW] INJECTED COOP+COEP → ${short} (HTTP ${response.status})`
                );

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders,
                });
            })
            .catch((err) => {
                console.error(`[SW] Fetch FAILED for: ${url}`, err);
                return new Response('BenchD Service Worker: fetch error', { status: 500 });
            })
    );
});
