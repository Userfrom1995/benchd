/**
 * BenchD Scheduler
 * Orchestrates Web Workers, runs the benchmark queue, and collects results.
 */

const workers = {
    compute: [],
    memory: null,
    crypto: null
};

let isRunning = false;
// Shortened runtime: 1s per test (3 windows) keeps the full suite snappy
// while still giving stable peak/sustained estimates.
let testDurationMs = 1000; // 1 second per test
let initPromise = null;
let abortFlag = false;

// Lower-is-better latency metrics (ns/op). Peak = min window for these,
// max window for throughput metrics.
const LOWER_BETTER = new Set(['branch', 'branch_predictable', 'cache_l1', 'cache_l2', 'cache_l3', 'cache_ram']);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Total progress steps: 15 benchmark categories + 1 clock card
// (+1 multicore card when cores > 1). Dashboard progress uses this.
export function EXPECTED_STEPS(cores) {
    return 15 + 1 + (cores > 1 ? 1 : 0);
}

export function cancelBenchmark() {
    abortFlag = true;
}

function throwIfAborted() {
    if (abortFlag) throw new Error('cancelled');
}

const events = new EventTarget();

export function onProgress(callback) {
    events.addEventListener('progress', e => callback(e.detail));
}

export function onResult(callback) {
    events.addEventListener('result', e => callback(e.detail));
}

export async function initScheduler(cores) {
    if (workers.compute.length > 0) return; // Already inited
    if (initPromise) return initPromise;
    initPromise = (async () => {
        cores = Math.min(Math.max(Math.floor(Number(cores))||4,1),8);

        const computeWorkers = [];
        let memoryWorker = null;
        let cryptoWorker = null;
        try {
            for (let i = 0; i < cores; i++) {
                computeWorkers.push(new Worker(new URL('./workers/compute.worker.js', import.meta.url), { type: 'module' }));
            }
            memoryWorker = new Worker(new URL('./workers/memory.worker.js', import.meta.url), { type: 'module' });
            cryptoWorker = new Worker(new URL('./workers/crypto.worker.js', import.meta.url), { type: 'module' });

            await Promise.all([
                ...computeWorkers.map((w) => waitForWorkerReady(w)),
                waitForWorkerReady(memoryWorker),
                waitForWorkerReady(cryptoWorker)
            ]);

            workers.compute.push(...computeWorkers);
            workers.memory = memoryWorker;
            workers.crypto = cryptoWorker;
        } catch (err) {
            for (const w of computeWorkers) {
                try { w.terminate(); } catch { /* ignore */ }
            }
            if (memoryWorker) {
                try { memoryWorker.terminate(); } catch { /* ignore */ }
            }
            if (cryptoWorker) {
                try { cryptoWorker.terminate(); } catch { /* ignore */ }
            }
            workers.compute.length = 0;
            workers.memory = null;
            workers.crypto = null;
            throw err;
        }
    })();
    try {
        await initPromise;
    } catch (err) {
        initPromise = null;
        throw err;
    }
}

export function terminateScheduler() {
    initPromise = null;
    for (const w of workers.compute) {
        try { w.terminate(); } catch { /* ignore */ }
    }
    workers.compute.length = 0;
    if (workers.memory) {
        try { workers.memory.terminate(); } catch { /* ignore */ }
        workers.memory = null;
    }
    if (workers.crypto) {
        try { workers.crypto.terminate(); } catch { /* ignore */ }
        workers.crypto = null;
    }
}

let taskIdCounter = 0;

function waitForWorkerReady(worker, ms = 10000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            worker.removeEventListener('message', handler);
            worker.removeEventListener('error', onError);
        };
        const settleResolve = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };
        const settleReject = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        };
        const handler = (e) => {
            if (e.data.type === 'ready') {
                settleResolve();
            } else if (e.data.type === 'error') {
                settleReject(new Error(e.data.error));
            }
        };
        const onError = (err) => {
            settleReject(err instanceof Error ? err : new Error(err?.message || 'worker error'));
        };
        const timer = setTimeout(() => {
            settleReject(new Error('worker ready timeout'));
        }, ms);
        worker.addEventListener('message', handler);
        worker.addEventListener('error', onError);
    });
}

function runWorkerTask(worker, type, durationMs, sharedBuf = null, timeoutMs = durationMs + 10000) {
    return new Promise((resolve, reject) => {
        const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? `${++taskIdCounter}-${crypto.randomUUID()}`
            : `task-${++taskIdCounter}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            worker.removeEventListener('message', handler);
            worker.removeEventListener('error', onError);
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`worker task timeout: ${type}`));
        }, timeoutMs);
        const handler = (e) => {
            if (e.data.id !== id) return;
            if (settled) return;
            settled = true;
            cleanup();
            if (e.data.type === 'error') reject(new Error(e.data.error));
            else resolve(e.data);
        };
        const onError = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err instanceof Error ? err : new Error(err?.message || 'worker error'));
        };
        worker.addEventListener('message', handler);
        worker.addEventListener('error', onError);
        try {
            worker.postMessage({ id, type, durationMs, sharedBuf });
        } catch (err) {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        }
    });
}

async function runCategory(categoryId, title, workerPool, type, isMulti = false, emitResult = true) {
    events.dispatchEvent(new CustomEvent('progress', { detail: { name: title } }));

    try {
        // 3 windows of ~333ms each (testDurationMs=1000). Keeps total runtime
        // short while still separating burst (peak) from steady-state (sustained).
        const NUM_WINDOWS = 3;
        const windowMs = testDurationMs / NUM_WINDOWS;

        // 1. Warm-up (short 200ms burst to trigger JIT/turbo, untimed)
        if (isMulti) await Promise.all(workerPool.map(w => runWorkerTask(w, type, 200)));
        else await runWorkerTask(workerPool[0], type, 200);

        // 2. Multi-window scoring: run NUM_WINDOWS back-to-back timed passes.
        //    Peak  = best single window (burst / turbo performance).
        //    Sustained = average across all windows (thermal steady-state).
        const windowScores = [];
        const windows = [];
        for (let w = 0; w < NUM_WINDOWS; w++) {
            let windowScore;
            if (isMulti) {
                const res = await Promise.all(workerPool.map(worker => runWorkerTask(worker, type, windowMs)));
                windowScore = res.reduce((sum, r) => sum + (r.gflops ?? r.score ?? 0), 0);
                windows.push(res);
            } else {
                const res = await runWorkerTask(workerPool[0], type, windowMs);
                windowScore = res.gflops ?? res.score ?? 0;
                windows.push(res);
            }
            windowScores.push(windowScore);
        }

        const isLatencyMetric = LOWER_BETTER.has(type);
        const peak = isLatencyMetric ? Math.min(...windowScores) : Math.max(...windowScores);
        const sustained = windowScores.reduce((a, b) => a + b, 0) / windowScores.length;

        if (emitResult) {
            events.dispatchEvent(new CustomEvent('result', {
                detail: { categoryId, peak, sustained, samples: windowScores }
            }));
        }

        return { peak, sustained, samples: windowScores, windows };
    } catch (err) {
        console.error(`Benchmark failed for ${categoryId}:`, err);
        events.dispatchEvent(new CustomEvent('result', {
            detail: { categoryId, peak: 0, sustained: 0, samples: [], failed: true, error: err.message }
        }));
        return { peak: 0, sustained: 0, samples: [], windows: [], failed: true, error: err.message };
    }
}

export async function runBenchmark(cores) {
    if (isRunning) throw new Error('already-running');
    isRunning = true;
    abortFlag = false;
    const results = {};

    try {
        let clockPeak = 0;
        const clockProbes = [];
        const captureClockProbe = async (durationMs = 300) => {
            try {
                const res = await runWorkerTask(workers.compute[0], 'clock', durationMs);
                const value = res.gflops ?? res.score ?? 0;
                if (value > clockPeak) clockPeak = value;
                clockProbes.push({ durationMs, value, raw: res });
            } catch (err) {
                console.warn('[BenchD] clock probe failed, skipping:', err);
            }
        };

        // Probe from start and keep tracking through the run.
        // 5 equal 300ms probes spread across the run.
        await captureClockProbe(300);
        throwIfAborted();

        results.fp32 = await runCategory('fp32', 'FP32 Compute', workers.compute, 'fp32');
        throwIfAborted();
        results.fp64 = await runCategory('fp64', 'FP64 Compute', workers.compute, 'fp64');
        throwIfAborted();
        results.int = await runCategory('int', 'Integer Compute', workers.compute, 'int');
        throwIfAborted();
        results.simd = await runCategory('simd', 'SIMD Compute', workers.compute, 'simd');
        throwIfAborted();
        await captureClockProbe();
        throwIfAborted();

        results.membw = await runCategory('membw', 'WASM Memory Bandwidth', [workers.memory], 'membw');
        throwIfAborted();
        results.cache_l1 = await runCategory('cache_l1', '32KB Random Walk', [workers.memory], 'cache_l1');
        throwIfAborted();
        results.cache_l2 = await runCategory('cache_l2', '256KB Random Walk', [workers.memory], 'cache_l2');
        throwIfAborted();
        results.cache_l3 = await runCategory('cache_l3', '8MB Random Walk', [workers.memory], 'cache_l3');
        throwIfAborted();
        results.cache_ram = await runCategory('cache_ram', '64MB Random Walk', [workers.memory], 'cache_ram');
        throwIfAborted();
        await captureClockProbe();
        throwIfAborted();

        results.branch_p = await runCategory('branch_p', 'Predictable Branch', [workers.compute[0]], 'branch_predictable');
        throwIfAborted();
        results.branch_r = await runCategory('branch_r', 'Random Branch', [workers.compute[0]], 'branch');
        throwIfAborted();
        await captureClockProbe();
        throwIfAborted();

        results.crypto_aes = await runCategory('crypto_aes', 'AES-GCM', [workers.crypto], 'aes');
        throwIfAborted();
        results.crypto_sha = await runCategory('crypto_sha', 'SHA-256', [workers.crypto], 'sha256');
        throwIfAborted();

        // New Compression Tests
        results.compress = await runCategory('compress', 'LZ77 Compression', [workers.compute[0]], 'compress');
        throwIfAborted();
        results.decompress = await runCategory('decompress', 'LZ77 Decompression', [workers.compute[0]], 'decompress');
        throwIfAborted();
        await captureClockProbe(300);
        throwIfAborted();

        // Report loop throughput at the end of the full benchmark run.
        // peak = max probe (burst), sustained = mean of the 5 equal probes,
        // min = slowest probe (thermal floor).
        events.dispatchEvent(new CustomEvent('progress', { detail: { name: 'WASM Loop Throughput' } }));
        const clockSamples = clockProbes.map(probe => probe.value);
        const clockMean = clockSamples.length
            ? clockSamples.reduce((a, b) => a + b, 0) / clockSamples.length
            : 0;
        const clockMin = clockSamples.length ? Math.min(...clockSamples) : 0;
        results.clock = {
            peak: clockPeak,
            sustained: clockMean,
            min: clockMin,
            max: clockPeak,
            samples: clockSamples,
            probes: clockProbes
        };
        events.dispatchEvent(new CustomEvent('result', {
            detail: { categoryId: 'clock', peak: clockPeak, sustained: clockMean, samples: results.clock.samples }
        }));

        if (cores > 1) {
            const mcResult = await runCategory('multicore', 'Multi-core Scaling', workers.compute, 'fp32', true, false);
            throwIfAborted();
            if (!mcResult.failed) {
                // Re-baselined on sustained single-core throughput (steady-state),
                // not burst peak, then clamped to [0,100].
                const base = results.fp32.sustained || results.fp32.peak || 0;
                const theoreticalMax = base * cores;
                const rawEfficiency = theoreticalMax > 0 ? (mcResult.peak / theoreticalMax) * 100 : 0;
                const efficiency = clamp(rawEfficiency, 0, 100);
                events.dispatchEvent(new CustomEvent('result', {
                    detail: {
                        categoryId: 'multicore',
                        peak: mcResult.peak,
                        sustained: mcResult.sustained,
                        efficiency,
                        samples: mcResult.samples
                    }
                }));
                results.multicore = {
                    peak: mcResult.peak,
                    sustained: mcResult.sustained,
                    efficiency,
                    samples: mcResult.samples,
                    windows: mcResult.windows,
                    aggregate: mcResult.peak
                };
            }
        }

        events.dispatchEvent(new CustomEvent('progress', { detail: { name: 'Done', done: true } }));
        return results;
    } finally {
        isRunning = false;
    }
}
