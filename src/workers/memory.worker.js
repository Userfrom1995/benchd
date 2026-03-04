import init, {
    bench_memory_bandwidth,
    bench_cache_latency
} from '../../wasm/pkg/benchd_wasm.js';

let wasmReady = false;

init().then(() => {
    wasmReady = true;
    postMessage({ type: 'ready' });
}).catch(err => {
    postMessage({ type: 'error', error: err.message });
});

let localBandwidthBuf = null;

self.onmessage = async (e) => {
    const { id, type, durationMs, sharedBuf } = e.data;

    if (!wasmReady) return;

    try {
        let result = { id, type: 'result', timeMs: 0, score: 0 };
        const start = performance.now();
        let now = start;

        if (type === 'membw') {
            let buf;
            if (sharedBuf) {
                buf = new Float64Array(sharedBuf);
            } else {
                if (!localBandwidthBuf) {
                    localBandwidthBuf = new Float64Array(1024 * 1024 * 16); // 128MB
                }
                buf = localBandwidthBuf;
            }

            let passes = 0;
            let totalBytes = 0;
            // wasm-bindgen copies JS slice -> WASM memory and back around each call,
            // plus the kernel itself does one full read + one full write.
            // Count all moved bytes so the reported throughput reflects the whole pipeline.
            const bytesPerPass = buf.byteLength * 4;

            while (now - start < durationMs) {
                bench_memory_bandwidth(buf);
                totalBytes += bytesPerPass;
                passes++;
                now = performance.now();
            }

            result.timeMs = now - start;
            result.score = (totalBytes / (result.timeMs / 1000)) / 1e9; // GB/s
        }
        else if (type === 'cache_l1' || type === 'cache_l2' || type === 'cache_l3' || type === 'cache_ram') {
            let sizeBytes;
            if (type === 'cache_l1') sizeBytes = 32 * 1024;
            else if (type === 'cache_l2') sizeBytes = 256 * 1024;
            else if (type === 'cache_l3') sizeBytes = 8 * 1024 * 1024;
            else sizeBytes = 64 * 1024 * 1024;

            const len = sizeBytes / 4;
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

            let passes = 0;
            const accessesPerPass = 2_000_000;
            while (now - start < durationMs) {
                bench_cache_latency(buf, accessesPerPass);
                passes++;
                now = performance.now();
            }

            result.timeMs = now - start;
            const totalAccesses = passes * accessesPerPass;
            result.score = (result.timeMs * 1_000_000) / totalAccesses; // ns
        }

        postMessage(result);
    } catch (err) {
        postMessage({ id, type: 'error', error: err.message });
    }
};
