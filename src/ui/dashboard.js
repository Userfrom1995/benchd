import { initScheduler, runBenchmark, onProgress, onResult } from '../scheduler.js';
import { computeFinalScore } from '../score.js';

const els = {
    scoreValue: document.getElementById('score-value'),
    btnStart: document.getElementById('btn-start'),
    progressWrap: document.getElementById('progress-wrap'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
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

let currentProgress = 0;
let totalCategories = 16;

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

function updateMetric(id, val, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    let text = '0.00';
    if (val === 'ERROR') {
        text = 'FAIL';
        cls = 'error';
    } else if (typeof val === 'number') {
        if (val >= 1000) text = val.toFixed(0);
        else if (val >= 1) text = val.toFixed(2);
        else if (val > 0) text = val.toFixed(4);
        else text = '0.00';
    } else {
        text = val;
    }
    el.textContent = text;
    el.className = `metric__value ${cls}`;
}

export function attachUI() {
    els.btnStart.addEventListener('click', async () => {
        els.btnStart.disabled = true;
        els.btnStart.textContent = 'Running…';
        els.scoreValue.textContent = '0';
        els.progressWrap.classList.add('visible');
        els.progressFill.style.width = '0%';
        currentProgress = 0;
        els.clockHero.textContent = 'Estimating Clock Speed…';

        Object.values(uiMap).forEach(ids => {
            if (ids.peak) updateMetric(ids.peak, '—', 'pending');
            if (ids.sustained) updateMetric(ids.sustained, '—', 'pending');
        });

        try {
            els.progressLabel.textContent = 'Booting workers…';
            const cores = window.__benchd?.cores || navigator.hardwareConcurrency || 4;
            totalCategories = cores > 1 ? 17 : 16;
            await initScheduler(cores);

            const rawResults = await runBenchmark(cores);
            const { total } = computeFinalScore(rawResults);

            els.progressLabel.textContent = 'Benchmark Complete';
            els.progressFill.style.width = '100%';
            animateScore(total);

        } catch (err) {
            console.error(err);
            els.progressLabel.textContent = 'Error: ' + err.message;
        } finally {
            els.btnStart.disabled = false;
            els.btnStart.textContent = 'Run Again';
        }
    });

    onProgress((detail) => {
        if (detail.done) return;
        currentProgress++;
        const pct = Math.min((currentProgress / totalCategories) * 100, 98);
        els.progressFill.style.width = `${pct}%`;
        els.progressLabel.textContent = `Testing ${detail.name}…`;
    });

    onResult((detail) => {
        const { categoryId, peak, sustained, efficiency, failed } = detail;

        if (categoryId === 'clock') {
            // peak is already in GOPS (= ops/sec / 1e9); for a 1-op/cycle kernel that ≈ GHz
            const ghz = peak;
            els.clockHero.textContent = `~${ghz.toFixed(2)} GHz Active Clock`;
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
