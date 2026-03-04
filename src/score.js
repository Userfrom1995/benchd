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

const RESULT_KEY_MAP = {
    int: 'integer'
};

export function computeSubScore(rawValue) {
    if (!rawValue || rawValue <= 0) return 0;
    // log1p scale * 1000
    return Math.log1p(rawValue) * 1000;
}

export function computeFinalScore(results) {
    let finalScore = 0;

    const metrics = {
        fp32: results.fp32?.peak || 0,
        fp64: results.fp64?.peak || 0,
        simd: results.simd?.peak || 0,
        int: results.integer?.peak || 0,
        membw: results.membw?.peak || 0,
        cache_l1: 100 / (results.cache_l1?.peak || 1),
        cache_l2: 100 / (results.cache_l2?.peak || 1),
        cache_l3: 100 / (results.cache_l3?.peak || 1),
        cache_ram: 100 / (results.cache_ram?.peak || 1),
        multicore: results.multicore?.aggregate || 0,
        // Branch is a latency metric (ns/op) — invert so lower latency → higher score,
        // matching the same pattern used for cache latency.
        branch_p: results.branch_p?.peak > 0 ? 100 / results.branch_p.peak : 0,
        branch_r: results.branch_r?.peak > 0 ? 100 / results.branch_r.peak : 0,
        crypto_aes: results.crypto_aes?.peak || 0,
        crypto_sha: results.crypto_sha?.peak || 0,
        compress: results.compress?.peak || 0,
        decompress: results.decompress?.peak || 0
    };

    // Resilient Weightage:
    // 1. Identify which tests succeeded
    const activeWeights = {};
    let totalActiveWeight = 0;

    for (const key in BASE_WEIGHTS) {
        const resultKey = RESULT_KEY_MAP[key] || key;
        const val = metrics[key];
        if (results[resultKey]?.failed || !Number.isFinite(val)) {
            continue;
        }

        activeWeights[key] = BASE_WEIGHTS[key];
        totalActiveWeight += BASE_WEIGHTS[key];
    }

    // 2. Normalize active weights to sum to 1.0
    for (const key in activeWeights) {
        const normalizedWeight = activeWeights[key] / totalActiveWeight;
        const subScore = computeSubScore(metrics[key]);
        finalScore += subScore * normalizedWeight;
    }

    return {
        total: Math.round(finalScore),
        breakdown: metrics
    };
}
