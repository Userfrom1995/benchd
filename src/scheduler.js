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
let testDurationMs = 2000; // 2 seconds per test

const events = new EventTarget();

export function onProgress(callback) {
    events.addEventListener('progress', e => callback(e.detail));
}

export function onResult(callback) {
    events.addEventListener('result', e => callback(e.detail));
}

export async function initScheduler(cores) {
    if (workers.compute.length > 0) return; // Already inited

    for (let i = 0; i < cores; i++) {
        const w = new Worker(new URL('./workers/compute.worker.js', import.meta.url), { type: 'module' });
        await waitForWorkerReady(w);
        workers.compute.push(w);
    }

    workers.memory = new Worker(new URL('./workers/memory.worker.js', import.meta.url), { type: 'module' });
    await waitForWorkerReady(workers.memory);

    workers.crypto = new Worker(new URL('./workers/crypto.worker.js', import.meta.url), { type: 'module' });
    await waitForWorkerReady(workers.crypto);
}

function waitForWorkerReady(worker) {
    return new Promise((resolve, reject) => {
        const handler = (e) => {
            if (e.data.type === 'ready') {
                worker.removeEventListener('message', handler);
                resolve();
            } else if (e.data.type === 'error') {
                worker.removeEventListener('message', handler);
                reject(new Error(e.data.error));
            }
        };
        worker.addEventListener('message', handler);
    });
}

function runWorkerTask(worker, type, durationMs, sharedBuf = null) {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);
        const handler = (e) => {
            if (e.data.id !== id) return;
            worker.removeEventListener('message', handler);
            if (e.data.type === 'error') reject(new Error(e.data.error));
            else resolve(e.data);
        };
        worker.addEventListener('message', handler);
        worker.postMessage({ id, type, durationMs, sharedBuf });
    });
}

async function runCategory(categoryId, title, workerPool, type, isMulti = false, emitResult = true) {
    events.dispatchEvent(new CustomEvent('progress', { detail: { name: title } }));

    try {
        const NUM_WINDOWS = 4;
        const windowMs = testDurationMs / NUM_WINDOWS;

        // 1. Warm-up
        if (isMulti) await Promise.all(workerPool.map(w => runWorkerTask(w, type, 500)));
        else await runWorkerTask(workerPool[0], type, 500);

        // 2. Multi-window scoring: run NUM_WINDOWS back-to-back timed passes.
        //    Peak  = best single window (burst / turbo performance).
        //    Sustained = average across all windows (thermal steady-state).
        const windowScores = [];
        for (let w = 0; w < NUM_WINDOWS; w++) {
            let windowScore;
            if (isMulti) {
                const res = await Promise.all(workerPool.map(worker => runWorkerTask(worker, type, windowMs)));
                windowScore = res.reduce((sum, r) => sum + (r.gflops || r.score || 0), 0);
            } else {
                const res = await runWorkerTask(workerPool[0], type, windowMs);
                windowScore = res.gflops || res.score || 0;
            }
            windowScores.push(windowScore);
        }

        const isLatencyMetric = type === 'branch' || type === 'branch_predictable' || type.startsWith('cache_');
        const peak = isLatencyMetric ? Math.min(...windowScores) : Math.max(...windowScores);
        const sustained = windowScores.reduce((a, b) => a + b, 0) / windowScores.length;

        if (emitResult) {
            events.dispatchEvent(new CustomEvent('result', {
                detail: { categoryId, peak, sustained }
            }));
        }

        return { peak, sustained };
    } catch (err) {
        console.error(`Benchmark failed for ${categoryId}:`, err);
        events.dispatchEvent(new CustomEvent('result', {
            detail: { categoryId, peak: 0, sustained: 0, failed: true, error: err.message }
        }));
        return { peak: 0, sustained: 0, failed: true };
    }
}

export async function runBenchmark(cores) {
    if (isRunning) return null;
    isRunning = true;
    const results = {};

    try {
        results.fp32 = await runCategory('fp32', 'FP32 Compute', workers.compute, 'fp32');
        results.fp64 = await runCategory('fp64', 'FP64 Compute', workers.compute, 'fp64');
        results.integer = await runCategory('int', 'Integer Compute', workers.compute, 'int');
        results.simd = await runCategory('simd', 'SIMD Compute', workers.compute, 'simd');

        results.clock = await runCategory('clock', 'Clock Estimation', [workers.compute[0]], 'clock');

        results.membw = await runCategory('membw', 'Memory Bandwidth', [workers.memory], 'membw');
        results.cache_l1 = await runCategory('cache_l1', 'L1 Cache', [workers.memory], 'cache_l1');
        results.cache_l2 = await runCategory('cache_l2', 'L2 Cache', [workers.memory], 'cache_l2');
        results.cache_l3 = await runCategory('cache_l3', 'L3 Cache', [workers.memory], 'cache_l3');
        results.cache_ram = await runCategory('cache_ram', 'RAM Latency', [workers.memory], 'cache_ram');

        results.branch_p = await runCategory('branch_p', 'Predictable Branch', [workers.compute[0]], 'branch_predictable');
        results.branch_r = await runCategory('branch_r', 'Random Branch', [workers.compute[0]], 'branch');

        results.crypto_aes = await runCategory('crypto_aes', 'AES-GCM', [workers.crypto], 'aes');
        results.crypto_sha = await runCategory('crypto_sha', 'SHA-256', [workers.crypto], 'sha256');

        // New Compression Tests
        results.compress = await runCategory('compress', 'LZ77 Compression', [workers.compute[0]], 'compress');
        results.decompress = await runCategory('decompress', 'LZ77 Decompression', [workers.compute[0]], 'decompress');

        if (cores > 1) {
            const mcResult = await runCategory('multicore', 'Multi-core Scaling', workers.compute, 'fp32', true, false);
            if (!mcResult.failed) {
                const theoreticalMax = (results.fp32.peak || 0) * cores;
                const efficiency = theoreticalMax > 0 ? (mcResult.peak / theoreticalMax) * 100 : 0;
                events.dispatchEvent(new CustomEvent('result', {
                    detail: { categoryId: 'multicore', peak: mcResult.peak, sustained: mcResult.sustained, efficiency }
                }));
                results.multicore = { aggregate: mcResult.peak, sustained: mcResult.sustained, efficiency };
            }
        }

        events.dispatchEvent(new CustomEvent('progress', { detail: { name: 'Done', done: true } }));
        return results;
    } finally {
        isRunning = false;
    }
}
