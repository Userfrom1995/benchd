# BenchD — Bug Analysis

> Analysis-only document. No code has been changed. All file/line references are to the current state of the codebase.

---

## Bug #1 — Clock Speed Always Shows ~0.00 GHz

**Severity:** Critical (feature completely broken)  
**File:** `src/ui/dashboard.js` (`onResult` handler)

### Root Cause

The worker returns the clock kernel result via the standard `result.gflops` field:

```
gflops = totalOps / (timeMs / 1000) / 1e9
```

For a 3 GHz CPU where `bench_clock` runs ~1 op/cycle, `totalOps / second ≈ 3e9`, so `gflops ≈ 3.0`.

The `runCategory` function dispatches `{ peak: score }` where `score = res.gflops = 3.0`.

Then in `dashboard.js`:
```javascript
const ghz = peak / 1e9;   // 3.0 / 1e9 = 0.000000003 GHz
```

The code divides by 1e9 **again**, even though `peak` is already in *Giga*-ops per second (already divided by 1e9 in the worker). The display correctly shows `~0.00 GHz` because the value is 3 × 10⁻⁹.

### What the correct value would be

`peak` is already in GFLOPS ≈ Giga-ops/sec ≈ GHz (for a 1-op-per-cycle sequential kernel).
The fix is simply `const ghz = peak;` — no second division.

### Secondary caveat

Even after the arithmetic fix, the clock estimate is inherently approximate. `bench_clock` does a serial `wrapping_add(1)` chain, so throughput ≈ clock frequency only if the CPU executes exactly 1 such op per cycle. In practice the estimate will be in the right ballpark but not a precise frequency readout.

---

## Bug #2 — Peak and Sustained Are Always Identical

**Severity:** High (feature not implemented)  
**File:** `src/scheduler.js` — `runCategory()`

### Root Cause

`runCategory` only performs **one timed measurement pass**. It then dispatches:

```javascript
events.dispatchEvent(new CustomEvent('result', {
    detail: { categoryId, peak: score, sustained: score }  // same value
}));
```

There is a `const passes = [];` array declared at the top of `runCategory` that is **never populated**. No logic exists to take multiple passes, track per-window performance, compute a max (peak) or average (sustained). The Plan calls for showing burst throughput vs. temperature-sustained throughput as separate numbers.

### How peak vs. sustained should work

One correct approach:
1. Split the test duration (e.g., 2 s) into several equal windows (e.g., 4 × 500 ms)
2. Record the throughput of each window
3. **Peak** = highest single-window throughput
4. **Sustained** = average over all windows

Currently both fields show the average over the entire single pass, which makes them identical.

---

## Bug #3 — Branch Prediction: Likely Compiles to Branchless Code

**Severity:** High (measurement is invalid)  
**File:** `wasm/src/lib.rs` — `bench_branch_predict()`, and `src/workers/compute.worker.js`

### Root Cause — Compiler eliminates the branch

The Rust kernel reads:

```rust
if data[i] > 127 {
    count += 1;
}
```

`count += (data[i] > 127) as u32` is exactly what LLVM produces for this pattern when targeting WASM. The comparison becomes an `i32.gt_u` instruction whose result (0 or 1) is added directly to `count` — no conditional branch (`br_if`) in the WASM bytecode. This means the "predictable" and "random" data variants execute **identical instruction sequences** and take the same time, producing the same score. The benchmark measures nothing meaningful about branch misprediction.

### Root Cause — Wrong metric / unit mismatch

The worker computes `result.gflops` (ops/sec / 1e9), but the HTML card displays the unit as `ns`:

```html
<span class="metric__unit">ns</span>
```

The Plan says the category should measure **misprediction penalty in nanoseconds**, not throughput. The current design is backwards on both what it measures and how it presents the result.

### What a correct implementation needs

To actually expose branch prediction cost, the kernel needs to **force a real conditional branch** that the CPU hardware must predict. Options:
- Use `std::hint::black_box()` around the counter update to prevent branchless rewriting
- Make the branch outcome determine the next array index (control-flow dependency), preventing speculation
- Compare timing of Predictable vs. Random data and present the **difference** in ns/op, not raw throughput

---

## Bug #4 — SHA-256 Effectively Shows 0.00 MH/s

**Severity:** High (result looks broken to every user)  
**File:** `src/workers/crypto.worker.js`

### Root Cause

The SHA-256 test hashes a **128 KB buffer** per call. `SubtleCrypto.digest('SHA-256', data)` over 128 KB takes roughly 50–200 ms in browsers (it's slow). Over a 2-second test window, that yields at most 10–40 total hashes.

```
score = totalHashes / (timeMs / 1000) / 1e6
      = 20 / 2.0 / 1_000_000
      = 0.00001 MH/s
```

`val.toFixed(2)` in `dashboard.js` then displays `0.00`. The number is not wrong — it really is that slow — but the **metric (MH/s) is inappropriate for 128 KB payloads**.

MH/s is meaningful for small fixed-size inputs (e.g., 64 bytes, as used in password hashing benchmarks). For large data, the idiomatic metric is GB/s throughput.

The fix is either:
1. Reduce the payload to 64–256 bytes and measure MH/s (matches the unit)
2. Keep 128 KB but report GB/s: `(totalHashes × 131072 bytes) / timeMs / 1e6`

Option 1 also makes the parallelism via `Promise.all(10 × digest)` much faster and meaningful.

---

## Bug #5 — AES-GCM Nonce (IV) Reuse

**Severity:** Medium (security anti-pattern; unlikely to cause runtime error in practice but is incorrect)  
**File:** `src/workers/crypto.worker.js`

```javascript
const iv = crypto.getRandomValues(new Uint8Array(12));  // generated once

while (now - start < durationMs) {
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);  // same iv every iteration
```

AES-GCM **must never reuse a nonce with the same key**. Doing so cryptographically destroys confidentiality and authenticity of both messages. While this is a benchmark and no real data is involved, it is still bad practice. Some browsers may also lower-level throttle or exhibit different performance when they detect nonce reuse (though most don't today).

The fix is to generate a fresh random IV for each encrypt call, or use a counter-based IV that increments each iteration.

---

## Bug #6 — Compression Scores Are Near-Zero and the Unit Is Wrong

**Severity:** High (results appear broken)  
**File:** `src/workers/compute.worker.js`, `index.html`

### Near-zero: the LZ77 kernel is O(n × window)

```javascript
const compressIters = 5;
for (let i = 0; i < compressIters; i++) {
    bench_compress(self.compressData, 1024);   // 64 KB input, 1024-byte window
}
totalOps += self.compressData.length * compressIters;  // 64K × 5 = ~328 KB per outer while iteration
```

The LZ77 `bench_compress` in Rust is O(n × window) = O(64 K × 1024) ≈ 64 M iterations per call. On typical hardware this can take 200–500 ms per call. In a 2-second test window the outer `while` loop completes perhaps 1–4 iterations.

`totalOps ≈ 4 × 327,680 = 1.3 MB` over 2 seconds = 0.65 MB/s.

That's then divided by 1e9:
```
result.gflops = 0.65e6 / 1e9 = 0.00000065
```
Which displays as `0.00`.

### Unit mismatch

The worker stores throughput in `result.gflops` which is computed as `bytes_per_second / 1e9` (effectively GB/s), but `index.html` labels the Compression card as `MB/s`. The value is in GB/s but the label says MB/s — off by ×1000.

### Decompression is also broken

`bench_decompress` operates on 1024 word-sized "commands", iterates 1000 times per call, and the worker estimates `1024 × 16 × 1000 = ~16 MB` per outer while iteration. That looks better but the "16" factor is an invented constant, not derived from actual decompressed bytes.

---

## Bug #7 — `cache_ram` Is Measured and Displayed but Excluded from the Score

**Severity:** Medium  
**File:** `src/score.js` — `BASE_WEIGHTS`

`cache_ram` is run by the scheduler, fires a `result` event, and is displayed in the Cache Latency card. However it is entirely absent from `BASE_WEIGHTS`, so it has zero weight in the final score. Cache latency tests (l1, l2, l3, ram) together constitute a meaningful portion of the test suite; omitting RAM latency from scoring is inconsistent.

---

## Bug #8 — Key Name Mismatch: `int` vs `integer`

**Severity:** Medium  
**File:** `src/score.js` — failed-test detection

`BASE_WEIGHTS` uses the key `'int'`, but `runBenchmark` in `scheduler.js` stores the result as `results.integer`:

```javascript
results.integer = { peak: ... };     // scheduler.js
```

```javascript
int: 0.10,                           // BASE_WEIGHTS key
...
if (results[key]?.failed) continue;  // checks results['int'] — always undefined
```

The `metrics` object correctly maps `int: results.integer?.peak`, so the **score value** is read correctly. But the **failed-test detection** checks `results['int']?.failed` which is always `undefined` (falsy), so integer failures are silently ignored rather than redistributing the weight to other categories.

---

## Bug #9 — Score Weights Diverge Significantly from the Plan

**Severity:** Medium  
**File:** `src/score.js` — `BASE_WEIGHTS`

| Category | Plan weight | Code weight | Delta |
|---|---|---|---|
| Memory Bandwidth (`membw`) | **0.20** | 0.10 | −0.10 |
| Cache (l1+l2+l3 total) | **0.10** | 0.15 (3 × 0.05) | +0.05 |
| Cryptography total (aes+sha) | **0.03** | 0.05 (0.02+0.03) | +0.02 |
| Compression total (encode+decode) | **0.02** | 0.05 (0.02+0.03) | +0.03 |

The weights still sum to 1.00 and are renormalized at runtime, so the final score won't crash. But memory bandwidth — the heaviest category in the plan at 20% — gets half the weight it should have. The methodology panel in `index.html` also lists "Memory: 10%" which agrees with the code but contradicts the plan.

---

## Bug #10 — SIMD Kernel Uses Scalar Arrays, Not WASM SIMD128

**Severity:** Medium (SIMD vs FP32 results will be nearly equal; feature misrepresented)  
**File:** `wasm/src/lib.rs` — `bench_simd_auto()`, `wasm/Cargo.toml`

`bench_simd_auto` uses a plain `[f32; 4]` array, relying on LLVM autovectorization:

```rust
let mut a = [start_a; 4];
for _ in 0..iterations {
    for i in 0..4 { a[i] = a[i] * b[i] + c[i]; }
    // ... 5 groups
}
```

**Why this likely stays scalar:** WASM SIMD128 (`v128`) is disabled by default in `wasm-pack`. Without passing `--target-features +simd128` or adding a `.cargo/config.toml` with `[target.wasm32-unknown-unknown] rustflags = ["-C", "target-feature=+simd128"]`, the Rust/LLVM backend does **not** emit WASM SIMD instructions. Autovectorization for `wasm32` targets scalar code unless SIMD is explicitly enabled.

The effect is that the SIMD card will show roughly the same value as FP32, or slightly higher (because the function does 20 ops/outer iteration vs 10 for FP32, with 4 independent dependency chains vs 1).

The generated `benchd_wasm.js` and `.wasm` binary currently in `pkg/` reflect whatever was compiled last; without SIMD128 in the build flags, the binary is scalar.

---

## Bug #11 — Crypto Worker Skips Initialization Handshake

**Severity:** Low (works by accident today, fragile)  
**File:** `src/scheduler.js`, `src/workers/crypto.worker.js`

Compute and memory workers both `postMessage({ type: 'ready' })` after their async WASM `init()`, and the scheduler awaits that message via `waitForWorkerReady()`:

```javascript
workers.compute.push(w);
await waitForWorkerReady(w);           // scheduler.js
```

The crypto worker does **no async initialization** and sends no `'ready'` message. The scheduler also does **not await** it:

```javascript
workers.crypto = new Worker(...);      // no waitForWorkerReady call
```

The first task dispatched to the crypto worker may arrive before `self.onmessage` is assigned (in a module worker this is unlikely to race in practice, but it is relying on microtask ordering rather than an explicit handshake). If the crypto worker ever needs async init in the future, this will silently break.

---

## Bug #12 — Multi-core Dispatches Two Result Events, First One Is Wrong

**Severity:** Low (brief visual flicker; end result is correct)  
**File:** `src/scheduler.js` — `runBenchmark()`

`runCategory('multicore', ...)` always fires the standard result event:

```javascript
{ categoryId: 'multicore', peak: mcResult, sustained: mcResult }
```

At this point `efficiency` is `undefined`, so `dashboard.js` maps `sustained` → `mc-efficiency` and shows aggregate GFLOPS in the Efficiency % field momentarily.

Then `runBenchmark` fires a **second** event with the correct `{ peak: mcResult, efficiency: X% }`. The second dispatch overwrites and corrects the display, so the final number is right, but there is a transient incorrect value.

---

## Bug #13 — Progress Bar Miscounts (totalCategories = 16, but ≥17 Events Fire)

**Severity:** Low (cosmetic)  
**File:** `src/ui/dashboard.js`

```javascript
const totalCategories = 16;
```

The scheduler fires a `progress` event for each of the 16 categories queued in `runBenchmark` *plus* a 17th for multi-core (when `cores > 1`, which is virtually every real device). This causes the progress bar to exceed 98% before all tests finish and then jump to 100% on "Done", rather than advancing smoothly.

---

## Bug #14 — Memory Bandwidth Test Includes JS→WASM Copy Overhead

**Severity:** Low–Medium (bandwidth reading is lower than true hardware bandwidth)  
**File:** `src/workers/memory.worker.js`, `wasm/pkg/benchd_wasm.js`

The buffer is allocated as a JS `Float64Array`:
```javascript
localBandwidthBuf = new Float64Array(1024 * 1024 * 16); // 128 MB
bench_memory_bandwidth(buf);
```

The wasm-bindgen glue for slice arguments (`&mut [f64]`) **copies** the entire array into WASM linear memory before the call and**copies it back** afterward. For a 128 MB buffer, that is 256 MB of extra data movement (128 MB in + 128 MB out) per call that is invisible to `totalBytes` but slows the wall-clock time.

Effect: the reported GB/s will be lower than the device's true memory bandwidth because the JS↔WASM copy inflates elapsed time without being counted in `totalBytes = buf.byteLength × 2`. The benchmark is measuring the copy pipeline + read + write, not purely memory read + write.

---

## Summary Table

| # | Bug | Severity | File(s) |
|---|---|---|---|
| 1 | Clock speed always ~0.00 GHz (double ÷1e9) | **Critical** | `src/ui/dashboard.js` |
| 2 | Peak === Sustained (one-pass, no multi-window logic) | **High** | `src/scheduler.js` |
| 3 | Branch prediction branchless + wrong unit (GFLOPS vs ns) | **High** | `wasm/src/lib.rs`, `compute.worker.js`, `index.html` |
| 4 | SHA-256 shows 0.00 MH/s (128 KB payload too large for MH/s) | **High** | `src/workers/crypto.worker.js` |
| 5 | AES-GCM nonce reuse per benchmark loop | **Medium** | `src/workers/crypto.worker.js` |
| 6 | Compression near-zero + wrong unit (GB/s vs MB/s label) | **High** | `compute.worker.js`, `index.html` |
| 7 | `cache_ram` excluded from `BASE_WEIGHTS` | **Medium** | `src/score.js` |
| 8 | `int` vs `integer` key mismatch in failed-test detection | **Medium** | `src/score.js` |
| 9 | `membw` weight 0.10 in code, 0.20 in plan | **Medium** | `src/score.js` |
| 10 | SIMD kernel is scalar (no WASM SIMD128 build flag) | **Medium** | `wasm/src/lib.rs`, `Cargo.toml` |
| 11 | Crypto worker skips ready handshake | **Low** | `scheduler.js`, `crypto.worker.js` |
| 12 | Multi-core fires two result events; first shows wrong efficiency | **Low** | `scheduler.js` |
| 13 | `totalCategories = 16` but 17+ progress events fire | **Low** | `src/ui/dashboard.js` |
| 14 | Memory bandwidth includes JS↔WASM copy overhead in timing | **Low–Medium** | `memory.worker.js` |

---

## Answers to Your Specific Questions

### "Clock speed shows zero"
Double division by 1e9. Worker output IS already in GFLOPS (= Giga-ops/s). Dashboard then re-divides by 1e9, moving the decimal 9 places left. See Bug #1.

### "Peak and Sustained almost always equal"
Only one measurement pass is taken. Both fields are assigned the same single score. The `passes` array in `runCategory` is declared but never used. See Bug #2.

### "Branch prediction logic is wrong because compiler optimizes it"
Correct diagnosis. `if x > 127` on a `u8` is a textbook LLVM branchless optimization target. The wasm binary almost certainly contains a `select`/arithmetic sequence rather than a `br_if` instruction, so the predictable vs. random datasets run in identical time. See Bug #3.

### "SHA-256 won't show a correct result"
The payload per hash call is 128 KB. `SubtleCrypto.digest` over 128 KB is slow (~50–200 ms). You get at most ~20 hashes in 2 seconds = 0.00001 MH/s, which rounds to `0.00`. The metric (MH/s) is unsuited for 128 KB payloads. See Bug #4.
