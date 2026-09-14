/**
 * BenchD Scoring Engine
 * Applies log1p scaling and weights to generate the final composite score.
 */

const BASE_WEIGHTS = {
    fp32: 0.15,
    fp64: 0.15,
    simd: 0.10,
    int: 0.10,
    membw: 0.20,
    cache_l1: 0.025,
    cache_l2: 0.025,
    cache_l3: 0.025,
    cache_ram: 0.025,
    multicore: 0.10,
    branch_p: 0.02,
    branch_r: 0.03,
    crypto_aes: 0.015,
    crypto_sha: 0.015,
    compress: 0.01,
    decompress: 0.01
};

// Assert weights sum to 1.0 (normalized scoring depends on it).
console.assert(
    Math.abs(Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0) - 1.0) < 1e-9,
    '[BenchD] BASE_WEIGHTS must sum to 1.0'
);

const RESULT_KEY_MAP = {
    int: 'int',
    // Legacy alias: Phase-1 scheduler stored results.integer; fallback below
    // still accepts it for backward compat.
    integer: 'integer'
};

// Reference latencies (ns/op) for lower-is-better metrics. Scored as REF/val
// so lower latency → higher normalized value, matching cache/branch inversion.
// Values are typical desktop reference points, not hard thresholds.
const LATENCY_REFS = {
    cache_l1: 2,
    cache_l2: 5,
    cache_l3: 15,
    cache_ram: 80,
    branch_p: 3,
    branch_r: 3
};

// REFS for unit normalization before log1p so disparate units are comparable:
// - compress/decompress: MB/s -> GB/s (/1000)
// - crypto_sha: MH/s -> normalized throughput (/0.05 MH/s ref)
const COMPRESS_DIVISOR = 1000;
const CRYPTO_SHA_REF = 0.05;

export function computeSubScore(rawValue) {
    if (!Number.isFinite(rawValue) || rawValue <= 0) return 0;
    // log1p scale * 1000
    return Math.log1p(rawValue) * 1000;
}

export function computeFinalScore(results) {
    results = results || {};
    let finalScore = 0;

    const metrics = {
        fp32: results.fp32?.peak ?? 0,
        fp64: results.fp64?.peak ?? 0,
        simd: results.simd?.peak ?? 0,
        int: results.int?.peak ?? results.integer?.peak ?? 0,
        membw: results.membw?.peak ?? 0,
        cache_l1: results.cache_l1?.peak > 0 ? LATENCY_REFS.cache_l1 / results.cache_l1.peak : 0,
        cache_l2: results.cache_l2?.peak > 0 ? LATENCY_REFS.cache_l2 / results.cache_l2.peak : 0,
        cache_l3: results.cache_l3?.peak > 0 ? LATENCY_REFS.cache_l3 / results.cache_l3.peak : 0,
        cache_ram: results.cache_ram?.peak > 0 ? LATENCY_REFS.cache_ram / results.cache_ram.peak : 0,
        multicore: results.multicore?.peak ?? results.multicore?.aggregate ?? 0,
        // Branch is a latency metric (ns/op) — invert so lower latency → higher score,
        // matching the same pattern used for cache latency.
        branch_p: results.branch_p?.peak > 0 ? LATENCY_REFS.branch_p / results.branch_p.peak : 0,
        branch_r: results.branch_r?.peak > 0 ? LATENCY_REFS.branch_r / results.branch_r.peak : 0,
        crypto_aes: results.crypto_aes?.peak ?? 0,
        crypto_sha: (results.crypto_sha?.peak ?? 0) / CRYPTO_SHA_REF,
        compress: (results.compress?.peak ?? 0) / COMPRESS_DIVISOR,
        decompress: (results.decompress?.peak ?? 0) / COMPRESS_DIVISOR
    };

    // Resilient Weightage:
    // 1. Identify which tests succeeded
    const activeWeights = {};
    const skipped = [];
    let totalActiveWeight = 0;

    for (const key in BASE_WEIGHTS) {
        const resultKey = RESULT_KEY_MAP[key] || key;
        // Backward-compat fallback: 'int' also accepts legacy results.integer.
        const entry = results[resultKey] ?? (key === 'int' ? results.integer : undefined);
        const val = metrics[key];
        if (entry?.failed || !Number.isFinite(val) || val <= 0) {
            skipped.push(key);
            continue;
        }

        activeWeights[key] = BASE_WEIGHTS[key];
        totalActiveWeight += BASE_WEIGHTS[key];
    }

    // 2. Normalize active weights to sum to 1.0
    const scoredInputs = { ...metrics };
    if (totalActiveWeight > 0) {
        for (const key in activeWeights) {
            const normalizedWeight = activeWeights[key] / totalActiveWeight;
            const subScore = computeSubScore(metrics[key]);
            finalScore += subScore * normalizedWeight;
        }
    }

    const complete = totalActiveWeight >= 0.999;

    return {
        total: Math.round(finalScore),
        breakdown: scoredInputs,
        complete,
        activeWeight: totalActiveWeight,
        skipped
    };
}
