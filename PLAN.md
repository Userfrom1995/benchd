# BenchD — Client-Side CPU Benchmark
## Implementation Plan

> **Editable by you.** Check off items as they are completed, add notes, adjust weights, rename things.
> Status: `[ ]` = todo · `[/]` = in progress · `[x]` = done

---

## Project Summary

A fully client-side CPU benchmark hosted on GitHub Pages.  
No server. No data collection. Everything runs in the user's browser.

**Tech stack:**
- HTML + CSS + Vanilla JS (UI, orchestration)
- Rust → WASM (compute kernels)
- Web Workers (multi-core parallelism)
- Service Worker (enables SharedArrayBuffer via COOP/COEP headers)

**Live URL (after deployment):** `https://<your-github-username>.github.io/benchd/`

---

## Directory Structure

```
benchd/
├── index.html               # Main page
├── sw.js                    # Service worker (COOP/COEP header injection)
├── src/
│   ├── main.js              # Entry point, benchmark orchestrator
│   ├── scheduler.js         # Runs benchmarks in sequence, collects results
│   ├── score.js             # Weighted scoring logic
│   ├── ui/
│   │   ├── dashboard.js     # Renders results to page
│   │   └── progress.js      # Live progress bar/status
│   └── workers/
│       ├── compute.worker.js    # Worker script: integer + FP + SIMD
│       ├── memory.worker.js     # Worker script: bandwidth + cache
│       └── crypto.worker.js    # Worker script: AES + SHA
├── wasm/
│   ├── src/
│   │   └── lib.rs           # Rust kernel source
│   ├── Cargo.toml
│   └── pkg/                 # wasm-pack output (committed to repo)
│       ├── benchd_wasm.js
│       ├── benchd_wasm_bg.wasm
│       └── ...
├── assets/
│   ├── style.css
│   └── fonts/               # Self-hosted fonts (no Google CDN needed)
└── .github/
    └── workflows/
        └── deploy.yml       # GitHub Actions: build WASM + deploy to gh-pages
```

---

## Benchmark Categories & Weights

> Adjust weights below as you see fit. They must sum to 1.0.

| # | Category | What is measured | Unit | Weight |
|---|---|---|---|---|
| 1 | FP32 Compute | Single-precision FLOPS | GFLOPS | 0.15 |
| 2 | FP64 Compute | Double-precision FLOPS | GFLOPS | 0.15 |
| 3 | SIMD Compute | Vectorized FP32 (128-bit SIMD) | GFLOPS | 0.10 |
| 4 | Integer Compute | 32/64-bit integer ops per second | GOPS | 0.10 |
| 5 | Memory Bandwidth | Sequential read + write | GB/s | 0.20 |
| 6 | Cache Latency | L1 / L2 / L3 access time | nanoseconds | 0.10 |
| 7 | Multi-core Scaling | Parallel FLOPS across all cores | GFLOPS + efficiency % | 0.10 |
| 8 | Branch Prediction | Misprediction penalty | nanoseconds | 0.05 |
| 9 | Cryptography | AES-GCM throughput + SHA-256 | GB/s + MH/s | 0.03 |
| 10 | Compression | Deflate encode/decode | MB/s | 0.02 |

**Total weight: 1.00**

---

## Scoring Formula

Each category produces a raw score in its natural unit.  
A sub-score is computed using a log1p (log of 1+x) scale so the score starts at 0 and grows gracefully with no ceiling:

```
sub_score = log1p(raw_value) × 1000
```

- Raw value of 0 → sub-score of 0
- No upper cap — faster hardware just scores higher
- If a category is unsupported (e.g. SIMD not available), raw = 0, sub-score = 0
- Overall score is still valid even with zero categories

```
final_score = sum( sub_score[i] × weight[i] )  for i in all categories
```

**Example scale (illustrative, not a hard schema):**
- Old/slow device:   ~500 – 1,500
- Mid-range laptop:  ~2,000 – 4,000
- Gaming desktop:    ~5,000 – 9,000
- Workstation:       ~10,000+

---

## Phases

### Phase 1 — Project Skeleton
- [ ] Init git repo, connect to GitHub
- [ ] Create `index.html` shell (empty, just loads `main.js`)
- [ ] Create `assets/style.css` with basic layout and dark theme
- [ ] Create `sw.js` service worker that injects `COOP` + `COEP` headers
- [ ] Register service worker in `main.js`
- [ ] Verify SharedArrayBuffer is available in browser console

### Phase 2 — Rust / WASM Kernels
- [ ] Install Rust toolchain (`rustup`, `wasm-pack`)
- [ ] Create `wasm/Cargo.toml` with `wasm-bindgen` dependency
- [ ] Write `wasm/src/lib.rs` with the following exported functions:
  - [ ] `bench_fp32(iterations: u64) -> f64`       — returns GFLOPS
  - [ ] `bench_fp64(iterations: u64) -> f64`       — returns GFLOPS
  - [ ] `bench_simd(iterations: u64) -> f64`       — returns GFLOPS (using `v128`)
  - [ ] `bench_integer(iterations: u64) -> f64`    — returns GOPS
  - [ ] `bench_memory_bandwidth(buf: &mut [f32]) -> f64` — returns GB/s
  - [ ] `bench_cache_latency(buf: &[u64], stride: usize) -> f64` — returns ns
- [ ] Run `wasm-pack build --target web` and commit `pkg/` output
- [ ] Write a simple test page to call each kernel and log results

### Phase 3 — Web Workers & Multi-core
- [ ] Create `src/workers/compute.worker.js`
  - Loads WASM, runs FP32/FP64/SIMD/INT kernels, posts results back
- [ ] Create `src/workers/memory.worker.js`
  - Runs bandwidth + cache latency tests, posts results back
- [ ] Create `src/workers/crypto.worker.js`
  - Uses `SubtleCrypto` API for AES-GCM + SHA-256 throughput
  - Uses `CompressionStream` for deflate throughput
- [ ] Create `src/scheduler.js`
  - Detects `navigator.hardwareConcurrency`
  - Spawns N workers for multi-core test
  - Runs single-core tests on 1 worker only
  - Times all tests and collects results object

### Phase 4 — Scoring Engine
- [ ] Create `src/score.js`
  - [ ] `computeSubScore(rawValue, floorValue)` — log2 scale
  - [ ] `computeFinalScore(results)` — applies weights from the table above
  - [ ] Returns structured object: `{ final, categories: { fp32, fp64, ... } }`

### Phase 5 — UI / Dashboard
- [ ] Design and implement `index.html` layout:
  - Hero section: big score number, animated progress ring
  - Category cards: one per benchmark with **peak score** and **sustained (average) score** shown separately
  - System info panel: detected cores, browser, OS
  - Start button, share button
- [ ] Implement `src/ui/dashboard.js` — renders score object into DOM
- [ ] Implement `src/ui/progress.js` — live status ("Running FP32...") with % bar
- [ ] Make layout responsive (works on mobile even if results are less meaningful)
- [ ] Dark theme by default, optionally add light mode toggle

### Phase 6 — GitHub Actions + Deployment
- [ ] Create `.github/workflows/deploy.yml`:
  - Trigger: push to `main`
  - Steps: install Rust, install wasm-pack, build WASM, copy to `wasm/pkg/`, deploy site to `gh-pages` branch
- [ ] Enable GitHub Pages on `gh-pages` branch in repo settings
- [ ] Verify live URL works and SharedArrayBuffer is enabled via service worker

### Phase 7 — Polish & Extras
- [ ] Add `localStorage` result history (show last N runs)
- [ ] **Share feature** (see below for how it works)
- [ ] Meta tags for SEO + Open Graph (for link previews)
- [ ] Favicon and page title
- [ ] README.md explaining what the benchmark tests and how to run locally

---

## Share Feature (No Server Required)

URL fragments (`#`) are never sent to any server — they are 100% client-side.

**Encoding (on share):**
1. Serialize results to JSON
2. Base64-encode the JSON string
3. Set `window.location.hash = base64string`
4. Copy URL to clipboard

**Decoding (on page load):**
1. Read `window.location.hash`
2. If non-empty, base64-decode it
3. Parse JSON and display as a "Shared Result" panel
4. User can then run their own benchmark and compare side-by-side

Result payload is small (~300–600 bytes JSON), fits easily in any URL.

---

## Decisions Log

> Resolved decisions are recorded here for reference.

| Decision | Resolution |
|---|---|
| Scoring floor | **Zero** — `log1p(raw)` starts at 0 naturally, no floor constant needed |
| SIMD fallback | Feature-detect at runtime; if unsupported, skip and score 0 for that category |
| Warm-up runs | **Yes** — 2–3 throw-away runs before timing to warm up JIT and caches |
| Test duration | **Default: 5 seconds** per kernel, configurable in Advanced Settings (range: 2–15s) |
| Clock estimation | **Dropped** — the benchmark results speak for themselves; no GHz labeling |
| Share feature | URL hash encoding (see Share Feature section above) — no server needed |

---

## Future / v2 Enhancements

> Do NOT implement these in v1. Add here for reference after first release.

| Feature | Notes |
|---|---|
| **Thermal throttling detection** | Run same kernel at start vs end; flag >10% performance drop |
| **Variance / score stability** | Run each kernel 3× and show ± range; warn if variance is high |

---

## Notes

- WASM SIMD (`v128`) is supported in Chrome 91+, Firefox 89+, Safari 16.4+. We can feature-detect and skip it on older browsers.
- `SharedArrayBuffer` requires `Cross-Origin-Isolated` context. Our service worker injects the required headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) to enable this on GitHub Pages.
- All computation happens locally. No data is sent anywhere unless the user explicitly clicks "Share" (which only generates a URL).
