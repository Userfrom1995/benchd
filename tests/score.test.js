import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSubScore, computeFinalScore } from '../src/score.js';

function fullResults() {
  return {
    fp32: { peak: 10 },
    fp64: { peak: 5 },
    simd: { peak: 8 },
    int: { peak: 10 },
    membw: { peak: 20 },
    cache_l1: { peak: 2 },
    cache_l2: { peak: 5 },
    cache_l3: { peak: 15 },
    cache_ram: { peak: 80 },
    multicore: { peak: 20 },
    branch_p: { peak: 3 },
    branch_r: { peak: 3 },
    crypto_aes: { peak: 1 },
    crypto_sha: { peak: 0.1 },
    compress: { peak: 500 },
    decompress: { peak: 800 }
  };
}

describe('computeSubScore', () => {
  it('returns 0 for non-positive / non-finite input', () => {
    assert.equal(computeSubScore(0), 0);
    assert.equal(computeSubScore(-5), 0);
    assert.equal(computeSubScore(NaN), 0);
    assert.equal(computeSubScore(Infinity), 0);
    assert.equal(computeSubScore(undefined), 0);
  });

  it('applies log1p(x) * 1000 scaling', () => {
    const expected = Math.log1p(1) * 1000;
    assert.ok(Math.abs(computeSubScore(1) - expected) < 1e-9);
    // monotonic: larger input -> larger sub-score
    assert.ok(computeSubScore(10) > computeSubScore(1));
  });
});

describe('computeFinalScore unit normalization', () => {
  it('normalizes compress MB/s -> GB/s (/1000)', () => {
    const score = computeFinalScore(fullResults());
    assert.equal(score.breakdown.compress, 500 / 1000);
    assert.equal(score.breakdown.decompress, 800 / 1000);
  });

  it('normalizes crypto_sha MH/s (/0.05 ref)', () => {
    const score = computeFinalScore(fullResults());
    assert.ok(Math.abs(score.breakdown.crypto_sha - 0.1 / 0.05) < 1e-12);
  });

  it('inverts latency metrics as REF / value', () => {
    const score = computeFinalScore(fullResults());
    // REFs: cache_l1=2, cache_l2=5, cache_l3=15, cache_ram=80, branch=3
    assert.equal(score.breakdown.cache_l1, 2 / 2);
    assert.equal(score.breakdown.cache_l2, 5 / 5);
    assert.equal(score.breakdown.cache_l3, 15 / 15);
    assert.equal(score.breakdown.cache_ram, 80 / 80);
    assert.equal(score.breakdown.branch_p, 3 / 3);
    assert.equal(score.breakdown.branch_r, 3 / 3);
  });
});

describe('computeFinalScore complete flag', () => {
  it('marks a full run complete with no skipped tests', () => {
    const score = computeFinalScore(fullResults());
    assert.equal(score.complete, true);
    assert.deepEqual(score.skipped, []);
    assert.ok(Math.abs(score.activeWeight - 1.0) < 1e-9);
    assert.ok(Number.isInteger(score.total) && score.total > 0);
  });

  it('marks a partial run incomplete and lists skipped keys', () => {
    const score = computeFinalScore({});
    assert.equal(score.complete, false);
    assert.equal(score.total, 0);
    assert.ok(score.skipped.length > 0);
    assert.equal(score.activeWeight, 0);
  });

  it('redistributes weight when a test fails', () => {
    const results = fullResults();
    results.fp32 = { peak: 10, failed: true };
    const score = computeFinalScore(results);
    assert.equal(score.complete, false);
    assert.ok(score.skipped.includes('fp32'));
    assert.ok(score.activeWeight < 1.0 && score.activeWeight > 0);
    assert.ok(score.total > 0);
  });
});
