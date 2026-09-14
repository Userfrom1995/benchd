import { initScheduler, runBenchmark, onProgress, onResult, EXPECTED_STEPS, cancelBenchmark } from '../scheduler.js';
import { computeFinalScore } from '../score.js';

const els = {
    scoreValue: document.getElementById('score-value'),
    btnStart: document.getElementById('btn-start'),
    btnCancel: document.getElementById('btn-cancel'),
    btnExport: document.getElementById('btn-export'),
    progressWrap: document.getElementById('progress-wrap'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
    progressTrack: document.getElementById('progress-track'),
    browserInfo: document.getElementById('browser-info'),
    clockHero: document.getElementById('clock-speed-hero')
};

const uiMap = {
    fp32: { peak: 'fp32-peak', sustained: 'fp32-sustained' },
    fp64: { peak: 'fp64-peak', sustained: 'fp64-sustained' },
    simd: { peak: 'simd-peak', sustained: 'simd-sustained' },
    int: { peak: 'int-peak', sustained: 'int-sustained' },
    membw: { peak: 'membw-peak', sustained: 'membw-sustained' },
    cache_l1: { peak: 'cache-l1' },
    cache_l2: { peak: 'cache-l2' },
    cache_l3: { peak: 'cache-l3' },
    cache_ram: { peak: 'cache-ram' },
    branch_p: { peak: 'branch-pred' },
    branch_r: { peak: 'branch-rand' },
    crypto_aes: { peak: 'crypto-aes' },
    crypto_sha: { peak: 'crypto-sha' },
    compress: { peak: 'compress-encode' },
    decompress: { peak: 'compress-decode' },
    multicore: { peak: 'mc-aggregate', sustained: 'mc-efficiency' }
};

const METRIC_STATES = ['pending', 'active', 'done', 'error'];

let currentProgress = 0;
let totalCategories = EXPECTED_STEPS(
    (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
);
let lastReport = null;
let isRunning = false;

function animateScore(target, duration = 1500) {
    const start = 0;
    const startTime = performance.now();
    els.scoreValue.classList.add('running');

    function update() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutStr = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + (target - start) * easeOutStr);
        els.scoreValue.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
        else els.scoreValue.classList.remove('running');
    }
    requestAnimationFrame(update);
}

function updateMetric(id, val, cls = 'done') {
    const el = document.getElementById(id);
    if (!el) return;
    let text = '0.00';
    if (val === 'ERROR') {
        text = 'FAIL';
        cls = 'error';
    } else if (typeof val === 'number') {
        if (!Number.isFinite(val)) {
            text = '—';
            cls = 'error';
        } else if (val >= 1000) text = val.toLocaleString(undefined, { maximumFractionDigits: 1 });
        else if (val >= 1) text = val.toFixed(2);
        else if (val > 0) text = val.toFixed(4);
        else text = '0.00';
    } else {
        text = val;
    }
    el.textContent = text;
    if (!el.classList.contains('metric__value')) el.classList.add('metric__value');
    el.classList.remove(...METRIC_STATES);
    el.classList.add(cls);
}

function createResultReport(rawResults, score, cores) {
    return {
        app: 'BenchD',
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        environment: {
            userAgent: navigator.userAgent,
            hardwareConcurrency: navigator.hardwareConcurrency,
            requestedWorkers: cores,
            crossOriginIsolated: window.__benchd?.crossOriginIsolated === true,
            sharedArrayBuffer: window.__benchd?.sabAvailable === true
        },
        score,
        scoreInputs: score?.breakdown ?? {},
        results: rawResults
    };
}

function downloadReport(report) {
    if (!report) return;

    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchd-results-${report.generatedAt.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function setProgress(pct, label) {
    const clamped = Math.min(Math.max(pct, 0), 100);
    if (els.progressFill) els.progressFill.style.width = `${clamped}%`;
    if (els.progressTrack) els.progressTrack.setAttribute('aria-valuenow', String(Math.round(clamped)));
    if (label !== undefined && els.progressLabel) els.progressLabel.textContent = label;
}

export function attachUI() {
    if (els.btnCancel) {
        els.btnCancel.addEventListener('click', () => {
            if (isRunning) cancelBenchmark();
        });
    }

    els.btnStart.addEventListener('click', async () => {
        if (isRunning) {
            cancelBenchmark();
            return;
        }
        isRunning = true;
        els.btnStart.disabled = true;
        if (els.btnCancel) els.btnCancel.disabled = false;
        els.btnExport.disabled = true;
        els.btnStart.textContent = 'Running…';
        els.scoreValue.textContent = '0';
        els.progressWrap.classList.add('visible');
        setProgress(0);
        currentProgress = 0;
        lastReport = null;
        els.clockHero.textContent = 'Measuring WASM Loop Throughput…';

        Object.values(uiMap).forEach(ids => {
            if (ids.peak) updateMetric(ids.peak, '—', 'pending');
            if (ids.sustained) updateMetric(ids.sustained, '—', 'pending');
        });

        try {
            setProgress(0, 'Booting workers…');
            const cores = window.__benchd?.cores || navigator.hardwareConcurrency || 4;
            totalCategories = EXPECTED_STEPS(cores);
            await initScheduler(cores);

            const rawResults = await runBenchmark(cores);
            const safeResults = rawResults ?? {};
            const score = computeFinalScore(safeResults);
            lastReport = createResultReport(safeResults, score, cores);

            if (!score.complete) {
                const skippedCount = score.skipped?.length ?? 0;
                setProgress(100, `Benchmark Complete (partial: ${skippedCount} skipped)`);
            } else {
                setProgress(100, 'Benchmark Complete');
            }
            animateScore(score.total);
            els.btnExport.disabled = false;

        } catch (err) {
            console.error(err);
            if (err?.message === 'already-running') {
                if (els.progressLabel) els.progressLabel.textContent = 'Benchmark already running…';
            } else if (err?.message === 'cancelled') {
                if (els.progressLabel) els.progressLabel.textContent = 'Benchmark cancelled.';
                els.clockHero.textContent = 'Benchmark cancelled';
            } else {
                if (els.progressLabel) els.progressLabel.textContent = 'Error: ' + err.message;
            }
        } finally {
            isRunning = false;
            els.btnStart.disabled = false;
            els.btnStart.textContent = 'Run Again';
            if (els.btnCancel) els.btnCancel.disabled = true;
        }
    });

    els.btnExport.addEventListener('click', () => {
        downloadReport(lastReport);
    });

    onProgress((detail) => {
        if (detail.done) return;
        currentProgress++;
        const pct = Math.min((currentProgress / totalCategories) * 100, 98);
        setProgress(pct, `Testing ${detail.name}…`);
    });

    onResult((detail) => {
        const { categoryId, peak, sustained, efficiency, failed } = detail;

        if (categoryId === 'clock') {
            const safePeak = Number.isFinite(peak) ? peak.toFixed(2) : '—';
            let extra = '';
            if (Number.isFinite(sustained)) extra += ` · sustained ${sustained.toFixed(2)}`;
            if (Array.isArray(detail.samples) && detail.samples.length > 0) {
                const finiteSamples = detail.samples.filter(Number.isFinite);
                if (finiteSamples.length > 0) {
                    const mn = Math.min(...finiteSamples);
                    const mx = Math.max(...finiteSamples);
                    if (Number.isFinite(mn) && Number.isFinite(mx)) {
                        extra += ` (min ${mn.toFixed(2)} / max ${mx.toFixed(2)})`;
                    }
                }
            }
            els.clockHero.textContent = `${safePeak} GOPS WASM Loop Rate${extra}`;
            return;
        }

        const mapping = uiMap[categoryId];
        if (!mapping) return;

        const stateClass = failed ? 'error' : 'done';
        const valPeak = failed ? 'ERROR' : peak;
        const valSustained = failed ? 'ERROR' : (efficiency !== undefined ? efficiency : sustained);

        if (categoryId === 'multicore') {
            updateMetric(mapping.peak, valPeak, stateClass);
            updateMetric(mapping.sustained, valSustained, stateClass);
        } else {
            if (mapping.peak) updateMetric(mapping.peak, valPeak, stateClass);
            if (mapping.sustained) updateMetric(mapping.sustained, valSustained, stateClass);
        }
    });
}
