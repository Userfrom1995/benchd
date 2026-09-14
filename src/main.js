/**
 * BenchD — Main Entry Point
 * Registers the Service Worker and verifies cross-origin isolation.
 */

import { attachUI } from './ui/dashboard.js';

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
            const activated = await new Promise((resolve) => {
                const installingWorker = reg.installing;
                if (!installingWorker) {
                    resolve(false);
                    return;
                }
                if (installingWorker.state === 'activated') {
                    resolve(true);
                    return;
                }
                const timeout = setTimeout(() => {
                    console.warn('[BenchD] SW install wait timed out after 5s.');
                    installingWorker.removeEventListener('statechange', handler);
                    resolve(false);
                }, 5000);
                function handler(e) {
                    console.log(`[BenchD] SW state → ${e.target.state}`);
                    if (e.target.state === 'activated') {
                        clearTimeout(timeout);
                        installingWorker.removeEventListener('statechange', handler);
                        resolve(true);
                    } else if (e.target.state === 'redundant') {
                        console.warn('[BenchD] SW became redundant during install.');
                        clearTimeout(timeout);
                        installingWorker.removeEventListener('statechange', handler);
                        resolve(false);
                    }
                }
                installingWorker.addEventListener('statechange', handler);
            });

            if (!activated) {
                return true;
            }

            if (sessionStorage.getItem('benchd-sw-reloaded')) {
                console.log('[BenchD] SW activated but reload already done this session — skipping reload.');
                return true;
            }
            sessionStorage.setItem('benchd-sw-reloaded', '1');
            console.log('[BenchD] SW activated on first install — reloading page so headers take effect.');
            window.location.reload();
            return false; // execution stops here after reload
        }

        if (reg.waiting) {
            console.log('[BenchD] SW is WAITING (new version pending).');
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
    console.log('navigator.hardwareConcurrency:', navigator.hardwareConcurrency ?? 4);

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
    el.classList.remove('status-ok', 'status-warn', 'status-error');
    if (cls) el.classList.add(cls);
}

function setBrowserInfo() {
    const el = document.getElementById('browser-info');
    if (!el) return;
    const cores = navigator.hardwareConcurrency ?? 4;
    el.textContent = `${navigator.userAgent.split(') ').pop().split(' ')[0]} · ${cores} logical cores`;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
async function init() {
    setStatus('⏳ Registering service worker…', '');
    setBrowserInfo();

    const ready = await registerServiceWorker();
    if (!ready) return;

    await navigator.serviceWorker.ready;

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
        cores: navigator.hardwareConcurrency ?? 4,
    };

    console.log('[BenchD] window.__benchd:', window.__benchd);

    // Bind the UI
    attachUI();
}

document.addEventListener('DOMContentLoaded', init);
