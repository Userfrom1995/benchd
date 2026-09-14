/**
 * Pure JS Web Worker for WebCrypto testing
 */

// Keep startup behavior consistent with other workers.
postMessage({ type: 'ready' });

self.onmessage = async (e) => {
    const { id, type, durationMs } = e.data;
    let result = { id, type: 'result', timeMs: 0, score: 0 };

    try {
        // Pre-warm (untimed): hoist data alloc + key generation BEFORE start
        // so the timed per-window loop measures only steady-state crypto
        // throughput, not allocator / keygen / first-compile cost.
        let aesData = null;
        let aesKey = null;
        let shaData = null;
        if (type === 'aes') {
            // 256KB payload keeps per-call latency moderate while remaining compute-heavy.
            aesData = new Uint8Array(256 * 1024);
            crypto.getRandomValues(aesData.subarray(0, 32));
            // Setup key & IV
            aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        } else if (type === 'sha256') {
            // 64-byte payload: matches the standard MH/s benchmark convention.
            // Small enough that per-hash API overhead is amortised across many
            // batched calls, while still exercising hardware SHA acceleration.
            shaData = new Uint8Array(64);
            crypto.getRandomValues(shaData); // fill entire buffer
        }

        // Timed section starts here — per-window loop only.
        let start = performance.now();
        let now = start;

        if (type === 'aes') {
            const data = aesData;
            const key = aesKey;
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
            // Timing hygiene: NaN/zero guard — never propagate Infinity/NaN.
            if (!Number.isFinite(result.timeMs) || result.timeMs <= 0 || !Number.isFinite(totalBytes) || totalBytes <= 0) {
                result.score = 0;
            } else {
                result.score = (totalBytes / (result.timeMs / 1000)) / 1e9; // GB/s
            }
        }
        else if (type === 'sha256') {
            const data = shaData;

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
            // Timing hygiene: NaN/zero guard — never propagate Infinity/NaN.
            if (!Number.isFinite(result.timeMs) || result.timeMs <= 0 || !Number.isFinite(totalHashes) || totalHashes <= 0) {
                result.score = 0;
            } else {
                result.score = totalHashes / (result.timeMs / 1000) / 1e6; // MH/s (Millions of Hashes per sec)
            }
        }

        postMessage(result);
    } catch (err) {
        postMessage({ id, type: 'error', error: err.message });
    }
};
