/**
 * BenchD — Main Entry Point
 * Registers the Service Worker and verifies cross-origin isolation.
 */

// ── Service Worker Registration ────────────────────────────────────────────
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[BenchD] Service Workers NOT supported in this browser.');
        return false;
    }

    try {
        console.log('[BenchD] Registering service worker…');
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        console.log('[BenchD] SW registered. Scope:', reg.scope);

        if (reg.installing) {
            console.log('[BenchD] SW is INSTALLING for the first time.');
            console.log('[BenchD] Waiting for it to activate, then will reload to apply COOP/COEP headers…');

            // Wait until the newly installing SW transitions to activated state
            await new Promise((resolve) => {
                reg.installing.addEventListener('statechange', function handler(e) {
                    console.log(`[BenchD] SW state → ${e.target.state}`);
                    if (e.target.state === 'activated') {
                        this.removeEventListener('statechange', handler);
                        resolve();
                    }
                });
            });

            console.log('[BenchD] SW activated on first install — reloading page so headers take effect.');
            window.location.reload();
            return false; // execution stops here after reload
        }

        if (reg.waiting) {
            console.log('[BenchD] SW is WAITING (new version pending). Reloading.');
            window.location.reload();
            return false;
        }

        if (reg.active) {
            console.log('[BenchD] SW already ACTIVE and controlling this page.');
        }

        return true;
    } catch (err) {
        console.error('[BenchD] SW registration FAILED:', err);
        return false;
    }
}

// ── SharedArrayBuffer + Isolation Check ───────────────────────────────────
function checkIsolation() {
    const isolated = self.crossOriginIsolated === true;
    const sabExists = typeof SharedArrayBuffer !== 'undefined';

    // Extended diagnostics
    console.group('[BenchD] Cross-Origin Isolation Diagnostics');
    console.log('crossOriginIsolated    :', isolated);
    console.log('SharedArrayBuffer      :', sabExists ? 'available ✅' : 'NOT available ❌');
    console.log('navigator.hardwareConcurrency:', navigator.hardwareConcurrency);

    // Check response headers of the current page
    fetch(window.location.href)
        .then(r => {
            console.log('COOP header on page    :', r.headers.get('Cross-Origin-Opener-Policy') ?? '(missing ❌)');
            console.log('COEP header on page    :', r.headers.get('Cross-Origin-Embedder-Policy') ?? '(missing ❌)');
            console.groupEnd();
        })
        .catch(err => {
            console.warn('[BenchD] Could not fetch page to check headers:', err);
            console.groupEnd();
        });

    return { isolated, sabExists };
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function setStatus(msg, cls) {
    const el = document.getElementById('sab-status');
    if (!el) return;
    el.textContent = msg;
    el.className = cls;
}

function setBrowserInfo() {
    const el = document.getElementById('browser-info');
    if (!el) return;
    el.textContent = `${navigator.userAgent.split(') ').pop().split(' ')[0]} · ${navigator.hardwareConcurrency} logical cores`;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
import { attachUI } from './ui/dashboard.js';

async function init() {
    setStatus('⏳ Registering service worker…', '');
    setBrowserInfo();

    await registerServiceWorker();

    // Short delay — gives the SW time to claim the page after activation
    await new Promise(r => setTimeout(r, 200));

    const { isolated, sabExists } = checkIsolation();

    if (sabExists && isolated) {
        setStatus('✅ SharedArrayBuffer available — multi-core benchmarks fully enabled', 'status-ok');
    } else if (sabExists && !isolated) {
        setStatus('⚠️ SharedArrayBuffer present but page is not cross-origin isolated — check console for header diagnostics', 'status-warn');
    } else {
        setStatus('❌ SharedArrayBuffer unavailable — running in fallback mode (check console for header diagnostics)', 'status-error');
    }

    // Expose globals for later phases
    window.__benchd = {
        sabAvailable: sabExists,
        crossOriginIsolated: isolated,
        cores: navigator.hardwareConcurrency,
    };

    console.log('[BenchD] window.__benchd:', window.__benchd);

    // Bind the UI
    attachUI();
}

document.addEventListener('DOMContentLoaded', init);
