/**
 * Pure JS Web Worker for WebCrypto testing
 */

// Keep startup behavior consistent with other workers.
postMessage({ type: 'ready' });

self.onmessage = async (e) => {
    const { id, type, durationMs } = e.data;
    let result = { id, type: 'result', timeMs: 0, score: 0 };

    try {
        const start = performance.now();
        let now = start;

        if (type === 'aes') {
            // 256KB payload keeps per-call latency moderate while remaining compute-heavy.
            const data = new Uint8Array(256 * 1024);
            crypto.getRandomValues(data.subarray(0, 32));

            // Setup key & IV
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            let totalBytes = 0;
            while (now - start < durationMs) {
                // Fresh nonce per encryption is required for AES-GCM correctness.
                await Promise.all([
                    crypto.subtle.encrypt({ name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }, key, data),
                    crypto.subtle.encrypt({ name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }, key, data),
                    crypto.subtle.encrypt({ name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }, key, data),
                    crypto.subtle.encrypt({ name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }, key, data)
                ]);
                totalBytes += data.byteLength * 4;
                now = performance.now();
            }

            result.timeMs = now - start;
            result.score = (totalBytes / (result.timeMs / 1000)) / 1e9; // GB/s
        }
        else if (type === 'sha256') {
            // 64-byte payload: matches the standard MH/s benchmark convention.
            // Small enough that per-hash API overhead is amortised across many
            // batched calls, while still exercising hardware SHA acceleration.
            const data = new Uint8Array(64);
            crypto.getRandomValues(data); // fill entire buffer

            let totalHashes = 0;
            while (now - start < durationMs) {
                // Hash 10 times per loop to reduce await overhead
                await Promise.all([
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data),
                    crypto.subtle.digest('SHA-256', data)
                ]);
                totalHashes += 10;
                now = performance.now();
            }

            result.timeMs = now - start;
            result.score = totalHashes / (result.timeMs / 1000) / 1e6; // MH/s (Millions of Hashes per sec)
        }

        postMessage(result);
    } catch (err) {
        postMessage({ id, type: 'error', error: err.message });
    }
};
