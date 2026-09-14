import init, {
    bench_wasm_memory_bandwidth,
    bench_cache_latency,
    reset_memory_bandwidth,
    init_cache_buffer,
    bench_cache_latency_persistent
} from '../../wasm/pkg/benchd_wasm.js';

let wasmReady = false;

init().then(() => {
    wasmReady = true;
    postMessage({ type: 'ready' });
}).catch(err => {
    postMessage({ type: 'error', error: err.message });
});

self.onmessage = async (e) => {
    const msg = e.data ?? {};
    const id = msg.id;
    const type = msg.type;
    const durationMs = msg.durationMs;
    try {
        if (!wasmReady) {
            postMessage({ id, type: 'error', error: 'WASM not initialized' });
            return;
        }
        let result = { id, type: 'result', timeMs: 0, score: 0 };
        let start = performance.now();
        let now = start;

        if (type === 'membw') {
            let passes = 0;
            let totalBytes = 0;
            const elements = 1024 * 1024 * 16; // 128MB of f64 values inside WASM memory.
            const bytesPerPass = elements * Float64Array.BYTES_PER_ELEMENT * 2;

            // Pre-warm (untimed): allocate + fill once so the timed loop measures
            // steady-state bandwidth, not allocator/zeroing cost.
            if (typeof reset_memory_bandwidth === 'function') {
                reset_memory_bandwidth(elements);
                start = performance.now();
                now = start;
            }

            while (now - start < durationMs) {
                bench_wasm_memory_bandwidth(elements);
                totalBytes += bytesPerPass;
                passes++;
                now = performance.now();
            }

            result.timeMs = now - start;
            result.score = (totalBytes / (result.timeMs / 1000)) / 1e9; // GB/s
            result.unit = 'GB/s';
            result.bytesPerPass = bytesPerPass;
            result.passes = passes;
        }
        else if (type === 'cache_l1' || type === 'cache_l2' || type === 'cache_l3' || type === 'cache_ram') {
            let sizeBytes;
            if (type === 'cache_l1') sizeBytes = 32 * 1024;
            else if (type === 'cache_l2') sizeBytes = 256 * 1024;
            else if (type === 'cache_l3') sizeBytes = 8 * 1024 * 1024;
            else sizeBytes = 64 * 1024 * 1024;

            const len = sizeBytes / 4;
            const accessesPerPass = 2_000_000;
            let passes = 0;

            const usePersistent = (typeof init_cache_buffer === 'function' &&
                typeof bench_cache_latency_persistent === 'function');
            if (usePersistent) {
                // Init once (untimed) inside WASM; time only the persistent chase.
                // u64 seed => pass BigInt for wasm-bindgen.
                const seed = BigInt((sizeBytes ^ 0x9E3779B9) >>> 0);
                init_cache_buffer(sizeBytes, seed);
                start = performance.now();
                now = start;
                while (now - start < durationMs) {
                    bench_cache_latency_persistent(accessesPerPass);
                    passes++;
                    now = performance.now();
                }
            } else {
                const buf = new Uint32Array(len);
                const indices = Array.from({ length: len }, (_, i) => i);

                // Fisher-Yates shuffle for true random walk (defeats prefetcher)
                for (let i = len - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                for (let i = 0; i < len - 1; i++) {
                    buf[indices[i]] = indices[i + 1];
                }
                buf[indices[len - 1]] = indices[0];

                while (now - start < durationMs) {
                    bench_cache_latency(buf, accessesPerPass);
                    passes++;
                    now = performance.now();
                }
            }

            result.timeMs = now - start;
            const totalAccesses = passes * accessesPerPass;
            result.score = (result.timeMs * 1_000_000) / totalAccesses; // ns
            result.unit = 'ns/access';
            result.sizeBytes = sizeBytes;
            result.accesses = totalAccesses;
        }

        postMessage(result);
    } catch (err) {
        postMessage({ id, type: 'error', error: err.message });
    }
};
