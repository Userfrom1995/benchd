import init, {
    bench_fp32,
    bench_fp64,
    bench_int,
    bench_simd_auto,
    bench_branch_predict,
    bench_clock,
    bench_compress,
    bench_decompress
} from '../../wasm/pkg/benchd_wasm.js';

let wasmReady = false;

// Initialize WASM as soon as the worker starts
init().then(() => {
    wasmReady = true;
    postMessage({ type: 'ready' });
}).catch(err => {
    postMessage({ type: 'error', error: err.message });
});

self.onmessage = async (e) => {
    const { id, type, durationMs } = e.data;

    if (!wasmReady) {
        postMessage({ id, type: 'error', error: 'WASM not initialized' });
        return;
    }

    try {
        let result = { id, type: 'result', ops: 0, timeMs: 0, gflops: 0 };

        // We calibrate dynamic iterations so it runs for roughly the requested duration
        // The WASM kernel calls are fast enough that we can loop them in JS and check the clock periodically
        const start = performance.now();
        let now = start;
        let totalOps = 0;

        // Chunk size: how many iterations per WASM call
        const chunkIters = 5_000_000;

        while (now - start < durationMs) {
            if (type === 'fp32') {
                bench_fp32(chunkIters, 1.0, 0.99999, 0.00001);
                totalOps += chunkIters * 10;
            }
            else if (type === 'fp64') {
                bench_fp64(chunkIters, 1.0, 0.9999999, 0.0000001);
                totalOps += chunkIters * 10;
            }
            else if (type === 'int') {
                bench_int(chunkIters, 1n, 2n, 3n);
                totalOps += chunkIters * 10;
            }
            else if (type === 'simd') {
                bench_simd_auto(chunkIters, 1.0, 0.99999, 0.00001);
                totalOps += chunkIters * 20; // estimate for vectorized
            }
            else if (type === 'branch') {
                if (!self.branchData) {
                    self.branchData = new Uint8Array(1024 * 1024);
                    // crypto.getRandomValues is limited to 64KB (65536 bytes) per call
                    const CHUNK_SIZE = 65536;
                    for (let i = 0; i < self.branchData.length; i += CHUNK_SIZE) {
                        crypto.getRandomValues(self.branchData.subarray(i, i + CHUNK_SIZE));
                    }
                }
                const branchIters = Math.max(1024 * 1024, chunkIters / 10);
                bench_branch_predict(self.branchData, branchIters);
                totalOps += branchIters;
            }
            else if (type === 'branch_predictable') {
                if (!self.predictableData) {
                    self.predictableData = new Uint8Array(1024 * 1024);
                    // Always-taken branch pattern gives the predictor a near-perfect signal.
                    self.predictableData.fill(255);
                }
                const branchIters = Math.max(1024 * 1024, chunkIters / 10);
                bench_branch_predict(self.predictableData, branchIters);
                totalOps += branchIters;
            }
            else if (type === 'clock') {
                // Vary seed each call so the compiler/JIT cannot treat calls as equivalent.
                bench_clock(chunkIters, (totalOps ^ (now * 1000) >>> 0) >>> 0);
                totalOps += chunkIters;
            }
            else if (type === 'compress') {
                if (!self.compressData) {
                    // 64KB of repetitive data for LZ77
                    self.compressData = new Uint8Array(64 * 1024);
                    for (let i = 0; i < self.compressData.length; i++) {
                        self.compressData[i] = (i % 256) ^ (i % 7);
                    }
                }
                const compressIters = 5; // Compression is heavy, do fewer outer loops
                for (let i = 0; i < compressIters; i++) {
                    bench_compress(self.compressData, 1024);
                }
                totalOps += self.compressData.length * compressIters;
            }
            else if (type === 'decompress') {
                if (!self.decompressCmds) {
                    // LZ77-like command stream:
                    // - Literal command: 0x000000VV (byte value)
                    // - Match command  : 0x80000000 | (len << 16) | (distance - 1)
                    self.decompressCmds = new Uint32Array(4096);
                    let produced = 0;
                    for (let i = 0; i < self.decompressCmds.length; i++) {
                        if (i < 64 || i % 5 !== 0) {
                            const v = (i * 131 + 17) & 0xFF;
                            self.decompressCmds[i] = v;
                            produced += 1;
                        } else {
                            const len = 8 + (i % 17); // 8..24 bytes
                            const maxDist = Math.max(1, Math.min(256, produced));
                            const distance = 1 + (i % maxDist);
                            self.decompressCmds[i] = 0x80000000 | (len << 16) | (distance - 1);
                            produced += len;
                        }
                    }

                    // Precompute output bytes per decode pass from command semantics.
                    let totalOut = 0;
                    for (let i = 0; i < self.decompressCmds.length; i++) {
                        const cmd = self.decompressCmds[i];
                        totalOut += (cmd & 0x80000000) ? ((cmd >>> 16) & 0x7FFF) : 1;
                    }
                    self.decompressOutBytes = totalOut;
                }
                const decompressIters = 1000;
                bench_decompress(self.decompressCmds, decompressIters);
                totalOps += self.decompressOutBytes * decompressIters;
            }
            else {
                throw new Error(`Unknown compute kernel: ${type}`);
            }

            now = performance.now();
        }

        result.timeMs = now - start;
        result.ops = totalOps;
        if (type === 'branch' || type === 'branch_predictable') {
            // Branch metric is latency (ns/op) — lower is better.
            // Use result.score so the scheduler picks it up separately from gflops.
            result.score = totalOps > 0 ? (result.timeMs * 1_000_000) / totalOps : 0;
        } else if (type === 'compress' || type === 'decompress') {
            // Compression card is labeled MB/s, so report MB/s directly.
            result.score = (totalOps / (result.timeMs / 1000)) / 1e6;
        } else {
            result.gflops = (totalOps / (result.timeMs / 1000)) / 1e9;
        }

        postMessage(result);
    } catch (err) {
        postMessage({ id, type: 'error', error: err.message });
    }
};
