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
    clockHero: document.getElementById('clock-speed-hero'),
    runHint: document.getElementById('run-hint'),
    scoreBadge: document.getElementById('score-badge'),
    historyList: document.getElementById('history-list'),
    btnClearHistory: document.getElementById('btn-clear-history')
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

const TITLE_TO_CARD = {
    'FP32 Compute': 'fp32',
    'FP64 Compute': 'fp64',
    'Integer Compute': 'int',
    'SIMD Compute': 'simd',
    'WASM Memory Bandwidth': 'membw',
    '32KB Random Walk': 'cache_l1',
    '256KB Random Walk': 'cache_l2',
    '8MB Random Walk': 'cache_l3',
    '64MB Random Walk': 'cache_ram',
    'Predictable Branch': 'branch_p',
    'Random Branch': 'branch_r',
    'AES-GCM': 'crypto_aes',
    'SHA-256': 'crypto_sha',
    'LZ77 Compression': 'compress',
    'LZ77 Decompression': 'decompress',
    'WASM Loop Throughput': 'clock',
    'Multi-core Scaling': 'multicore'
};

const CARD_EL = {
    fp32: 'card-fp32',
    fp64: 'card-fp64',
    simd: 'card-simd',
    int: 'card-integer',
    membw: 'card-membw',
    cache_l1: 'card-cache',
    cache_l2: 'card-cache',
    cache_l3: 'card-cache',
    cache_ram: 'card-cache',
    branch_p: 'card-branch',
    branch_r: 'card-branch',
    crypto_aes: 'card-crypto',
    crypto_sha: 'card-crypto',
    compress: 'card-compress',
    decompress: 'card-compress',
    multicore: 'card-multicore',
    clock: 'clock-speed-hero'
};

const HIST_KEY = 'benchd.history.v1';
const HIST_CAP = 20;

const METRIC_STATES = ['pending', 'active', 'done', 'error'];

let currentProgress = 0;
let totalCategories = EXPECTED_STEPS(
    (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
);
let lastReport = null;
let isRunning = false;
let runStartTime = 0;

function animateScore(target, duration = 1500) {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        els.scoreValue.textContent = Math.floor(target).toLocaleString();
        els.scoreValue.classList.remove('running');
        return;
    }
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
    el.removeAttribute('title');
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

function highlightCard(categoryId) {
    document.querySelectorAll('.card.active').forEach((c) => c.classList.remove('active'));
    if (els.clockHero) els.clockHero.classList.remove('active');
    if (!categoryId) return;
    const elId = CARD_EL[categoryId];
    if (!elId) return;
    const target = document.getElementById(elId);
    if (!target) return;
    target.classList.add('active');
}

function clearScoreBadge() {
    if (!els.scoreBadge) return;
    els.scoreBadge.hidden = true;
    els.scoreBadge.textContent = '';
    els.scoreBadge.classList.remove('complete', 'partial');
}

function setScoreBadge(complete, skippedCount) {
    if (!els.scoreBadge) return;
    if (complete) {
        els.scoreBadge.textContent = 'complete';
        els.scoreBadge.classList.remove('partial');
        els.scoreBadge.classList.add('complete');
    } else {
        els.scoreBadge.textContent = `partial: ${skippedCount}`;
        els.scoreBadge.classList.remove('complete');
        els.scoreBadge.classList.add('partial');
    }
    els.scoreBadge.hidden = false;
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

function loadHistory() {
    try {
        const raw = localStorage.getItem(HIST_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveRun(report) {
    try {
        const hist = loadHistory();
        hist.unshift({
            at: report.generatedAt,
            total: report.score?.total ?? 0,
            complete: report.score?.complete === true
        });
        localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, HIST_CAP)));
    } catch {
        /* storage unavailable — history stays in-memory only */
    }
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatSigned(n) {
    const r = Math.round(n);
    return (r >= 0 ? '+' : '') + r.toLocaleString();
}

function renderHistory() {
    if (!els.historyList) return;
    const hist = loadHistory();
    els.historyList.textContent = '';
    if (hist.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No runs yet — results stay in this browser only.';
        els.historyList.appendChild(li);
        return;
    }
    hist.forEach((entry, i) => {
        const li = document.createElement('li');
        let dateStr = entry.at ?? '';
        try {
            const d = new Date(entry.at);
            if (!Number.isNaN(d.getTime())) dateStr = d.toLocaleString();
        } catch { /* keep raw */ }
        const status = entry.complete ? 'complete' : 'partial';
        const totalStr = typeof entry.total === 'number' ? entry.total.toLocaleString() : String(entry.total);
        let text = `${dateStr} — ${totalStr} (${status})`;
        if (i + 1 < hist.length) {
            const prev = hist[i + 1];
            if (typeof entry.total === 'number' && typeof prev.total === 'number') {
                text += ` Δ last: ${formatSigned(entry.total - prev.total)}`;
            }
        }
        if (i === 0 && hist.length >= 2) {
            const priorTotals = hist.slice(1, 4).map((h) => h.total).filter((t) => typeof t === 'number');
            if (priorTotals.length > 0) {
                const med = median(priorTotals);
                text += ` (median-3: ${formatSigned(entry.total - med)} vs last ${priorTotals.length})`;
            }
        }
        li.textContent = text;
        els.historyList.appendChild(li);
    });
}

export function attachUI() {
    if (els.browserInfo && !els.browserInfo.textContent) {
        try {
            const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || '?';
            const brands = (typeof navigator !== 'undefined' && navigator.userAgentData?.brands?.map((b) => b.brand).join(', ')) || (typeof navigator !== 'undefined' && navigator.platform) || '';
            els.browserInfo.textContent = brands ? `${cores} cores · ${brands}` : `${cores} cores`;
        } catch { /* ignore */ }
    }

    if (els.btnCancel) {
        els.btnCancel.addEventListener('click', () => {
            if (isRunning) cancelBenchmark();
        });
    }

    if (els.btnClearHistory) {
        els.btnClearHistory.addEventListener('click', () => {
            try {
                localStorage.removeItem(HIST_KEY);
            } catch { /* ignore */ }
            renderHistory();
        });
    }

    renderHistory();

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
        runStartTime = performance.now();
        lastReport = null;
        clearScoreBadge();
        highlightCard(null);
        if (els.runHint) els.runHint.hidden = false;
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
            setScoreBadge(score.complete, score.skipped?.length ?? 0);
            highlightCard(null);
            if (els.runHint) els.runHint.hidden = true;
            animateScore(score.total);
            els.btnExport.disabled = false;
            saveRun(lastReport);
            renderHistory();

        } catch (err) {
            console.error(err);
            highlightCard(null);
            if (els.runHint) els.runHint.hidden = true;
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
            if (els.runHint) els.runHint.hidden = true;
            highlightCard(null);
        }
    });

    els.btnExport.addEventListener('click', () => {
        downloadReport(lastReport);
    });

    onProgress((detail) => {
        if (detail.done) {
            highlightCard(null);
            return;
        }
        currentProgress++;
        const pct = Math.min((currentProgress / totalCategories) * 100, 98);
        const elapsed = (performance.now() - runStartTime) / 1000;
        const done = currentProgress;
        const remaining = Math.max(totalCategories - done, 0);
        const eta = done > 0 ? (elapsed / done) * remaining : 0;
        setProgress(pct, `Testing ${detail.name}… (${done}/${totalCategories} · ETA ~${Math.round(eta)}s)`);
        const categoryId = TITLE_TO_CARD[detail.name];
        if (categoryId) highlightCard(categoryId);
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

        if (!failed && mapping.sustained && categoryId !== 'multicore' &&
            !categoryId.startsWith('cache_') && !categoryId.startsWith('branch_')) {
            if (typeof peak === 'number' && typeof sustained === 'number' &&
                Number.isFinite(peak) && Number.isFinite(sustained) && peak > 0) {
                const pctDelta = ((sustained - peak) / peak) * 100;
                const susEl = document.getElementById(mapping.sustained);
                if (susEl) susEl.title = `${pctDelta.toFixed(1)}% vs peak`;
            }
        }
    });
}
